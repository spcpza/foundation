/* A foundation for tomorrow — a living painting.
   Michelangelo's figures, repainted live in Van Gogh's brushwork: thousands of WebGL2 strokes, each laid
   along the forms of the fresco beneath it. Night: God making the sun and the moon (Gen 1:16),
   "the lesser light to rule the night". Scrolling repaints the canvas stroke by stroke, outward from
   the light, into day: the Creation of Adam. The evening and the morning (Gen 1:5).
   Both frescoes are grown past Michelangelo's frame in his own manner, a window at a time
   (tools/grow.py, SDXL inpainting run on this machine); each is cut wide for desktops, tall for phones.
   Frescoes: Michelangelo, Sistine Chapel ceiling, 1508-12 (public domain, via Wikimedia Commons). */

const root = document.documentElement;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;

/* ---------------- words: split, one slide per screen ---------------- */
document.querySelectorAll('.reveal-words').forEach(el => {
  const walk = node => [...node.childNodes].forEach(n => {
    if (n.nodeType === 3) {
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.append(' '); return; }
        const s = document.createElement('span'); s.className = 'w'; s.textContent = part; frag.append(s);
      });
      n.replaceWith(frag);
    } else walk(n);
  });
  walk(el);
  el.querySelectorAll('.w').forEach((w, i) => w.style.setProperty('--i', i));
});
const panels = [...document.querySelectorAll('.panel')];
function activate() {
  const mid = scrollY + innerHeight * 0.5;
  let on = 0; panels.forEach((p, i) => { if (p.offsetTop <= mid) on = i; });
  panels.forEach((p, i) => p.classList.toggle('active', i === on));
}
activate();
addEventListener('scroll', activate, { passive: true });
addEventListener('resize', activate, { passive: true });
const ready = () => requestAnimationFrame(() => root.classList.add('ready'));

/* ---------------- the painting ---------------- */
const canvas = document.getElementById('scene');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, depth: true });
const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
// each picture is one painting grown past Michelangelo's frame; wide and tall screens are cut from it around its focus
const shape = innerWidth / innerHeight >= .8 ? 'wide' : 'tall';
if (!gl) { root.classList.add('no-gl'); ready(); }
else fetch('/img/scene.json').then(r => r.json()).then(meta =>
  Promise.all(['night', 'night-flow', 'day', 'day-flow'].map(n => load(`/img/${n}.webp`)))
    .then(ims => paint(gl, ims, meta[shape])))
  .catch(() => { root.classList.add('no-gl'); ready(); });

