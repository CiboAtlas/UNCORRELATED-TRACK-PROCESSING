import json
import uuid 
import numpy as np
from datetime import datetime, timezone 
import os
import random
import copy

# New Dependencies to use
import torch
import scipy.linalg
from scipy.spatial.transform import Rotation 
import numba

# Orekit
# Import the Orekit Python wrapper for astrodynamics calculations
import orekit_jpype as orekit

# Need to start Java Virtual Machine to use orekit 
vm = orekit.initVM()

from orekit_jpype.pyhelpers import setup_orekit_data

# save orekit-data 
PROJECT_ROOT = os.getcwd()
OREKIT_DATA_PATH = os.path.join(PROJECT_ROOT, "uctp-openevolve-example", "orekit-data")

# feed path into orekit 
setup_orekit_data(filenames=OREKIT_DATA_PATH)

# load raw observations
DATA_PATH = os.path.join(PROJECT_ROOT, "uctp-openevolve-example", "output_dataset.json")

with open(DATA_PATH) as f:
    dataset = json.load(f)

def normalize_observation(obs):
    if "ra" in obs:
        return {
            "type": "orbit", "ra": obs["ra"], "declination": obs["declination"],
            "range": obs.get("range"), "id": obs["id"], "obTime": obs["obTime"],
            "senlat": obs.get("senlat"), "senlon": obs.get("senlon"), "senalt": obs.get("senalt"),
            "losUnc": obs.get("losUnc")
        }
    # Check for 2D cartesian coordinates
    if "x" in obs:
        return {"type": "cartesian", "x": obs["x"], "y": obs["y"]}
    # Check for 1D angle
    if "angle" in obs:
        return {"type": "angle", "angle": obs["angle"]}
    # Error if not 
    raise ValueError(f"Unknown observation format: {obs}")

#iterate through the dataset
observations = [normalize_observation(o) for o in dataset["dataset_obs"]]

# hyperparametes 
Q_PROCESS_NOISE = 1e-6  
GATE_THRESHOLD = 9.0    


# circle dataset
xy_points = [obs for obs in observations if obs["type"] == "cartesian"]
skip_orbit_pipeline = False
r_est = 0.0

# 2D Calculations 
if len(xy_points) > 0:
    xs, ys = np.array([p["x"] for p in xy_points]), np.array([p["y"] for p in xy_points])
    r_est = np.mean(np.sqrt(xs**2 + ys**2))
    skip_orbit_pipeline = True

# ellipse dataset
# bound between -pi and +pi
def wrap_angle(x):
    return (x + np.pi) % (2*np.pi) - np.pi

# Initialize a list to hold tracks representing clusters of 1D angles
angle_tracks = []
# Iterate through all normalized observations to process only the 1D angle types
for obs in observations:
    if obs["type"] != "angle": continue
    # Extract angle value
    angle = obs["angle"]

    # greedy best match for existing cluster 
    best_track, best_dist = None, float("inf")

    # Compare the current angle against the mean of all existing angle tracks
    for t in angle_tracks:
        # Calculate the shortest angular distance btwn the observation and the tracks mean
        d = abs(wrap_angle(angle - t["mean"]))

        # update best match variables
        if d < best_dist:
            best_dist, best_track = d, t

    #if no track exists or is too far (> 0.5 radians); new track
    if best_track is None or best_dist > 0.5:
        angle_tracks.append({"mean": angle, "obs": [angle]})
    else:
        best_track["obs"].append(angle)
        best_track["mean"] = np.mean(best_track["obs"])

# will store each observations unit direction vector  
unit_direction_vector_u_hat = {}

