
import json # for loading in the json datasets
import uuid # each new grouping 
import numpy as np
from datetime import datetime # to format the obTime when storing it in json again 
from datetime import timezone


# EVOLVE-START
Q_PROCESS_NOISE = 1e-6  # range: 1e-8 to 1e-4
GATE_THRESHOLD = 9.0    # range: 4.0 to 9.0
# EVOLVE-END


# Load observations
with open(r"C:\Users\aurelabroqi\Favorites\Documents\GitHub\openevolve+example\examples\uctp_example\output_dataset.json") as f:
    dataset = json.load(f)

observations = dataset["dataset_obs"]


#  intent: to estimate the state vector [x y z Vx Vy Vz]  
# velocity and position are in intertial space at a specifc time (t)
# position of the object at time (t) = 
    # (position of the sensor at time (t)) + 
    # range (p) * (how far along that unit vector direction is (since its only mangitude of 1))
    # (a unit vector of what direction the sensor is pointing in (magnitude of 1)) (points in the direction the sensor is looking at)
    # p * u_hat is the relative position from sensor to object

# 3D Position Vectors at at an observation time
# interial direction (non rotating coordinate frame |||| 
    # az/elevation -- rotating frame -- changes constantly over time ) 
# global  RA/Dec -- coordinates on the celestial sphere |||| 
    # measured relative to earths mean equator and equinox of J2000 (an Earth Centered Inertial frame)

# will store each observations unit direction vector  
unit_direction_vector_u_hat = {}

for obs in observations: 
# for every observation made, we'll store the unit vector we get from that sensor observation 
    #high fidelty in orekit --  very error prone (much more accuraate)
    # orekit pulls in special daat 
    # so i t can upadte so i t can pul in mnew orket data
    # if you want to propbabagte 
    # the fdraga nd solar radiation pressure
    # at this poin top f 

    # converting spherical coordinates into cartesian 
    alpha_rad = np.deg2rad(obs["ra"])   #Right Ascension -- angle around the equator (like longitude on the celestial sphere; how far left/right) -- now in radians
    delta_rad = np.deg2rad(obs["declination"]) #angle above/below (how far up/down) the equator (like latitude on the celestial sphere) -- in radians 
    
    # computing the unit vector pointing from the origin toward the object
    # conerts ra and d into 3d direction in space 
    # celestial spherical coordinates 
    r_hat_unit_vector = np.array([
        np.cos(delta_rad) * np.cos(alpha_rad), #x
        np.cos(delta_rad) * np.sin(alpha_rad), #y horizontal: projection onto the equatorial plane is : cos(delclination)
        np.sin(delta_rad)                  #z vertical component (z): if sin(0) = 0 (equatorial plane) ; sin(90) = 1 (north pole)
    ])
# sigma unified data library micro - radians sigma  
# dont use data types that arent in the given dataset you wont get confirmation if you want to pull from the dataset directly if there is something that sticks you will have to pull form the udl directly 
    #check that the magnitude is of length 1 (0.99999999) with L2 norm -- for the rare case that it didnt convert to radians ?
    if (abs(np.linalg.norm(r_hat_unit_vector) - 1.0) <= 1e-10):
        # storing each unit vector in a dictionary 
        # so that we can use it to calculate 
        # so formatting the obs measurements so each  obs_id we store {time, unit vector}
        unit_direction_vector_u_hat[obs["id"]] = {
            "time": datetime.fromisoformat(obs["obTime"].replace("Z", "+00:00")), #since json just stores times as a string and we need the times for other calculations 
            "unit_vector": r_hat_unit_vector, #u^ --- direction vector
        }
        # print("time:", datetime.fromisoformat(obs["obTime"].replace("Z", "+00:00")))
        #break
        
    else:
        raise ValueError(f"Unit vector incorrect: norm = {np.linalg.norm(r_hat_unit_vector)}")
    
# obs_id = key  data = value
# for i, (obs_id, data) in enumerate(unit_direction_vector_u_hat.items()):
#     if i >= 3:
#         break

#     print("OBJ_ID:", obs_id)
#     print("  Time:", data["time"])
#     print("  Unit vector:", data["unit_vector"])
#     print("  Range:", data["range"])
#     print()


# SENSOR POSITION -- EECF -- 
def convert_spherical_to_catesian(lat_deg, lon_deg, sensor_alt_km):
    R_earth = 6378.137  # km --> equatorial radius ; when alt = 0 --> on earths surface 

    # convert to radians for numpy 
    lat_phi = np.deg2rad(lat_deg) # angle above the equatorial place  lat_phi
    lon_lambda = np.deg2rad(lon_deg) # angle around the z axis  lon_lambda

    # distance from Earths center to sensor 
    r = R_earth + sensor_alt_km # alt of the sensor (above earths surface) = height

    # the position of the sensor from an observatory 
    return np.array([
        r * np.cos(lat_phi) * np.cos(lon_lambda),  # r cos φ cos λ  <-- x = rxy ​cos(λ)
        r * np.cos(lat_phi) * np.sin(lon_lambda),  # r cos φ sin λ <-- y = rxy ​sin(λ)
        r * np.sin(lat_phi)                   # r sin φ --> z = height above the equotial plane 
    ])

