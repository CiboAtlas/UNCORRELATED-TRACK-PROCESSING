# Initial Program
The first program developed generates a randomized output file from an input observation dataset of 10 objects. It begins by loading the JSON dataset and defines an output structure for candidate
state vectors that conforms to the UCTP benchmarking framework output schema, including fields
such as idStateVector, sourcedData, placeholder position and velocity values, and other required
metadata. The program then iterates through each observation in dataset_obs and randomly assigns
each observation ID to one of the existing candidate state vectors by appending it to that entry’s
sourcedData list. At the same time, it randomly decides whether to create a new state vector,
causing the number of output entries to grow over time. The result is a synthetic output file in which
observations are grouped arbitrarily rather than through any physical tracking or association logic.
This program is best understood as a baseline or test generator for producing placeholder
association outputs, rather than as a true UCTP algorithm to test how an initial program can evolve
from the metrics the user defines in OpenEvolve.

# Evaluator
The program is evaluated by comparing its randomly generated observation groupings against the
ground-truth reference groupings in the dataset. The evaluation file computes an F1 score between
each reference track and the best matching output track based on shared observation IDs in
sourcedData, and the final score is the average of these best-match F1 values. As a result, the
program is judged on how closely its random track assignments resemble the true grouping of
observations, rather than on physical orbit quality or state estimation accuracy.

# Configuration
This configuration was run with 30 iterations and 1 island because we were starting to exhaust our free trial access. When evolving this program through free trial access, we tend to get to errors when calling the api which is why we only ran it with 30 iterations and 1 island.

# Conclusion
This experiment was designed to demonstrate how effectively OpenEvolve can improve a simple
initial program related to UCTP toward the desired evaluation metrics. Where the
initial program scored 0 out of 100 prior to any evolution. This result was expected, as the program
did not contain meaningful association logic and instead grouped observations randomly, making
it unable to track objects effectively. Based on the evaluation metrics defined by the researchers,
the objective of this experiment was to guide OpenEvolve toward developing logic that is more
closely aligned with the scoring criteria and improved overall track association performance.
