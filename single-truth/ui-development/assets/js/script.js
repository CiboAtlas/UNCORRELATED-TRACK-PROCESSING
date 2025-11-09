/* =========================
   CHARTS (monochrome)
========================= */
const monoLine  = '#d6d6d6';                 // stroke
const monoPoint = '#e6e6e6';                 // points
const monoBar   = '#9a9a9a';                 // bars
const grid      = 'rgba(255,255,255,0.08)';  // chart grid
const text      = '#cfd2d6';                 // axis text

function createLine(ctx, dataPoints, color = monoLine){
  return new Chart(ctx,{
    type:'line',
    data:{
      labels:['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'],
      datasets:[{
        data:dataPoints,
        borderColor:color,
        backgroundColor:'transparent',
        pointBackgroundColor:monoPoint,
        pointBorderColor:monoPoint,
        pointRadius:3,
        tension:.35,
        borderWidth:2
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{enabled:true,mode:'index',intersect:false} },
      scales:{
        x:{ ticks:{color:text}, grid:{color:grid} },
        y:{ ticks:{color:text}, grid:{color:grid} }
      }
    }
  });
}

function createBars(ctx){
  return new Chart(ctx,{
    type:'bar',
    data:{
      labels:['USA','GER','AUS','UK','RO','BR'],
      datasets:[{
        data:[45,15,12,72,96,43],
        backgroundColor:[
          monoBar, 'rgba(255,255,255,.10)','rgba(255,255,255,.10)',
          monoBar, monoBar, 'rgba(255,255,255,.10)'
        ],
        borderWidth:0,
        borderRadius:6
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:text},grid:{display:false}},
        y:{ticks:{color:text},grid:{color:grid}}
      }
    }
  });
}

/* =========================
   WELCOME OVERLAY — 2D canvas
========================= */
const ROTATION_SPEED = 0.0006;
const DOTS_LAT = 80;
const DOTS_LON = 80;

const PARTICLE_COUNT = 100;
const ORBIT_MIN = 2.45;
const ORBIT_MAX = 3.45;
const CONNECT_DIST = 100;
const KM_PER_PX = 30;

let welcomeRunning = false;

/* Fully manage dashboard visibility via body class */
function openWelcome() {
  const overlay = document.getElementById('welcomeOverlay');
  if(!overlay) return;
  document.body.classList.add('welcome-open');
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden','false');
  startWelcomeAnimation();      // 2D
  window.WelcomeGlobe?.start(); // 3D (welcome.js)
}

