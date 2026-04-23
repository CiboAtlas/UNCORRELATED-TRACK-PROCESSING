# Initial Programs 
**Base Program**
The base initial program implements adeterministic prototype for Uncorrelated Track Processing by
converting raw EO observations into candidate object tracks and state vectors. It begins by loading
observation data, transforming each observation’s right ascension and declination into a unit direction vector,
and converting sensor positions from geodetic coordinates into the J2000 inertial frame using ECEF-to-ECI rotation based on Greenwich Mean
Sidereal Time. Using each sensor position, range measurement, and direction vector, the program
estimates object positions in inertial space. It then sorts observations by time and applies a Kalmanfilter-style association process, 
where existing tracks are predicted forward using a constantvelocity motion model and compared against new observations through a Mahalanobis-distance
gate controlled by tunable parameters such as process noise and gating threshold. Observations that
meet the gating criteria are added to existing tracks and used to update the track state; otherwise,
new tracks are created. The final result is written as an output file containing grouped observation
IDs and estimated position and velocity state vectors for each candidate track.

**Loop Hole Program**
This loophole initial program is a more opportunistic version of the
base initial program because it is designed to exploit weaknesses in the
evaluation setup rather than focus only on physically consistent orbit
tracking. Like the previous program, it still converts EO observations into
J2000 positions, uses uncertaintyaware gating, and produces UCTPstyle grouped tracks and state
vectors. However, it adds several behaviors that make it a loophole: it
first detects whether the input resembles an orbit problem, a 2D Cartesian problem, or a 1D angle
problem, and then switches into whichever pipeline is most convenient for scoring; it introduces
special case logic for circle-style datasets and angle clustering that are unrelated to true UCTP
processing; and most importantly it uses a Monte Carlo Markov Chain style proposal loop with
track reassign, split, and merge moves to search for track groupings that maximize the scoring
objective. Its hypothesis score also explicitly rewards longer tracks and penalizes fragmentation,
which helps it exploit the evaluator by optimizing grouping behavior directly. Compared with the
previous deterministic Kalman-gating program, this version is considered a loophole because it
broadens the problem definition, uses dataset-type branching and stochastic hypothesis search, and
exploits the evaluator’s grouping-based rewards to improve score even when the added logic does
not necessarily reflect a more realistic or operationally faithful UCTP solution.

# Evaluator
Both initial programs were run with similar evaluator files where it’s responsible for executing
candidate programs and quantitatively assessing their performance against a ground-truth dataset.
It runs the candidate program, loads its generated output, and compares the predicted observation
groupings to the reference groupings defined in the dataset. For tracking problems, the evaluation
is performed through pairwise comparison of observation IDs, computing true positives, false
positives, false negatives, and true negatives to derive metrics such as precision, recall, specificity,
F1 score, and a weighted combined score. The combined score is further adjusted through soft
penalties and rewards, including penalties for excessive false positives and minimal track counts,
as well as small rewards for producing a reasonable number of tracks. Because the evaluation
emphasizes grouping accuracy and includes heuristic adjustments to the final score, it creates
opportunities for programs to optimize specifically toward these metrics rather than strictly
improving physical tracking accuracy. 

# Config
Both programs are run with 100 max iterations and 3 islands