for obs in observations: 
    # for every observation made, we'll store the unit vector we get from that sensor observation 
    # high fidelty in orekit --  very error prone (much more accuraate)
    # orekit pulls in special daat 
    # so i t can upadte so i t can pul in mnew orket data
    # if you want to propbabagte 
    # the fdraga nd solar radiation pressure
    if obs["type"] != "orbit": continue  
    
    # converting spherical coordinates into cartesian 
    alpha_rad = np.deg2rad(obs["ra"])    # Right Ascension -- angle around the equator (like longitude on the celestial sphere; how far left/right) -- now in radians
    delta_rad = np.deg2rad(obs["declination"]) # angle above/below (how far up/down) the equator (like latitude on the celestial sphere) -- in radians 
    
    # computing the unit vector pointing from the origin toward the object
    # conerts ra and d into 3d direction in space 
    # celestial spherical coordinates 
    r_hat_unit_vector = np.array([
        np.cos(delta_rad) * np.cos(alpha_rad), # x
        np.cos(delta_rad) * np.sin(alpha_rad), # y horizontal: projection onto the equatorial plane is : cos(delclination)
        np.sin(delta_rad)                      # z vertical component (z): if sin(0) = 0 (equatorial plane) ; sin(90) = 1 (north pole)
    ])

    # sigma unified data library micro - radians sigma  
    # dont use data types that arent in the given dataset you wont get confirmation if you want to pull from the dataset directly if there is something that sticks you will have to pull form the udl directly 
    # check that the magnitude is of length 1 (0.99999999) with L2 norm -- for the rare case that it didnt convert to radians ?
    if (abs(np.linalg.norm(r_hat_unit_vector) - 1.0) <= 1e-10):
        # storing each unit vector in a dictionary 
        # so that we can use it to calculate 
        # so formatting the obs measurements so each  obs_id we store {time, unit vector}
        unit_direction_vector_u_hat[obs["id"]] = {
            "time": datetime.fromisoformat(obs["obTime"].replace("Z", "+00:00")), 
            "unit_vector": r_hat_unit_vector, 
        }
    # If the magnitude of the vector deviates from 1, raise an error as the math is compromised
    else:
        raise ValueError(f"Unit vector incorrect: norm = {np.linalg.norm(r_hat_unit_vector)}")

# SENSOR POSITION -- EECF -- 
def convert_spherical_to_catesian(lat_deg, lon_deg, sensor_alt_km):
    R_earth = 6378.137   # km --> equatorial radius ; when alt = 0 --> on earths surface 

    # convert to radians for numpy 
    lat_phi = np.deg2rad(lat_deg) # angle above the equatorial place 
    lon_lambda = np.deg2rad(lon_deg) # angle around the z axis 

    # distance from Earths center to sensor 
    r = R_earth + sensor_alt_km # alt of the sensor (above earths surface) = height
   
    # the position of the sensor from an observatory 
    return np.array([
        r * np.cos(lat_phi) * np.cos(lon_lambda),  # r cos φ cos λ  <-- x = rxy ​cos(λ)
        r * np.cos(lat_phi) * np.sin(lon_lambda),  # r cos φ sin λ <-- y = rxy ​sin(λ)
        r * np.sin(lat_phi)                        # r sin φ --> z = height above the equotial plane 
    ])

# need to align the coordinate systems for each term 
# referencing an article to calculate Greenwich Mean Sidereal Time 
# originally used seonds after midnight from the given epoch (high error (7000km off))
# GMST to ECI Rotation 
def calculate_gmst(diff_in_time):
    if diff_in_time.tzinfo is None:
        diff_in_time = diff_in_time.replace(tzinfo=timezone.utc) 
    else:
        diff_in_time = diff_in_time.astimezone(timezone.utc)
    jd = diff_in_time.timestamp() / 86400 + 2440587.5   # julian date
    d = jd - 2451545.0   # Julian days since J2000.0
    gmst = (280.46061837 + 360.98564736629 * d) % 360  # normalize (0-360) --keeping the angle btwn 0 and 360 since d can grow large
    return np.radians(gmst)   # convert to radians (prev degrees)

