# ANALYTIC CONSOLE DOCUMENTATION
# OVERVIEW
The Analytic Console is an application that allows researchers to see how their algorithms and programs evolve in real time through OpenEvolve. The application combines a static frontend with a Node/Express backend. The frontend displays checkpoint metrics, OpenEvolve logs, configuration values, dataset observations, and evaluation results. The backend acts as the bridge between the browser and local OpenEvolve files, including checkpoint folders, YAML configuration files, log folders, datasets, and evaluation result JSON files.

In the production based application, it consists of four main pages: 
index.html
evaluation.html
documentation.html
settings.html

All pages are navigated by a sidebar navigation which allows users to switch between the four different pages. 

**Primary center panels**
The center panels contains the main performance chart and any secondary metric cards that are generated from the evaluation file created by the user, The data being passed through in this region is from the latest checkpoint directory that OpenEvolve creates.

**Operational outside panels**
The side panels contains supporting information like configuration set up, latest metric values, log activity, and system logs.

**OpenEvolve Sources**
OpenEvolve data is typically pulled from three places: checkpoint folders, the YAML configuration file, and the logs directory. These sources can be updated from the settings page so the console can point to a different environments of wherever OpenEvolve is being run.

# SETTINGS PAGE
Helps users set or update:
Checkpoint folder path
Config YAML path
OpenEvolve logs folder
Dashboard dataset JSON path
API key value
Program display name

The backend then saves that setting. The backend stores settings such as checkpoints_dir, config_yaml_path, openevolve_logs_dir, and dataset_json_path, and it can also read/write the API key in the OpenEvolve YAML config.

The Dashboard depends on the paths set in the settings page. For example, the dashboard uses /api/openevolve/evolutions to read checkpoint data, /api/openevolve/latest-log to read logs, /api/openevolve/config-summary to read YAML config values, and /api/settings to find the dataset path.

# PROCESS TO INSTALLING ANALYTIC CONSOLE
**Step 1:** package/zip up Production folder from Git<br> 
**Step 2:** cd into the directory you put the contents of the folder in<br> 
**Step 3:** command prompt: npm install (for node-module folder)<br> 
**Step 4:** command prompt: npm run build (for dist folder)<br> 
**Step 5:** after it builds the app, go into that dist folder<br> 
**Step 6:** double click OpenEvolve Analytics Console Setup 1.0.0 (installs the application)<br> 

****Make sure you extracted the assets folder as well, thats what stores the scripts and styling of the application****
