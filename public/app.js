/* solichin.org: a slow "drone" camera over the painting plus a scrambled title.
   Only one element (.stage) moves, with translate3d/scale, so it stays on the GPU. */
(function () {
  'use strict';

  // Future: set to e.g. '/video/flight.mp4' once the AI fly-through exists. It plays
  // muted/inline/looped inside .stage, the code camera stops, and the painting stays as poster.
  var VIDEO = null;

  // Camera paths in painting coordinates: u,v = centre of view (0..1), z = zoom over "cover".
  // d = relative time to travel to the next key. Closed Catmull-Rom loop, so it is seamless.
  // The path is picked by the painting's shape, so swapping the image file needs no code change
  // (but the keys may want retuning if the composition moves).
  var PATHS = {
    // Portrait painting: start low on Adam and the rocks, rise up his arm, through the light
    // between the fingers, up to God, then ease back down.
    // Fred's drawn path (portrait painting). One closed loop:
    portrait: { loop: 28, still: { u: 0.50, v: 0.48, z: 1.35 }, keys: [
      { u: 0.50, v: 0.55, z: 1.30 },  // wide
      { u: 0.68, v: 0.22, z: 2.10 },  // God
      { u: 0.58, v: 0.38, z: 2.00 },  // God's arm
      { u: 0.48, v: 0.48, z: 2.25 },  // spark
      { u: 0.32, v: 0.68, z: 2.00 },  // Adam's arm
      { u: 0.28, v: 0.80, z: 2.15 },  // Adam
      { u: 0.55, v: 0.82, z: 1.60 },  // ground
      { u: 0.78, v: 0.65, z: 1.70 },  // cypress
      { u: 0.72, v: 0.35, z: 1.80 },  // sky climb
      { u: 0.55, v: 0.28, z: 1.70 },  // stars
      { u: 0.48, v: 0.42, z: 1.50 },  // pull back
      { u: 0.50, v: 0.52, z: 1.35 }   // wide
    ]},

    // Landscape painting (earlier stand-in): window travelling across a wide picture.
    landscape: { loop: 26, still: { u: 0.425, v: 0.44, z: 1.30 }, keys: [
      { u: 0.58, v: 0.78, z: 2.10 }, { u: 0.68, v: 0.62, z: 1.70 },
      { u: 0.80, v: 0.40, z: 1.50 }, { u: 0.65, v: 0.33, z: 1.60 },
      { u: 0.48, v: 0.43, z: 1.85 }, { u: 0.428, v: 0.43, z: 1.95 },
      { u: 0.35, v: 0.44, z: 1.85 }, { u: 0.19, v: 0.40, z: 1.60 },
      { u: 0.20, v: 0.58, z: 1.50 }, { u: 0.34, v: 0.72, z: 1.85 },
      { u: 0.47, v: 0.79, z: 2.10 }
    ]}
  };

  var stage = document.getElementById('stage');
  var img = document.getElementById('painting');
  var words = document.getElementById('words');
  var line = document.getElementById('line');
  var backdrop = document.querySelector('.backdrop');
  backdrop.style.backgroundImage = stage.style.backgroundImage;

  var IMG_W = +img.getAttribute('width'), IMG_H = +img.getAttribute('height'), ASPECT = IMG_W / IMG_H;
  var P = ASPECT < 1 ? PATHS.portrait : PATHS.landscape;
  var KEYS = P.keys, LOOP = P.loop, STILL = P.still;

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var still = reduce || saveData || /[?&]still\b/.test(location.search);

  // ---------- layout ----------
  var vw, vh, W, H, zMul;
  function layout() {
    vw = window.innerWidth; vh = window.innerHeight;
    var screenAspect = vw / vh;
    if (ASPECT < 1 && screenAspect > 0.8) {
      // portrait painting on a wide screen: show it whole and centred, gentle moves only
      H = vh; W = H * ASPECT; zMul = 0.3;
    } else {
      H = Math.max(vh, vw / ASPECT); W = H * ASPECT; // cover
      zMul = vw > vh ? 0.45 : 1;
    }
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    prepare();
  }
  function axis(view, size, c) { // offset that puts c (0..1) at the centre, clamped to the painting
    if (size <= view) return (view - size) / 2;
    return Math.min(0, Math.max(view - size, view / 2 - c * size));
  }
  function place(u, v, z) {
    z = 1 + (z - 1) * zMul;
    var x = axis(vw, W * z, u), y = axis(vh, H * z, v);
    stage.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) scale(' + z.toFixed(4) + ')';
  }

  // ---------- closed Catmull-Rom spline ----------
  // Keys are first clamped to what this screen can actually reach (so the camera never stalls
  // against an edge), then each segment gets time in proportion to how far it moves ON SCREEN,
  // which keeps the speed nearly constant: faster across wide sweeps, gentle when zoomed in.
  var N = KEYS.length, total = 0, starts = [], K = [], durs = [];
  function prepare() {
    K = KEYS.map(function (k) {
      var z = 1 + (k.z - 1) * zMul, hx = vw / (2 * W * z), hy = vh / (2 * H * z);
      return {
        u: hx >= 0.5 ? 0.5 : Math.min(1 - hx, Math.max(hx, k.u)),
        v: hy >= 0.5 ? 0.5 : Math.min(1 - hy, Math.max(hy, k.v)), z: k.z };
    });
    total = 0; starts = []; durs = [];
    for (var i = 0; i < N; i++) {
      var a = K[i], b = K[(i + 1) % N];
      var dist = Math.hypot((b.u - a.u) * W, (b.v - a.v) * H) / vh * (a.z + b.z) / 2 + Math.abs(b.z - a.z) * 0.6;
      var d = Math.max(0.12, dist);
      starts.push(total); durs.push(d); total += d;
    }
  }
  function cr(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  function soft(t) { var e = t * t * (3 - 2 * t); return t * 0.85 + e * 0.15; } // near-constant speed, tiny ease at keys
  function sample(phase) {
    var s = phase * total, k = N - 1;
    for (var j = 0; j < N; j++) if (s < starts[j] + durs[j]) { k = j; break; }
    var t = soft((s - starts[k]) / durs[k]);
    var a = K[(k - 1 + N) % N], b = K[k], c = K[(k + 1) % N], d = K[(k + 2) % N];
    return { u: cr(a.u, b.u, c.u, d.u, t), v: cr(a.v, b.v, c.v, d.v, t), z: cr(a.z, b.z, c.z, d.z, t) };
  }

  // ---------- camera loop ----------
  var t0 = null, running = false, raf = 0, videoOn = false, stopped = false;
  var frozen = (location.search.match(/[?&]t=([\d.]+)/) || [])[1]; // proof hook: ?t=12 freezes the camera
  function frame(now) {
    if (!running) return;
    if (t0 === null) t0 = now;
    var sec = frozen !== undefined ? parseFloat(frozen) : (now - t0) / 1000;
    var p = sample((sec % LOOP) / LOOP);
    place(p.u, p.v, p.z);
    raf = requestAnimationFrame(frame);
  }
  function startCamera() { if (running) return; running = true; t0 = null; raf = requestAnimationFrame(frame); }
  function stopCamera() { running = false; cancelAnimationFrame(raf); }
  window.__camera = { stop: function () { stopCamera(); stopped = true; }, LOOP: LOOP, keyTimes: function () { return starts.map(function (s) { return +(s / total * LOOP).toFixed(2); }); } };

  function placeStill() { place(STILL.u, STILL.v, STILL.z); }
  layout();
  if (still) placeStill(); else { var p0 = sample(0); place(p0.u, p0.v, p0.z); }
  window.addEventListener('resize', function () { layout(); if (!running) placeStill(); }, { passive: true });
  document.addEventListener('visibilitychange', function () {
    if (still || videoOn || stopped) return;
    if (document.hidden) stopCamera(); else startCamera();
  });

  function onLoaded() { stage.classList.add('loaded'); }
  if (img.complete && img.naturalWidth) onLoaded(); else img.addEventListener('load', onLoaded);
  if (!still) startCamera();

  // 3D drone fly-through (WebGL). Not loaded for reduced motion / data saver, or when a VIDEO is set.
  if (!still && !VIDEO && !/[?&]flat\b/.test(location.search)) {
    var s = document.createElement('script'); s.src = '/drone.js'; s.async = true; document.body.appendChild(s);
  }

  // ---------- optional video (drop-in replacement for the code camera) ----------
  if (VIDEO && !still) {
    var v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.preload = 'auto'; v.poster = img.currentSrc || img.src; v.src = VIDEO;
    v.addEventListener('playing', function () {
      videoOn = true; stopCamera(); placeStill(); place(0.5, 0.5, 1); v.classList.add('playing');
    }, { once: true });
    stage.appendChild(v);
  }

  // ---------- scrambled title ----------
  var TEXT = words.textContent.trim();
  var GLYPHS = 'abcdefghijklmnopqrstuvwxyz#%&*+=/<>?!';
  words.textContent = '';
  var cells = [], wordEl = null;
  for (var c = 0; c < TEXT.length; c++) {
    var ch = TEXT[c];
    if (ch === ' ') {
      // keep "a foundation" / "for tomorrow" as two lines on every screen
      if (TEXT.slice(c + 1, c + 5) === 'for ') words.appendChild(document.createElement('br'));
      else words.appendChild(document.createTextNode(' '));
      wordEl = null; continue;
    }
    if (!wordEl) { wordEl = document.createElement('span'); wordEl.className = 'w'; wordEl.setAttribute('aria-hidden', 'true'); words.appendChild(wordEl); }
    var sp = document.createElement('span'); sp.className = still ? 'c' : 'c s'; sp.textContent = ch; sp.setAttribute('data-g', '');
    wordEl.appendChild(sp); cells.push(sp);
  }
  words.classList.add('ready');
  if (still) { words.dataset.done = '1'; line.classList.add('shown'); return; }

  var START = 450, STAGGER = 55, SPIN = 520, TICK = 55;
  var tStart = performance.now(), last = 0;
  function scramble(now) {
    if (now - last >= TICK) {
      last = now;
      var el = now - tStart, done = 0;
      for (var i = 0; i < cells.length; i++) {
        var appear = START + i * STAGGER, lock = appear + SPIN, cell = cells[i];
        if (el >= lock) { if (cell.classList.contains('s')) cell.classList.remove('s'); done++; }
        else if (el >= appear) cell.setAttribute('data-g', GLYPHS[(Math.random() * GLYPHS.length) | 0]);
      }
      if (done === cells.length) { words.dataset.done = '1'; setTimeout(function () { line.classList.add('shown'); }, 250); return; }
    }
    requestAnimationFrame(scramble);
  }
  requestAnimationFrame(scramble);
})();