def ecef_to_eci_(r_ecef, datetime_object):
    # theta stores how far the earth has rotated -- radians (rotation angle relative to inertial space)
    theta = calculate_gmst(datetime_object)

    # converting for rotation in 3d geometry 
    c = np.cos(theta)
    s = np.sin(theta)

    # rotational matrix to transform the ecef coordinates to rotational eci coordinates 
    R = np.array([
        [ c, -s, 0],  # cosθ  −sinθ
        [ s,  c, 0],  # sinθ  +cosθ
        [ 0,  0, 1]
    ])
    
    # given earths rotation at this time rotate the sensor position into
    # intertial coordinates 
    # x′= x cosθ − ysinθ
    # y′ = x sinθ + ycosθ
    # z' = z
    return R @ r_ecef 

# 1D
# x(t+dt) = x(t) + v(t)dt
# velocity is change in pos / change in time : v = dx/dt​ ; at every small step: dx ≈ v⋅dt
# xk+1 ​= Fxk​ -- how the position and velocity evolve  the state model
def make_F(diff_in_time):
    I3 = np.eye(3)
    Z3 = np.zeros((3,3))
    return np.block([
        [I3, diff_in_time*I3],
        [Z3, I3]
    ])

# measurement matrix ; the observation model
H = np.block([
    [np.eye(3), np.zeros((3,3))]
])


# process the noise, how much motion is allowed to deviate from a straight line 
# q is tunable 
# uncertainty is tied to the sensor.
# the covariance of the process noise; Q is uncertainty growth.
#  Q lets uncertainty grow
#  Measurements shrink uncertainty
#  Data association chooses correct target
# How much unknown acceleration you believe exists
def make_Q(diff_in_time):
    q = Q_PROCESS_NOISE
    I3 = np.eye(3)
    # White acceleration noise
    # velocity variance grows -> q*dt2 --> q = acceleration noise intensity
    # position variance grows -> q*dt4 /4
    # covariance between pos and velocity grows : q*dt3/2
    return q * np.block([
        [(diff_in_time**4)/4 * I3, (diff_in_time**3)/2 * I3],
        [(diff_in_time**3)/2 * I3, (diff_in_time**2)   * I3]
    ])

# The longer you go without a measurement
# the less confident you are
# threhold logic 
# the covariance of the observation noise
def make_R(range_km, los_arcsec):
    sigma_rad = np.deg2rad(los_arcsec / 3600.0)
    sigma_pos = range_km * sigma_rad # from angular uncertainty into pos uncertainty
    # arc_length = radius * angle
    # if the object is farther away the same angular error 
    return (sigma_pos**2) * np.eye(3)


# loop to probabilistically propose a new arrangement of tracks
def propose_modification(current_omega):
    # Create a deep copy of the current hypothesis; filter out any accidentally empty tracks
    new_omega = [track for track in copy.deepcopy(current_omega) if len(track) > 0]
    # If there are no active tracks, simply return the empty list
    if not new_omega: return new_omega

    move_type = random.choice(["reassign", "split", "merge"])
    
    # move one track into another
    if move_type == "reassign" and len(new_omega) >= 2:
        track1_idx, track2_idx = random.sample(range(len(new_omega)), 2)
        # check so it has observations to give
        if len(new_omega[track1_idx]) > 0:
            obs_to_move = new_omega[track1_idx].pop(random.randrange(len(new_omega[track1_idx])))
            new_omega[track2_idx].append(obs_to_move)
            
    # move observation out of existing track and start a new isolated track
    elif move_type == "split":
        track_idx = random.randrange(len(new_omega))
        
        if len(new_omega[track_idx]) > 1: # at least 2 observations so splitting doesn't destroy the track 
            obs_to_move = new_omega[track_idx].pop(random.randrange(len(new_omega[track_idx])))
            # creating a new track containing only the isolated observation
            new_omega.append([obs_to_move])
            
    # merge logic; two separate tracks into one larger track
    elif move_type == "merge" and len(new_omega) >= 2:
        track1_idx, track2_idx = random.sample(range(len(new_omega)), 2)
        new_omega[track1_idx].extend(new_omega[track2_idx])
        # pop empty track 
        new_omega.pop(track2_idx)
        
    # remove tracks that were emptied during the proposal step
    return [track for track in new_omega if len(track) > 0]


