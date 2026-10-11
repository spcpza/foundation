/* A foundation for tomorrow — a living painting.
   Michelangelo's figures, repainted live in Van Gogh's brushwork: thousands of WebGL2 strokes, each laid
   along the forms of the fresco beneath it. Night: God making the sun and the moon (Gen 1:16),
   "the lesser light to rule the night". Scrolling repaints the canvas stroke by stroke, outward from
   the light, into day: the Creation of Adam. The evening and the morning (Gen 1:5).
   The plaster is lifted away, so the figures stand in a whole painted world: the sun and moon made
   whole, Adam's hill carried on past the fresco's edge; on tall screens the Creation is turned so
   the two hands meet on the diagonal.
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
if (!gl) { root.classList.add('no-gl'); ready(); }
else Promise.all(['/img/night.webp', '/img/night-flow.webp', '/img/day.webp', '/img/day-flow.webp'].map(load))
  .then(ims => paint(gl, ims))
  .catch(() => { root.classList.add('no-gl'); ready(); });

function paint(gl, [nightImg, nightFlow, dayImg, dayFlow]) {
  // Each picture: its figures cut free of the plaster and placed (see place()), in a painted
  // world around it — a starry night, or a sunlit sky — so any screen shape is a whole picture.
  const SCENE = /* glsl */`
  uniform float A;                       // canvas width / height (height is 1)
  // where each figure layer sits: (anchor x, anchor y on the canvas, rotation, fresco width on the canvas)
  uniform vec4 NT, DG, DM;               // night; day God; day man (Adam)
  uniform vec2 LC;                       // the light: between the two hands
  uniform sampler2D TN, FN, TD, FD;      // frescoes and their flow maps
  const vec2 NANCH = vec2(.5, .5), HANDS = vec2(.385, .47);
  const float NASP = 955./717., DASP = 2400./1089.;
  float DET = 1.;                        // brush size here (small for faces, hands and edges)
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ return .55*vn(p) + .28*vn(p*2.1+3.1) + .17*vn(p*4.3+7.7); }
  vec2 perp(vec2 d){ return vec2(-d.y, d.x); }
  vec2 rot(vec2 v, float a){ return vec2(cos(a)*v.x - sin(a)*v.y, sin(a)*v.x + cos(a)*v.y); }
  float lum(vec3 c){ return dot(c, vec3(.3,.55,.15)); }

  // canvas point -> fresco uv (0..1, top-left origin) for a placed layer
  vec2 toUV(vec2 p, vec4 L, vec2 anchor, float asp){
    vec2 f = rot(p - L.xy, -L.z) / L.w;
    return vec2(anchor.x + f.x, anchor.y - f.y*asp);
  }
  // read a fresco at uv: colour, stroke direction (turned with the layer), coherence, detail, plaster
  vec3 fresco(sampler2D T, sampler2D F, vec2 uv, float turn, vec2 hint, out vec2 dir, out float coh, out float det, out float plaster){
    vec2 t2 = clamp(uv, .001, .999);
    vec4 f = textureLod(F, t2, 0.);
    float t = atan(f.g*2. - 1., f.r*2. - 1.)*.5;
    dir = rot(vec2(cos(t), sin(t)), turn); if (dot(dir, hint) < 0.) dir = -dir;
    coh = clamp(f.b*2. - 1., 0., 1.); plaster = clamp(1. - f.b*2., 0., 1.); det = f.a;
    return textureLod(T, t2, 0.).rgb;
  }
  float inBox(vec2 uv){ return step(0., uv.x)*step(uv.x, 1.)*step(0., uv.y)*step(uv.y, 1.); }

  // ---- night: God makes the two great lights (Gen 1:16) ----
  vec3 nightsky(vec2 p, out vec2 dir){
    float n = fbm(p*vec2(5., 9.));
    vec3 col = mix(vec3(.04,.07,.24), vec3(.16,.27,.58), clamp(p.y*.85 + .3*n - .15, 0., 1.));
    dir = vec2(1., .2*sin(p.x*5. + 1.) + .25*(n - .5));
    float line = .86 + .04*sin(p.x*4.6 + .8), band = exp(-pow((p.y-line)/.05, 2.));
    col = mix(col, vec3(.40,.55,.84), band*.6*(.6+.6*n));
    dir += vec2(0., .4*cos(p.x*4.6 + .8))*band;
    // small stars, scattered like dust
    vec2 g = floor(p*vec2(38., 38.)); vec2 c = (g + .2 + .6*vec2(h21(g), h21(g+7.)))/38.;
    float st = step(.86, h21(g + 3.)) * smoothstep(.006, .001, length(p - c));
    col = mix(col, vec3(1.,.95,.75), st);
    // the earth below, dark hills under the heavens
    float hz = .2 + .025*sin(p.x*7. + 1.) + .012*sin(p.x*19.);
    if (p.y < hz) { col = mix(vec3(.03,.06,.11), vec3(.10,.15,.22), n*(p.y/hz)); dir = vec2(1., .25*sin(p.x*9. + p.y*30.)); }
    return col;
  }
  vec3 night(vec2 p, out vec2 dir){
    vec2 bd; vec3 bg = nightsky(p, bd);
    vec2 uv = toUV(p, NT, NANCH, NASP);
    vec2 fd; float coh, det, plaster;
    vec3 c = fresco(TN, FN, uv, NT.z, bd, fd, coh, det, plaster);
    float on = inBox(uv)*(1. - plaster);
    on *= smoothstep(0., .015, min(min(uv.x, 1. - uv.x), min(uv.y, 1. - uv.y)));
    float l = lum(c), sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
    float warm = smoothstep(.12, .3, sat)*step(c.b, c.g)*step(c.g, c.r);
    vec3 g = mix(vec3(l), c, 1.35);
    g = mix(vec3(.05,.07,.22), g*mix(vec3(.88,.76,.94), vec3(1.05,.92,.84), warm), smoothstep(.04, .5, l));
    vec3 col = mix(bg, g, on);
    dir = normalize(mix(bd, fd, on*smoothstep(.15, .6, coh)) + 1e-4);
    DET = mix(DET, mix(1., .3, smoothstep(.08, .55, det)), on);
    // the two great lights, made whole: the sun burning in rings, the moon in its pale fire
    vec2 fl = vec2((uv.x - .039), (uv.y - .0)/NASP);   // in fresco widths, y down
    float sl = length(fl), sr = .215;
    if (sl < sr*1.5) {
      float ring = .5 + .5*sin(sl*260.);
      vec3 sunc = mix(vec3(1.,.62,.12), vec3(1.,.86,.36), ring*.6 + .4*smoothstep(sr, 0., sl));
      float disc = smoothstep(sr, sr*.97, sl);
      col = mix(col, vec3(1.,.82,.4), exp(-pow((sl - sr*1.18)/(sr*.12), 2.))*.55);
      col = mix(col, sunc, disc);
      if (disc > .5) dir = normalize(perp(rot(vec2(fl.x, -fl.y), NT.z)) + 1e-4);
      DET = min(DET, .7);
    }
    vec2 ml = vec2(uv.x - .921, (uv.y - .318)/NASP); float mr = .125, md = length(ml);
    if (md < mr*1.9) {
      col = mix(col, vec3(.70,.80,.98), exp(-pow((md - mr*1.35)/(mr*.18), 2.))*.6);
      col = mix(col, mix(vec3(.96,.95,.84), vec3(.84,.86,.82), vn(p*vec2(60.,60.))), smoothstep(mr, mr*.94, md));
      if (md < mr) dir = normalize(perp(rot(vec2(ml.x, -ml.y), NT.z)) + 1e-4);
      DET = min(DET, .6);
    }
    return col;
  }

  // ---- day: the Creation of Adam, under an open sky ----
  vec3 sky(vec2 p, out vec2 dir){
    vec2 d = p - LC; float L = length(d), n = fbm(p*vec2(6., 9.));
    vec3 col = mix(vec3(1.,.94,.70), vec3(.48,.68,.90), smoothstep(.06, .85, L));
    col += .05*sin(L*90. - n*2.)*vec3(1.,.9,.6)*smoothstep(.7, .1, L);
    dir = normalize(mix(normalize(perp(d) + 1e-4), vec2(1., .4*sin(p.x*7. + p.y*11.) + .3*(n - .5)), smoothstep(.25, .7, L)));
    return col;
  }
  // Adam's hill, carried on past the edge of the fresco so he rests on real ground
  float hillTop(float u){ return u < .55 ? .36 + .14*clamp(u, 0., 1.) + 2.6*max(0., u - .36)*max(0., u - .36) : .53 + (u - .55)*1.6; }
  float earth(vec2 uv){
    bool beyond = uv.y > 1. || uv.x < 0.;
    bool corner = uv.x < .175 && uv.y > .895;                 // a fragment of another figure at the fresco's edge
    return ((beyond || corner) && uv.y > hillTop(uv.x)) ? 1. : 0.;
  }
  vec3 earthPaint(vec2 uv, vec2 p, out vec2 d){
    float top = hillTop(uv.x), depth = clamp((uv.y - top)/.6, 0., 1.);
    float n = fbm(vec2(uv.x*9., uv.y*22.)), m = fbm(vec2(uv.x*30., uv.y*60.) + 4.);
    vec3 c = mix(vec3(.26,.32,.16), vec3(.45,.37,.22), n);
    c = mix(c, vec3(.36,.50,.24), smoothstep(.12, .0, uv.y - top)*.7);          // grass along the crest
    c = mix(c, vec3(.55,.48,.30), step(.82, m)*.5);                              // a few lit stones
    c *= 1. - .45*depth;
    float slope = uv.x < .55 ? .14 + 5.2*max(0., uv.x - .36) : 1.6;
    d = vec2(1., -slope*.5 + .2*(n - .5));
    return c;
  }

  vec3 dawn(vec2 p, out vec2 dir){
    vec2 bd; vec3 col = sky(p, bd); dir = bd;
    float dt = 1.;
    // the man: Adam and the hill he lies on
    vec2 um = toUV(p, DM, HANDS, DASP);
    if (um.x < HANDS.x + .004 || um.y > 1.) {
      vec2 fd; float coh, det, plaster;
      vec3 c = fresco(TD, FD, um, DM.z, bd, fd, coh, det, plaster);
      float on = inBox(um)*(1. - plaster);
      if (earth(um) > 0.) {   // beyond the fresco: the earth he lies on, painted on
        vec2 ed; c = earthPaint(um, p, ed);
        fd = normalize(rot(ed, DM.z)); coh = 1.; det = .1; on = 1.;
      }
      vec3 g = mix(vec3(lum(c)), c, 1.35); g = (g - .5)*1.12 + .52;
      col = mix(col, g, on);
      dir = normalize(mix(dir, fd, on*smoothstep(.15, .6, coh)) + 1e-4);
      dt = mix(dt, mix(1., .28, smoothstep(.08, .55, det)), on);
    }
    // God, with the angels in his cloak
    vec2 ug = toUV(p, DG, HANDS, DASP);
    if (ug.x > HANDS.x - .004) {
      vec2 fd; float coh, det, plaster;
      vec3 c = fresco(TD, FD, ug, DG.z, bd, fd, coh, det, plaster);
      float on = inBox(ug)*(1. - plaster)*smoothstep(0., .01, min(1. - ug.x, min(ug.y, 1. - ug.y)));
      vec3 g = mix(vec3(lum(c)), c, 1.35); g = (g - .5)*1.12 + .52;
      col = mix(col, g, on);
      dir = normalize(mix(dir, fd, on*smoothstep(.15, .6, coh)) + 1e-4);
      dt = mix(dt, mix(1., .28, smoothstep(.08, .55, det)), on);
    }
    DET = dt;
    return col;
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
    const u = {}; for (const n of ['A', 'T', 'MIX', 'BOIL', 'B', 'NT', 'DG', 'DM', 'LC', 'TN', 'FN', 'TD', 'FD']) u[n] = gl.getUniformLocation(p, n);
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
  // where the figures stand on this screen: [anchor x, anchor y, rotation, fresco width]
  let A = 1, NT = [.5, .5, 0, 1], DG = [.5, .5, 0, 1], DM = [.5, .5, 0, 1], LC = [.5, .5];
  const NA = nightImg.width / nightImg.height, DA = dayImg.width / dayImg.height;
  function place() {
    if (A >= .8) {
      // wide: each fresco whole, the hands near the middle
      const nw = Math.min(A * .9, .78 * NA);
      NT = [A / 2, .58, 0, nw];
      const dw = Math.min(A * .96, .8 * DA);
      DG = DM = [A / 2 - (.5 - .385) * dw * .6, .6, 0, dw];
    } else {
      // tall: God, the sun and the moon fill the width; then Adam below-left and God above-right,
      // turned so the two hands meet on the diagonal in the middle of the screen
      NT = [A * .45, .62, 0, A * 1.18];      // God between the two lights, both in view
      const dw = A * 1.62;
      DM = [A * .45, .58, 0.85, dw];
      DG = [A * .45 + .006, .58 + .006, 0.85, dw];
    }
    LC = [DM[0], DM[1]];
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
    gl.uniform1f(P.u.A, A); gl.uniform4fv(P.u.NT, NT); gl.uniform4fv(P.u.DG, DG); gl.uniform4fv(P.u.DM, DM); gl.uniform2fv(P.u.LC, LC);
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
