# ALGORITHMS FOR UNCORRELATED TRACK PROCESSING
Our project addresses the challenge of identifying unknown objects in space from sparse, noisy, and time sensitive observation data. This is a critical problem in Space Domain Awareness, where accurate orbit estimation is essential for detecting, correlating, and responding to potential threats. Current development methods are often manual, time intensive, and difficult to adapt, especially as adversaries use camouflage, concealment, deception, and maneuver techniques to disrupt reliable tracking. A major challenge in Uncorrelated Track Processing is the lack of known solutions for direct comparison, making benchmarking, evaluation, and algorithm improvement difficult. OpenEvolve helps address this by providing a way to evaluate UCT processor performance and benchmark algorithm improvements.

Our project investigates the viability of OpenEvolve, an open source evolutionary coding agent that uses large language models to iteratively improve code, as a benchmarking and development support tool for Uncorrelated Track Processing. We evaluate whether it can automate parts of algorithm discovery, testing, and refinement while working with existing UCT benchmarks and performance metrics. We also built an analytics console that provides real time visibility into program evolution and performance, helping researchers identify when performance peaks, when it declines, and how the optimization process changes over time with greater transparency and reproducibility.

# About OpenEvolve
Key Features
OpenEvolve implements a comprehensive evolutionary coding system with:

- Evolutionary Coding Agent: LLM-guided evolution of entire code files (not just functions)
- Distributed Controller Loop: Asynchronous pipeline coordinating LLMs, evaluators, and databases
- Program Database: Storage and sampling of evolved programs with evaluation metrics
- Prompt Sampling: Context-rich prompts with past programs, scores, and problem descriptions
- LLM Ensemble: Multiple language models working together for code generation
- Multi-objective Optimization: Simultaneous optimization of multiple evaluation metrics
- Checkpoint System: Automatic saving and resuming of evolution state

# Links
https://github.com/codelion/openevolve<br>
https://pypi.org/project/openevolve/0.1.0/

# Contributers
Kyle Francis Galang<br> 
Aurela Broqi<br> 
Ruben Dennis<br> 
Aaron Nogues<br> 
Ezra Stone<br> 

# Contributers
Dr. Richard Leinecker, Associate Lecturer<br> 

# Citations
@software{openevolve,<br> 
  title = {OpenEvolve: an open-source evolutionary coding agent},<br> 
  author = {Asankhaya Sharma},<br> 
  year = {2025},<br> 
  publisher = {GitHub},<br> 
  url = {https://github.com/codelion/openevolve}<br> 
}
