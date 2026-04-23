import importlib.util
import json
import traceback
import os
import numpy as np
from openevolve.evaluation_result import EvaluationResult

# Configuration
DATASET_PATH = os.path.join(os.path.dirname(__file__), 'dataset_10Objects.json')

def calculate_f1_score(set_a, set_b):
    """
    Calculates F1 score between two sets of IDs.
    F1 = 2 * (precision * recall) / (precision + recall)
    """
    if not set_a and not set_b:
        return 1.0
    if not set_a or not set_b:
        return 0.0
        
    tp = len(set_a.intersection(set_b))
    fp = len(set_b) - tp
    fn = len(set_a) - tp
    
    if tp == 0:
        return 0.0
        
    precision = tp / (tp + fp)
    recall = tp / (tp + fn)
    
    if precision + recall == 0:
        return 0.0
        
    return 2 * (precision * recall) / (precision + recall)

def evaluate(program_path):
    """
    Evaluate the track association program using Average F1 Score.
    """
    try:
        # 1. Load the Dataset
        if not os.path.exists(DATASET_PATH):
            return EvaluationResult(
                metrics={"combined_score": 0.0},
                artifacts={"error": f"Dataset not found at {DATASET_PATH}"}
            )
            
        with open(DATASET_PATH, 'r') as f:
            data = json.load(f)
            
        observations = data.get('dataset_obs', [])
        reference_tracks_data = data.get('reference', [])
        
        # Prepare Reference Sets (Ground Truth)
        reference_track_sets = [set(t.get('groupedObsIds', [])) for t in reference_tracks_data]
        
        if not reference_track_sets:
            return EvaluationResult(
                metrics={"combined_score": 0.0},
                artifacts={"error": "No reference tracks found in dataset"}
            )

        # 2. Load the Candidate Program
        spec = importlib.util.spec_from_file_location("program", program_path)
        program = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(program)
        except Exception as e:
            return EvaluationResult(
                metrics={"combined_score": 0.0},
                artifacts={"error": f"Import failed: {str(e)}", "traceback": traceback.format_exc()}
            )

        # 3. Run the Program
        if not hasattr(program, "run_association"):
            return EvaluationResult(
                metrics={"combined_score": 0.0},
                artifacts={"error": "Program missing 'run_association' function"}
            )

        try:
            output_data = program.run_association(observations)
        except Exception as e:
            return EvaluationResult(
                metrics={"combined_score": 0.0},
                artifacts={"error": f"Runtime error: {str(e)}", "traceback": traceback.format_exc()}
            )

        # 4. Score the Output (Soft Matching)
        output_track_sets = [set(track.get('sourcedData', [])) for track in output_data]
        
        total_f1 = 0.0
        matched_indices = set()
        track_breakdown = []

        # For every reference track, find the best matching output track
        for i, ref_set in enumerate(reference_track_sets):
            best_f1 = 0.0
            best_match_idx = -1
            
            for j, out_set in enumerate(output_track_sets):
                # Calculate score
                score = calculate_f1_score(ref_set, out_set)
                
                if score > best_f1:
                    best_f1 = score
                    best_match_idx = j
            
            # Record the best match for this reference track
            track_breakdown.append({
                "ref_track_id": i,
                "best_match_output_id": best_match_idx,
                "score": round(best_f1, 4),
                "ref_length": len(ref_set),
                "out_length": len(output_track_sets[best_match_idx]) if best_match_idx != -1 else 0
            })
            
            total_f1 += best_f1

        # Calculate Average F1 Score
        # We divide by the number of reference tracks to normalize (0.0 to 1.0)
        final_score = total_f1 / len(reference_track_sets) if reference_track_sets else 0.0

        # 5. Create Artifacts
        artifacts = {
            "output_track_count": len(output_track_sets),
            "reference_track_count": len(reference_track_sets),
            "track_scores": track_breakdown, # Helps the LLM see which specific tracks failed
            "sample_output": str(output_data[:1]) if output_data else "No output"
        }

        return EvaluationResult(
            metrics={
                "combined_score": final_score,
                "accuracy": final_score, # Using F1 as the accuracy proxy
            },
            artifacts=artifacts
        )

    except Exception as e:
        return EvaluationResult(
            metrics={"combined_score": 0.0},
            artifacts={"error": f"Evaluation exception: {str(e)}", "traceback": traceback.format_exc()}
        )