def evaluate_full_hypothesis(current_tracks, eci_data_dict):

    total_log_pi = 0.0
    # Iterating over every track in the current hypothesis
    for track_ids in current_tracks:

        if not track_ids: continue
        
        # Sort observations by time
        sorted_obs = sorted([eci_data_dict[obs_id] for obs_id in track_ids], key=lambda x: x["time"])
        
        # Initialize state for this track
        # grab the earliest observation to seed 
        first_obs = sorted_obs[0]
        x_prev = np.zeros(6) # empty 6d vector 
        x_prev[0:3] = first_obs["position_in_eci"] #load position 

        sigma_pos = first_obs["range"] * np.deg2rad(first_obs["losUnc"] / 3600.0)

        P_prev = np.diag([sigma_pos**2]*3 + [100.0]*3)
        
        last_time = first_obs["time"] # store time of initial state
        
        # Tracking the likelihood score for this specific track
        track_log_likelihood = 0.0
        
        # Filtering through the rest of the observations
        for obs_data in sorted_obs[1:]:

            curr_obs_time = obs_data["time"] # store current observation in the loop
            
            diff_in_time = (curr_obs_time - last_time).total_seconds() # time delta in seconds btwn previous state and current observation
            
            
            # If timestamps are identical or backwards, skip to avoid division-by-zero or math errors
            if diff_in_time <= 0: continue
                
            # intialize for this specific time step
            F, Q = make_F(diff_in_time), make_Q(diff_in_time)

            # Predict the new state vector forward in time (a priori estimate)
            x_pred = F @ x_prev

            # Predict the new state covariance forward in time 
            P_pred = F @ P_prev @ F.T + Q   # adding process noise
            
            # Extract the actual 3D position from observation data
            z = obs_data["position_in_eci"]

            # Construct the Measurement Noise Matrix
            R_mat = make_R(obs_data["range"], obs_data["losUnc"])

            # Calculating the residual difference between actual measurement and predicted measurement
            y = z - H @ x_pred

            # Calculating total uncertainty of the prediction mapped to measurement space
            S = H @ P_pred @ H.T + R_mat
# =====================================================================
# EVOLVE-START
# =====================================================================
            
            # Mahalanobis Distance & Likelihood
            try:
                # Calculate squared Mahalanobis distance to measure how far off the prediction was and scale it by uncertainty
                d2 = float(y.T @ np.linalg.solve(S, y))

                # log_likelihood of a Gaussian
                step_ll = -0.5 * (d2 + np.log(np.linalg.det(S))) # step log_likelihood using the multivariate normal distribution formula
                
                # log_likelihood for overall track score
                track_log_likelihood += step_ll
            except np.linalg.LinAlgError:
                track_log_likelihood += -1e6 # penalize invalid tracks

                # Break track state is corrupted
                break
                
            # Update state for next step
            K = P_pred @ H.T @ np.linalg.solve(S, np.eye(3))

            # update posteriori state estimate WITH Kalman 
            x_prev = x_pred + K @ y
            # update posteriori state covariance
            P_prev = (np.eye(6) - K @ H) @ P_pred  #reducing uncertainty based on the measurement
            
            # Step TIME forward for the next iteration
            last_time = curr_obs_time
        
        #FIX
        # rewarding for track length to encourage longer, more complete tracks
        # This prevents the algorithm from overly fragmenting the hypothesis into single-point tracks which inherently have zero residual error
        track_log_likelihood += 0.5 * len(track_ids)
            
        # adding each tracks log likelihood into the hypothesis total
        total_log_pi += track_log_likelihood
    
    # FIX
    # Penalize the total number of tracks to reduce fragmentation
    total_log_pi -= 5.0 * len(current_tracks)
    return total_log_pi

