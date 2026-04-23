import json
import subprocess
import numpy as np
import os
import sys

# uctp_output.json -- ouput from uctp -> input to evalutor 
# output_dataset.json -- fed to uct processor, ground truth dataset used for training and evaluation only.

PROJECT_ROOT = os.getcwd()

pred_path = os.path.join(PROJECT_ROOT, "uctp-openevolve-example", "uctp_output.json")
truth_path = os.path.join(PROJECT_ROOT, "uctp-openevolve-example", "output_dataset.json")

program_path = "initial_program.py"

def evaluate(candidate_path: str):

    print("🔥 EVALUATOR RUNNING")
    print("Candidate path:", candidate_path)

    import os, shutil, uuid

    print("CWD:", os.getcwd())

    try:
        # storing candidates after mutation 
        SAVE_DIR = os.path.join(PROJECT_ROOT, "uctp-openevolve-example", "saved_candidates")
        os.makedirs(SAVE_DIR, exist_ok=True)

        save_path = os.path.join(SAVE_DIR, f"{uuid.uuid4()}.py")

        shutil.copy(candidate_path, save_path)

        print("✅ SAVED:", save_path)

    except Exception as e:
        print("❌ COPY FAILED:", e)

    # check if pred_path was created     
    if os.path.exists(pred_path):
        os.remove(pred_path)

    # run subprocess 
    try:
        subprocess.run(
            [sys.executable, candidate_path], # <--- 2. CHANGE "python" to sys.executable
            check=True,
            timeout=300
        )
    except Exception as e:
        print("❌ Candidate execution failed:", e)
        return default_metrics() # to prevent crashing 
    # end of process

    if not os.path.exists(pred_path):
        print("❌ Missing output file")
        return default_metrics()

    # artifacts 

    # Loading in the output after it ran through the intial progam
    # aka input to the evaluator
    # this is what we want to evaluate since its what our
    # initial program produced
    try:
        with open(pred_path) as f:
            pred = json.load(f)
    except Exception as e:
        print("❌ Failed to load prediction:", e)
        return default_metrics()

    # Load ground truth    
    with open(truth_path) as f:
        truth = json.load(f)

    # this is the generated data pulled from UDL with create_datasete.py script
    # answer key -- how we will calculate if our predictions
    # are accurate

    ref = truth.get("reference", {})

    # --- CIRCLE ---
    if isinstance(ref, dict) and "r" in ref:
        return evaluate_circle(pred, ref, truth)

    # --- ELLIPSE ---
    elif isinstance(ref, dict) and "semimajor axis" in ref and "eccentricity" in ref:
        return evaluate_ellipse(pred, ref, truth)

    # --- TRACKING ---
    elif isinstance(ref, list):
        return evaluate_tracking(pred, ref, truth)

    # --- UNKNOWN ---
    else:
        return default_metrics()


def default_metrics():
    return {
        "accuracy": 0.0,
        "precision": 0.0,
        "recall": 0.0,
        "specificity": 0.0,
        "balanced_accuracy": 0.0,
        "f1_score": 0.0,
        "combined_score": 0.0,
        "num_tracks": 0,
        "artifacts": {
            "num_tracks": 0,
            "total_pairs": 0,
            "tp": 0,
            "fp": 0,
            "fn": 0,
            "tn": 0
        }
    }

def evaluate_circle(pred, ref, truth):

    if not isinstance(pred, dict):
        return default_metrics()

    r_true = ref.get("r")
    r_pred = pred.get("estimated_r")

    if r_true is None or r_pred is None:
        return default_metrics()

    error = abs(r_pred - r_true)
    score = np.exp(-error)

    return {
        "precision": score,
        "recall": score,
        "f1_score": score,
        "combined_score": score,
        "num_tracks": 1,
        "artifacts": {"radius_error": error}
    }
    
