/**
 * Analytics Console Server
 * - static file hosting
 * - settings storage
 * - OpenEvolve summaries
 * - evaluation render route
 */

'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const YAML = require('yaml');
const { spawn } = require('child_process');
require('dotenv').config();

const app = express();

/* =========================
   APP CONFIG
========================= */

app.use(express.static(path.join(__dirname)));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const APP = {
  port: Number(process.env.PORT) || 3000
};

const DEFAULTS = {
  checkpointsDir:
    process.env.OPENEVOLVE_CHECKPOINTS_DIR ||
    path.join(
      'C:',
      'Users',
      'kfg4s',
      'Downloads',
      'SENIOR DESIGN',
      'openevolve',
      'examples',
      'function_minimization',
      'openevolve_output',
      'checkpoints'
    ),

  configYamlPath:
    process.env.OPENEVOLVE_CONFIG_PATH ||
    path.join(
      'C:',
      'Users',
      'kfg4s',
      'Downloads',
      'SENIOR DESIGN',
      'openevolve',
      'examples',
      'function_minimization',
      'config.yaml'
    ),

  logsDir:
    process.env.OPENEVOLVE_LOGS_DIR ||
    path.join(
      'C:',
      'Users',
      'kfg4s',
      'Downloads',
      'SENIOR DESIGN',
      'openevolve',
      'examples',
      'function_minimization',
      'openevolve_output',
      'logs'
    )
};

const SETTINGS_FILE = path.join(__dirname, 'app-settings.json');

/* =========================
   SMALL UTILITIES
========================= */

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeMetrics(metrics) {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    return {};
  }

  const out = {};
  for (const [key, value] of Object.entries(metrics)) {
    const n = safeNumber(value);
    out[key] = n != null ? n : value;
  }
  return out;
}

function ensureExists(targetPath, messagePrefix = 'Path does not exist') {
  if (!fs.existsSync(targetPath)) {
    const error = new Error(`${messagePrefix}: ${targetPath}`);
    error.status = 400;
    throw error;
  }
}

function readTextFile(filePath) {
  ensureExists(filePath, 'File not found');
  return fs.readFileSync(filePath, 'utf8');
}

function writeTextFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function jsonOk(res, payload = {}) {
  res.json({ success: true, ...payload });
}

function jsonError(res, status, error, message) {
  res.status(status).json({
    error,
    message
  });
}

function handleRoute(label, handler) {
  return async (req, res) => {
    try {
      const payload = await handler(req, res);
      if (res.headersSent) return;
      jsonOk(res, payload || {});
    } catch (error) {
      console.error(`[${label}]`, error);
      jsonError(
        res,
        error.status || 500,
        `${label} error`,
        error.message || `Failed to handle ${label}`
      );
    }
  };
}

function escapeYamlDoubleQuoted(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function stripYamlWrappingQuotes(value) {
  const trimmed = String(value).trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function getCheckpointIndex(name) {
  const match = /^checkpoint_(\d+)$/i.exec(name);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function tailLines(text, maxLines = 120) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  return lines.slice(-maxLines).join('\n').trimEnd();
}

function resolveMaybeRelativePath(inputPath) {
  const trimmed = String(inputPath || '').trim();

  if (!trimmed) {
    const error = new Error('Please provide a non-empty path');
    error.status = 400;
    error.code = 'Missing path';
    throw error;
  }

  const resolved = path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(__dirname, trimmed);

  if (!fs.existsSync(resolved)) {
    const error = new Error(`Path does not exist: ${resolved}`);
    error.status = 400;
    error.code = 'Invalid path';
    throw error;
  }

  return resolved;
}

/* =========================
   SETTINGS
========================= */

function getDefaultSettings() {
  return {
    checkpoints_dir: DEFAULTS.checkpointsDir,
    config_yaml_path: DEFAULTS.configYamlPath,
    openevolve_logs_dir: DEFAULTS.logsDir,
    program_name: 'Program Name',
    program_subtext: 'Initial-program',
    pathway_label: 'Pathway',
    api_key_label: 'Key'
  };
}

function loadAppSettings() {
  const defaults = getDefaultSettings();

  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      writeTextFile(SETTINGS_FILE, JSON.stringify(defaults, null, 2));
      return defaults;
    }

    const parsed = JSON.parse(readTextFile(SETTINGS_FILE));
    return { ...defaults, ...parsed };
  } catch (error) {
    console.error('[settings] failed to load settings:', error.message);
    return defaults;
  }
}

