import json
import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Tuple


# Tunable parameters
MAX_TIME_GAP_SEC = 45 * 60      # 45 minutes
GATE_DEG = 0.25                 # angular gate in degrees
GATE_RANGE_KM = 1500.0          # optional range gate
USE_RANGE_GATE = True

UNCERTAINTY_SCALE = False
UNC_K = 3.0


# Helpers
def parse_time_zulu(s: str) -> float:
    """Parse ISO 8601 time string into seconds since epoch."""
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return dt.timestamp()


def wrap_ra_deg(ra: float) -> float:
    """Wrap RA into [0, 360)."""
    return ra % 360.0


def ang_sep_deg(ra1_deg: float, dec1_deg: float, ra2_deg: float, dec2_deg: float) -> float:
    """
    Great-circle angular separation between two sky directions in degrees.
    """
    ra1 = math.radians(wrap_ra_deg(ra1_deg))
    ra2 = math.radians(wrap_ra_deg(ra2_deg))
    dec1 = math.radians(dec1_deg)
    dec2 = math.radians(dec2_deg)

    cosang = (
        math.sin(dec1) * math.sin(dec2)
        + math.cos(dec1) * math.cos(dec2) * math.cos(ra1 - ra2)
    )
    cosang = max(-1.0, min(1.0, cosang))
    return math.degrees(math.acos(cosang))


def ra_diff_deg(ra2: float, ra1: float) -> float:
    """
    Smallest signed RA difference ra2 - ra1 in degrees.
    Result is in (-180, 180].
    """
    return (wrap_ra_deg(ra2) - wrap_ra_deg(ra1) + 180.0) % 360.0 - 180.0


def predict_linear_angle(
    last_ra: float,
    last_dec: float,
    ra_rate: float,
    dec_rate: float,
    dt_sec: float,
) -> Tuple[float, float]:
    """
    Predict RA/Dec forward using a linear angular-rate model.
    """
    ra_pred = wrap_ra_deg(last_ra + ra_rate * dt_sec)
    dec_pred = last_dec + dec_rate * dt_sec
    return ra_pred, dec_pred


# -----------------------------
# Data structures
# -----------------------------
@dataclass
class Obs:
    oid: str
    t: float
    ra: float
    dec: float
    rng: Optional[float]
    los_unc: Optional[float]
    sensor: str


@dataclass
class Track:
    obs: List[Obs] = field(default_factory=list)

    def last(self) -> Obs:
        return self.obs[-1]

    def has_rate(self) -> bool:
        return len(self.obs) >= 2

    def rate_deg_per_sec(self) -> Tuple[float, float]:
        """
        Estimate angular rates from the last two observations.
        """
        o1 = self.obs[-2]
        o2 = self.obs[-1]
        dt = o2.t - o1.t
        if dt <= 0:
            return 0.0, 0.0

        ra_rate = ra_diff_deg(o2.ra, o1.ra) / dt
        dec_rate = (o2.dec - o1.dec) / dt
        return ra_rate, dec_rate

    def predict_ra_dec(self, t_new: float) -> Tuple[float, float]:
        """
        Predict sky position at a new time.
        """
        o_last = self.last()
        dt = t_new - o_last.t
        if dt <= 0 or not self.has_rate():
            return o_last.ra, o_last.dec

        ra_rate, dec_rate = self.rate_deg_per_sec()
        return predict_linear_angle(o_last.ra, o_last.dec, ra_rate, dec_rate, dt)

    def compatible(self, o: Obs) -> Tuple[bool, float]:
        """
        Check whether a new observation is compatible with this track.

        Returns:
            (is_compatible, score)
        Lower score is better.
        """
        dt = o.t - self.last().t
        if dt < 0 or dt > MAX_TIME_GAP_SEC:
            return False, float("inf")

        ra_pred, dec_pred = self.predict_ra_dec(o.t)
        sep = ang_sep_deg(ra_pred, dec_pred, o.ra, o.dec)

        gate = GATE_DEG
        if UNCERTAINTY_SCALE and o.los_unc is not None:
            # Assumes losUnc might be in arcseconds. Keep off unless confirmed.
            gate = max(gate, UNC_K * (o.los_unc / 3600.0))

        if sep > gate:
            return False, sep

        if USE_RANGE_GATE and o.rng is not None and self.last().rng is not None:
            if abs(o.rng - self.last().rng) > GATE_RANGE_KM:
                return False, sep

        return True, sep



# Association algorithm
# EVOLVE-BLOCK-START
def group_observations(observations: List[Obs]) -> List[List[str]]:
    """
    Directly group observations into tracks using greedy prediction-based association.
    Returns a list of grouped observation ID lists.
    """
    observations = sorted(observations, key=lambda x: x.t)
    tracks: List[Track] = []

    for o in observations:
        best_i = None
        best_score = float("inf")

        for i, trk in enumerate(tracks):
            ok, score = trk.compatible(o)
            if ok and score < best_score:
                best_score = score
                best_i = i

        if best_i is None:
            tracks.append(Track(obs=[o]))
        else:
            tracks[best_i].obs.append(o)

    return [[obs.oid for obs in trk.obs] for trk in tracks]
# EVOLVE-BLOCK-END


# Dataset loading / interface
def load_dataset(path: str) -> List[Obs]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    obs_list: List[Obs] = []
    for row in data["dataset_obs"]:
        obs_list.append(
            Obs(
                oid=row["id"],
                t=parse_time_zulu(row["obTime"]),
                ra=float(row["ra"]),
                dec=float(row["declination"]),
                rng=float(row["range"]) if row.get("range") is not None else None,
                los_unc=float(row["losUnc"]) if row.get("losUnc") is not None else None,
                sensor=str(row.get("idSensor", "unknown")),
            )
        )
    return obs_list


def run_association(dataset_path: str):
    """
    Stable interface for the evaluator / OpenEvolve.

    Returns UCTP-style minimal output:
    [
      {
        "idStateVector": "...",
        "sourcedData": [...],
        "sourcedDataTypes": [...]
      },
      ...
    ]
    """
    observations = load_dataset(dataset_path)
    groups = group_observations(observations)

    output = []
    for i, group in enumerate(groups, start=1):
        output.append(
            {
                "idStateVector": f"track-{i}",
                "sourcedData": group,
                "sourcedDataTypes": ["EO"] * len(group),
            }
        )

    return output


def main():
    dataset_path = r"C:\Users\ruben\Downloads\openevolve\dataset_10Objects (1).json"
    output_path = r"C:\Users\ruben\Downloads\openevolve\output.txt"

    output = run_association(dataset_path)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"Tracks found: {len(output)}")
    for i, trk in enumerate(output[:10], start=1):
        print(f"  Track {i}: {len(trk['sourcedData'])} obs")
    print(f"Wrote output to {output_path}")


if __name__ == "__main__":
    main()