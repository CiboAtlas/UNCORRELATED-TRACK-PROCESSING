# ALGORITHMS FOR UNCORRELATED TRACK PROCESSING
Collaborating with Airforce Research Laboratory researchers and a 5-person undergraduate student team to design and benchmark uncorrelated track processing (UCTP) algorithms for satellite data, leveraging the Google Gemini API to query into OpenEvolve LLM and improve evaluation accuracy. Currently we are evaluating through small problem sets to configure functions for UCTP, then convert into larger scale formats in a high-performance computing cluster using Nvidia SuperPOD to test on larger scale datasets with hopes of finding an efficient evolutionary algorithm and AI architecture to replace.

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
Ezra Stone

# Citations
@software{openevolve,<br> 
  title = {OpenEvolve: an open-source evolutionary coding agent},<br> 
  author = {Asankhaya Sharma},<br> 
  year = {2025},<br> 
  publisher = {GitHub},<br> 
  url = {https://github.com/codelion/openevolve}<br> 
}
