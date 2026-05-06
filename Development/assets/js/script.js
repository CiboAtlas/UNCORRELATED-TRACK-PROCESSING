/* assets/js/script.js */
(() => {
  'use strict';

  const COLORS = {
    line: '#d6d6d6',
    point: '#e6e6e6',
    bar: '#9a9a9a',
    grid: 'rgba(255,255,255,0.08)',
    text: '#cfd2d6'
  };

  const API = {
    settings: '/api/settings',
    evolutions: '/api/openevolve/evolutions',
    configSummary: '/api/openevolve/config-summary',
    latestLog: '/api/openevolve/latest-log'
  };

  const POLL_MS = 10000;

  const METRIC_PRIORITY = [
    'combined_score',
    'composite_score',
    'overall_score',
    'output_length',
    'distance_score',
    'value_score',
    'lag_error',
    'avg_error',
    'slope_changes',
    'false_reversals',
    'correlation',
    'noise_reduction',
    'smoothness_score',
    'responsiveness_score',
    'accuracy_score',
    'efficiency_score',
    'execution_time',
    'success_rate',
    'reliability_score',
    'runs_successfully'
  ];

  const PREFERRED_PRIMARY_METRICS = [
    'combined_score',
    'composite_score',
    'overall_score'
  ];

  const DEFAULT_DATASET_CANDIDATE_PATHS = [
    '/assets/UCT-benchmarking/data/dataset_1Object_100Obs.json',
    './assets/UCT-benchmarking/data/dataset_1Object_100Obs.json',
    'assets/UCT-benchmarking/data/dataset_1Object_100Obs.json',
    '/assets/UCT-benchmarking/data/dataset_1Object_100Obs',
    './assets/UCT-benchmarking/data/dataset_1Object_100Obs',
    'assets/UCT-benchmarking/data/dataset_1Object_100Obs',
    '/UCT-benchmarking/data/dataset_1Object_100Obs.json',
    './UCT-benchmarking/data/dataset_1Object_100Obs.json',
    'UCT-benchmarking/data/dataset_1Object_100Obs.json',
    '/UCT-benchmarking/data/dataset_1Object_100Obs',
    './UCT-benchmarking/data/dataset_1Object_100Obs',
    'UCT-benchmarking/data/dataset_1Object_100Obs'
  ];

  const WELCOME = {
    rotationSpeed: 0.0006,
    dotsLat: 80,
    dotsLon: 80,
    particleCount: 100,
    orbitMin: 2.45,
    orbitMax: 3.45,
    connectDist: 100
  };

  const state = {
    perfChart: null,
    dynamicMetricCharts: new Map(),
    graphsRadarChart: null,
    graphsHiddenIterations: new Set(),
    graphsFullscreen: false,
    latestOpenEvolveSignature: '',
    latestOpenEvolveLogSignature: '',
    perfUserViewport: null,
    perfUserInteracted: false,
    currentPrimaryMetric: 'combined_score',
    welcomeRunning: false,
    welcomeExiting: false
  };

  const dom = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheDom();
    injectGraphsLegendScrollStyles();
    initializeMainChart();
    setupTabs();
    setupWelcome();
    setupZoomAndPan();

    await Promise.allSettled([
      loadConfigSummary(),
      loadDataset(),
      refreshOpenEvolveCharts(),
      refreshOpenEvolveLog()
    ]);

    window.setInterval(refreshOpenEvolveCharts, POLL_MS);
    window.setInterval(refreshOpenEvolveLog, POLL_MS);
  }

  function cacheDom() {
    dom.chartPerformance = document.getElementById('chartPerformance');
    dom.systemLog = document.getElementById('systemLog');
    dom.openEvolveLog = document.getElementById('openEvolveLog');
    dom.metricCardsGrid = document.getElementById('metricCardsGrid');
    dom.latestMetricsPanel = document.getElementById('latestMetricsPanel');
    dom.mainMetricTitle = document.getElementById('mainMetricTitle');
    dom.dynamicDropzone = document.getElementById('dynamicDropzone');

    dom.openWelcomeBtn = document.getElementById('openWelcomeBtn');
    dom.enterBtn = document.getElementById('enterBtn');
    dom.zoomInBtn = document.getElementById('zoomInBtn');
    dom.zoomOutBtn = document.getElementById('zoomOutBtn');
    dom.resetZoomBtn = document.getElementById('resetZoomBtn');

    dom.tabs = Array.from(document.querySelectorAll('.tab[data-view]'));

    const dynamicTab = dom.tabs.find(tab => tab.dataset.view === 'dynamic');
    if (dynamicTab) {
      dynamicTab.textContent = 'Graphs';
    }
  }

  function injectGraphsLegendScrollStyles() {
    if (document.getElementById('graphsLegendScrollInjectedStyles')) return;

    const style = document.createElement('style');
    style.id = 'graphsLegendScrollInjectedStyles';
    style.textContent = `
      .graphs-radar-shell{
        min-height:570px;
      }

      .graphs-radar-body{
        height:490px;
        display:flex;
        flex-direction:column;
        overflow:hidden;
        padding-bottom:8px;
      }

      .graphs-radar-body canvas{
        flex:1 1 auto;
        min-height:0;
        max-height:392px;
      }

      .graphs-radar-legend-scroll{
        flex:0 0 52px;
        width:100%;
        max-width:100%;
        overflow-x:auto;
        overflow-y:hidden;
        padding:2px 0 8px;
        margin-top:0;
        scrollbar-gutter:stable;
      }

      .graphs-radar-legend-scroll::-webkit-scrollbar{
        height:8px;
      }

      .graphs-radar-legend-scroll::-webkit-scrollbar-track{
        background:rgba(255,255,255,0.04);
        border-radius:999px;
      }

      .graphs-radar-legend-scroll::-webkit-scrollbar-thumb{
        background:rgba(255,255,255,.22);
        border-radius:999px;
      }

      .graphs-radar-legend-scroll::-webkit-scrollbar-thumb:hover{
        background:rgba(255,255,255,.35);
      }

      .graphs-radar-legend{
        display:flex !important;
        flex-wrap:nowrap !important;
        gap:10px;
        align-items:center;
        width:max-content;
        min-width:100%;
        padding:0 4px;
      }

      .graphs-radar-toggle{
        flex:0 0 auto;
        white-space:nowrap;
        min-height:34px;
      }

      .graphs-radar-shell.graphs-radar-fullscreen{
        min-height:auto;
      }

      .graphs-radar-shell.graphs-radar-fullscreen .graphs-radar-body{
        height:calc(100vh - 120px);
      }

      .graphs-radar-shell.graphs-radar-fullscreen .graphs-radar-body canvas{
        max-height:none;
      }
    `;

    document.head.appendChild(style);
  }

  function initializeMainChart() {
    if (!dom.chartPerformance) return;
    state.perfChart = createLineChart(dom.chartPerformance.getContext('2d'), [{ x: 1, y: 0 }]);
  }

  async function fetchJsonOrThrow(url, label) {
    const res = await fetch(`${url}?_=${Date.now()}`, { cache: 'no-store' });

    if (!res.ok) {
      let message = `${label} failed: ${res.status} ${res.statusText}`;
      try {
        const payload = await res.json();
        if (payload?.message) message = payload.message;
      } catch (_) {}
      throw new Error(message);
    }

    return res.json();
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const el = getEl(id);
    if (el) el.textContent = value;
  }

  function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function prettifyMetricName(name) {
    if (!name) return 'Metric';
    return String(name)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function formatMetricValue(value) {
    const n = safeNumber(value);
    if (n == null) return String(value ?? '—');
    if (Math.abs(n) >= 100) return n.toFixed(2);
    if (Math.abs(n) >= 10) return n.toFixed(3);
    return n.toFixed(6);
  }

  function formatYAxisValue(value, span) {
    if (!Number.isFinite(value)) return '';
    if (span <= 0.002) return value.toFixed(4);
    if (span <= 0.2) return value.toFixed(3);
    return value.toFixed(2);
  }

  function fmtNum(value, digits = 2) {
    return value == null || !Number.isFinite(value) ? '—' : Number(value).toFixed(digits);
  }

  function fmtInt(value) {
    return value == null || !Number.isFinite(value) ? '—' : String(Math.round(value));
  }

  function fmtDateZ(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';

    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mi = String(date.getUTCMinutes()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd} ${hh}:${mi}Z`;
  }

  function minutesBetween(aIso, bIso) {
    const a = new Date(aIso);
    const b = new Date(bIso);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return NaN;
    return Math.abs(b - a) / 60000;
  }

  function percentile(sortedValues, p) {
    if (!sortedValues.length) return NaN;

    const idx = (sortedValues.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);

    if (lo === hi) return sortedValues[lo];

    const weight = idx - lo;
    return sortedValues[lo] * (1 - weight) + sortedValues[hi] * weight;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function addLog(message) {
    if (!dom.systemLog) return;

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    const code = document.createElement('code');
    code.textContent = `[${hh}:${mm}:${ss}] ${message}`;
    dom.systemLog.appendChild(code);

    const lines = dom.systemLog.querySelectorAll('code');
    const maxLines = 18;
    if (lines.length > maxLines) {
      for (let i = 0; i < lines.length - maxLines; i += 1) {
        lines[i].remove();
      }
    }

    dom.systemLog.scrollTop = dom.systemLog.scrollHeight;
  }

  function scrollLogPanelToBottom(el) {
    if (!el) return;

    const doScroll = () => {
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = maxScroll;
    };

    requestAnimationFrame(() => requestAnimationFrame(doScroll));
  }

  function chartBaseOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      transitions: {
        active: { animation: { duration: 0 } },
        resize: { animation: { duration: 0 } },
        show: { animation: { duration: 0 } },
        hide: { animation: { duration: 0 } }
      },
      layout: { padding: { top: 14, right: 18, bottom: 14, left: 14 } },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true, mode: 'index', intersect: false }
      },
      scales: {
        x: {
          type: 'linear',
          grid: { color: COLORS.grid },
          ticks: {
            color: COLORS.text,
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
            callback: v => `iter.${v}`
          }
        },
        y: {
          ticks: {
            color: COLORS.text,
            maxTicksLimit: 6
          },
          grid: { color: COLORS.grid },
          grace: '8%',
          beginAtZero: false,
          bounds: 'ticks'
        }
      }
    };
  }

  function createLineChart(ctx, points, options = {}) {
    return new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [{
          data: points,
          parsing: false,
          borderColor: COLORS.line,
          backgroundColor: 'transparent',
          pointBackgroundColor: COLORS.point,
          pointBorderColor: COLORS.point,
          pointRadius: 3,
          borderWidth: 2,
          tension: options.tension ?? 0.18,
          cubicInterpolationMode: options.cubicInterpolationMode ?? 'monotone'
        }]
      },
      options: {
        ...chartBaseOptions(),
        plugins: {
          ...chartBaseOptions().plugins,
          tooltip: {
            enabled: true,
            mode: 'index',
            intersect: false,
            callbacks: {
              title: items => {
                if (!items?.length) return '';
                return `iter.${Math.round(items[0].parsed.x)}`;
              },
              ...(options.tooltipLabel
                ? { label: options.tooltipLabel }
                : {})
            }
          }
        }
      }
    });
  }

  function createMetricChart(canvas, metricName, points) {
    return createLineChart(canvas.getContext('2d'), points, {
      tension: 0.35,
      tooltipLabel: ctx => `${metricName}: ${Number(ctx.parsed.y).toFixed(6)}`
    });
  }

  function buildRadarMetricNames(rows) {
    return sortMetricNamesForDisplay(extractMetricNames(rows)).filter(
      name => name !== 'runs_successfully' && name !== 'reliability_score'
    );
  }

  function hsla(h, s, l, a) {
    return `hsla(${h}, ${s}%, ${l}%, ${a})`;
  }

  function buildRadarDatasets(rows, metricNames) {
    if (!rows.length || !metricNames.length) return [];

    const ranges = {};
    for (const metricName of metricNames) {
      const values = rows
        .map(row => safeNumber(row?.metrics?.[metricName]))
        .filter(Number.isFinite);

      if (!values.length) continue;

      ranges[metricName] = {
        min: Math.min(...values),
        max: Math.max(...values)
      };
    }

    const recentRows = rows;

    return recentRows.map((row, index) => {
      const hue = Math.round((index / Math.max(1, recentRows.length)) * 360);
      const label = `iter.${row.current_iteration}`;

      return {
        label,
        data: metricNames.map(metricName => {
          const value = safeNumber(row?.metrics?.[metricName]);
          const range = ranges[metricName];

          if (value == null || !range) return 0;

          const span = range.max - range.min;
          if (span <= 0.0000001) return 100;

          return ((value - range.min) / span) * 100;
        }),
        fill: true,
        hidden: state.graphsHiddenIterations.has(label),
        backgroundColor: hsla(hue, 85, 65, 0.08),
        borderColor: hsla(hue, 90, 68, 0.75),
        pointBackgroundColor: hsla(hue, 92, 72, 0.95),
        pointBorderColor: hsla(hue, 92, 72, 1),
        pointHoverBackgroundColor: hsla(hue, 92, 72, 1),
        pointHoverBorderColor: '#ffffff',
        pointRadius: 3,
        pointHoverRadius: 7,
        pointHitRadius: 22,
        borderWidth: 1
      };
    });
  }

  function ensureGraphsRadarShell() {
    if (!dom.dynamicDropzone) return null;

    let shell = dom.dynamicDropzone.querySelector('.graphs-radar-shell');
    if (shell) return shell;

    dom.dynamicDropzone.innerHTML = `
      <div class="card graphs-radar-shell" id="graphsRadarShell">
        <div class="card-header">
          <div class="card-title">
            <span class="metric-label">Checkpoint Metrics</span>
            <h3 id="graphsRadarTitle">Iteration Comparison</h3>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button
              id="graphsRadarFullscreenBtn"
              type="button"
              class="settings-btn"
              aria-pressed="false"
              title="Toggle graph size"
            >
              Full Screen
            </button>
          </div>
        </div>
        <div class="card-body graphs-radar-body">
          <canvas id="graphsRadarCanvas"></canvas>
          <div class="graphs-radar-legend-scroll">
            <div id="graphsRadarLegend" class="graphs-radar-legend"></div>
          </div>
        </div>
      </div>
    `;

    const createdShell = dom.dynamicDropzone.querySelector('.graphs-radar-shell');
    const fullscreenBtn = document.getElementById('graphsRadarFullscreenBtn');

    fullscreenBtn?.addEventListener('click', () => {
      toggleGraphsRadarFullscreen();
    });

    return createdShell;
  }

  function destroyGraphsRadarChart() {
    if (!state.graphsRadarChart) return;
    try {
      state.graphsRadarChart.destroy();
    } catch (_) {}
    state.graphsRadarChart = null;
  }

  function syncGraphsFullscreenButton() {
    const btn = document.getElementById('graphsRadarFullscreenBtn');
    if (!btn) return;

    btn.textContent = state.graphsFullscreen ? 'Exit Full Screen' : 'Full Screen';
    btn.setAttribute('aria-pressed', state.graphsFullscreen ? 'true' : 'false');
  }

  function toggleGraphsRadarFullscreen() {
    state.graphsFullscreen = !state.graphsFullscreen;
    document.body.classList.toggle('graphs-radar-fullscreen-open', state.graphsFullscreen);

    const shell = document.getElementById('graphsRadarShell');
    if (shell) {
      shell.classList.toggle('graphs-radar-fullscreen', state.graphsFullscreen);
    }

    syncGraphsFullscreenButton();

    requestAnimationFrame(() => {
      renderGraphsRadar(Array.isArray(window.__lastOpenEvolveRows) ? window.__lastOpenEvolveRows : []);
    });
  }

  function renderGraphsRadarLegend(datasets) {
    const legendEl = document.getElementById('graphsRadarLegend');
    if (!legendEl) return;

    legendEl.innerHTML = '';

    datasets.forEach((dataset, datasetIndex) => {
      const hidden = !!dataset.hidden;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'graphs-radar-toggle';
      btn.setAttribute('data-label', dataset.label);
      btn.setAttribute('aria-pressed', hidden ? 'false' : 'true');

      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'center';
      btn.style.gap = '8px';
      btn.style.padding = '6px 10px';
      btn.style.borderRadius = '999px';
      btn.style.border = `1px solid ${hidden ? 'rgba(255,255,255,0.14)' : dataset.borderColor}`;
      btn.style.background = hidden ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)';
      btn.style.color = hidden ? 'rgba(207,210,214,0.58)' : COLORS.text;
      btn.style.cursor = 'pointer';
      btn.style.transition = 'all .15s ease';

      const box = document.createElement('span');
      box.className = 'graphs-radar-toggle-box';
      box.style.width = '14px';
      box.style.height = '14px';
      box.style.borderRadius = '4px';
      box.style.display = 'inline-flex';
      box.style.alignItems = 'center';
      box.style.justifyContent = 'center';
      box.style.border = `1px solid ${hidden ? 'rgba(255,255,255,0.25)' : dataset.borderColor}`;
      box.style.background = hidden ? 'transparent' : dataset.backgroundColor;
      box.style.color = hidden ? 'transparent' : dataset.borderColor;
      box.style.fontSize = '11px';
      box.style.fontWeight = '700';
      box.textContent = hidden ? '' : '×';

      const swatch = document.createElement('span');
      swatch.style.width = '10px';
      swatch.style.height = '10px';
      swatch.style.borderRadius = '999px';
      swatch.style.background = dataset.borderColor;
      swatch.style.opacity = hidden ? '0.35' : '1';

      const text = document.createElement('span');
      text.textContent = dataset.label;
      text.style.textDecoration = 'none';

      btn.appendChild(box);
      btn.appendChild(swatch);
      btn.appendChild(text);

      btn.addEventListener('click', () => {
        const label = dataset.label;

        if (state.graphsHiddenIterations.has(label)) {
          state.graphsHiddenIterations.delete(label);
        } else {
          state.graphsHiddenIterations.add(label);
        }

        if (state.graphsRadarChart) {
          const meta = state.graphsRadarChart.getDatasetMeta(datasetIndex);
          const nowHidden = state.graphsHiddenIterations.has(label);
          meta.hidden = nowHidden;
          state.graphsRadarChart.data.datasets[datasetIndex].hidden = nowHidden;
          state.graphsRadarChart.update('none');
        }

        renderGraphsRadarLegend(state.graphsRadarChart?.data?.datasets || datasets);
      });

      legendEl.appendChild(btn);
    });
  }

  function renderGraphsRadar(rows) {
    if (!dom.dynamicDropzone) return;

    const shell = ensureGraphsRadarShell();
    if (!shell) return;

    if (state.graphsFullscreen) {
      shell.classList.add('graphs-radar-fullscreen');
      document.body.classList.add('graphs-radar-fullscreen-open');
    } else {
      shell.classList.remove('graphs-radar-fullscreen');
      document.body.classList.remove('graphs-radar-fullscreen-open');
    }

    const metricNames = buildRadarMetricNames(rows);
    const datasets = buildRadarDatasets(rows, metricNames);

    const titleEl = shell.querySelector('#graphsRadarTitle');
    if (titleEl) {
      const latestRow = rows.length ? rows[rows.length - 1] : null;
      titleEl.textContent = latestRow
        ? `Most Recent Iteration Checkpoint: iter.${latestRow.current_iteration}`
        : 'No checkpoint metrics yet';
    }

    syncGraphsFullscreenButton();

    const body = shell.querySelector('.graphs-radar-body');
    if (!body) return;

    destroyGraphsRadarChart();

    if (!metricNames.length || !datasets.length) {
      body.innerHTML = '<div class="graphs-empty">No checkpoint metrics available yet.</div>';
      return;
    }

    body.innerHTML = `
      <canvas id="graphsRadarCanvas"></canvas>
      <div class="graphs-radar-legend-scroll">
        <div id="graphsRadarLegend" class="graphs-radar-legend"></div>
      </div>
    `;

    const canvas = body.querySelector('#graphsRadarCanvas');
    if (!canvas) return;

    state.graphsRadarChart = new Chart(canvas.getContext('2d'), {
      type: 'radar',
      data: {
        labels: metricNames.map(prettifyMetricName),
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: 'nearest',
          intersect: false
        },
        onHover: (event, elements, chart) => {
          const target = chart?.canvas;
          if (target) {
            target.style.cursor = elements?.length ? 'pointer' : 'default';
          }
        },
        elements: {
          line: {
            tension: 0.08,
            borderWidth: 1
          },
          point: {
            radius: 3,
            hoverRadius: 7,
            hitRadius: 22,
            borderWidth: 1
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: true,
            mode: 'nearest',
            intersect: false,
            position: 'nearest',
            displayColors: true,
            callbacks: {
              title: items => {
                if (!items?.length) return '';
                return items[0].label;
              },
              label: ctx => {
                const value = Number(ctx.raw);
                return `${ctx.dataset.label}: ${value.toFixed(2)}%`;
              }
            }
          }
        },
        scales: {
          r: {
            min: 0,
            max: 100,
            beginAtZero: true,
            angleLines: { color: COLORS.grid },
            grid: { color: COLORS.grid },
            pointLabels: {
              color: COLORS.text,
              font: { size: 12 }
            },
            ticks: {
              color: COLORS.text,
              backdropColor: 'transparent',
              stepSize: 20,
              callback: value => `${value}%`
            }
          }
        }
      }
    });

    renderGraphsRadarLegend(datasets);
  }

  function normalizeEvolutionPayload(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.rows)) return payload.rows;
    if (Array.isArray(payload.evolutions)) return payload.evolutions;
    return [];
  }

  function buildOpenEvolveSignature(rows) {
    return JSON.stringify(
      rows.map(row => ({
        checkpoint: row.checkpoint,
        current_iteration: row.current_iteration,
        metrics: row.metrics
      }))
    );
  }

  function extractMetricNames(rows) {
    const names = new Set();

    for (const row of rows) {
      const metrics = row?.metrics || {};
      for (const [key, value] of Object.entries(metrics)) {
        if (safeNumber(value) != null) names.add(key);
      }
    }

    return [...names];
  }

  function sortMetricNamesForDisplay(metricNames) {
    return [...metricNames].sort((a, b) => {
      const aIndex = METRIC_PRIORITY.indexOf(a);
      const bIndex = METRIC_PRIORITY.indexOf(b);

      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });
  }

  function pickPrimaryMetric(metricNames) {
    for (const name of PREFERRED_PRIMARY_METRICS) {
      if (metricNames.includes(name)) return name;
    }
    return metricNames[0] || null;
  }

  function buildMetricSeries(rows, metricName) {
    return rows
      .map(row => {
        const x = safeNumber(row.current_iteration);
        const y = safeNumber(row?.metrics?.[metricName]);
        if (x == null || y == null) return null;
        return { x, y };
      })
      .filter(Boolean)
      .sort((a, b) => a.x - b.x);
  }

  function getChartViewport(chart) {
    const xScale = chart?.options?.scales?.x;
    if (!xScale) return null;

    return {
      min: typeof xScale.min === 'number' ? xScale.min : null,
      max: typeof xScale.max === 'number' ? xScale.max : null
    };
  }

  function autoFitPerfYToCurrentX(chart) {
    if (!chart) return;

    const xScale = chart.options.scales.x;
    const yScale = chart.options.scales.y;
    let points = chart.data.datasets?.[0]?.data || [];

    const xMin = typeof xScale.min === 'number' ? xScale.min : null;
    const xMax = typeof xScale.max === 'number' ? xScale.max : null;

    if (xMin != null && xMax != null) {
      points = points.filter(point => Number(point.x) >= xMin && Number(point.x) <= xMax);
    }

    const ys = points.map(point => Number(point.y)).filter(Number.isFinite);
    if (!ys.length) return;

    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const span = Math.max(0.000001, maxY - minY);

    yScale.min = minY - span * 0.08;
    yScale.max = maxY + span * 0.08;
    yScale.ticks.callback = value => formatYAxisValue(value, span);

    chart.update('none');
  }

  function updateChartSeries(chart, points, { preserveMainViewport = false } = {}) {
    if (!chart) return;

    chart.data.datasets[0].data = points;

    const ys = points.map(point => Number(point.y)).filter(Number.isFinite);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const span = Math.max(0.000001, maxY - minY);

    chart.options.scales.y.min = minY - span * 0.08;
    chart.options.scales.y.max = maxY + span * 0.08;
    chart.options.scales.y.ticks.callback = value => formatYAxisValue(value, span);

    if (!preserveMainViewport || !state.perfUserInteracted || chart !== state.perfChart) {
      chart.options.scales.x.min = undefined;
      chart.options.scales.x.max = undefined;
      if (chart === state.perfChart) {
        state.perfUserViewport = null;
      }
    } else if (chart === state.perfChart && state.perfUserViewport) {
      if (typeof state.perfUserViewport.min === 'number') {
        chart.options.scales.x.min = state.perfUserViewport.min;
      }
      if (typeof state.perfUserViewport.max === 'number') {
        chart.options.scales.x.max = state.perfUserViewport.max;
      }
    }

    chart.update('none');
  }

  function statusLabel01(value) {
    const n = safeNumber(value);
    if (n == null) return '—';
    return n >= 0.999999 ? 'PASS' : (n > 0 ? 'WARN' : 'FAIL');
  }

  function renderProgramStatus(rows) {
    if (!rows.length) return;

    const latest = rows[rows.length - 1];
    const metrics = latest.metrics || {};

    const runsSuccessfully = safeNumber(metrics.runs_successfully);
    const reliability = safeNumber(metrics.reliability_score ?? metrics.reliability);

    setText('metricRunsSuccessfully', runsSuccessfully != null ? runsSuccessfully.toFixed(6) : '—');
    setText('metricRunsSuccessfullyStatus', statusLabel01(runsSuccessfully));
    setText('metricCurrentIteration', latest.current_iteration != null ? `iter.${latest.current_iteration}` : '—');

    setText('metricReliability', reliability != null ? reliability.toFixed(6) : '—');
    setText('metricReliabilityStatus', statusLabel01(reliability));
  }

  function renderLatestCheckpointMetrics(rows) {
    if (!dom.latestMetricsPanel) return;

    const latest = rows.length ? rows[rows.length - 1] : null;
    const metrics = latest?.metrics || {};

    const entries = Object.entries(metrics)
      .filter(([, value]) => safeNumber(value) != null)
      .sort((a, b) => a[0].localeCompare(b[0]));

    if (!entries.length) {
      dom.latestMetricsPanel.innerHTML = '<div><span>No metrics found</span><b>—</b></div>';
      return;
    }

    dom.latestMetricsPanel.innerHTML = entries
      .map(([key, value]) => `
        <div>
          <span>${prettifyMetricName(key)}</span>
          <b>${formatMetricValue(value)}</b>
        </div>
      `)
      .join('');
  }

  function clearDynamicMetricCards() {
    for (const [, entry] of state.dynamicMetricCharts) {
      try {
        entry.chart.destroy();
      } catch (_) {}
      entry.card.remove();
    }
    state.dynamicMetricCharts.clear();
  }

  function renderEmptyMetricState() {
    if (!dom.metricCardsGrid) return;
    if (dom.metricCardsGrid.querySelector('.metric-empty')) return;

    dom.metricCardsGrid.innerHTML = `
      <div class="card no-border metric-empty">
        <div class="card-header">
          <div class="card-title">
            <span class="metric-label">Metrics</span>
            <h3>No additional metric history yet</h3>
          </div>
        </div>
        <div class="card-body"></div>
      </div>
    `;
  }

  function syncMetricCards(rows, primaryMetric) {
    if (!dom.metricCardsGrid) return;

    const metricNames = sortMetricNamesForDisplay(extractMetricNames(rows));
    const lowerMetrics = metricNames.filter(
      name => name !== primaryMetric && name !== 'reliability_score' && name !== 'runs_successfully'
    );

    for (const [metricName, entry] of state.dynamicMetricCharts) {
      if (!lowerMetrics.includes(metricName)) {
        try {
          entry.chart.destroy();
        } catch (_) {}
        entry.card.remove();
        state.dynamicMetricCharts.delete(metricName);
      }
    }

    if (!lowerMetrics.length) {
      clearDynamicMetricCards();
      renderEmptyMetricState();
      return;
    }

    const oldEmpty = dom.metricCardsGrid.querySelector('.metric-empty');
    if (oldEmpty) oldEmpty.remove();

    for (const metricName of lowerMetrics) {
      const points = buildMetricSeries(rows, metricName);
      if (!points.length) continue;

      const latestValue = points[points.length - 1]?.y;
      let entry = state.dynamicMetricCharts.get(metricName);

      if (!entry) {
        const card = document.createElement('div');
        card.className = 'card no-border';
        card.dataset.metric = metricName;

        const canvasId = `metricChart_${metricName}`;
        card.innerHTML = `
          <div class="card-header">
            <div class="card-title">
              <span class="metric-label">${prettifyMetricName(metricName)}</span>
              <h3 class="metric-value">${latestValue != null ? Number(latestValue).toFixed(6) : '—'}</h3>
            </div>
          </div>
          <div class="card-body">
            <canvas id="${canvasId}" height="120"></canvas>
          </div>
        `;

        dom.metricCardsGrid.appendChild(card);

        const canvas = card.querySelector('canvas');
        const chart = createMetricChart(canvas, metricName, points);

        entry = {
          card,
          chart,
          valueEl: card.querySelector('.metric-value')
        };

        state.dynamicMetricCharts.set(metricName, entry);
      } else {
        entry.valueEl.textContent = latestValue != null ? Number(latestValue).toFixed(6) : '—';
        updateChartSeries(entry.chart, points);
      }

      dom.metricCardsGrid.appendChild(entry.card);
    }
  }

  async function fetchOpenEvolveRows() {
    const payload = await fetchJsonOrThrow(API.evolutions, 'OpenEvolve API');
    return normalizeEvolutionPayload(payload).sort(
      (a, b) => Number(a.current_iteration) - Number(b.current_iteration)
    );
  }

  async function fetchOpenEvolveConfigSummary() {
    return fetchJsonOrThrow(API.configSummary, 'OpenEvolve config API');
  }

  async function fetchLatestOpenEvolveLog() {
    return fetchJsonOrThrow(API.latestLog, 'OpenEvolve log API');
  }

  function renderQueueAgeFromConfig(config) {
    setText('qaMaxIterations', config?.max_iterations != null ? fmtInt(config.max_iterations) : '—');
    setText('qaCheckpointInterval', config?.checkpoint_interval != null ? fmtInt(config.checkpoint_interval) : '—');
    setText('qaPopulationSize', config?.population_size != null ? fmtInt(config.population_size) : '—');
    setText('qaNumIslands', config?.num_islands != null ? fmtInt(config.num_islands) : '—');
  }

  function renderOpenEvolveLog(payload) {
    if (!dom.openEvolveLog) return;

    const cleanBody = String(payload?.text || 'No log content available.')
      .replace(/\r\n/g, '\n')
      .trimEnd();

    const signature = JSON.stringify({
      file_name: payload?.file_name || '',
      updated_at: payload?.updated_at || '',
      text: cleanBody
    });

    const fileName = payload?.file_name || 'No log file found';
    const updatedAt = payload?.updated_at ? fmtDateZ(payload.updated_at) : '—';

    if (signature !== state.latestOpenEvolveLogSignature) {
      state.latestOpenEvolveLogSignature = signature;
      dom.openEvolveLog.innerHTML = `
        <div class="log-meta">${escapeHtml(fileName)} • ${escapeHtml(updatedAt)}</div>
        <code>${escapeHtml(cleanBody)}</code>
      `;
    }

    scrollLogPanelToBottom(dom.openEvolveLog);
  }

  async function refreshOpenEvolveCharts() {
    try {
      addLog('[openevolve] polling checkpoints...');

      const rows = await fetchOpenEvolveRows();
      window.__lastOpenEvolveRows = rows;

      if (!rows.length) {
        addLog('[openevolve] no checkpoint data found yet');
        renderLatestCheckpointMetrics([]);
        if (document.body.classList.contains('graphs-mode')) {
          renderGraphsRadar([]);
        }
        return;
      }

      const signature = buildOpenEvolveSignature(rows);
      if (signature === state.latestOpenEvolveSignature) {
        renderProgramStatus(rows);
        return;
      }

      state.latestOpenEvolveSignature = signature;

      const metricNames = sortMetricNamesForDisplay(extractMetricNames(rows));
      const primaryMetric = pickPrimaryMetric(metricNames);

      state.currentPrimaryMetric = primaryMetric || 'combined_score';

      if (dom.mainMetricTitle) {
        dom.mainMetricTitle.textContent = primaryMetric
          ? prettifyMetricName(primaryMetric)
          : 'Combined Score';
      }

      if (primaryMetric) {
        const points = buildMetricSeries(rows, primaryMetric);
        if (points.length) {
          updateChartSeries(state.perfChart, points, { preserveMainViewport: true });
        }
      }

      renderProgramStatus(rows);
      renderLatestCheckpointMetrics(rows);
      syncMetricCards(rows, primaryMetric);

      if (document.body.classList.contains('graphs-mode')) {
        renderGraphsRadar(rows);
      }

      const latest = rows[rows.length - 1];
      addLog(`[openevolve] updated iter.${latest.current_iteration} (${rows.length} checkpoints)`);
    } catch (err) {
      console.error(err);
      addLog(`[openevolve] ${err.message}`);
    }
  }

  async function refreshOpenEvolveLog() {
    try {
      const payload = await fetchLatestOpenEvolveLog();
      renderOpenEvolveLog(payload);
    } catch (err) {
      console.error(err);
      addLog(`[log] ${err.message}`);
    }
  }

  async function loadConfigSummary() {
    try {
      const config = await fetchOpenEvolveConfigSummary();
      renderQueueAgeFromConfig(config);
    } catch (err) {
      console.error(err);
      addLog(`[config] ${err.message}`);
    }
  }

  async function getDatasetCandidatePaths() {
    try {
      const settings = await fetchJsonOrThrow(API.settings, 'Settings API');
      const configuredPath = String(settings?.dataset_json_path || '').trim();

      if (!configuredPath) {
        return DEFAULT_DATASET_CANDIDATE_PATHS;
      }

      const normalized = configuredPath.replace(/\\/g, '/');

      const candidates = [
        configuredPath,
        normalized,
        normalized.startsWith('/') ? normalized : `/${normalized}`,
        ...DEFAULT_DATASET_CANDIDATE_PATHS
      ];

      return [...new Set(candidates.filter(Boolean))];
    } catch (err) {
      console.warn('[dataset] failed to load dataset path from settings:', err.message);
      return DEFAULT_DATASET_CANDIDATE_PATHS;
    }
  }

  async function loadDataset() {
    try {
      addLog('[dataset] loading...');

      const localValue = localStorage.getItem('l25_dataset_json');
      let json = null;
      let sourceLabel = 'localStorage:l25_dataset_json';

      if (localValue) {
        json = JSON.parse(localValue);
      } else {
        const candidatePaths = await getDatasetCandidatePaths();

        for (const candidate of candidatePaths) {
          try {
            const res = await fetch(`${candidate}?_=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) continue;

            json = await res.json();
            sourceLabel = candidate;
            break;
          } catch (_) {}
        }

        if (!json) {
          throw new Error(
            `No dataset source found. Checked: ${candidatePaths.join(', ')}`
          );
        }
      }

      const obs = Array.isArray(json?.dataset_obs) ? json.dataset_obs : [];
      window.__dataset_obs = obs;

      addLog(`[dataset] loaded ${obs.length} observations (${sourceLabel})`);
      renderOuterPanels(computeMetricsFromObs(obs));
    } catch (err) {
      console.error(err);
      addLog(`[dataset] ${err.message}`);
    }
  }

  function setupTabs() {
    if (!dom.tabs.length) return;

    const setView = view => {
      dom.tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.view === view));
      document.body.classList.toggle('focus-mode', view === 'focus');
      document.body.classList.toggle('graphs-mode', view === 'dynamic');

      if (dom.dynamicDropzone) {
        dom.dynamicDropzone.style.display = view === 'dynamic' ? '' : 'none';
      }

      if (view !== 'dynamic' && state.graphsFullscreen) {
        state.graphsFullscreen = false;
        document.body.classList.remove('graphs-radar-fullscreen-open');
        const shell = document.getElementById('graphsRadarShell');
        shell?.classList.remove('graphs-radar-fullscreen');
      }

      if (view === 'dynamic') {
        renderGraphsRadar(Array.isArray(window.__lastOpenEvolveRows) ? window.__lastOpenEvolveRows : []);
      }
    };

    dom.tabs.forEach(tab => {
      tab.addEventListener('click', () => setView(tab.dataset.view));
    });

    if (dom.dynamicDropzone) {
      dom.dynamicDropzone.style.display = 'none';
    }
  }

  async function animateWelcomeExit() {
    if (state.welcomeExiting) return;
    state.welcomeExiting = true;

    try {
      if (window.WelcomeGlobe?.blinkAndShutdown) {
        await window.WelcomeGlobe.blinkAndShutdown();
        return;
      }

      const canvas = getEl('welcomeCanvas2d');
      if (!canvas) return;

      const originalOpacity = canvas.style.opacity || '1';

      for (let i = 0; i < 3; i += 1) {
        canvas.style.opacity = '0.15';
        await new Promise(resolve => setTimeout(resolve, 120));
        canvas.style.opacity = '1';
        await new Promise(resolve => setTimeout(resolve, 120));
      }

      canvas.style.opacity = originalOpacity;
    } finally {
      state.welcomeExiting = false;
    }
  }

  function setupWelcome() {
    if (dom.openWelcomeBtn) {
      dom.openWelcomeBtn.addEventListener('click', event => {
        event.preventDefault();
        openWelcome();
      });
    }

    if (dom.enterBtn) {
      dom.enterBtn.addEventListener('click', async () => {
        if (state.welcomeExiting) return;

        sessionStorage.setItem('l16_hasVisited', '1');

        try {
          await animateWelcomeExit();
        } finally {
          closeWelcome();
        }
      });
    }

    const overlay = getEl('welcomeOverlay');
    const hasVisitedThisLaunch = sessionStorage.getItem('l16_hasVisited') === '1';
    const url = new URL(window.location.href);

    if (url.searchParams.get('welcome') === '1' || !hasVisitedThisLaunch) {
      openWelcome();
    } else if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('welcome-open');
    }
  }

  function openWelcome() {
    const overlay = getEl('welcomeOverlay');
    if (!overlay) return;

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('welcome-open');

    if (!state.welcomeRunning && window.WelcomeGlobe?.start) {
      window.WelcomeGlobe.start(WELCOME);
      state.welcomeRunning = true;
    }
  }

  function closeWelcome() {
    const overlay = getEl('welcomeOverlay');
    if (!overlay) return;

    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('welcome-open');
  }

  function setupZoomAndPan() {
    if (!dom.zoomInBtn || !dom.zoomOutBtn || !dom.resetZoomBtn || !state.perfChart) return;

    const applyViewport = (min, max) => {
      const chart = state.perfChart;
      if (!chart) return;

      chart.options.scales.x.min = min;
      chart.options.scales.x.max = max;
      state.perfUserViewport = { min, max };
      state.perfUserInteracted = true;
      autoFitPerfYToCurrentX(chart);
    };

    const zoomIn = () => {
      const chart = state.perfChart;
      const points = chart?.data?.datasets?.[0]?.data || [];
      if (!points.length) return;

      const xs = points.map(point => Number(point.x)).filter(Number.isFinite);
      const fullMin = Math.min(...xs);
      const fullMax = Math.max(...xs);

      if (!Number.isFinite(fullMin) || !Number.isFinite(fullMax) || fullMin === fullMax) return;

      const viewport = getChartViewport(chart);
      const currentMin = viewport?.min ?? fullMin;
      const currentMax = viewport?.max ?? fullMax;
      const center = (currentMin + currentMax) / 2;
      const width = Math.max(2, (currentMax - currentMin) * 0.7);

      applyViewport(center - width / 2, center + width / 2);
    };

    const zoomOut = () => {
      const chart = state.perfChart;
      const points = chart?.data?.datasets?.[0]?.data || [];
      if (!points.length) return;

      const xs = points.map(point => Number(point.x)).filter(Number.isFinite);
      const fullMin = Math.min(...xs);
      const fullMax = Math.max(...xs);

      if (!Number.isFinite(fullMin) || !Number.isFinite(fullMax) || fullMin === fullMax) return;

      const viewport = getChartViewport(chart);
      const currentMin = viewport?.min ?? fullMin;
      const currentMax = viewport?.max ?? fullMax;
      const center = (currentMin + currentMax) / 2;
      const width = Math.min(fullMax - fullMin, Math.max(2, (currentMax - currentMin) * 1.4));

      applyViewport(
        Math.max(fullMin, center - width / 2),
        Math.min(fullMax, center + width / 2)
      );
    };

    const resetZoom = () => {
      const chart = state.perfChart;
      if (!chart) return;

      chart.options.scales.x.min = undefined;
      chart.options.scales.x.max = undefined;
      state.perfUserViewport = null;
      state.perfUserInteracted = false;
      chart.update('none');
    };

    dom.zoomInBtn.addEventListener('click', zoomIn);
    dom.zoomOutBtn.addEventListener('click', zoomOut);
    dom.resetZoomBtn.addEventListener('click', resetZoom);

    document.addEventListener('keydown', event => {
      const target = event.target;
      const tagName = String(target?.tagName || '').toLowerCase();
      const isTyping =
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target?.isContentEditable;

      if (isTyping) return;

      const isCtrlOrCmd = event.ctrlKey || event.metaKey;
      if (!isCtrlOrCmd) return;

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomIn();
      } else if (event.key === '-') {
        event.preventDefault();
        zoomOut();
      } else if (event.key === '0') {
        event.preventDefault();
        resetZoom();
      }
    });
  }

  function computeMetricsFromObs(obs) {
    const validObs = Array.isArray(obs) ? obs : [];
    const rangeValues = [];
    const losValues = [];
    const isoValues = [];
    const sensors = new Set();
    let nanSensorCount = 0;
    let losGt3 = 0;
    let rangeJump = 0;

    for (const row of validObs) {
      const range = safeNumber(row?.range ?? row?.rng ?? row?.slant_range);
      const los = safeNumber(row?.los_unc ?? row?.los_uncertainty ?? row?.line_of_sight_unc);
      const sensor = String(row?.sensor ?? row?.idSensor ?? row?.id_sensor ?? '').trim();
      const epoch = row?.epoch || row?.time || row?.timestamp || null;

      if (Number.isFinite(range)) rangeValues.push(range);
      if (Number.isFinite(los)) {
        losValues.push(los);
        if (los > 3) losGt3 += 1;
      }

      if (sensor && sensor.toLowerCase() !== 'nan') {
        sensors.add(sensor);
      } else {
        nanSensorCount += 1;
      }

      if (epoch) isoValues.push(epoch);
    }

    for (let i = 1; i < rangeValues.length; i += 1) {
      if (Math.abs(rangeValues[i] - rangeValues[i - 1]) > 500) {
        rangeJump += 1;
      }
    }

    const sortedRange = [...rangeValues].sort((a, b) => a - b);
    const avgRange = sortedRange.length
      ? sortedRange.reduce((sum, value) => sum + value, 0) / sortedRange.length
      : NaN;

    const avgLos = losValues.length
      ? losValues.reduce((sum, value) => sum + value, 0) / losValues.length
      : NaN;

    let latestObs = '—';
    if (isoValues.length) {
      const latest = isoValues
        .map(value => new Date(value))
        .filter(date => !Number.isNaN(date.getTime()))
        .sort((a, b) => a - b)
        .pop();

      if (latest) {
        latestObs = fmtDateZ(latest.toISOString());
      }
    }

    let spanMinutes = NaN;
    if (isoValues.length >= 2) {
      const parsed = isoValues
        .map(value => new Date(value))
        .filter(date => !Number.isNaN(date.getTime()))
        .sort((a, b) => a - b);

      if (parsed.length >= 2) {
        spanMinutes = minutesBetween(parsed[0].toISOString(), parsed[parsed.length - 1].toISOString());
      }
    }

    return {
      totalObs: validObs.length,
      avgRange,
      avgLos,
      latestObs,
      uniqueSensors: sensors.size,
      spanMinutes,
      losGt3,
      nanSensorCount,
      rangeJump,
      p90: sortedRange.length ? percentile(sortedRange, 0.9) : NaN
    };
  }

  function renderOuterPanels(metrics) {
    setText('tAvgRange', Number.isFinite(metrics.avgRange) ? fmtNum(metrics.avgRange, 2) : '—');
    setText('tAvgLos', Number.isFinite(metrics.avgLos) ? fmtNum(metrics.avgLos, 3) : '—');
    setText('tLatest', metrics.latestObs || '—');

    setText('qUncorrelated', fmtInt(metrics.totalObs));
    setText('qResolved', fmtInt(Math.max(0, metrics.totalObs - metrics.nanSensorCount)));
    setText('qFlagged', fmtInt(metrics.losGt3 + metrics.rangeJump));

    setText('passWindow', Number.isFinite(metrics.spanMinutes) ? `${fmtInt(metrics.spanMinutes)} min span` : '—');

    setText('cSensors', fmtInt(metrics.uniqueSensors));
    setText('cUniqueSensors', fmtInt(metrics.uniqueSensors));
    setText('cTBD', fmtInt(metrics.uniqueSensors));

    setText('aLosHigh', fmtInt(metrics.losGt3));
    setText('aNanSensor', fmtInt(metrics.nanSensorCount));
    setText('aRangeJump', fmtInt(metrics.rangeJump));
    setText('aTBD', fmtInt(metrics.rangeJump));

    setText('opsOperators', 'TBD');
    setText('opsJobs', fmtInt(metrics.totalObs));
    setText('opsEta', Number.isFinite(metrics.p90) ? `${fmtInt(metrics.p90)}m` : '—');

    applyBars('throughputBars', [
      metrics.totalObs || 0,
      metrics.uniqueSensors || 0,
      metrics.losGt3 || 0,
      metrics.rangeJump || 0
    ]);
  }

  function applyBars(containerId, values) {
    const el = getEl(containerId);
    if (!el) return;

    const numeric = values.map(v => Number(v) || 0);
    const max = Math.max(1, ...numeric);

    const bars = Array.from(el.children);
    numeric.forEach((value, index) => {
      const bar = bars[index];
      if (!bar) return;
      bar.style.setProperty('--v', `${Math.max(6, (value / max) * 100)}%`);
    });
  }
})();