# need to align the coordinate systems for each term 

# referencing an article to calculate Greenwich Mean Sidereal Time 
# originally used seonds after midnight from the given epoch (high error (7000km off))
# GMST to ECI Rotation 
def calculate_gmst(diff_in_time):
    if diff_in_time.tzinfo is None:
        diff_in_time = diff_in_time.replace(tzinfo=timezone.utc) # setting the timezone explicitly to utc 
    else:
        diff_in_time = diff_in_time.astimezone(timezone.utc)

    jd = diff_in_time.timestamp() / 86400 + 2440587.5   #julian date
    d = jd - 2451545.0   #Julian days since J2000.0
    gmst = 280.46061837 + 360.98564736629 * d  #gmst in degrees
    gmst = gmst % 360  # normalize (0-360) --keeping the angle btwn 0 and 360 since d can grow large

    return np.radians(gmst)  #convert to radians (prev degrees)


def ecef_to_eci_(r_ecef, datetime_object):
    # however many seconds since midnight has passed will determine how much Earth has rotated 
    # seconds_for_datatime = (
    #     datetime_object.hour * 3600 +
    #     datetime_object.minute * 60 +
    #     datetime_object.second +
    #     datetime_object.microsecond * 1e-6
    # )

    # theta stores how far the earth has rotated -- radians (rotation angle relative to inertial space)
    theta = calculate_gmst(datetime_object)

    #converting for rotation in 3d geometry 
    c = np.cos(theta)
    s = np.sin(theta)

    # rotational matrix to transform the ecef coordinates to rotational eci coordinates 
    R = np.array([
        [ c, -s, 0],  # cosθ  −sinθ
        [ s,  c, 0],  # sinθ  +cosθ
        [ 0,  0, 1]
    ])
    #given earths rotation at this time rotate the sensor position into
    #intertial coordinates 

    # x′= x cosθ − ysinθ
    # y′ = x sinθ + ycosθ
    # z' = z
    #now when we apply the rotation matrix, R, to the r_ecef vector it'll output another vector 
    #only position changes
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

#measurement matrix ; the observation model
H = np.block([
    [np.eye(3), np.zeros((3,3))]
])

#process the noise, how much motion is allowed to deviate from a straight line 
# q is tunable 
# uncertainty is tied to the sensor.
# the covariance of the process noise; Q is uncertainty growth.
#  Q lets uncertainty grow
#  Measurements shrink uncertainty
#  Data association chooses correct target
# How much unknown acceleration you believe exists
# orekit is synatically specific data type-- throws an error 
# pure python package 
# orekit is not the easiest 
def make_Q(diff_in_time):
    q = Q_PROCESS_NOISE
    I3 = np.eye(3)
    # White acceleration noise
        # velocity variance grows -> q*dt2 --> q = acceleration noise intensity
        # position variance grows -> q*dt4 /4
        # covariance between pos and velocity grows : q*dt3/2
  
    return q * np.block([
        [(diff_in_time**4)/4 * I3, (diff_in_time**3)/2 * I3],
        [(diff_in_time)/2 * I3, (diff_in_time**2)   * I3]
    ])

# The longer you go without a measurement
# the less confident you are

# threhold logic 
# the covariance of the observation noise
def make_R(range_km, los_arcsec):
    sigma_rad = np.deg2rad(los_arcsec / 3600.0)
    sigma_pos = range_km * sigma_rad # from angular uncertainty into pos uncertainty
    # arc_length = radius * angle
    #if the object is farther away the same angular error 
    return (sigma_pos**2) * np.eye(3)

#refernce frame convergence 
# topical centric the observer reotasting around with the rearth 
# quickily defines the long and lat 
# at this pint in time converts it to the frame converswation 

# for item in observations_by_object.items():
#     obj_id = item[0]
#     obj_observations = item[1]

#     print(obj_id)
#     print(obj_observations)

    # now use obj_id and obj_observations
    # position of the object at time (t) = 
    # (position of the sensor at time (t)) + 
    # range (p) * 
    # (a unit vector of what direction the sensor is pointing in (magnitude of 1))

# initialize dict for final results
#r_object_positions_in_eci_by_object = {} # OBJ_id (obs_id -> {time, position_in_eci})
velocities_by_object = {}

# tuple looping 
obj_observations = observations

