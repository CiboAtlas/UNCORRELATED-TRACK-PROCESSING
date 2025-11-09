// OpenEvolve Dashboard - Main JavaScript
class OpenEvolveDashboard {
  constructor() {
    this.charts = {};
    this.currentLanguage = 'filler';
    this.codeTemplates = {
      filler: ``
    };
    
    this.init();
  }

  init() {
    this.setupCharts();
    this.setupIDE();
    this.setupEventListeners();
    this.setupSidebarToggle();
  }

  // Chart setup and management
  setupCharts() {
    const chartConfig = {
      type: 'line',
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
            tooltip: {
              enabled: true,
              mode: 'index',
              intersect: false,
              backgroundColor: '#1a1a1a',
              titleColor: '#ffffff',
              bodyColor: '#b3b3b3',
              borderColor: '#ff5bbb',
              borderWidth: 1
            }
        },
        scales: {
          x: {
            ticks: { color: '#666666' },
            grid: { color: '#333333' }
          },
          y: {
            ticks: { color: '#666666' },
            grid: { color: '#333333' }
          }
        },
        elements: {
          point: {
            radius: 4,
            hoverRadius: 6,
            backgroundColor: '#ff5bbb',
            borderColor: '#ff5bbb',
            borderWidth: 2
          }
        }
      }
    };

    // Overall Trends Chart (Total Shipments Performance)
    const overallCtx = document.getElementById('chartOverall');
    if (overallCtx) {
      this.charts.overall = new Chart(overallCtx, {
        ...chartConfig,
        data: {
          labels: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
          datasets: [{
            data: [80, 75, 70, 68, 72, 70, 75, 78, 85, 90, 95, 88],
            borderColor: '#ff5bbb',
            backgroundColor: 'rgba(255, 91, 187, 0.1)',
            tension: 0.35,
            borderWidth: 2,
            fill: true
          }]
    }
  });
}

    // Shipments Chart (Total Shipments)
    const shipmentsCtx = document.getElementById('chartShipments');
    if (shipmentsCtx) {
      this.charts.shipments = new Chart(shipmentsCtx, {
        ...chartConfig,
        data: {
          labels: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
          datasets: [{
            data: [80, 75, 60, 55, 65, 70, 85, 95, 110, 125, 135, 100],
            borderColor: '#ff5bbb',
            backgroundColor: 'rgba(255, 91, 187, 0.1)',
            tension: 0.35,
            borderWidth: 2,
            fill: true
          }]
    }
  });
}

    // Sales Chart (Daily Sales - Bar Chart)
    const salesCtx = document.getElementById('chartSales');
    if (salesCtx) {
      this.charts.sales = new Chart(salesCtx, {
        type: 'bar',
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              mode: 'index',
              intersect: false,
              backgroundColor: '#1a1a1a',
              titleColor: '#ffffff',
              bodyColor: '#b3b3b3',
              borderColor: '#ff5bbb',
              borderWidth: 1
            }
          },
          scales: {
            x: {
              ticks: { color: '#666666' },
              grid: { color: '#333333' }
            },
            y: {
              ticks: { color: '#666666' },
              grid: { color: '#333333' }
            }
          }
        },
        data: {
          labels: ['USA', 'GER', 'AUS', 'UK', 'RO', 'BR'],
          datasets: [{
            data: [45, 15, 12, 72, 96, 43],
            backgroundColor: ['#3b82f6', '#6b7280', '#6b7280', '#3b82f6', '#3b82f6', '#6b7280'],
            borderWidth: 0,
            borderRadius: 6
          }]
        }
      });
    }

    // Profit Chart (Completed Tasks)
    const profitCtx = document.getElementById('chartProfit');
    if (profitCtx) {
      this.charts.profit = new Chart(profitCtx, {
        ...chartConfig,
        data: {
          labels: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
          datasets: [{
            data: [100, 95, 60, 55, 65, 70, 75, 80, 85, 90, 95, 100],
            borderColor: '#27e0a7',
            backgroundColor: 'rgba(39, 224, 167, 0.1)',
            tension: 0.35,
            borderWidth: 2,
            fill: true
          }]
        }
      });
    }
  }


  // IDE-like functionality
  setupIDE() {
    this.setupLanguageTabs();
    this.setupCodeEditor();
  }

  setupLanguageTabs() {
    const tabs = document.querySelectorAll('.editor-tabs .tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // Remove active class from all tabs
        tabs.forEach(t => t.classList.remove('active'));
        // Add active class to clicked tab
        tab.classList.add('active');
        
        // Update current language and code
        this.currentLanguage = tab.dataset.lang;
        this.updateCodeDisplay();
      });
    });
  }

  setupCodeEditor() {
    const userInput = document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton');
    const fileUploadButton = document.getElementById('fileUploadButton');
    const fileInput = document.getElementById('fileInput');

    if (userInput) {
      userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          // Do nothing - chatbot is disabled
        }
      });
    }

    if (sendButton) {
      sendButton.addEventListener('click', () => {
        // Do nothing - chatbot is disabled
      });
    }

    if (fileUploadButton && fileInput) {
      fileUploadButton.addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          // File selected - could add visual feedback here
          console.log('File selected:', file.name);
        }
      });
    }
  }




  // Sidebar toggle functionality
  setupSidebarToggle() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    
    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('minimized');
        
        // Update charts after sidebar resize
        setTimeout(() => {
          Object.values(this.charts).forEach(chart => {
            if (chart) chart.resize();
          });
        }, 300);
      });
    }
  }

  // Event listeners
  setupEventListeners() {
    // Navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
      e.preventDefault();
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
      });
    });

    // Window resize
    window.addEventListener('resize', () => {
      Object.values(this.charts).forEach(chart => {
        if (chart) chart.resize();
      });
    });
  }

}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new OpenEvolveDashboard();
});

// Add CSS for cursor blink animation
const style = document.createElement('style');
style.textContent = `
  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
`;
document.head.appendChild(style);

// Editor gutter: populate line numbers and sync scrolling
(function() {
  function setupGutter() {
    const gutter = document.getElementById('editorGutter');
    const editorView = document.getElementById('editorView');
    const outputCode = document.getElementById('outputCode');
    if (!gutter || !editorView || !outputCode) return;

    function updateGutter() {
      // split code by lines
      const text = outputCode.textContent || outputCode.innerText || '';
      const lines = text.split('\n');
      // create a string of line numbers
      let html = '';
      for (let i = 0; i < lines.length; i++) {
        html += (i + 1) + '\n';
      }
      gutter.textContent = html;
    }

    // sync scroll
    const view = document.getElementById('editorView');
    view.addEventListener('scroll', () => {
      gutter.scrollTop = view.scrollTop;
    });

    // observe changes to outputCode content (for dynamic updates)
    const observer = new MutationObserver(() => updateGutter());
    observer.observe(outputCode, { childList: true, subtree: true, characterData: true });

    // initial fill
    updateGutter();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') setupGutter();
  else document.addEventListener('DOMContentLoaded', setupGutter);
})();