function closeWelcome() {
  const overlay = document.getElementById('welcomeOverlay');
  if(!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden','true');
  document.body.classList.remove('welcome-open');
  stopWelcomeAnimation();         // 2D
  window.WelcomeGlobe?.dispose(); // 3D
}

/* 2D renderer (transparent canvas stacked over WebGL) */
function startWelcomeAnimation() {
  const canvas = document.getElementById('welcomeCanvas2d');
  if(!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });

  let w, h, dpr, t = 0;
  const stars = [];
  const particles = [];

  function resize() {
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    w = canvas.width  = Math.floor(innerWidth * dpr);
    h = canvas.height = Math.floor(innerHeight * dpr);
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(dpr, dpr);

    stars.length = 0;
    const starCount = Math.floor((innerWidth*innerHeight)/9000);
    for (let i=0;i<starCount;i++){
      stars.push({
        x: Math.random()*innerWidth,
        y: Math.random()*innerHeight,
        a: Math.random()*0.6 + 0.2,
        r: Math.random()*1.3 + 0.2
      });
    }

    particles.length = 0;
    const globeR = Math.min(innerWidth, innerHeight) * 0.28;
    for (let i=0;i<PARTICLE_COUNT;i++){
      const shell = globeR * (ORBIT_MIN + Math.random()*(ORBIT_MAX-ORBIT_MIN));
      const theta = Math.random()*Math.PI*2;
      const vel = (Math.random()*0.0008 + 0.00035) * (globeR / shell);
      particles.push({ shell, theta, vel, tilt:(Math.random()*0.6 - 0.3), size: Math.random()*1.4 + 0.8 });
    }
  }
  resize();
  window.addEventListener('resize', resize);

  const spherePts = [];
  for(let i=0;i<=DOTS_LAT;i++){
    const v = i/ DOTS_LAT;
    const phi = (v-0.5)*Math.PI;
    const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
    for(let j=0;j<=DOTS_LON;j++){
      const u = j/ DOTS_LON;
      const theta = u*2*Math.PI;
      const cosTh = Math.cos(theta), sinTh = Math.sin(theta);
      spherePts.push([cosPhi*cosTh, sinPhi, cosPhi*sinTh]);
    }
  }

  function draw() {
    if(!welcomeRunning) return;
    requestAnimationFrame(draw);

    const cx = innerWidth/2, cy = innerHeight/2 + 10;
    const globeR = Math.min(innerWidth, innerHeight) * 0.28;

    ctx.clearRect(0,0,innerWidth,innerHeight);

    // stars (neutral whites)
    for(const s of stars){
      ctx.globalAlpha = s.a * (0.7 + 0.3*Math.sin(t*0.001 + s.x));
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      ctx.fillStyle = '#e5e7eb';
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // dotted globe (projected)
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    const angle = t * ROTATION_SPEED;
    const dist = 2.4;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    for(const p of spherePts){
      const x = p[0], y = p[1], z = p[2];
      const xr =  x*ca + z*sa;
      const zr = -x*sa + z*ca;
      const f = dist / (dist - zr);
      const px = cx + xr * globeR * f;
      const py = cy + y  * globeR * f;
      const a  = Math.max(0, Math.min(1, 0.35 + (zr+1)/2));
      ctx.globalAlpha = a;
      ctx.fillRect(px, py, 1.30, 1.15);
    }
    ctx.globalAlpha = 1;

    // ring scan band
    const bandY = cy + Math.sin(t*0.0012) * (globeR*0.05);
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.fillRect(0, bandY-8, innerWidth, 16);

    // particle positions
    const pts = [];
    for (const p of particles){
      p.theta += p.vel;
      const x = Math.cos(p.theta) * p.shell;
      const y = Math.sin(p.theta) * p.shell * p.tilt * 0.4;
      const z = Math.sin(p.theta) * (p.shell*0.08);
      const f = dist / (dist - z / (globeR*0.5));
      pts.push({ x: cx + x*f, y: cy + y*f, r: p.shell, size: p.size });
    }

    // connections + distance labels
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.66)';
    ctx.fillStyle = '#f8fafc';
    let labelSkip = 0;
    for (let i=0;i<pts.length;i++){
      for (let j=i+1;j<pts.length;j++){
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d  = Math.hypot(dx,dy);
        if (d < CONNECT_DIST){
          ctx.globalAlpha = 0.35 * (1 - d/CONNECT_DIST);
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();

          if ((labelSkip++ % 5) === 0){
            const mx = (pts[i].x + pts[j].x)/2;
            const my = (pts[i].y + pts[j].y)/2;
            const km = Math.round(d * KM_PER_PX);
            const text = `${km.toLocaleString()} km`;
            ctx.font = '10px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(0,0,0,.35)';
            const padX = 6;
            const tw = ctx.measureText(text).width;
            ctx.beginPath();
            ctx.roundRect(mx - tw/2 - padX, my - 9, tw + padX*2, 12, 6);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.85)';
            ctx.fillText(text, mx, my - 3);
          }
        }
      }
    }
    ctx.globalAlpha = 1;

    // particles
    ctx.fillStyle = '#ffffff';
    for (const s of pts){
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    t += 16;
  }

  welcomeRunning = true;
  draw();

  canvas._stop = () => {
    welcomeRunning = false;
    window.removeEventListener('resize', resize);
    const ctx2 = canvas.getContext('2d');
    ctx2 && ctx2.clearRect(0,0,canvas.width,canvas.height);
  };
}

function stopWelcomeAnimation() {
  const canvas = document.getElementById('welcomeCanvas2d');
  if (canvas && typeof canvas._stop === 'function') canvas._stop();
}

/* =========================
   BOOTSTRAP
========================= */
document.addEventListener('DOMContentLoaded', ()=>{
  // Charts → center stage
  const perf = document.getElementById('chartPerformance');
  const mini1 = document.getElementById('chartMini1');
  const mini2 = document.getElementById('chartMini2');
  const bars  = document.getElementById('chartBars');
  if(perf){ createLine(perf.getContext('2d'),[98,72,88,70,82,60,74,66,80,92,110,102]); }
  if(mini1){ createLine(mini1.getContext('2d'),[78,92,70,68,72,90,118,126,132,128,140,96]); }
  if(mini2){ createLine(mini2.getContext('2d'),[104,66,72,58,62,70,60,56,48,52,74,100]); }
  if(bars){  createBars(bars.getContext('2d')); }

  // Welcome overlay logic
  const overlay = document.getElementById('welcomeOverlay');
  const enterBtn = document.getElementById('enterBtn');
  const openWelcomeBtn = document.getElementById('openWelcomeBtn');

  const hasVisited = localStorage.getItem('l16_hasVisited') === '1';
  if (!hasVisited) { openWelcome(); } else { overlay.classList.add('hidden'); }

  // Enter → blink/shutdown if available → hide
  enterBtn?.addEventListener('click', async ()=>{
    localStorage.setItem('l16_hasVisited','1');
    try { if (window.WelcomeGlobe?.blinkAndShutdown) await window.WelcomeGlobe.blinkAndShutdown(); }
    finally { closeWelcome(); }
  });

  // Re-open Welcome from the dashboard
  openWelcomeBtn?.addEventListener('click', ()=> openWelcome());

  // Optional hotkey: 'w'
  window.addEventListener('keydown', (e)=>{
    if (e.key.toLowerCase() === 'w' && !e.metaKey && !e.ctrlKey) {
      const hidden = overlay.classList.contains('hidden');
      hidden ? openWelcome() : closeWelcome();
    }
  });
});
