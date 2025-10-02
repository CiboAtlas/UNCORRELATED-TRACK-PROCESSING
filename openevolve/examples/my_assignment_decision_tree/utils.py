import argparse
from pathlib import Path
import pickle

import numpy as np
import matplotlib.pyplot as plt
import statistics


def load_dataset(filename):
    with open(Path("..", "data", filename).with_suffix(".pkl"), "rb") as f:
        return pickle.load(f)


def plot_classifier(model, X, y):
    """plots the decision boundary of the model and the scatterpoints
       of the target values 'y'.

    Assumptions
    -----------
    y : it should contain two classes: '1' and '2'

    Parameters
    ----------
    model : the trained model which has the predict function

    X : the N by D feature array

    y : the N element vector corresponding to the target values

    """
    x1 = X[:, 0]
    x2 = X[:, 1]

    x1_min, x1_max = int(x1.min()) - 1, int(x1.max()) + 1
    x2_min, x2_max = int(x2.min()) - 1, int(x2.max()) + 1

    x1_line = np.linspace(x1_min, x1_max, 200)
    x2_line = np.linspace(x2_min, x2_max, 200)

    x1_mesh, x2_mesh = np.meshgrid(x1_line, x2_line)

    mesh_data = np.c_[x1_mesh.ravel(), x2_mesh.ravel()]

    y_pred = model.predict(mesh_data)
    y_pred = np.reshape(y_pred, x1_mesh.shape)

    plt.figure()
    plt.xlim([x1_mesh.min(), x1_mesh.max()])
    plt.ylim([x2_mesh.min(), x2_mesh.max()])

    plt.contourf(
        x1_mesh,
        x2_mesh,
        -y_pred.astype(int),  # unsigned int causes problems with negative sign... o_O
        cmap=plt.cm.RdBu,
        alpha=0.6,
    )

    plt.scatter(x1[y == 0], x2[y == 0], color="b", label="class 0")
    plt.scatter(x1[y == 1], x2[y == 1], color="r", label="class 1")
    plt.legend()


def mode(y):
    """Computes the element with the maximum count

    Parameters
    ----------
    y : an input numpy array

    Returns
    -------
    y_mode :
        Returns the element with the maximum count
    """
    if len(y) == 0:
        return -1
    else:
        return statistics.mode(y.flatten())


def euclidean_dist_squared(X, Xtest):
    """Computes the Euclidean distance between rows of 'X' and rows of 'Xtest'

    Parameters
    ----------
    X : an N by D numpy array
    Xtest: an T by D numpy array

    Returns: an array of size N by T,
    #        containing the pairwise squared Euclidean distances.

    Python/Numpy (and other numerical languages like Matlab and R)
    can be slow at executing operations in `for' loops, but allows fast
    hardware-dependent vector and matrix operations. By taking advantage of SIMD
    registers and multiple cores (and faster matrix-multiplication algorithms),
    vector and matrix operations in Numpy will often be several times faster
    than if you implemented them yourself in a fast language like C. The
    following code will form a matrix containing the squared Euclidean
    distances between all training and test points. If the output is stored in
    D, then element D[i,j] gives the squared Euclidean distance between training
    point i and testing point j. It exploits the identity (a-b)^2 = a^2 + b^2 - 2ab.
    The right-hand-side of the above is more amenable to vector/matrix operations.
    """
    # for reference, sklearn.metrics.pairwise.euclidean_distances
    # does this but a little bit nicer; this code is just here so you can
    # easily see that it's not doing anything actually very complicated

    X_norms_sq = np.sum(X ** 2, axis=1)
    Xtest_norms_sq = np.sum(Xtest ** 2, axis=1)
    dots = X @ Xtest.T

    return X_norms_sq[:, np.newaxis] + Xtest_norms_sq[np.newaxis, :] - 2 * dots


################################################################################
# Helpers for setting up the command-line interface

_funcs = {}


def handle(number):
    def register(func):
        _funcs[number] = func
        return func

    return register


def run(question):
    if question not in _funcs:
        raise ValueError(f"unknown question {question}")
    return _funcs[question]()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("question", choices=sorted(_funcs.keys()) + ["all"])
    args = parser.parse_args()
    if args.question == "all":
        for q in sorted(_funcs.keys()):
            start = f"== {q} "
            print("\n" + start + "=" * (80 - len(start)))
            run(q)
    else:
        return run(args.question)