# --- PRE-PROCESS ECI POSITIONS ---
# Initialize a dictionary to cache the heavily computed ECI Cartesian positions for fast MCMC lookups
r_obj_positions_in_eci_form = {}

if not skip_orbit_pipeline:
    for obs in observations:
        if obs["type"] != "orbit": continue  
        
        obs_datatime = datetime.fromisoformat(obs["obTime"].replace("Z", "+00:00"))

        # grab the u_hat vector that matches the corresponding obs id 
        u_hat_vector = unit_direction_vector_u_hat[obs["id"]]["unit_vector"]

        # store the sensors position in earth centered - earth fixed cartesian matrix for conversion 
        r_sensor_ecef = convert_spherical_to_catesian(obs["senlat"], obs["senlon"], obs["senalt"])

        # use the rotational matrix function to rotate the sensor to earth centered inertial frame
        r_sensor_eci = ecef_to_eci_(r_sensor_ecef, obs_datatime)

        r_obj_eci_final = r_sensor_eci + obs["range"] * u_hat_vector

        # store all the necessary spatial and uncertainty data cleanly indexed by the observation ID
        r_obj_positions_in_eci_form[obs["id"]] = {
            "id": obs["id"], "time": obs_datatime, 
            "position_in_eci": r_obj_eci_final, 
            "range": obs["range"], "losUnc": obs["losUnc"]
        }



# --- DETERMINISTIC INITIALIZATION ---
# Function to generate a baseline "best guess" hypothesis to seed the MCMC process, accelerating convergence
def initialize_tracks_deterministically(eci_data_dict):
    initial_tracks = []
    initial_track_state = []  # holds Kalman filter state (x, P, last_time) for each track
    
    # If less than 2 observations return empty
    if len(eci_data_dict) < 2: return initial_tracks
        
    sort_by_time = sorted(eci_data_dict.values(), key=lambda x: x["time"])
    
    # Iterate through every observation
    for obs_data in sort_by_time:
        obs_id = obs_data["id"]
        curr_obs_time = obs_data["time"]
        curr_pos_eci = obs_data["position_in_eci"]

        # Tracking the best distance match for all running tracks
        best_track_index = None
        best_score = None

        # Compare the current observation against every established track
        for k in range(len(initial_tracks)):
            
            last_obs_time = initial_track_state[k]["last_time"] #time of last obs

            diff_in_time = (curr_obs_time - last_obs_time).total_seconds()
            if diff_in_time <= 0: continue

            # Generate the specific state and noise matrices for this time jump
            F = make_F(diff_in_time)
            Q = make_Q(diff_in_time)

            x_prev = initial_track_state[k]["x"]
            P_prev = initial_track_state[k]["P"]

            # Predict
            x_pred = F @ x_prev 

            # Propagate the covariance forward
            P_pred = F @ P_prev @ F.T + Q  #(uncertainty)

           
            z = curr_pos_eci
            R_mat = make_R(obs_data["range"], obs_data["losUnc"]) # Calculating the measurement noise for the current observation

            y = z - H @ x_pred # RESIDUAL: difference between predicted and actual measurement
                        
            S = H @ P_pred @ H.T + R_mat #TOTAL

            # Calculate the squared Mahalanobis distance
            d2 = float(y.T @ np.linalg.solve(S, y))

            #IMPORTANT ELLIPSE ERROR
            # Apply the Gating mechanism: Only consider assigning the point if it falls within the plausible error ellipse
            if d2 < GATE_THRESHOLD:
                # If this track offers a tighter fit (lower distance) than previous checks
                # save as the new best
                if best_score is None or d2 < best_score:
                    best_score = d2
                    best_track_index = k


        if best_track_index is not None: # successfully found a valid track 
           
            k = best_track_index
            # grab timing data to rerun the Kalman update
            last_obs_time = initial_track_state[k]["last_time"]
            diff_in_time = (curr_obs_time - last_obs_time).total_seconds()

            # Rebuild matrices for the update step
            F = make_F(diff_in_time)
            Q = make_Q(diff_in_time)

            x_prev = initial_track_state[k]["x"] 
            P_prev = initial_track_state[k]["P"]

            # prediction step
            x_pred = F @ x_prev
            P_pred = F @ P_prev @ F.T + Q
            
            # Rebuild measurement matrices
            z = curr_pos_eci
            R_mat = make_R(obs_data["range"], obs_data["losUnc"])
            y = z - H @ x_pred
            S = H @ P_pred @ H.T + R_mat
            
            
            K = P_pred @ H.T @ np.linalg.solve(S, np.eye(3))

            # Update and store the new state vector
            initial_track_state[k]["x"] = x_pred + K @ y

            # Update and store the new covariance matrix 
            initial_track_state[k]["P"] = (np.eye(6) - K @ H) @ P_pred

            # Update and store current observations time
            initial_track_state[k]["last_time"] = curr_obs_time

            # append the observation ID to the list defining this track
            initial_tracks[k].append(obs_id)

        # If no existing tracks match; new track
        else:
            x0 = np.zeros(6)

            x0[0:3] = curr_pos_eci

            sigma_pos = obs_data["range"] * np.deg2rad(obs_data["losUnc"] / 3600.0)

            # Initialize the covariance matrix with huge uncertainty on velocity (100.0)
            P0 = np.diag([sigma_pos**2]*3 + [100.0]*3)

            initial_tracks.append([obs_id])  

            # Append the corresponding initial state metadata to the parallel state tracker
            initial_track_state.append({"x": x0, "P": P0, "last_time": curr_obs_time})

    return initial_tracks

