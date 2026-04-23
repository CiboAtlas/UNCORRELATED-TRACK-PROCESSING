# EVOLVE-BLOCK-START
import json
import numpy as np
from scipy.optimize import least_squares
import uuid
from datetime import datetime, timezone

# --- Constants ---
MU = 398600.4418  # Earth's gravitational parameter (km^3/s^2)
J2000_EPOCH = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
EARTH_RADIUS = 6378.137  # km
EARTH_FLATTENING = 1.0 / 298.257223563
DEG_TO_RAD = np.pi / 180.0

# --- Coordinate Transforms ---

def get_julian_date(dt):
    """Calculate Julian Date from datetime object."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = dt - J2000_EPOCH
    days = delta.total_seconds() / 86400.0
    return 2451545.0 + days

def get_gmst(jd):
    """Calculate Greenwich Mean Sidereal Time (in radians)."""
    t_ut1 = (jd - 2451545.0) / 36525.0
    gmst_seconds = 67310.54841 + (876600.0 * 3600 + 8640184.812866) * t_ut1 + \
                   0.093104 * t_ut1**2 - 6.2e-6 * t_ut1**3
    return ((gmst_seconds % 86400.0) / 240.0 * DEG_TO_RAD)

def geodetic_to_ecef(lat_deg, lon_deg, alt_km):
    """Convert Lat/Lon/Alt to ECEF coordinates."""
    lat, lon = lat_deg * DEG_TO_RAD, lon_deg * DEG_TO_RAD
    sin_lat, cos_lat = np.sin(lat), np.cos(lat)
    N = EARTH_RADIUS / np.sqrt(1.0 - (2*EARTH_FLATTENING - EARTH_FLATTENING**2) * sin_lat**2)
    x = (N + alt_km) * cos_lat * np.cos(lon)
    y = (N + alt_km) * cos_lat * np.sin(lon)
    z = (N * (1.0 - (2*EARTH_FLATTENING - EARTH_FLATTENING**2)) + alt_km) * sin_lat
    return np.array([x, y, z])

def ecef_to_eci(ecef, jd):
    """Convert ECEF to ECI using GMST rotation."""
    theta = get_gmst(jd)
    c, s = np.cos(theta), np.sin(theta)
    R = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
    return R @ ecef

def measurements_to_eci(obs):
    """Convert observation dictionary to ECI position vector."""
    dt = datetime.fromisoformat(obs['obTime'].replace('+', ' +'))
    jd = get_julian_date(dt)
    
    # Sensor position in Inertial Frame
    sensor_ecef = geodetic_to_ecef(obs['senlat'], obs['senlon'], obs['senalt'])
    sensor_eci = ecef_to_eci(sensor_ecef, jd)
    
    # Relative vector (Range/Az/El -> RA/Dec -> Cartesian)
    ra_rad, dec_rad = np.radians(obs['ra']), np.radians(obs['declination'])
    r = obs['range']
    rel_vec = np.array([
        r * np.cos(dec_rad) * np.cos(ra_rad),
        r * np.cos(dec_rad) * np.sin(ra_rad),
        r * np.sin(dec_rad)
    ])
    return sensor_eci + rel_vec

# --- Orbit Logic ---

def propagate_orbit(state0, dt):
    """Simple two-body propagation."""
    r0, v0 = state0[:3], state0[3:]
    r_norm = np.linalg.norm(r0)
    if r_norm < 6000: return state0 # Safety check
    
    accel = -MU * r0 / (r_norm**3)
    # Taylor series integration
    r_f = r0 + v0 * dt + 0.5 * accel * dt**2
    v_f = v0 + accel * dt
    return np.concatenate([r_f, v_f])

def orbit_residuals(state0, obs_list, times):
    """Residuals function for least squares optimizer."""
    residuals = []
    for obs, t in zip(obs_list, times):
        pred = propagate_orbit(state0, t)[:3]
        meas = measurements_to_eci(obs)
        residuals.extend(pred - meas)
    return np.array(residuals)

def fit_orbit(track_observations):
    """Fits an orbit to the given observations."""
    if len(track_observations) < 3: return None
    
    obs_sorted = sorted(track_observations, key=lambda x: x['obTime'])
    t0 = datetime.fromisoformat(obs_sorted[0]['obTime'].replace('+', ' +'))
    
    # Time deltas in seconds
    times = [(datetime.fromisoformat(o['obTime'].replace('+', ' +')) - t0).total_seconds() for o in obs_sorted]
    positions = [measurements_to_eci(o) for o in obs_sorted]
    
    dt = times[-1]
    if dt <= 0: return None
    
    # Initial Guess
    v_guess = (positions[-1] - positions[0]) / dt
    initial_state = np.concatenate([positions[0], v_guess])
    
    try:
        res = least_squares(orbit_residuals, initial_state, args=(obs_sorted, times), ftol=1e-3, max_nfev=20)
        return res.x
    except:
        return None

# --- Association ---

def get_obs_info(obs):
    """Returns (datetime, ECI_position)."""
    dt = datetime.fromisoformat(obs['obTime'].replace('+', ' +'))
    pos = measurements_to_eci(obs)
    return dt, pos

def associate(track, obs):
    """
    Decides if obs belongs to track.
    Returns: (is_match, score) where lower score is better.
    """
    obs_time, obs_pos = get_obs_info(obs)
    last_time, last_pos = get_obs_info(track['obs'][-1])
    dt = (obs_time - last_time).total_seconds()
    
    # Priority 1: Orbit Fit (Highest Confidence)
    if track['state'] is not None:
        dt_start = (obs_time - track['t0']).total_seconds()
        pred_pos = propagate_orbit(track['state'], dt_start)[:3]
        dist = np.linalg.norm(obs_pos - pred_pos)
        
        # Gate: 200km. Score is pure distance.
        if dist < 200.0: 
            return True, dist 

    # Priority 2: Linear Extrapolation (Medium Confidence)
    elif len(track['obs']) >= 2:
        prev_time, prev_pos = get_obs_info(track['obs'][-2])
        dt_prev = (last_time - prev_time).total_seconds()
        if dt_prev > 0:
            v_est = (last_pos - prev_pos) / dt_prev
            pred_pos = last_pos + v_est * dt
            dist = np.linalg.norm(obs_pos - pred_pos)
            
            # Gate: 500km. Score Penalty +1000 so we prefer Orbit matches.
            if dist < 500.0:
                return True, dist + 1000.0

    # Priority 3: Velocity Consistency (Lowest Confidence)
    else:
        dist = np.linalg.norm(obs_pos - last_pos)
        vel = dist / abs(dt) if dt != 0 else 0
        
        # Gate: < 12 km/s. Score Penalty +10000.
        # This penalizes single-point matches so established tracks 'win' observations.
        if vel < 12.0:
            return True, vel + 10000.0

    return False, float('inf')

def run_association(observations):
    observations = sorted(observations, key=lambda x: x['obTime'])
    tracks = []

    for obs in observations:
        obs_time, _ = get_obs_info(obs)
        best_idx, min_score = -1, float('inf')
        
        # Greedy search for best track
        for i, track in enumerate(tracks):
            match, score = associate(track, obs)
            if match and score < min_score:
                min_score = score
                best_idx = i
        
        if best_idx != -1:
            track = tracks[best_idx]
            track['obs'].append(obs)
            
            # Try to fit orbit if we have enough points
            if len(track['obs']) >= 3:
                new_state = fit_orbit(track['obs'])
                if new_state is not None:
                    track['state'] = new_state
                    # Robustly get t0 from the first observation
                    first_obs_time, _ = get_obs_info(track['obs'][0])
                    track['t0'] = first_obs_time
        else:
            tracks.append({'obs': [obs], 'state': None, 't0': obs_time})

    # Format Output
    output_data = []
    for track in tracks:
        # Determine output position
        if track['state'] is not None:
            last_obs_time, _ = get_obs_info(track['obs'][-1])
            last_t = (last_obs_time - track['t0']).total_seconds()
            
            final_state = propagate_orbit(track['state'], last_t)
            pos, vel = final_state[:3], final_state[3:]
        else:
            _, pos = get_obs_info(track['obs'][-1])
            vel = [0.0, 0.0, 0.0]

        output_data.append({
            "idStateVector": str(uuid.uuid4()),
            "sourcedData": [o['id'] for o in track['obs']],
            "sourcedDataTypes": ["EO"] * len(track['obs']),
            "classificationMarking": "U",
            "epoch": track['obs'][-1]['obTime'],
            "xpos": pos[0], "ypos": pos[1], "zpos": pos[2],
            "xvel": vel[0], "yvel": vel[1], "zvel": vel[2],
            "referenceFrame": "J2000",
            "covReferenceFrame": "J2000",
            "cov": [0.0]*21,
            "source": "openevolve-copilot-v2",
            "algorithm": "weighted-orbit-fit"
        })
    return output_data

def main():
    input_path = 'C:/Users/Owner/Documents/openevolve-main/Personal/TrackAssociation/dataset_10Objects.json'
    output_path = 'C:/Users/Owner/Documents/openevolve-main/Personal/output.txt'
    
    print(f"Reading data from: {input_path}")
    try:
        with open(input_path, 'r') as f:
            data = json.load(f)
        
        # Handle list vs dict format
        obs = data['dataset_obs'] if isinstance(data, dict) and 'dataset_obs' in data else data
        
        print(f"Processing {len(obs)} observations...")
        output = run_association(obs)
        print(f"Generated {len(output)} tracks.")
        
        with open(output_path, 'w') as f:
            json.dump(output, f, indent=2)
            print(f"Output saved to {output_path}")
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error: {e}")

# EVOLVE-BLOCK-END

if __name__ == "__main__":
    main()