function saveAppSettings(nextSettings) {
  writeTextFile(SETTINGS_FILE, JSON.stringify(nextSettings, null, 2));
}

let appSettings = loadAppSettings();

function getActiveCheckpointsDir() {
  return appSettings.checkpoints_dir || DEFAULTS.checkpointsDir;
}

function getActiveConfigYamlPath() {
  return appSettings.config_yaml_path || DEFAULTS.configYamlPath;
}

function getActiveOpenEvolveLogsDir() {
  return appSettings.openevolve_logs_dir || DEFAULTS.logsDir;
}

function validateNonEmptyPath(value, fieldName, missingLabel) {
  const trimmed = String(value || '').trim();

  if (!trimmed) {
    const error = new Error(`Please provide a non-empty ${fieldName}`);
    error.status = 400;
    error.code = missingLabel;
    throw error;
  }

  if (!fs.existsSync(trimmed)) {
    const error = new Error(`Path does not exist: ${trimmed}`);
    error.status = 400;
    error.code = missingLabel;
    throw error;
  }

  return trimmed;
}

function applySettingIfPresent(nextSettings, body, key, validator) {
  if (typeof body[key] === 'undefined') return;
  nextSettings[key] = validator ? validator(body[key]) : String(body[key]).trim();
}

function applyTrimmedTextIfPresent(nextSettings, body, key) {
  if (typeof body[key] !== 'string') return;
  const trimmed = body[key].trim();
  if (trimmed) nextSettings[key] = trimmed;
}

/* =========================
   YAML HELPERS
========================= */