# --- MCMC LOOP START ---
# Check if orbital calculations are enabled before using Monte Carlo loop
if not skip_orbit_pipeline:
    # Seed current hypothesis using the DETERMINISTIC GATING 
    current_omega = initialize_tracks_deterministically(r_obj_positions_in_eci_form)

    current_log_pi = evaluate_full_hypothesis(current_omega, r_obj_positions_in_eci_form) #baseline log_likelihood

    #MCMC iterations : higher = longer compute ;  better chance of global optimum
    iterations = 500 
    
    for i in range(iterations):
        # Generate a new hypothesis 
        new_omega = propose_modification(current_omega)
        # Score the newly proposed hypothesis
        new_log_pi = evaluate_full_hypothesis(new_omega, r_obj_positions_in_eci_form)
        
        # Guard against math errors/overflows in the exponent
        try:
            # Calculate the Metropolis Hastings acceptance ratio based on the difference in log likelihoods
            ratio = np.exp(new_log_pi - current_log_pi)
        except OverflowError:
            ratio = 1.0 if new_log_pi > current_log_pi else 0.0
            
        # Probabilistically accept or reject the mutation based on the ratio and a random float [0.0, 1.0)
        if np.random.rand() < ratio:
            # The mutation is accepted; make it the new baseline
            current_omega = new_omega
            # Update the baseline score
            current_log_pi = new_log_pi

    # Finalize tracks
    # After all iterations complete, assign the final evolved state to the 'tracks' variable
    tracks = current_omega

# --- FINAL STATE GENERATION FOR OUTPUT ---
# We must run the Kalman Filter one last time on best scoring tracks 
# to get the final State Vectors (xpos, ypos, xvel, etc.) for JSON formatting.
# Initialize a list to hold the finalized kinematic states for serialization
track_state = []

