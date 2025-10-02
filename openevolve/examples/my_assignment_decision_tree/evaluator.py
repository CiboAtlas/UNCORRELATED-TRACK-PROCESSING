import numpy as np
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

from initial_program import DecisionStumpInfoGain
from utils import load_dataset  # ✅ use your project loader

def evaluate(program_path: str):
    try:
        # Load one of your assignment datasets
        dataset = load_dataset("citiesSmall.pkl")
        X, y = dataset["X"], dataset["y"]
        X_test, y_test = dataset["Xtest"], dataset["ytest"]

        # Train/val split for evaluation
        X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.3)

        stump = DecisionStumpInfoGain()
        stump.fit(X_train, y_train)
        y_pred = stump.predict(X_val)

        acc = accuracy_score(y_val, y_pred)

        return {
            "combined_score": acc,  # REQUIRED
            "accuracy": acc         # Match config.yaml
        }
    except Exception as e:
        return {
            "combined_score": 0.0,
            "accuracy": 0.0,      # 👈 add this line
            "error": str(e)
        }