function readYamlConfig(configPath = getActiveConfigYamlPath()) {
  ensureExists(configPath, 'Config YAML not found');

  const parsed = YAML.parse(readTextFile(configPath));
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid YAML config: ${configPath}`);
  }

  return parsed;
}

function readYamlApiKey(configPath = getActiveConfigYamlPath()) {
  ensureExists(configPath, 'Config YAML not found');

  const raw = readTextFile(configPath);
  const match = raw.match(/^\s*api_key:\s*(.+?)\s*$/m);

  if (!match) return '';

  const value = stripYamlWrappingQuotes(match[1]);
  return value.toLowerCase() === 'null' ? '' : value;
}

function writeYamlApiKey(configPath, nextApiKey) {
  ensureExists(configPath, 'Config YAML not found');

  const raw = readTextFile(configPath);
  const replacementLine = `api_key: "${escapeYamlDoubleQuoted(nextApiKey)}"`;

  if (/^\s*api_key:\s*.+$/m.test(raw)) {
    writeTextFile(
      configPath,
      raw.replace(/^\s*api_key:\s*.+$/m, replacementLine)
    );
    return;
  }

  writeTextFile(configPath, `${raw.trimEnd()}\n${replacementLine}\n`);
}

function getConfigSummary() {
  const configPath = getActiveConfigYamlPath();
  const cfg = readYamlConfig(configPath);

  return {
    config_yaml_path: configPath,
    max_iterations: safeNumber(cfg.max_iterations),
    checkpoint_interval: safeNumber(cfg.checkpoint_interval),
    population_size: safeNumber(cfg?.database?.population_size),
    num_islands: safeNumber(cfg?.database?.num_islands),
    max_code_length: safeNumber(cfg.max_code_length),
    diff_based_evolution:
      typeof cfg.diff_based_evolution === 'boolean'
        ? cfg.diff_based_evolution
        : null
  };
}

/* =========================
   OPENEVOLVE CHECKPOINTS
========================= */

function listCheckpointFolders(checkpointsDir) {
  ensureExists(checkpointsDir, 'Checkpoint directory not found');

  return fs
    .readdirSync(checkpointsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^checkpoint_\d+$/i.test(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => getCheckpointIndex(a) - getCheckpointIndex(b));
}

function parseEvolutionInfo(infoPath, checkpointName) {
  const parsed = JSON.parse(readTextFile(infoPath));

  const currentIteration =
    safeNumber(parsed.current_iteration) ??
    safeNumber(parsed.iteration) ??
    safeNumber(parsed.generation);

  if (currentIteration == null) return null;

  return {
    checkpoint: checkpointName,
    id: parsed.id ?? '',
    generation: safeNumber(parsed.generation),
    iteration: safeNumber(parsed.iteration),
    current_iteration: currentIteration,
    timestamp: safeNumber(parsed.timestamp),
    saved_at: safeNumber(parsed.saved_at),
    language: parsed.language ?? null,
    metrics: normalizeMetrics(parsed.metrics)
  };
}

function readOpenEvolveEvolutionRows() {
  const checkpointsDir = getActiveCheckpointsDir();
  const checkpointFolders = listCheckpointFolders(checkpointsDir);
  const evolutions = [];

  for (const folder of checkpointFolders) {
    const infoPath = path.join(checkpointsDir, folder, 'best_program_info.json');
    if (!fs.existsSync(infoPath)) continue;

    try {
      const row = parseEvolutionInfo(infoPath, folder);
      if (row) evolutions.push(row);
    } catch (error) {
      console.error(`[evolutions] failed reading ${infoPath}:`, error.message);
    }
  }

  return evolutions;
}

/* =========================
   OPENEVOLVE LOGS
========================= */

function listOpenEvolveLogFiles(logsDir) {
  ensureExists(logsDir, 'Logs directory not found');

  return fs
    .readdirSync(logsDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => {
      const fullPath = path.join(logsDir, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        name: entry.name,
        fullPath,
        mtimeMs: stat.mtimeMs,
        size: stat.size
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function readLatestOpenEvolveLog() {
  const logsDir = getActiveOpenEvolveLogsDir();
  const files = listOpenEvolveLogFiles(logsDir);

  if (!files.length) {
    return {
      logs_dir: logsDir,
      file_name: '',
      file_path: '',
      updated_at: null,
      text: '',
      line_count: 0
    };
  }

  const latest = files[0];
  const raw = readTextFile(latest.fullPath);
  const text = tailLines(raw, 120);

  return {
    logs_dir: logsDir,
    file_name: latest.name,
    file_path: latest.fullPath,
    updated_at: new Date(latest.mtimeMs).toISOString(),
    text,
    line_count: text ? text.split('\n').length : 0
  };
}

/* =========================
   EVALUATION HELPERS
========================= */

const EVALUATION = {
  benchmarkRoot: path.join(__dirname, 'assets', 'UCT-benchmarking'),
  pythonBin: process.env.PYTHON_BIN || 'python'
};

function runEvaluationRender(uctpPath, referenceDatasetPath) {
  return new Promise((resolve, reject) => {
    ensureExists(EVALUATION.benchmarkRoot, 'Benchmark root not found');
    ensureExists(referenceDatasetPath, 'Reference dataset not found');
    ensureExists(uctpPath, 'UCT output file not found');

    const pythonScript = `
import os
import sys
import json
import time
import io
import contextlib
import pandas as pd
import numpy as np

benchmark_root = sys.argv[1]
uctp_path = sys.argv[2]
reference_dataset_path = sys.argv[3]

os.chdir(benchmark_root)

from libraries.apiIntegration import loadDataset
from libraries.generateCov import generateCov
from libraries.propagator import monteCarloPropagator, ephemerisPropagator, TLEpropagator
from libraries.orbitAssociation import orbitAssociation
from libraries.stateMetrics import stateMetrics
from libraries.binaryMetrics import binaryMetrics
from libraries.residualMetrics import residualMetrics
from libraries.evaluationReport import evaluationReport

def to_jsonable(obj):
    if isinstance(obj, pd.DataFrame):
        return obj.to_dict(orient='records')
    if isinstance(obj, pd.Series):
        return obj.to_dict()
    if isinstance(obj, (pd.Timestamp, np.datetime64)):
        try:
            return pd.Timestamp(obj).isoformat()
        except Exception:
            return str(obj)
    if isinstance(obj, dict):
        return {str(k): to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [to_jsonable(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return [to_jsonable(v) for v in obj.tolist()]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    try:
        return obj.item()
    except Exception:
        return str(obj)

start = time.perf_counter()
stdout_capture = io.StringIO()

with contextlib.redirect_stdout(stdout_capture):
    ref_obs, obs_data, ref_track, track_data, ref_sv, ref_elset = loadDataset(reference_dataset_path)

    uctp_output = pd.read_json(uctp_path)
    uctp_output['epoch'] = pd.to_datetime(uctp_output['epoch'])
    uctp_output = generateCov(uctp_output)

    associated_orbits, association_results, nonassociated_orbits = orbitAssociation(
        ref_sv, uctp_output, ephemerisPropagator
    )

    binary_results = binaryMetrics(ref_obs, associated_orbits)
    state_results = stateMetrics(ref_sv, associated_orbits, monteCarloPropagator)
    residual_cand_results = residualMetrics(ref_obs, uctp_output, ephemerisPropagator, False)
    residual_ref_results = residualMetrics(ref_obs, associated_orbits, ephemerisPropagator, True)

    evals = evaluationReport(
        association_results,
        binary_results,
        state_results,
        residual_ref_results,
        residual_cand_results,
        './data/raw_results.json'
    )

elapsed_minutes = round((time.perf_counter() - start) / 60.0, 4)

payload = {
    'message': 'Evaluation completed successfully.',
    'uctp_path': uctp_path,
    'reference_dataset_path': reference_dataset_path,
    'association_results': to_jsonable(association_results),
    'associated_orbits': to_jsonable(associated_orbits),
    'nonassociated_orbits': to_jsonable(nonassociated_orbits),
    'binary_results': to_jsonable(binary_results),
    'state_results': to_jsonable(state_results),
    'residual_cand_results': to_jsonable(residual_cand_results),
    'residual_ref_results': to_jsonable(residual_ref_results),
    'evals': to_jsonable(evals),
    'elapsed_minutes': elapsed_minutes,
    'logs': stdout_capture.getvalue().strip()
}

print(json.dumps(payload, default=to_jsonable))
`.trim();

    const child = spawn(
      EVALUATION.pythonBin,
      ['-c', pythonScript, EVALUATION.benchmarkRoot, uctpPath, referenceDatasetPath],
      { cwd: EVALUATION.benchmarkRoot }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', error => {
      reject(error);
    });

    child.on('close', code => {
      if (code !== 0) {
        return reject(
          new Error(
            `Evaluation Python process failed with code ${code}\n${stderr || stdout || 'No output returned.'}`
          )
        );
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (error) {
        reject(
          new Error(
            `Failed to parse evaluation output as JSON.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`
          )
        );
      }
    });
  });
}

/* =========================
   SETTINGS API
========================= */

app.get('/api/settings', (req, res) => {
  let yamlApiKey = '';

  try {
    yamlApiKey = readYamlApiKey(getActiveConfigYamlPath());
  } catch (error) {
    console.warn('[settings] failed to read YAML api_key:', error.message);
  }

  jsonOk(res, {
    ...appSettings,
    checkpoints_dir: getActiveCheckpointsDir(),
    config_yaml_path: getActiveConfigYamlPath(),
    openevolve_logs_dir: getActiveOpenEvolveLogsDir(),
    api_key_value: yamlApiKey
  });
});

app.post('/api/settings', async (req, res) => {
  try {
    const body = req.body || {};
    const nextSettings = { ...appSettings };

    applySettingIfPresent(nextSettings, body, 'checkpoints_dir', value =>
      validateNonEmptyPath(value, 'checkpoints_dir', 'Invalid checkpoint path')
    );

    applySettingIfPresent(nextSettings, body, 'config_yaml_path', value =>
      validateNonEmptyPath(value, 'config_yaml_path', 'Invalid config path')
    );

    applySettingIfPresent(nextSettings, body, 'openevolve_logs_dir', value =>
      validateNonEmptyPath(value, 'openevolve_logs_dir', 'Invalid logs path')
    );

    applyTrimmedTextIfPresent(nextSettings, body, 'program_name');
    applyTrimmedTextIfPresent(nextSettings, body, 'program_subtext');
    applyTrimmedTextIfPresent(nextSettings, body, 'pathway_label');
    applyTrimmedTextIfPresent(nextSettings, body, 'api_key_label');

    if (typeof body.api_key_value === 'string') {
      const targetConfigPath = nextSettings.config_yaml_path || getActiveConfigYamlPath();
      writeYamlApiKey(targetConfigPath, body.api_key_value.trim());
    }

    appSettings = nextSettings;
    saveAppSettings(appSettings);

    let yamlApiKey = '';
    try {
      yamlApiKey = readYamlApiKey(getActiveConfigYamlPath());
    } catch (_) {}

    jsonOk(res, {
      message: 'Settings updated successfully',
      settings: {
        ...appSettings,
        api_key_value: yamlApiKey
      }
    });
  } catch (error) {
    const status = error.status || 500;
    const code = error.code || 'Settings update error';
    console.error('[settings] failed to update settings:', error);
    jsonError(res, status, code, error.message || 'Failed to update settings');
  }
});

/* =========================
   OPENEVOLVE APIs
========================= */

app.get('/api/openevolve/evolutions', handleRoute('openevolve evolutions', async () => {
  const rows = readOpenEvolveEvolutionRows();
  const metricNames = new Set();

  for (const row of rows) {
    for (const key of Object.keys(row.metrics || {})) {
      metricNames.add(key);
    }
  }

  return {
    checkpoints_dir: getActiveCheckpointsDir(),
    count: rows.length,
    metric_names: [...metricNames],
    rows
  };
}));

app.get('/api/openevolve/config-summary', handleRoute('config-summary', async () => {
  return getConfigSummary();
}));

app.get('/api/openevolve/latest-log', handleRoute('latest-log', async () => {
  return readLatestOpenEvolveLog();
}));

/* =========================
   EVALUATION ROUTE
========================= */

app.post('/api/evaluation/render', async (req, res) => {
  try {
    const body = req.body || {};
    const resolvedUctpPath = resolveMaybeRelativePath(body.uctpPath);
    const resolvedReferenceDatasetPath = resolveMaybeRelativePath(body.referenceDatasetPath);

    const payload = await runEvaluationRender(
      resolvedUctpPath,
      resolvedReferenceDatasetPath
    );

    jsonOk(res, payload);
  } catch (error) {
    const status = error.status || 500;
    const code = error.code || 'evaluation render error';
    console.error('[evaluation/render]', error);
    jsonError(res, status, code, error.message || 'Failed to render evaluation');
  }
});

/* =========================
   INFO ROUTES
========================= */

app.get('/api/config', (req, res) => {
  jsonOk(res, {
    openEvolve: {
      checkpointsDir: getActiveCheckpointsDir(),
      configYamlPath: getActiveConfigYamlPath(),
      logsDir: getActiveOpenEvolveLogsDir()
    }
  });
});

app.get('/api/health', (req, res) => {
  jsonOk(res, {
    status: 'ok',
    service: 'Analytics Console Server'
  });
});

/* =========================
   EVALUATION REPORT ROUTE
========================= */

app.post('/api/evaluation/raw-results', async (req, res) => {
  try {
    const body = req.body || {};
    const resolvedRawResultsPath = resolveMaybeRelativePath(body.rawResultsPath);
    const rawText = readTextFile(resolvedRawResultsPath);

    const sanitizedText = rawText
      .replace(/\bNaN\b/g, 'null')
      .replace(/\bInfinity\b/g, 'null')
      .replace(/\b-Infinity\b/g, 'null');

    const parsed = JSON.parse(sanitizedText);

    jsonOk(res, {
      message: 'Raw evaluation results loaded successfully.',
      raw_results_path: resolvedRawResultsPath,
      ...parsed
    });
  } catch (error) {
    const status = error.status || 500;
    const code = error.code || 'raw results load error';
    console.error('[evaluation/raw-results]', error);
    jsonError(res, status, code, error.message || 'Failed to load raw results');
  }
});

/* =========================
   STARTUP
========================= */

app.listen(APP.port, () => {
  console.log(`Analytics Console Server running on http://localhost:${APP.port}`);
  console.log(`GET  /api/settings`);
  console.log(`POST /api/settings`);
  console.log(`GET  /api/openevolve/evolutions`);
  console.log(`GET  /api/openevolve/config-summary`);
  console.log(`GET  /api/openevolve/latest-log`);
  console.log(`POST /api/evaluation/render`);
  console.log(`GET  /api/config`);
  console.log(`GET  /api/health`);
  console.log(`POST /api/evaluation/raw-results`);
  console.log(`OpenEvolve checkpoints: ${getActiveCheckpointsDir()}`);
  console.log(`OpenEvolve config YAML: ${getActiveConfigYamlPath()}`);
  console.log(`OpenEvolve logs dir: ${getActiveOpenEvolveLogsDir()}`);
});