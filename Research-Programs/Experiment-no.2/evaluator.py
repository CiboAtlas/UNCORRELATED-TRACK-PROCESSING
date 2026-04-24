import json
import math
import importlib.util
import traceback
from collections import Counter
from itertools import combinations
from datetime import datetime
from openevolve.evaluation_result import EvaluationResult

DATASET_PATH = r"C:\Users\ruben\Downloads\openevolve\dataset_10Objects (1).json"


def parse_time_seconds(time_str):
    """
    Convert ISO time string to seconds since epoch.
    """
    return datetime.fromisoformat(time_str.replace("Z", "+00:00")).timestamp()


def angular_difference_deg(a, b):
    """
    Smallest angular difference in degrees, handling wraparound.
    """
    diff = abs(a - b)
    return min(diff, 360.0 - diff)


def jaccard_similarity(set_a, set_b):
    """
    Jaccard similarity between two sets.
    """
    if not set_a and not set_b:
        return 1.0
    union = set_a | set_b
    if not union:
        return 0.0
    return len(set_a & set_b) / len(union)


def load_dataset(dataset_path):
    with open(dataset_path, "r", encoding="utf-8") as f:
        return json.load(f)


def validate_output(predicted_tracks, valid_obs_ids):
    """
    Validate that the evolved program returned the expected structure.
    """
    errors = []
    warnings = []

    if not isinstance(predicted_tracks, list):
        errors.append("Output must be a list.")
        return False, errors, warnings

    all_ids = []

    for i, track in enumerate(predicted_tracks):
        if not isinstance(track, dict):
            errors.append(f"Track {i} is not a dict.")
            continue

        if "sourcedData" not in track:
            errors.append(f"Track {i} is missing 'sourcedData'.")
            continue

        if not isinstance(track["sourcedData"], list):
            errors.append(f"Track {i} 'sourcedData' must be a list.")
            continue

        if "idStateVector" not in track:
            warnings.append(f"Track {i} is missing 'idStateVector'.")
        if "sourcedDataTypes" not in track:
            warnings.append(f"Track {i} is missing 'sourcedDataTypes'.")

        for obs_id in track["sourcedData"]:
            all_ids.append(obs_id)
            if obs_id not in valid_obs_ids:
                warnings.append(f"Track {i} contains unknown observation ID: {obs_id}")

    duplicates = [obs_id for obs_id, count in Counter(all_ids).items() if count > 1]
    if duplicates:
        warnings.append(f"{len(duplicates)} observation IDs appear in more than one track.")

    return len(errors) == 0, errors, warnings


def build_truth_label_map(reference_tracks):
    """
    obs_id -> true reference track label
    """
    truth = {}
    for ref_idx, ref in enumerate(reference_tracks):
        for obs_id in ref.get("groupedObsIds", []):
            truth[obs_id] = ref_idx
    return truth


def build_predicted_label_map(predicted_tracks):
    """
    obs_id -> predicted track label
    """
    pred = {}
    for pred_idx, track in enumerate(predicted_tracks):
        for obs_id in track.get("sourcedData", []):
            pred[obs_id] = pred_idx
    return pred


def compute_binary_metrics(valid_obs_ids, truth_labels, predicted_labels):
    """
    Pairwise same-object / different-object classification metrics.
    """
    obs_ids = [obs_id for obs_id in valid_obs_ids if obs_id in truth_labels]

    tp = fp = fn = tn = 0

    for a, b in combinations(obs_ids, 2):
        truth_same = truth_labels.get(a) == truth_labels.get(b)
        pred_same = (
            a in predicted_labels and
            b in predicted_labels and
            predicted_labels[a] == predicted_labels[b]
        )

        if truth_same and pred_same:
            tp += 1
        elif not truth_same and pred_same:
            fp += 1
        elif truth_same and not pred_same:
            fn += 1
        else:
            tn += 1

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2.0 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    total_pairs = tp + fp + fn + tn
    accuracy = (tp + tn) / total_pairs if total_pairs > 0 else 0.0

    binary_score = 0.7 * f1 + 0.3 * accuracy

    return {
        "binary_score": float(binary_score),
        "pair_precision": float(precision),
        "pair_recall": float(recall),
        "pair_f1": float(f1),
        "pair_accuracy": float(accuracy),
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
    }


