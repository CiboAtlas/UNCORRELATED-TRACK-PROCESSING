# Initial Program
The second program was developed concurrently with
experiment No. 1. This program focused on improving
object observability and track continuity. In the first stage,
the program takes in the time and directional measurements
of observed objects and sorts them in order. This step is
important because telescopes and sensors have only a
limited observation window before the object moves out of view, at which point continued tracking
must be handed off to another sensor located elsewhere. In the second stage, the program attempts
to merge these short observation tracklets and stitch them together into a single continuous track.
The primary purpose of this program was to evaluate OpenEvolve on a more complex initial problem and determine how much additional performance and logic
refinement could be achieved through its evolutionary process.

# Evaluator
This evaluator file is the scoring script for OpenEvolve: it loads your candidate Python program, checks that it has a required run_association(dataset_path) function, runs it on the hardcoded dataset, validates that the program returns a proper list of predicted tracks with sourcedData observation IDs, and then compares those predicted groupings against the reference truth data. Its main goal is to see how well your program groups observations that belong to the same space object. It calculates pairwise precision, recall, F1, and accuracy, then adds extra scoring for internal track consistency using RA, declination, range, and time spread, optionally scores position/velocity state vectors if your program provides them, and penalizes duplicate or invalid observation IDs. The final combined_score is weighted as 50% binary grouping accuracy, 25% residual consistency, 15% state vector accuracy, and 10% assignment validity, so OpenEvolve can use that score to decide whether a newly evolved program is better or worse.

# Config
This program was run within 30 iterations and 3 islands to go against the first experiment and experimenting what would happen if we added more diversity.

# Conclusion
As discussed before, the problem gets more difficult as
more logic gets implemented into the initial and evaluator
programs. Where if we try to base the efficiency and how
well our program performs strictly based off of the
combined score. How does OpenEvolve improve that score, and what trade-offs are
made in the process? This question was explored through
the experimentation conducted with this program. Iimprovements in residual score
were accompanied by declines in binary score. These
results raised an important concern for researchers. What
does it actually mean for a program to perform better
when improvement in one metric may come at the
expense of another? Alongside what if that improvement weighs more heavily than the degradation
of other metrics which causes the combined score to increase although other metrics are performing
worse.
