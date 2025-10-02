# OpenEvolve Setup & Usage

This repository contains setup notes and usage instructions for running **OpenEvolve** with different API providers.

---

## Installation

Clone the repository and install OpenEvolve:

```powershell
pip install openevolve
```

## virtual env

python -m venv venv
venv\Scripts\Activate.ps1

## download dependencies

pip install -e .

## export dependencies

pip freeze > requirements.txt

## for openrouter

$env:OPENAI_API_KEY="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"

## running circle_packing, though llm index out of range error

python openevolve-run.py examples/circle_packing/initial_program.py examples/circle_packing/evaluator.py --config examples/circle_packing/config.yaml --iterations 50