def evaluate_ellipse(pred, ref, truth):

    if not isinstance(pred, dict):
        return default_metrics()

    a_true = ref.get("semimajor axis")
    e_true = ref.get("eccentricity")

    a_pred = pred.get("estimated_a")
    e_pred = pred.get("estimated_e")

    if a_true is None or e_true is None or a_pred is None or e_pred is None:
        return default_metrics()

    error = abs(a_pred - a_true) + abs(e_pred - e_true)
    score = np.exp(-error)

    return {
        "precision": score,
        "recall": score,
        "f1_score": score,
        "combined_score": score,
        "num_tracks": 1,
        "artifacts": {"ellipse_error": error}
    }

def evaluate_tracking(pred, ref, truth):

    # 1️⃣ Validate prediction format
    if not isinstance(pred, list):
        print("❌ Prediction is not a list")
        return default_metrics()

    pred_dict = {}

    for state in pred:
        if not isinstance(state, dict):
            print("❌ Invalid state:", state)
            return default_metrics()

        if "idStateVector" not in state or "sourcedData" not in state:
            print("❌ Invalid track format:", state)
            return default_metrics()

        track_id = state["idStateVector"]

        for obs_id in state["sourcedData"]:
            pred_dict[obs_id] = track_id

    # truth mapping
    truth_dict = {}

    for ref_index, group in enumerate(ref):
        if not isinstance(group, dict):
            continue

        grouped = group.get("groupedObsIds")
        if grouped is None:
            continue

        for obs_id in grouped:
            truth_dict[obs_id] = ref_index

    # compare pairs
    obs_ids = list(truth_dict.keys())

    TP = FP = TN = FN = 0

    for i in range(len(obs_ids)):
        for j in range(i + 1, len(obs_ids)):

            id_i = obs_ids[i]
            id_j = obs_ids[j]

            same_truth = truth_dict[id_i] == truth_dict[id_j]

            pred_i = pred_dict.get(id_i)
            pred_j = pred_dict.get(id_j)

            same_pred = (
                pred_i is not None and
                pred_j is not None and
                pred_i == pred_j
            )

            if same_truth and same_pred:
                TP += 1
            elif same_truth and not same_pred:
                FN += 1
            elif not same_truth and same_pred:
                FP += 1
            else:
                TN += 1

    # metrics
    total = TP + FP + FN + TN

    accuracy = (TP + TN) / total if total > 0 else 0.0
    precision = TP / (TP + FP) if (TP + FP) > 0 else 0.0
    recall = TP / (TP + FN) if (TP + FN) > 0 else 0.0
    specificity = TN / (TN + FP) if (TN + FP) > 0 else 0.0
    balanced_accuracy = 0.5 * (recall + specificity) if (TP + FN) > 0 and (TN + FP) > 0 else 0.0
    f1_score = (2 * TP) / ((2 * TP) + FP + FN) if ((2 * TP) + FP + FN) > 0 else 0.0

    combined_score = (
        0.4 * f1_score +
        0.3 * precision +
        0.2 * recall +
        0.1 * specificity
    )

    num_tracks = len(pred)

    # --- Soft penalty (not harsh) ---
    if num_tracks <= 1:
        combined_score *= 0.5   # was 0.1 → too aggressive

    # --- Softer FP penalty ---
    fp_rate = FP / (TP + FP + 1e-8)
    combined_score -= 0.1 * fp_rate   # was 0.3 → too strong

    # --- Small reward for structure ---
    combined_score += 0.1 * min(num_tracks / 50, 1.0)

    combined_score = max(combined_score, 0.0)

    return {
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "specificity": specificity,
        "balanced_accuracy": balanced_accuracy,
        "f1_score": f1_score,
        "combined_score": combined_score,
        "num_tracks": len(pred),
        "artifacts": {
            "num_tracks": len(pred),
            "total_pairs": total,
            "tp": TP,
            "fp": FP,
            "fn": FN,
            "tn": TN
        }
    }