r_obj_positions_in_eci_form = {}
for obs in obj_observations:
    # calculating each obs new sensor to obj position

    obs_datatime_object = datetime.fromisoformat(obs["obTime"].replace("Z", "+00:00"))

    # grab the u_hat vector that matches the corresponding obs id 
    u_hat_vector = unit_direction_vector_u_hat[obs["id"]]["unit_vector"]

    # store the sensors position in earth centered - earth fixed cartesian matrix for conversion 
    r_sensor_ecef_form = convert_spherical_to_catesian(
        obs["senlat"],
        obs["senlon"],
        obs["senalt"]
    )

    # use the rotational matrix function to rotate the sensor to earth centered inertial frame
    r_sensor_eci_form = ecef_to_eci_(r_sensor_ecef_form, obs_datatime_object)

    r_obj_eci_final = r_sensor_eci_form + obs["range"] * u_hat_vector
    #print("||r_obj|| =", np.linalg.norm(r_obj_eci_final))

    # r_geo = 42164.0  # km (rough)
    # print("delta (km) =", np.linalg.norm(r) - r_geo)

    # if obs["id"] == "9a803627-da41-4b99-bf6a-a5088cd0a34e":
    #     print(f"r_sensor_eci_form: {r_sensor_eci_form}")
    #     print(f"  range: {obs['range']}")
    #     print(f"  u_hat: {u_hat_vector}")
    #     print()


    r_obj_positions_in_eci_form[obs["id"]] = {
        "time": obs_datatime_object,
        "position_in_eci": r_obj_eci_final,
        "range": obs["range"],
        "losUnc": obs["losUnc"]
    }

    #load in per object observation
    # r_object_positions_in_eci_by_object[obj_id] = r_obj_positions_in_eci_form

# for i, (obs_id, data) in enumerate(r_obj_positions_in_eci_form.items()):
#     if i >= 3:
#         break
#     print(obs_id, data)    
#     print(f"\nObservation ID: {obs_id}")
#     print(f"  Time: {data['time']}")
#     print(f"  Position (ECI): {data['position_in_eci']}")

    # "dataset_obs": [
    # {
    #   "id": "9a803627-da41-4b99-bf6a-a5088cd0a34e",
    #   "obTime": "2026-01-02T23:26:51.191918Z",
    #   "idSensor": "EXO1838",
    #   "azimuth": 124.3531428479689,
    #   "elevation": 31.45217217583705,
    #   "range": 38485.749055184,
    #   "ra": 164.9917719679,
    #   "declination": -5.2640748137,
    #   "losUnc": 2.226412, arcseconds
    #   "senlat": 35.070379,
    #   "senlon": 25.97259,
    #   "senalt": 0.39,
    #   "uct": false
    # },

# tuple
# 9a803627-da41-4b99-bf6a-a5088cd0a34e {
#   'time': datetime.datetime(2026, 1, 2, 23, 26, 51, 191918, tzinfo=datetime.timezone.utc), 
#   'position_in_eci': array([-39649.67988886,  14431.70870222,    134.06544568])}


# For each group 
    # collect all observations in that group
    # sort them by time is t2 - t1 ; t2 > t1 
    # compute velocity from those
    # to find velocity we just take the deritvative of r w.r.t time
    #how much the position changed divided by how much time passed at each x, y, and z