# check for orbital track
if not skip_orbit_pipeline and len(tracks) > 0:
   
   
    for track_ids in tracks:
        # Sort the observation dicts for smoothing 
        sorted_obs = sorted([r_obj_positions_in_eci_form[oid] for oid in track_ids], key=lambda x: x["time"])
        
        first_obs = sorted_obs[0] #grab the first observation
        
        # initialize the state vector
        x_final = np.zeros(6)
        x_final[0:3] = first_obs["position_in_eci"]

        # Calculate standard deviation of position based on sensor line-of-sight uncertainty
        sigma_pos = first_obs["range"] * np.deg2rad(first_obs["losUnc"] / 3600.0)

        # store the initial covariance 
        P_final = np.diag([sigma_pos**2]*3 + [100.0]*3) # (high uncertainty on unobserved velocity)
       
        # store the starting epoch
        last_time = first_obs["time"]
        
        # do Kalman filter again; runs forward through every observation in the track to derive final velocity
        for obs_data in sorted_obs[1:]:
            # Calculate time jump
            diff_in_time = (obs_data["time"] - last_time).total_seconds()

            if diff_in_time <= 0: continue
                
            # Create matrices for time step
            F = make_F(diff_in_time)
            Q = make_Q(diff_in_time)

            # Predict state and covariance
            x_pred = F @ x_final
            P_pred = F @ P_final @ F.T + Q
            

            z = obs_data["position_in_eci"]
            R_mat = make_R(obs_data["range"], obs_data["losUnc"])
            y = z - H @ x_pred
            S = H @ P_pred @ H.T + R_mat
            

            K = P_pred @ H.T @ np.linalg.solve(S, np.eye(3))
            x_final = x_pred + K @ y
            P_final = (np.eye(6) - K @ H) @ P_pred
            # step the time forward
            last_time = obs_data["time"]
            
        # Append the completely filtered state vector and its final epoch to the output list
        track_state.append({
            "x": x_final,
            "last_time": last_time
        })

# =====================================================================
# EVOLVE-END
# =====================================================================

# json formatting

# Initialize the list for serialization into json
uctp_output = []

# if the system detected 2D Cartesian points
if len(tracks) == 0 and len(angle_tracks) == 0 and skip_orbit_pipeline:
    uctp_output = [{"estimated_r": float(r_est)}]

# if the system detected 1D angles
if len(tracks) == 0 and len(angle_tracks) > 0:
    for t in angle_tracks:
        uctp_output.append({
            "idStateVector": str(uuid.uuid4()), "sourcedData": t["obs"],
            "epoch": None, "xpos": None, "ypos": None, "zpos": None,
            "xvel": None, "yvel": None, "zvel": None
        })

# Iterate over the tracks to generate the output
for k in range(len(tracks)):
    x = track_state[k]["x"]
    last_time = track_state[k]["last_time"]

    uctp_output.append({
        "idStateVector": str(uuid.uuid4()),
        "sourcedData": tracks[k],
        "sourcedDataTypes": ["EO"] * len(tracks[k]),
        "classificationMarking": None,
        "epoch": last_time.isoformat().replace("+00:00", "Z"), 
        "uct": True,
        "xpos": float(x[0]), "ypos": float(x[1]), "zpos": float(x[2]),
        "xvel": float(x[3]), "yvel": float(x[4]), "zvel": float(x[5]),
        "referenceFrame": "J2000", "covReferenceFrame": "J2000",
        "cov": None, 
        "lunarSolar": "true", "solarRadPress": "true",
        "inTrackThrust": " false", 
        "rms": None, 
        "source": "LSAS",
        "dataMode": "REAL", 
        "algorithm": "ODTK"
    })



OUTPUT_PATH = os.path.join(PROJECT_ROOT, "uctp-openevolve-example", "uctp_output.json")
with open(OUTPUT_PATH, "w") as f:
    # Serialize uctp_output and write to disk
    json.dump(uctp_output, f, indent=2)