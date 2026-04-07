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

  // These are browser-fetch paths relative to your project/server root.
  // Do NOT use raw Windows paths like C:\... in fetch().
  const DATASET_CANDIDATE_PATHS = [
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

  function toXYFromY(points) {
    return points.map((y, index) => ({ x: index + 1, y }));
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

    const recentRows = rows.slice(-8);

    return recentRows.map((row, index) => {
      const hue = Math.round((index / Math.max(1, recentRows.length)) * 300);
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
        backgroundColor: hsla(hue, 85, 65, 0.12),
        borderColor: hsla(hue, 90, 68, 0.85),
        pointBackgroundColor: hsla(hue, 92, 72, 0.98),
        pointBorderColor: hsla(hue, 92, 72, 1),
        pointHoverBackgroundColor: hsla(hue, 92, 72, 1),
        pointHoverBorderColor: '#ffffff',
        pointRadius: 4,
        pointHoverRadius: 8,
        pointHitRadius: 26,
        borderWidth: 1.25
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
          <div id="graphsRadarLegend" class="graphs-radar-legend" style="margin-top:14px; display:flex; flex-wrap:wrap; gap:10px;"></div>
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
      <div id="graphsRadarLegend" class="graphs-radar-legend" style="margin-top:14px; display:flex; flex-wrap:wrap; gap:10px;"></div>
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
            borderWidth: 1.25
          },
          point: {
            radius: 4,
            hoverRadius: 8,
            hitRadius: 26,
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
      try { entry.chart.destroy(); } catch (_) {}
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
        try { entry.chart.destroy(); } catch (_) {}
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
      const dataChanged = signature !== state.latestOpenEvolveSignature;
      const metricNames = sortMetricNamesForDisplay(extractMetricNames(rows));
      const latestRow = rows[rows.length - 1];
      const latestCombined = safeNumber(latestRow?.metrics?.combined_score);

      addLog(`[openevolve] loaded ${rows.length} rows`);
      addLog(`[openevolve] metrics found: ${metricNames.join(', ') || 'none'}`);
      addLog(
        `[openevolve] latest iteration=${latestRow.current_iteration} | combined_score=${latestCombined != null ? latestCombined.toFixed(6) : 'n/a'}`
      );

      renderProgramStatus(rows);
      renderLatestCheckpointMetrics(rows);

      const mainMetric = pickPrimaryMetric(metricNames);
      state.currentPrimaryMetric = mainMetric || 'combined_score';

      if (!dataChanged) {
        if (document.body.classList.contains('graphs-mode')) {
          renderGraphsRadar(rows);
        }
        addLog('[openevolve] no chart changes detected');
        return;
      }

      state.latestOpenEvolveSignature = signature;

      const mainPoints = mainMetric ? buildMetricSeries(rows, mainMetric) : [];
      if (mainPoints.length) {
        updateChartSeries(state.perfChart, mainPoints, { preserveMainViewport: true });
        setText('mainMetricTitle', prettifyMetricName(mainMetric));
      } else {
        setText('mainMetricTitle', 'Performance');
      }

      syncMetricCards(rows, mainMetric);

      if (document.body.classList.contains('graphs-mode')) {
        renderGraphsRadar(rows);
      }

      addLog('[openevolve] charts updated');
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
      if (!dom.openEvolveLog) return;

      dom.openEvolveLog.innerHTML = `
        <div class="log-meta">${escapeHtml(err.message)}</div>
        <code>—</code>
      `;
      scrollLogPanelToBottom(dom.openEvolveLog);
    }
  }

  function computeMetricsFromObs(obs) {
    const totalObs = obs.length;

    const times = obs
      .map(item => new Date(item.obTime))
      .filter(date => !Number.isNaN(date.getTime()))
      .sort((a, b) => a - b);

    const earliest = times[0] || null;
    const latest = times[times.length - 1] || null;
    const spanMin = earliest && latest ? (latest - earliest) / 60000 : NaN;

    const ranges = obs.map(item => item.range).filter(value => typeof value === 'number' && Number.isFinite(value));
    const loses = obs.map(item => item.losUnc).filter(value => typeof value === 'number' && Number.isFinite(value));

    const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
    const avgRange = average(ranges);
    const avgLos = average(loses);

    const sensorName = value => (value == null ? '' : String(value)).trim();
    const sensors = obs.map(item => sensorName(item.idSensor ?? item.sensor));
    const uniqueSensors = new Set(sensors.filter(Boolean)).size;
    const nanSensorCount = sensors.filter(sensor => sensor.toLowerCase() === 'nan').length;

    const uctTrue = obs.filter(item => item.uct === true).length;
    const losGt3 = obs.filter(item => typeof item.losUnc === 'number' && item.losUnc > 3).length;

    const obsByTime = [...obs]
      .filter(item => item.obTime && typeof item.range === 'number' && Number.isFinite(item.range))
      .sort((a, b) => new Date(a.obTime) - new Date(b.obTime));

    let rangeJump = 0;
    for (let i = 1; i < obsByTime.length; i += 1) {
      const deltaRange = Math.abs(obsByTime[i].range - obsByTime[i - 1].range);
      if (deltaRange > 5) rangeJump += 1;
    }

    const ratePerHr = Number.isFinite(spanMin) && spanMin > 0
      ? totalObs / (spanMin / 60)
      : NaN;

    const gaps = [];
    for (let i = 1; i < obsByTime.length; i += 1) {
      const dt = minutesBetween(obsByTime[i - 1].obTime, obsByTime[i].obTime);
      if (Number.isFinite(dt)) gaps.push(dt);
    }
    gaps.sort((a, b) => a - b);

    const passWindowText = earliest && latest
      ? `${fmtDateZ(earliest.toISOString()).split(' ')[1].replace('Z', '')}→${fmtDateZ(latest.toISOString()).split(' ')[1].replace('Z', '')} UTC`
      : '—';

    return {
      totalObs,
      avgRange,
      avgLos,
      latestObsIso: latest ? latest.toISOString() : null,
      earliestObsIso: earliest ? earliest.toISOString() : null,
      spanMin,
      ratePerHr,
      uniqueSensors,
      nanSensorCount,
      uctTrue,
      losGt3,
      rangeJump,
      p50: percentile(gaps, 0.5),
      p90: percentile(gaps, 0.9),
      p99: percentile(gaps, 0.99),
      passWindowText
    };
  }

  function applyBars(containerId, values) {
    const wrap = getEl(containerId);
    if (!wrap) return;

    const bars = [...wrap.querySelectorAll('div')];
    if (!bars.length) return;

    const maxValue = Math.max(1, ...values);
    bars.forEach((bar, index) => {
      const value = values[index] ?? 0;
      const pct = Math.max(6, Math.min(100, (value / maxValue) * 100));
      bar.style.setProperty('--v', `${pct}%`);
    });
  }

  function renderOuterPanels(metrics) {
    setText('tAvgRange', Number.isFinite(metrics.avgRange) ? `${fmtNum(metrics.avgRange, 0)} km` : '—');
    setText('tAvgLos', fmtNum(metrics.avgLos, 3));
    setText('tLatest', fmtDateZ(metrics.latestObsIso));

    setText('qUncorrelated', fmtInt(metrics.uctTrue));
    setText('qResolved', fmtInt(metrics.totalObs));
    setText('qFlagged', fmtInt(metrics.losGt3));

    setText('passWindow', metrics.passWindowText);
    setText('cSensors', fmtInt(metrics.uniqueSensors));
    setText('cObsRate', Number.isFinite(metrics.ratePerHr) ? `${fmtNum(metrics.ratePerHr, 1)}/hr` : '—');
    setText('cSpan', Number.isFinite(metrics.spanMin) ? `${fmtInt(metrics.spanMin)}m` : '—');

    setText('aLosHigh', fmtInt(metrics.losGt3));
    setText('aNanSensor', fmtInt(metrics.nanSensorCount));
    setText('aRangeJump', fmtInt(metrics.rangeJump));

    setText('opsOperators', '4 online');
    setText('opsJobs', fmtInt(metrics.totalObs));
    setText('opsEta', Number.isFinite(metrics.p90) ? `${fmtInt(metrics.p90)}m` : '—');

    applyBars('throughputBars', [
      metrics.totalObs || 0,
      metrics.uniqueSensors || 0,
      metrics.losGt3 || 0,
      metrics.rangeJump || 0
    ]);
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

  async function loadDataset() {
    try {
      addLog('[dataset] loading...');

      const localValue = localStorage.getItem('l25_dataset_json');
      let json = null;
      let sourceLabel = 'localStorage:l25_dataset_json';

      if (localValue) {
        json = JSON.parse(localValue);
      } else {
        for (const candidate of DATASET_CANDIDATE_PATHS) {
          try {
            const res = await fetch(candidate, { cache: 'no-store' });
            if (!res.ok) continue;
            json = await res.json();
            sourceLabel = candidate;
            break;
          } catch (_) {}
        }
      }

      if (!json) {
        throw new Error(
          `No dataset source found. Checked: ${DATASET_CANDIDATE_PATHS.join(', ')}`
        );
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

        localStorage.setItem('l16_hasVisited', '1');

        try {
          await animateWelcomeExit();
        } finally {
          closeWelcome();
        }
      });
    }

    const overlay = getEl('welcomeOverlay');
    const hasVisited = localStorage.getItem('l16_hasVisited') === '1';
    const url = new URL(window.location.href);

    if (url.searchParams.get('welcome') === '1' || !hasVisited) {
      openWelcome();
    } else if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('welcome-open');
    }

    window.addEventListener('keydown', event => {
      if (event.key.toLowerCase() === 'w' && !event.metaKey && !event.ctrlKey) {
        const currentOverlay = getEl('welcomeOverlay');
        const hidden = currentOverlay?.classList.contains('hidden');
        hidden ? openWelcome() : closeWelcome();
      }

      if (event.key === 'Escape' && state.graphsFullscreen) {
        toggleGraphsRadarFullscreen();
      }
    });
  }

  function openWelcome() {
    const overlay = getEl('welcomeOverlay');
    if (!overlay) return;

    document.body.classList.add('welcome-open');
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');

    startWelcomeAnimation();
    window.WelcomeGlobe?.start?.();
  }

  function closeWelcome() {
    const overlay = getEl('welcomeOverlay');
    if (!overlay) return;

    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('welcome-open');

    stopWelcomeAnimation();
    window.WelcomeGlobe?.dispose?.();
  }

  function startWelcomeAnimation() {
    const canvas = getEl('welcomeCanvas2d');
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    let t = 0;

    const stars = [];
    const particles = [];

    const spherePts = [];
    for (let i = 0; i <= WELCOME.dotsLat; i += 1) {
      const v = i / WELCOME.dotsLat;
      const phi = (v - 0.5) * Math.PI;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);

      for (let j = 0; j <= WELCOME.dotsLon; j += 1) {
        const u = j / WELCOME.dotsLon;
        const theta = u * 2 * Math.PI;
        spherePts.push([
          cosPhi * Math.cos(theta),
          sinPhi,
          cosPhi * Math.sin(theta)
        ]);
      }
    }

    function resize() {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      stars.length = 0;
      const starCount = Math.floor((window.innerWidth * window.innerHeight) / 9000);
      for (let i = 0; i < starCount; i += 1) {
        stars.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          a: Math.random() * 0.6 + 0.2,
          r: Math.random() * 1.3 + 0.2
        });
      }

      particles.length = 0;
      const globeR = Math.min(window.innerWidth, window.innerHeight) * 0.28;
      for (let i = 0; i < WELCOME.particleCount; i += 1) {
        const shell = globeR * (WELCOME.orbitMin + Math.random() * (WELCOME.orbitMax - WELCOME.orbitMin));
        const theta = Math.random() * Math.PI * 2;
        const vel = (Math.random() * 0.0008 + 0.00035) * (globeR / shell);

        particles.push({
          shell,
          theta,
          vel,
          tilt: Math.random() * 0.6 - 0.3,
          size: Math.random() * 1.4 + 0.8
        });
      }
    }

    function draw() {
      if (!state.welcomeRunning) return;
      requestAnimationFrame(draw);

      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2 + 10;
      const globeR = Math.min(window.innerWidth, window.innerHeight) * 0.28;

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (const star of stars) {
        ctx.globalAlpha = star.a * (0.7 + 0.3 * Math.sin(t * 0.001 + star.x));
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = '#e5e7eb';
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = 'rgba(255,255,255,.82)';
      const angle = t * WELCOME.rotationSpeed;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const dist = 2.4;

      for (const point of spherePts) {
        const x = point[0];
        const y = point[1];
        const z = point[2];

        const xr = x * ca + z * sa;
        const zr = -x * sa + z * ca;
        const f = dist / (dist - zr);

        const px = cx + xr * globeR * f;
        const py = cy + y * globeR * f;
        const alpha = Math.max(0, Math.min(1, 0.35 + (zr + 1) / 2));

        ctx.globalAlpha = alpha;
        ctx.fillRect(px, py, 1.3, 1.15);
      }
      ctx.globalAlpha = 1;

      const bandY = cy + Math.sin(t * 0.0012) * (globeR * 0.05);
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      ctx.fillRect(0, bandY - 8, window.innerWidth, 16);

      const orbitPoints = [];
      for (const particle of particles) {
        particle.theta += particle.vel;

        const x = Math.cos(particle.theta) * particle.shell;
        const y = Math.sin(particle.theta) * particle.shell * particle.tilt * 0.4;
        const z = Math.sin(particle.theta) * (particle.shell * 0.08);
        const f = dist / (dist - z / (globeR * 0.5));

        orbitPoints.push({
          x: cx + x * f,
          y: cy + y * f,
          size: particle.size
        });
      }

      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(255,255,255,0.66)';
      for (let i = 0; i < orbitPoints.length; i += 1) {
        for (let j = i + 1; j < orbitPoints.length; j += 1) {
          const dx = orbitPoints[i].x - orbitPoints[j].x;
          const dy = orbitPoints[i].y - orbitPoints[j].y;
          const d = Math.hypot(dx, dy);

          if (d < WELCOME.connectDist) {
            ctx.globalAlpha = 0.35 * (1 - d / WELCOME.connectDist);
            ctx.beginPath();
            ctx.moveTo(orbitPoints[i].x, orbitPoints[i].y);
            ctx.lineTo(orbitPoints[j].x, orbitPoints[j].y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#ffffff';
      for (const point of orbitPoints) {
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      t += 16;
    }

    resize();
    window.addEventListener('resize', resize);

    state.welcomeRunning = true;
    draw();

    canvas._stop = () => {
      state.welcomeRunning = false;
      window.removeEventListener('resize', resize);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.style.opacity = '1';
    };
  }

  function stopWelcomeAnimation() {
    const canvas = getEl('welcomeCanvas2d');
    if (canvas && typeof canvas._stop === 'function') {
      canvas._stop();
    }
  }

  function setupZoomAndPan() {
    if (!state.perfChart || !dom.chartPerformance) return;

    const canvas = dom.chartPerformance;
    const EPS = 1e-6;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const inFocusMode = () => document.body.classList.contains('focus-mode');

    function getXBounds() {
      const points = state.perfChart.data.datasets[0].data || [];
      const xs = points.map(point => Number(point.x)).filter(Number.isFinite);

      const defMin = xs.length ? Math.min(...xs) : 1;
      const defMax = xs.length ? Math.max(...xs) : 2;

      const xScale = state.perfChart.options.scales.x;
      const min = typeof xScale.min === 'number' ? xScale.min : defMin;
      const max = typeof xScale.max === 'number' ? xScale.max : defMax;

      return { min, max, defMin, defMax };
    }

    function setXBounds(min, max) {
      const { defMin, defMax } = getXBounds();
      let nextMin = min;
      let nextMax = max;

      if (nextMin == null || nextMax == null) {
        state.perfChart.options.scales.x.min = undefined;
        state.perfChart.options.scales.x.max = undefined;
        state.perfUserViewport = null;
        state.perfUserInteracted = false;
        autoFitPerfYToCurrentX(state.perfChart);
        return;
      }

      if (nextMin < defMin) {
        nextMax += defMin - nextMin;
        nextMin = defMin;
      }
      if (nextMax > defMax) {
        nextMin -= nextMax - defMax;
        nextMax = defMax;
      }

      nextMin = clamp(nextMin, defMin, defMax);
      nextMax = clamp(nextMax, defMin, defMax);

      if (nextMax - nextMin < EPS) return;

      state.perfChart.options.scales.x.min = nextMin;
      state.perfChart.options.scales.x.max = nextMax;
      state.perfUserViewport = { min: nextMin, max: nextMax };
      state.perfUserInteracted = true;

      autoFitPerfYToCurrentX(state.perfChart);
    }

    function captureViewport() {
      state.perfUserViewport = getChartViewport(state.perfChart);
      state.perfUserInteracted = true;
    }

    function clearViewport() {
      state.perfUserViewport = null;
      state.perfUserInteracted = false;
    }

    dom.zoomInBtn?.addEventListener('click', () => {
      const { min, max, defMin, defMax } = getXBounds();
      const span = Math.max(EPS, max - min);
      const nextSpan = Math.max(EPS, span * 0.85);
      const center = (min + max) / 2;

      let nextMin = center - nextSpan / 2;
      let nextMax = center + nextSpan / 2;

      if (nextMin < defMin) {
        nextMax += defMin - nextMin;
        nextMin = defMin;
      }
      if (nextMax > defMax) {
        nextMin -= nextMax - defMax;
        nextMax = defMax;
      }

      setXBounds(nextMin, nextMax);
      captureViewport();
    });

    dom.zoomOutBtn?.addEventListener('click', () => {
      const { min, max, defMin, defMax } = getXBounds();
      const span = Math.max(EPS, max - min);
      const nextSpan = Math.min(defMax - defMin, span * 1.15);
      const center = (min + max) / 2;

      let nextMin = center - nextSpan / 2;
      let nextMax = center + nextSpan / 2;

      if (nextMin < defMin) {
        nextMax += defMin - nextMin;
        nextMin = defMin;
      }
      if (nextMax > defMax) {
        nextMin -= nextMax - defMax;
        nextMax = defMax;
      }

      setXBounds(nextMin, nextMax);
      captureViewport();
    });

    dom.resetZoomBtn?.addEventListener('click', () => {
      clearViewport();
      setXBounds(null, null);
    });

    let dragging = false;
    let dragStartX = 0;
    let dragViewport = null;

    const stopDragging = event => {
      dragging = false;
      dragViewport = null;
      try {
        canvas.releasePointerCapture?.(event.pointerId);
      } catch (_) {}
    };

    canvas.addEventListener('pointerdown', event => {
      if (!inFocusMode()) return;

      dragging = true;
      dragStartX = event.clientX;
      dragViewport = getXBounds();
      canvas.setPointerCapture?.(event.pointerId);
    });

    canvas.addEventListener('pointermove', event => {
      if (!dragging || !dragViewport) return;

      const rect = canvas.getBoundingClientRect();
      const dx = event.clientX - dragStartX;
      const span = dragViewport.max - dragViewport.min;
      const px = Math.max(1, rect.width);
      const shift = -(dx / px) * span;

      setXBounds(dragViewport.min + shift, dragViewport.max + shift);
      captureViewport();
    });

    canvas.addEventListener('pointerup', stopDragging);
    canvas.addEventListener('pointercancel', stopDragging);

    canvas.addEventListener('wheel', event => {
      if (!inFocusMode()) return;
      event.preventDefault();

      const { min, max, defMin, defMax } = getXBounds();
      const span = max - min;
      const rect = canvas.getBoundingClientRect();
      const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
      const center = min + span * ratio;
      const zoomFactor = event.deltaY < 0 ? 0.9 : 1.1;
      const nextSpan = Math.max(EPS, Math.min(defMax - defMin, span * zoomFactor));

      let nextMin = center - nextSpan * ratio;
      let nextMax = nextMin + nextSpan;

      if (nextMin < defMin) {
        nextMax += defMin - nextMin;
        nextMin = defMin;
      }
      if (nextMax > defMax) {
        nextMin -= nextMax - defMax;
        nextMax = defMax;
      }

      setXBounds(nextMin, nextMax);
      captureViewport();
    }, { passive: false });
  }
})();