function paint(gl, [nightImg, nightFlow, dayImg, dayFlow], meta) {
  // Each picture: its figures cut free of the plaster and placed (see place()), in a painted
  // world around it — a starry night, or a sunlit sky — so any screen shape is a whole picture.
  // Each picture is one whole painting: Michelangelo's fresco, grown past its frame in his manner.
  // It covers the screen around its focus; the brush engine repaints it stroke by stroke.
  const SCENE = /* glsl */`
  uniform float A;                       // canvas width / height (height is 1)
  uniform vec4 RN, RD;                   // where each painting lies on the canvas: x, y, w, h
  uniform vec3 MOON;                     // the moon in the night painting: u, v, radius (in widths)
  uniform vec2 LC;                       // the light: between the two hands
  uniform sampler2D TN, FN, TD, FD;      // paintings and their flow maps
  float DET = 1.;                        // brush size here (small for faces, hands and edges)
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ return .55*vn(p) + .28*vn(p*2.1+3.1) + .17*vn(p*4.3+7.7); }
  vec2 perp(vec2 d){ return vec2(-d.y, d.x); }
  float lum(vec3 c){ return dot(c, vec3(.3,.55,.15)); }
  vec3 paintAt(sampler2D T, sampler2D F, vec4 R, vec2 p, out vec2 uv, out vec2 dir, out float coh, out float det, out float plaster){
    uv = clamp(vec2((p.x - R.x)/R.z, 1. - (p.y - R.y)/R.w), .001, .999);
    vec4 f = textureLod(F, uv, 0.);
    float t = atan(f.g*2. - 1., f.r*2. - 1.)*.5;
    dir = vec2(cos(t), sin(t));
    vec2 wind = vec2(1., .25*sin(p.x*5. + p.y*7.));
    if (dot(dir, wind) < 0.) dir = -dir;
    coh = clamp(f.b*2. - 1., 0., 1.); plaster = clamp(1. - f.b*2., 0., 1.); det = f.a;
    dir = normalize(mix(wind, dir, smoothstep(.1, .5, coh)) + 1e-4);
    return textureLod(T, uv, 0.).rgb;
  }

  // ---- night: God makes the two great lights (Gen 1:16); the whole painting turned to night ----
  vec3 night(vec2 p, out vec2 dir){
    vec2 uv; float coh, det, plaster;
    vec3 c = paintAt(TN, FN, RN, p, uv, dir, coh, det, plaster);
    float l = lum(c), sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
    float warm = smoothstep(.12, .3, sat)*step(c.b, c.g)*step(c.g, c.r);
    float gold = smoothstep(.3, .5, sat)*step(c.b + .2, c.r);                 // the sun keeps its fire
    // the heavens sink to deep night blue; God and those with him stay lit by the lights he is making
    float sky = smoothstep(.15, .7, plaster);           // only the open heavens, joined to the picture's edges (never a robe's highlight)
    vec3 lit = mix(vec3(l), c, 1.25)*mix(vec3(.95,.86,.98), vec3(1.06,.95,.86), warm);
    vec3 nightc = mix(vec3(.04,.07,.24), vec3(.26,.36,.68), smoothstep(.35, 1., l))*(.85 + .3*fbm(p*vec2(4., 7.)));
    vec3 g = mix(lit, nightc, sky);
    g = mix(g, c*vec3(1.15,1.,.8), gold);
    // a few small stars in the dark heavens
    vec2 gs = floor(p*38.); vec2 cs = (gs + .2 + .6*vec2(h21(gs), h21(gs + 7.)))/38.;
    float pale = (1. - smoothstep(.08, .2, sat))*smoothstep(.5, .7, l);
    g = mix(g, vec3(1.,.95,.75), pale*step(.88, h21(gs + 3.))*smoothstep(.005, .001, length(p - cs)));
    // the moon keeps its light
    vec2 md = (uv - MOON.xy)*vec2(1., RN.w/RN.z); float ml = length(md)/MOON.z;
    g = mix(g, vec3(.94,.95,.86)*(.9 + .2*vn(p*60.)), smoothstep(1.02, .96, ml));
    g = mix(g, vec3(.70,.80,.98), exp(-pow((ml - 1.3)/.15, 2.))*.5*(1. - smoothstep(1.02, .96, ml)));
    if (ml < 1.05) dir = normalize(perp(md) + 1e-4);
    DET = mix(1., .3, smoothstep(.08, .55, det));
    if (ml < 1.4) DET = min(DET, .55);
    return g;
  }

  // ---- day: the Creation of Adam, the painting whole ----
  vec3 dawn(vec2 p, out vec2 dir){
    vec2 uv; float coh, det, plaster;
    vec3 c = paintAt(TD, FD, RD, p, uv, dir, coh, det, plaster);
    vec3 g = mix(vec3(lum(c)), c, 1.3); g = (g - .5)*1.1 + .52;           // fuller colour, firmer form
    vec2 d = p - LC; float L = length(d);
    g += vec3(.06,.05,.02)*smoothstep(.45, .0, L)*(.5 + .5*plaster);        // the light between the hands
    if (plaster > .3) dir = normalize(mix(dir, normalize(perp(d) + 1e-4), smoothstep(.5, .1, L)*.7));
    DET = mix(1., .28, smoothstep(.08, .55, det));
    return g;
  }`;

  const VS = `#version 300 es
  precision highp float;
  layout(location=0) in vec2 corner;
  layout(location=1) in vec2 base;
  layout(location=2) in vec4 rnd;
  layout(location=3) in vec2 size;
  uniform float T, MIX, BOIL;
  out vec2 vUv; out vec3 vCol; out float vSeed;
  ${SCENE}
  void main(){
    vec2 p = base * vec2(A, 1.);
    vec2 dn, dd; DET = 1.; vec3 cn = night(p, dn); float detN = DET; DET = 1.; vec3 cd = dawn(p, dd); float detD = DET;
    // repaint order: outward from the light, ragged like a hand at work
    float order = .5*rnd.x + .5*clamp(length(p - LC)/1.1, 0., 1.);
    float k = smoothstep(order - .05, order + .05, MIX*1.12 - .03);
    vec2 dir = normalize(mix(dn, dd, k) + 1e-4);
    vec3 col = mix(cn, cd, k);
    float det = mix(detN, detD, k);
    // the hand: no two strokes the same
    float a = (rnd.y - .5)*.42*det;
    dir = mat2(cos(a), sin(a), -sin(a), cos(a)) * dir;
    col *= .9 + .2*rnd.z;
    col = mix(col, col.gbr*.5 + col*.5, (rnd.w - .5)*.1);
    // the wind: the whole picture breathes along its own current
    float wave = sin(T*.7 - p.x*3.1 - p.y*2.3 + rnd.x*.8);
    vec2 drift = dir * .006 * wave * BOIL;
    float wob = .05 * sin(T*.9 + rnd.y*6.28) * BOIL;
    dir = mat2(cos(wob), sin(wob), -sin(wob), cos(wob)) * dir;
    vec2 q = p + drift*det + (dir*corner.x*size.x + perp(dir)*corner.y*size.y)*det;
    gl_Position = vec4(q.x/A*2. - 1., q.y*2. - 1., det*.9 - .45 + rnd.z*.04, 1.);   // small brushes land on top
    vUv = corner + .5; vCol = col; vSeed = rnd.w;
  }`;
  const FS = `#version 300 es
  precision mediump float;
  in vec2 vUv; in vec3 vCol; in float vSeed;
  uniform sampler2D B;
  out vec4 o;
  void main(){
    vec4 b = texture(B, vec2(vUv.x, vUv.y*.5 + step(.5, vSeed)*.5));   // two bristle loads
    if (b.a < .3) discard;
    vec3 c = vCol * (.84 + .3*b.r) + .06*smoothstep(.35, 1., b.r)*(1. - vUv.y);   // impasto ridges catch the light
    o = vec4(c, b.a);
  }`;
  const VS_BG = `#version 300 es
  layout(location=0) in vec2 q; out vec2 vp; uniform float A;
  void main(){ vp = (q*.5+.5)*vec2(A,1.); gl_Position = vec4(q,0.,1.); }`;
  const FS_BG = `#version 300 es
  precision highp float;
  in vec2 vp; uniform float MIX; out vec4 o;
  ${SCENE}
  void main(){
    vec2 d1, d2; float m = smoothstep(.15, .9, MIX);
    DET = 1.; vec3 cn = night(vp, d1); float dn = DET; DET = 1.; vec3 cd = dawn(vp, d2); float dd = DET;
    vec3 c = mix(cn, cd, m);
    float fine = 1. - smoothstep(.4, .8, mix(dn, dd, m));     // where a small brush works, the ground beneath is painted true
    float weave = .5 + .5*sin(vp.x*900.)*sin(vp.y*900.);
    o = vec4(c*mix(.66, 1., fine) + vec3(.05,.04,.03)*weave*(1. - fine), 1.);
  }`;

  function prog(vs, fs) {
    const p = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; for (const n of ['A', 'T', 'MIX', 'BOIL', 'B', 'RN', 'RD', 'MOON', 'LC', 'TN', 'FN', 'TD', 'FD']) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }
  const SP = prog(VS, FS), BG = prog(VS_BG, FS_BG);

  function texture(src, mip) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  const tex = { TN: texture(nightImg), FN: texture(nightFlow), TD: texture(dayImg), FD: texture(dayFlow) };

  /* a brush: bristle streaks in a tapered stroke, fat at the loaded head, thin at the dry tail (two loads stacked) */
  function bristles() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    let seed = 11; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let half = 0; half < 2; half++) {
      const y0 = half * 64;
      g.fillStyle = 'rgba(205,205,205,1)'; g.beginPath(); g.ellipse(118, y0 + 32, 112, 25, 0, 0, 7); g.fill();   // the paint body
      for (let i = 0; i < 34; i++) {
        const y = y0 + 6 + r() * 52, w = 1.2 + r() * 3, v = 130 + r() * 125;
        const start = r() * 26, end = 256 - r() * 70 - (Math.abs(y - y0 - 32) / 32) * 50;
        const grd = g.createLinearGradient(start, 0, end, 0);
        grd.addColorStop(0, `rgba(${v},${v},${v},0)`); grd.addColorStop(.08, `rgba(${v},${v},${v},${.75 + r() * .25})`);
        grd.addColorStop(.7, `rgba(${v},${v},${v},${.6 + r() * .3})`); grd.addColorStop(1, `rgba(${v},${v},${v},0)`);
        g.strokeStyle = grd; g.lineWidth = w; g.lineCap = 'round';
        g.beginPath(); g.moveTo(start, y); g.quadraticCurveTo(128, y + (r() - .5) * 4, end, y + (r() - .5) * 3); g.stroke();
      }
    }
    const img = g.getImageData(0, 0, 256, 128), d = img.data;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) {
      const v = ((y % 64) - 32) / 32, u = x / 256, half = .95 - .3 * u;
      const k = Math.max(0, 1 - Math.pow(Math.abs(v) / half, 6)), i = (y * 256 + x) * 4;
      d[i + 3] = d[i + 3] * k;
    }
    g.putImageData(img, 0, 0);
    return texture(c, true);
  }
  const brush = bristles();

  /* where the frescoes sit on this screen */
  // cover the screen with each painting, keeping its focus in view (meta: focus u,v; moon; hands)
  let A = 1, RN = [0, 0, 1, 1], RD = [0, 0, 1, 1], LC = [.5, .5], MOON = meta.moon;
  function cover(img, focus) {
    const ia = img.width / img.height;
    let w, h; if (A > ia) { w = A; h = A / ia; } else { h = 1; w = ia; }
    const x = Math.min(0, Math.max(A - w, A / 2 - focus[0] * w));
    const y = Math.min(0, Math.max(1 - h, .58 - (1 - focus[1]) * h));
    return [x, y, w, h];
  }
  function place() {
    RN = cover(nightImg, meta.nightFocus);
    RD = cover(dayImg, meta.dayFocus);
    LC = [RD[0] + meta.hands[0] * RD[2], RD[1] + (1 - meta.hands[1]) * RD[3]];
  }

  /* strokes: three passes, broad underpainting → body → fine top marks */
  let vao, count = 0;
  function lay() {
    A = canvas.clientWidth / canvas.clientHeight; place();
    // a narrow screen shows the figures smaller, so it gets a smaller brush (and more strokes to cover)
    const narrow = A < .8, sm = narrow ? .6 : 1;
    const passes = [[1300, .07 * sm, .024 * sm], [6000, .04 * sm, .014 * sm], [7000, .022 * sm, .0085 * sm]];
    const k = A * (narrow ? 1.9 : 1);
    const data = [];
    let seed = 1; const r = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    for (const [n, len, wid] of passes) {
      const N = Math.round(n * k), cols = Math.ceil(Math.sqrt(N * A)), rows = Math.ceil(N / cols);
      for (let i = 0; i < N; i++) {
        const x = (i % cols + r()) / cols, y = (Math.floor(i / cols) + r()) / rows;
        const f = .75 + r() * .5;
        data.push(x * 1.04 - .02, y * 1.04 - .02, r(), r(), r(), r(), len * f, wid * f);
      }
    }
    count = data.length / 8;
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5, -.5, .5, -.5, -.5, .5, .5, .5]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const inst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    for (const [loc, n, off] of [[1, 2, 0], [2, 4, 2], [3, 2, 6]]) {
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 32, off * 4); gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
  }
  const bgVao = gl.createVertexArray(); gl.bindVertexArray(bgVao);
  const bgBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);

  function resize() {
    const dpr = Math.min(devicePixelRatio, phone ? 1.6 : 2);
    canvas.width = Math.round(canvas.clientWidth * dpr); canvas.height = Math.round(canvas.clientHeight * dpr);
    const a = canvas.clientWidth / canvas.clientHeight;
    if (!vao || Math.abs(a - A) / A > .12) lay();   // re-lay only if the shape really changed (not for a URL bar)
  }
  function bind(P) {
    gl.uniform1f(P.u.A, A); gl.uniform4fv(P.u.RN, RN); gl.uniform4fv(P.u.RD, RD); gl.uniform3fv(P.u.MOON, MOON); gl.uniform2fv(P.u.LC, LC);
    ['TN', 'FN', 'TD', 'FD'].forEach((n, i) => { gl.activeTexture(gl.TEXTURE1 + i); gl.bindTexture(gl.TEXTURE_2D, tex[n]); gl.uniform1i(P.u[n], 1 + i); });
  }

  const pin = (location.search.match(/[?&]p=([\d.]+)/) || [])[1];   // test hook: ?p=0.9 holds the scroll at 90%
  let cur = 0, forced = pin ? +pin : null, last = performance.now(), running = true;
  const target = () => { const m = document.documentElement.scrollHeight - innerHeight; return m > 0 ? Math.min(1, Math.max(0, scrollY / m)) : 0; };
  const smooth = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
  function frame(now, once) {
    if (!running) return;
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    const goal = forced ?? target();
    cur = still || forced !== null ? goal : cur + (goal - cur) * (1 - Math.exp(-dt * 3.2));
    const mix = smooth(.16, .78, cur);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    gl.useProgram(BG.p); bind(BG); gl.uniform1f(BG.u.MIX, mix);
    gl.bindVertexArray(bgVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(SP.p); bind(SP);
    gl.uniform1f(SP.u.T, still ? 0 : now / 1000); gl.uniform1f(SP.u.MIX, mix); gl.uniform1f(SP.u.BOIL, still ? 0 : 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, brush); gl.uniform1i(SP.u.B, 0);
    gl.bindVertexArray(vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    if (!once) requestAnimationFrame(frame);
  }
  resize();
  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { last = performance.now(); requestAnimationFrame(frame); } });
  cur = target();
  requestAnimationFrame(t => { frame(t); ready(); });
  window.__scene = { renderAt: p => { forced = p; frame(performance.now(), true); } };
}
