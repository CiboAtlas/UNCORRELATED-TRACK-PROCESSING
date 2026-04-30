# DASHBOARD PAGE
**Dashboard Panels**
The main dashboard is divided into two regions; outside and inside panels. This layout keeps the most important chart area large while secondary operational details stay visible around it.

**Primary center panels**
The center panels contains the main performance chart and any secondary metric cards that are generated from the evaluation file created by the user, The data being passed through in this region is from the latest checkpoint directory that OpenEvolve creates.

**Operational outside panels**
The side panels contains supporting information like configuration set up, latest metric values, log activity, and system logs.

**OpenEvolve Sources**
OpenEvolve data is typically pulled from three places: checkpoint folders, the YAML configuration file, and the logs directory. These sources can be updated from the settings page so the console can point to a different environments of wherever OpenEvolve is being run.

# DASHBOARD PAGE
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