def compute_residual_metrics(predicted_tracks, obs_by_id):
    """
    Internal consistency metric for each predicted track.

    Uses:
    - RA spread
    - declination spread
    - range spread
    - time spread

    This is not a full orbital residual, but it gives OpenEvolve a useful signal.
    """
    if not predicted_tracks:
        return {
            "residual_score": 0.0,
            "mean_group_residual": float("inf"),
            "groups_scored": 0,
        }

    residuals = []

    for track in predicted_tracks:
        obs_list = [obs_by_id[obs_id] for obs_id in track.get("sourcedData", []) if obs_id in obs_by_id]

        if len(obs_list) < 2:
            continue

        try:
            mean_ra = sum(float(o["ra"]) for o in obs_list) / len(obs_list)
            mean_dec = sum(float(o["declination"]) for o in obs_list) / len(obs_list)
            mean_range = sum(float(o["range"]) for o in obs_list) / len(obs_list)
            mean_time = sum(parse_time_seconds(o["obTime"]) for o in obs_list) / len(obs_list)
        except Exception:
            continue

        total_resid = 0.0
        count = 0

        for o in obs_list:
            try:
                los_unc = max(float(o.get("losUnc", 1.0)), 1e-6)
                ra_resid = angular_difference_deg(float(o["ra"]), mean_ra) / los_unc
                dec_resid = abs(float(o["declination"]) - mean_dec) / los_unc
                range_resid = abs(float(o["range"]) - mean_range) / 1000.0
                time_resid = abs(parse_time_seconds(o["obTime"]) - mean_time) / 600.0
            except Exception:
                continue

            total_resid += ra_resid + dec_resid + range_resid + time_resid
            count += 1

        if count > 0:
            residuals.append(total_resid / count)

    if not residuals:
        return {
            "residual_score": 0.0,
            "mean_group_residual": float("inf"),
            "groups_scored": 0,
        }

    mean_group_residual = sum(residuals) / len(residuals)
    residual_score = 1.0 / (1.0 + mean_group_residual)

    return {
        "residual_score": float(residual_score),
        "mean_group_residual": float(mean_group_residual),
        "groups_scored": len(residuals),
    }


def greedy_match_predicted_to_reference(predicted_tracks, reference_tracks):
    """
    Match predicted tracks to reference tracks greedily by best overlap.
    """
    pred_sets = [set(track.get("sourcedData", [])) for track in predicted_tracks]
    ref_sets = [set(ref.get("groupedObsIds", [])) for ref in reference_tracks]

    matches = []
    remaining_refs = list(range(len(reference_tracks)))

    for pred_idx, pred_set in enumerate(pred_sets):
        best_ref_idx = None
        best_score = -1.0

        for ref_idx in remaining_refs:
            score = jaccard_similarity(pred_set, ref_sets[ref_idx])
            if score > best_score:
                best_score = score
                best_ref_idx = ref_idx

        if best_ref_idx is not None and best_score > 0.0:
            matches.append((pred_idx, best_ref_idx, best_score))
            remaining_refs.remove(best_ref_idx)

    return matches


def compute_state_metrics(predicted_tracks, reference_tracks):
    """
    Compare predicted state vectors to truth if they exist.

    For your current initial program, this will usually be 0.0 because the
    program does not yet return xpos/ypos/zpos/xvel/yvel/zvel.
    """
    matches = greedy_match_predicted_to_reference(predicted_tracks, reference_tracks)

    scored = 0
    total_state_score = 0.0

    for pred_idx, ref_idx, overlap in matches:
        pred = predicted_tracks[pred_idx]
        ref = reference_tracks[ref_idx]

        needed = ["xpos", "ypos", "zpos", "xvel", "yvel", "zvel"]
        if not all(k in pred for k in needed):
            continue

        try:
            px = float(pred["xpos"])
            py = float(pred["ypos"])
            pz = float(pred["zpos"])
            pvx = float(pred["xvel"])
            pvy = float(pred["yvel"])
            pvz = float(pred["zvel"])

            rx = float(ref["xpos"])
            ry = float(ref["ypos"])
            rz = float(ref["zpos"])
            rvx = float(ref["xvel"])
            rvy = float(ref["yvel"])
            rvz = float(ref["zvel"])
        except Exception:
            continue

        pos_err = math.sqrt((px - rx) ** 2 + (py - ry) ** 2 + (pz - rz) ** 2)
        vel_err = math.sqrt((pvx - rvx) ** 2 + (pvy - rvy) ** 2 + (pvz - rvz) ** 2)

        pos_score = 1.0 / (1.0 + pos_err / 1000.0)
        vel_score = 1.0 / (1.0 + vel_err / 1.0)
        state_score_this = 0.6 * pos_score + 0.4 * vel_score

        total_state_score += overlap * state_score_this
        scored += 1

    if scored == 0:
        return {
            "state_score": 0.0,
            "state_tracks_scored": 0,
        }

    return {
        "state_score": float(total_state_score / scored),
        "state_tracks_scored": scored,
    }


def compute_assignment_metrics(predicted_tracks, valid_obs_ids):
    """
    Penalize invalid IDs and duplicate use of the same observation ID.
    """
    all_ids = []
    invalid_count = 0

    for track in predicted_tracks:
        for obs_id in track.get("sourcedData", []):
            all_ids.append(obs_id)
            if obs_id not in valid_obs_ids:
                invalid_count += 1

    counts = Counter(all_ids)
    duplicate_count = sum(1 for _, c in counts.items() if c > 1)

    total = max(len(all_ids), 1)
    duplicate_penalty = duplicate_count / total
    invalid_penalty = invalid_count / total

    assignment_score = max(0.0, 1.0 - duplicate_penalty - invalid_penalty)

    return {
        "assignment_score": float(assignment_score),
        "duplicate_obs_ids": duplicate_count,
        "invalid_obs_ids": invalid_count,
    }


