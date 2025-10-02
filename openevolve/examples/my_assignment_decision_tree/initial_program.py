import numpy as np
import utils


class DecisionStumpErrorRate:
    y_hat_yes = None
    y_hat_no = None
    j_best = None
    t_best = None

    def fit(self, X, y):
        n, d = X.shape

        # Get an array with the number of 0's, number of 1's, etc.
        count = np.bincount(y)

        # Get the index of the largest value in count.
        # Thus, y_mode is the mode (most popular value) of y
        y_mode = np.argmax(count)

        self.y_hat_yes = y_mode
        self.y_hat_no = None
        self.j_best = None
        self.t_best = None

        # If all the labels are the same, no need to split further
        if np.unique(y).size <= 1:
            return

        err_min = np.sum(y != y_mode)

        # Loop over features looking for the best split
        for j in range(d):
            for i in range(n):
                # Choose value to equate to
                t = X[i, j]

                # Find most likely class for each split
                y_yes_mode = utils.mode(y[X[:, j] > t])
                y_no_mode = utils.mode(y[X[:, j] <= t])

                # Make predictions
                y_pred = y_yes_mode * np.ones(n)
                y_pred[X[:, j] <= t] = y_no_mode

                # Compute error
                errors = np.sum(y_pred != y)

                # Compare to minimum error so far
                if errors < err_min:
                    # This is the lowest error, store this value
                    err_min = errors
                    self.j_best = j
                    self.t_best = t
                    self.y_hat_yes = y_yes_mode
                    self.y_hat_no = y_no_mode

    def predict(self, X):
        n, d = X.shape

        if self.j_best is None:
            return self.y_hat_yes * np.ones(n)

        go_yes = X[:, self.j_best] > self.t_best
        return np.where(go_yes, self.y_hat_yes, self.y_hat_no)


def entropy(p):
    """
    A helper function that computes the entropy of the
    discrete distribution p (stored in a 1D numpy array).
    The elements of p should add up to 1.
    This function ensures lim p-->0 of p log(p) = 0
    which is mathematically true, but numerically results in NaN
    because log(0) returns -Inf.
    """
    plogp = 0 * p  # initialize full of zeros
    plogp[p > 0] = p[p > 0] * np.log(p[p > 0])  # only do the computation when p>0
    return -np.sum(plogp)


class DecisionStumpInfoGain(DecisionStumpErrorRate):
    y_hat_yes = None
    y_hat_no = None
    j_best = None
    t_best = None

    def fit(self, X, y, split_features=None):
        n, d = X.shape

        # Address the trivial case where we do not split
        count = np.bincount(y)

        # Compute total entropy (needed for information gain)
        p = count / np.sum(count)  # Convert counts to probabilities
        entropyTotal = entropy(p)

        info_gain_max = 0
        self.j_best = None
        self.t_best = None
        self.y_hat_yes = np.argmax(count)
        self.y_hat_no = None

        # Check if labels are not all equal
        if np.unique(y).size <= 1:
            return

        if split_features is None:
            split_features = range(d)

        for j in split_features:
            thresholds = np.unique(X[:, j])
            for t in thresholds[:-1]:
                # Count number of class labels where the feature
                # is greater than threshold
                count1 = np.bincount(y[X[:, j] > t])
                count0 = np.bincount(y[X[:, j] <= t])

                # Compute infogain
                p1 = count1 / np.sum(count1)
                p0 = count0 / np.sum(count0)
                H1 = entropy(p1)
                H0 = entropy(p0)
                prob1 = np.sum(X[:, j] > t) / n
                prob0 = 1 - prob1

                # EVOLVE-BLOCK-START
                info_gain = entropyTotal - prob1 * H1 - prob0 * H0
                # EVOLVE-BLOCK-END


                # assert infoGain >= 0
                # Compare to minimum error so far
                if info_gain > info_gain_max:
                    # This is the highest information gain, store this value
                    info_gain_max = info_gain
                    self.j_best = j
                    self.t_best = t
                    self.y_hat_yes = np.argmax(count1)
                    self.y_hat_no = np.argmax(count0)