# base case: need at least two to compute velocity 
if len(r_obj_positions_in_eci_form) >= 2:
                  
    
    # load in all the sorted items 
    # Observation ID: ebeee183-f346-442c-a4e5-c1847ab06d8c
    #     Time: 2026-01-02 23:10:12.393071+00:00
    #     Position (ECI): [-38495.43981747  17277.13424221    132.10481707]

    sort_by_time = sorted(
        r_obj_positions_in_eci_form.items(),
        key=lambda item: item[1]["time"] ) # KEY = item to compare for each element

    # build tracks to sort between diff observations
    tracks = []       # list[list[obs_id]]
    track_state = []  # list[dict], same index as tracks
    # velocity is used while tracking
    # track_state[i] corresponds to tracks[i]
  
    # looping through the observatiosn that are sorted by its time stamp 
    for item in sort_by_time:
        obs_id = item[0]
        obs_data = item[1]

        curr_obs_time = obs_data["time"]
        curr_pos_eci = obs_data["position_in_eci"]

        best_track_index = None
        best_score = None

        was_assigned_to_existing_track = False

        # check if current observation belongs to an existing track 
        # each new observation thats added is moving forward in time 
        for k in range(len(tracks)):

            last_obs_time = track_state[k]["last_time"]
            diff_in_time = (curr_obs_time - last_obs_time).total_seconds()
            if diff_in_time <= 0:
                continue

            F = make_F(diff_in_time)
            Q = make_Q(diff_in_time)

            x_prev = track_state[k]["x"]
            P_prev = track_state[k]["P"]

            # Predict
            x_pred = F @ x_prev #Predicted (a priori) state estimate
            P_pred = F @ P_prev @ F.T + Q # Predicted (a priori) estimate covariance P (k | k-1) = F(k)P(k-1)F(k).T + Q(k)

            z = curr_pos_eci
            R = make_R(obs_data["range"], obs_data["losUnc"])

            y = z - H @ x_pred
            S = H @ P_pred @ H.T + R

            # Mahalanobis distance (stable)
            d2 = float(y.T @ np.linalg.solve(S, y))

            if d2 < GATE_THRESHOLD:
                if best_score is None or d2 < best_score:
                    best_score = d2
                    best_track_index = k

        # assign to best track if we found one
        if best_track_index is not None:
            k = best_track_index

            last_obs_time = track_state[k]["last_time"]
            diff_in_time = (curr_obs_time - last_obs_time).total_seconds()

            F = make_F(diff_in_time)
            Q = make_Q(diff_in_time)

            x_prev = track_state[k]["x"]
            P_prev = track_state[k]["P"]

            # Predict again for the chosen track
            x_pred = F @ x_prev
            P_pred = F @ P_prev @ F.T + Q

            z = curr_pos_eci
            R = make_R(obs_data["range"], obs_data["losUnc"])

            y = z - H @ x_pred
            S = H @ P_pred @ H.T + R

            # Update
            K = P_pred @ H.T @ np.linalg.solve(S, np.eye(3))
            x_new = x_pred + K @ y
            P_new = (np.eye(6) - K @ H) @ P_pred

            track_state[k]["x"] = x_new
            track_state[k]["P"] = P_new
            track_state[k]["last_time"] = curr_obs_time

            tracks[k].append(obs_id)

        else:
            # create a new track
            x0 = np.zeros(6)
            x0[0:3] = curr_pos_eci

            sigma_pos = obs_data["range"] * np.deg2rad(obs_data["losUnc"] / 3600.0)
            P0 = np.diag([
                sigma_pos**2, sigma_pos**2, sigma_pos**2,
                100.0, 100.0, 100.0
            ])

            tracks.append([obs_id])  # IMPORTANT: keep lists aligned
            track_state.append({
                "x": x0,
                "P": P0,
                "last_time": curr_obs_time
            })
    
# output UCTP output when complete
uctp_output = []

#depending on how the gating logic created new tracks it will create a new observation 
for k in range(len(tracks)):
    x = track_state[k]["x"]
    P = track_state[k]["P"]
    last_time = track_state[k]["last_time"]

    uctp_output.append({
        "idStateVector": str(uuid.uuid4()),
        "sourcedData": tracks[k],
        "sourcedDataTypes": ["EO"] * len(tracks[k]),
        "classificationMarking": None,
        "epoch": last_time.isoformat().replace("+00:00", "Z"),#make sure to convert time back to ISO string 
        "uct": True,
        "xpos": float(x[0]), #km
        "ypos": float(x[1]),
        "zpos": float(x[2]),
        "xvel": float(x[3]), #km/s
        "yvel": float(x[4]),
        "zvel": float(x[5]),
        "referenceFrame": "J2000",
        "covReferenceFrame": "J2000",
        # TODO: convert P into the 21 lower-tri elements your schema expects
        "cov": None,
        "lunarSolar": "true",
        "solarRadPress": "true",
        "inTrackThrust": " false",
        "rms": None,
        "source": "LSAS",
        "dataMode": "REAL",
        "algorithm": "ODTK"
    })

with open("uctp_output.json", "w") as f:
    json.dump(uctp_output, f, indent=2)

# Oribital Regime
# semi major axis is a measure in km (note that LEO
# corresponds to mean altitude <2000)

# LEO : a <= 8378 km (combination of two regimes (LEO and MEO))  Low Earth Orbit
# MEO : 8378 < a < 42164 km                                      Middle Earth Orbit 

# GEO : a >= 42164 km (combination of 3 regimes : LEO GEO MEO)  Geosynchronous Orbit
# HEO : e >= 0.07 eccentricity                                  Highly Elliptical Orbit


# Finish deterministic tracklet building

# Build candidate state vector per tracklet

# Then add uncertainty model (losUnc → R matrix)

# Then build likelihood scoring

# Then consider probabilistic sampling

# now  we can group the observations based on the position and velocity 


#TODO: think about If an object suddenly changes semi-major axis or shifts regimes, 
# that’s suspicious.


# Camouflage: Hard to detect

# Concealment: Hidden or masked by clutter

# Deception: False signals or misleading observations

# Maneuver: Actual orbit changes making associations hard

# loss uncertainty
loss_uncertainty = {}
for obs in observations: 
    loss_uncertainty[obs["id"]] = np.array([
        obs["losUnc"]
    ])
