/* Welcome globe (Three.js) with blinking X + clean lifecycle */
(() => {
  // ------- tunables -------
  const ROTATION_SPEED = 0.0008;   // normal spin
  const STAR_COUNT     = 1500;
  const R_GLOBE        = 2;
  const R_MARKERS      = R_GLOBE + 0.02;
  const X_SIZE         = 0.18;
  const X_COLOR        = 0xff3b3b;

  // ------- state -------
  let renderer = null, scene = null, camera = null;
  let globeGroup = null, rafId = 0, started = false;

  // parts we’ll fade during shutdown
  let globePoints = null;      // dotted sphere
  let globePointsMat = null;
  let ringLines = [];          // orbits
  let ringMat = null;
  let stars = null;
  let starMat = null;
  let markers = [];            // red X’s (objects)
  let markerMats = [];         // each X’s material

  // shutdown controls
  let shuttingDown = false;
  let shutdownStart = 0;
  let shutdownDuration = 900;  // ms fade time
  let resolveShutdown = null;  // Promise resolver

  // ---------- helpers ----------
  function makeX(size = X_SIZE, color = X_COLOR) {
    const s = size;
    const verts = new Float32Array([
      -s, -s, 0,   s,  s, 0,
      -s,  s, 0,   s, -s, 0
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const mesh = new THREE.LineSegments(geo, mat);
    markerMats.push(mat);
    return mesh;
  }

  function addMarkers() {
    const lats = [-60, -30, -10, 10, 30, 60];
    const lons = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
    for (const lat of lats) {
      for (const lon of lons) {
        if ((lat + lon) % 60 === 0) continue;
        const phi   = THREE.MathUtils.degToRad(90 - lat);
        const theta = THREE.MathUtils.degToRad(lon);
        const x = R_MARKERS * Math.sin(phi) * Math.cos(theta);
        const y = R_MARKERS * Math.cos(phi);
        const z = R_MARKERS * Math.sin(phi) * Math.sin(theta);
        const obj = makeX();
        obj.position.set(x, y, z);
        markers.push(obj);
        globeGroup.add(obj);
      }
    }
    for (let i = 0; i < 10; i++) {
      const u = Math.random(), v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const x = R_MARKERS * Math.sin(phi) * Math.cos(theta);
      const y = R_MARKERS * Math.cos(phi);
      const z = R_MARKERS * Math.sin(phi) * Math.sin(theta);
      const obj = makeX(X_SIZE * (0.9 + Math.random() * 0.4));
      obj.position.set(x, y, z);
      markers.push(obj);
      globeGroup.add(obj);
    }
  }

  function createScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 7);
    scene.add(camera);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 0.5);
    dir.position.set(5, 5, 5);
    scene.add(dir);

    globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const geo = new THREE.SphereGeometry(R_GLOBE, 64, 64);
    globePointsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.012, transparent: true, opacity: 0.9 });
    globePoints = new THREE.Points(geo, globePointsMat);
    globeGroup.add(globePoints);

    ringMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
    ringLines = [];
    [0.0, 0.18, -0.15].forEach((tilt, i) => {
      const curve = new THREE.EllipseCurve(0, 0, 3.2 + i * 0.15, 3.6 + i * 0.15, 0, Math.PI * 2, false, 0);
      const pts = curve.getPoints(256).map(p => new THREE.Vector3(p.x, p.y, 0));
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), ringMat);
      line.rotation.x = Math.PI / 2;
      line.rotation.z = tilt;
      globeGroup.add(line);
      ringLines.push(line);
    });

    const starGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      pos[i*3+0] = (Math.random() - 0.5) * 30;
      pos[i*3+1] = (Math.random() - 0.5) * 30;
      pos[i*3+2] = (Math.random() - 0.5) * 30;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.01, transparent: true, opacity: 0.5 });
    stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    addMarkers();
  }

  function resize() {
    const canvas = document.getElementById('welcomeCanvas3d');
    if (!canvas || !renderer) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function animate() {
    rafId = requestAnimationFrame(animate);

    const now = performance.now();
    let spin = ROTATION_SPEED;
    if (shuttingDown) {
      const t = Math.min(1, (now - shutdownStart) / shutdownDuration);
      const k = 1 - t;
      spin *= k * k;
      const f = k;
      globePointsMat.opacity = 0.9 * f;
      ringMat.opacity        = 0.35 * f;
      starMat.opacity        = 0.5 * f;
      for (const m of markerMats) m.opacity = Math.max(0.05, m.opacity) * f;

      if (t >= 1) {
        shuttingDown = false;
        if (resolveShutdown) { const r = resolveShutdown; resolveShutdown = null; r(); }
      }
    }

    globeGroup.rotation.y += spin;
    ringLines.forEach((r, i) => { r.rotation.y -= spin * (i + 1) * 0.3; });
    for (const m of markers) m.lookAt(camera.position);

    renderer.render(scene, camera);
  }

  function start() {
    if (started) return;
    const canvas = document.getElementById('welcomeCanvas3d');
    if (!canvas) return;

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    createScene();
    resize();
    window.addEventListener('resize', resize, { passive: true });

    started = true;
    shuttingDown = false;
    shutdownStart = 0;
    animate();
  }

  async function blinkAndShutdown() {
    if (!started) return Promise.resolve();
    const blinks = 3;
    const period = 180; // ms per half-toggle
    let toggles = 0;
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const on = (toggles % 2) === 0;
        for (const m of markerMats) m.opacity = on ? 0.15 : 0.95;
        toggles++;
        if (toggles >= blinks * 2) {
          clearInterval(timer);
          shuttingDown = true;
          shutdownStart = performance.now();
          resolveShutdown = () => resolve();
        }
      }, period);
    });
  }

  function dispose() {
    if (!started) return;
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resize);

    const disposeObj = (obj) => {
      obj.traverse?.((o) => {
        if (o.geometry) o.geometry.dispose?.();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
          else o.material.dispose?.();
        }
      });
    };
    disposeObj(scene);

    renderer.dispose();
    renderer = null;
    scene = null; camera = null; globeGroup = null;
    globePoints = null; globePointsMat = null;
    stars = null; starMat = null;
    ringLines = []; ringMat = null;
    markers = []; markerMats = [];
    started = false;
  }

  window.WelcomeGlobe = { start, dispose, blinkAndShutdown, get isReady(){ return started; } };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const overlay = document.getElementById('welcomeOverlay');
      if (overlay && !overlay.classList.contains('hidden')) start();
    });
  } else {
    const overlay = document.getElementById('welcomeOverlay');
    if (overlay && !overlay.classList.contains('hidden')) start();
  }
})();