def evaluate(program_path):
    """
    Main OpenEvolve evaluator entry point.
    """
    try:
        spec = importlib.util.spec_from_file_location("program", program_path)
        program = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(program)

        if not hasattr(program, "run_association"):
            return EvaluationResult(
                metrics={
                    "combined_score": 0.0,
                    "binary_score": 0.0,
                    "residual_score": 0.0,
                    "state_score": 0.0,
                    "assignment_score": 0.0,
                    "error": "Missing run_association(dataset_path)",
                },
                artifacts={
                    "error_type": "MissingFunction",
                    "error_message": "Program is missing required function run_association(dataset_path).",
                    "suggestion": "Expose a stable entry point named run_association(dataset_path).",
                },
            )

        dataset = load_dataset(DATASET_PATH)
        dataset_obs = dataset.get("dataset_obs", [])
        reference_tracks = dataset.get("reference", [])

        valid_obs_ids = {obs["id"] for obs in dataset_obs if "id" in obs}
        obs_by_id = {obs["id"]: obs for obs in dataset_obs if "id" in obs}

        predicted_tracks = program.run_association(DATASET_PATH)

        is_valid, errors, warnings = validate_output(predicted_tracks, valid_obs_ids)
        if not is_valid:
            return EvaluationResult(
                metrics={
                    "combined_score": 0.0,
                    "binary_score": 0.0,
                    "residual_score": 0.0,
                    "state_score": 0.0,
                    "assignment_score": 0.0,
                    "error": "; ".join(errors),
                },
                artifacts={
                    "error_type": "InvalidOutput",
                    "error_message": "; ".join(errors),
                    "warnings": warnings,
                },
            )

        truth_labels = build_truth_label_map(reference_tracks)
        predicted_labels = build_predicted_label_map(predicted_tracks)

        binary_results = compute_binary_metrics(valid_obs_ids, truth_labels, predicted_labels)
        residual_results = compute_residual_metrics(predicted_tracks, obs_by_id)
        state_results = compute_state_metrics(predicted_tracks, reference_tracks)
        assignment_results = compute_assignment_metrics(predicted_tracks, valid_obs_ids)

        combined_score = (
            0.50 * binary_results["binary_score"] +
            0.25 * residual_results["residual_score"] +
            0.15 * state_results["state_score"] +
            0.10 * assignment_results["assignment_score"]
        )

        return EvaluationResult(
            metrics={
                "combined_score": float(combined_score),
                "binary_score": binary_results["binary_score"],
                "residual_score": residual_results["residual_score"],
                "state_score": state_results["state_score"],
                "assignment_score": assignment_results["assignment_score"],
                "pair_f1": binary_results["pair_f1"],
                "pair_precision": binary_results["pair_precision"],
                "pair_recall": binary_results["pair_recall"],
            },
            artifacts={
                "warnings": warnings,
                "state_tracks_scored": state_results["state_tracks_scored"],
                "groups_scored_for_residuals": residual_results["groups_scored"],
                "mean_group_residual": residual_results["mean_group_residual"],
                "duplicate_obs_ids": assignment_results["duplicate_obs_ids"],
                "invalid_obs_ids": assignment_results["invalid_obs_ids"],
                "pair_counts": {
                    "tp": binary_results["tp"],
                    "fp": binary_results["fp"],
                    "fn": binary_results["fn"],
                    "tn": binary_results["tn"],
                },
                "summary": (
                    f"Combined={combined_score:.4f}, "
                    f"Binary={binary_results['binary_score']:.4f}, "
                    f"Residual={residual_results['residual_score']:.4f}, "
                    f"State={state_results['state_score']:.4f}, "
                    f"Assignment={assignment_results['assignment_score']:.4f}"
                ),
            },
        )

    except Exception as e:
        return EvaluationResult(
            metrics={
                "combined_score": 0.0,
                "binary_score": 0.0,
                "residual_score": 0.0,
                "state_score": 0.0,
                "assignment_score": 0.0,
                "error": str(e),
            },
            artifacts={
                "error_type": type(e).__name__,
                "error_message": str(e),
                "traceback": traceback.format_exc(),
                "suggestion": "Check syntax, imports, dataset path, and returned output structure.",
            },
        )


def evaluate_stage1(program_path):
    return evaluate(program_path)


def evaluate_stage2(program_path):
    return evaluate(program_path)


if __name__ == "__main__":
    test_program_path = r"C:\Users\ruben\Downloads\openevolve\Attempt2.py"

    result = evaluate(test_program_path)

    print("=== Evaluator Test Output ===")
    print("Metrics:")
    for key, value in result.metrics.items():
        print(f"  {key}: {value}")

    print("\nArtifacts:")
    for key, value in result.artifacts.items():
        print(f"  {key}: {value}")
