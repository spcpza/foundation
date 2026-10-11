/* solichin.org — a living painting.
   Thousands of brushstrokes, painted live in WebGL2, each one laid along the current of the picture
   the way Van Gogh laid his. It opens on a starry night; scrolling repaints the canvas stroke by stroke
   into the Sower's dawn — a great sun over the furrows. A foundation for tomorrow.
   No images: everything is generated, so it is sharp at any size. */

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
document.getElementById('year').textContent = new Date().getFullYear();
const ready = () => requestAnimationFrame(() => root.classList.add('ready'));

/* ---------------- the painting ---------------- */
const canvas = document.getElementById('scene');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
if (!gl) { root.classList.add('no-gl'); ready(); }
else paint(gl);

function paint(gl) {
  // Both pictures are one function of position: colour + the direction a brush would travel there.
  const SCENE = /* glsl */`
  uniform float A;            // canvas width / height (height is 1)
  float DET = 1.;             // brush size here: the painter switches to a small brush for figures and lights
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ return .55*vn(p) + .28*vn(p*2.1+3.1) + .17*vn(p*4.3+7.7); }
  vec2 perp(vec2 d){ return vec2(-d.y, d.x); }
  float seg(vec2 p, vec2 a, vec2 b, float r){ vec2 pa = p-a, ba = b-a; float h = clamp(dot(pa,ba)/dot(ba,ba), 0., 1.); return length(pa - ba*h) - r; }
  // where things sit: the composition lives in a centred square on wide screens
  float W(){ return min(A, 1.0); }
  float X(float f){ return A*.5 + (f-.5)*W(); }

  // ---- I. the starry night ----
  vec3 night(vec2 p, out vec2 dir){
    float hz = .29 + .035*sin(p.x/W()*6.+.5) + .018*sin(p.x/W()*15.);
    float n = fbm(p*vec2(5., 9.));
    vec3 col; dir = vec2(1., .18*sin(p.x/W()*5.+1.));
    if (p.y > hz) {
      col = mix(vec3(.07,.13,.38), vec3(.20,.34,.66), clamp((p.y-hz)*.9 + .35*n, 0., 1.));
      // the great swirl
      float line = .6 + .07*sin(p.x/W()*4.6 + .8);
      float band = exp(-pow((p.y-line)/.075, 2.));
      col = mix(col, vec3(.48,.64,.86), band*.75*(.6+.6*n));
      dir += vec2(0., .5*cos(p.x/W()*4.6+.8)) * band;
      vec2 V[2]; V[0] = vec2(X(.42), .6); V[1] = vec2(X(.66), .64);
      float R[2]; R[0] = .13; R[1] = .085;
      for (int i = 0; i < 2; i++) { vec2 d = p - V[i]; float L = length(d);
        float w = exp(-L*L/(R[i]*R[i]*1.6)); dir += 5.*w*normalize(perp(d)+1e-4);
        float ring = exp(-pow((L - R[i]*.62)/(R[i]*.22), 2.)); col = mix(col, vec3(.62,.76,.93), ring*.75);
        col = mix(col, vec3(.16,.27,.58), exp(-L*L/(R[i]*R[i]*.08))*.8); }
      // stars, each with a halo the strokes circle
      vec3 S[7]; S[0]=vec3(.12,.88,.028); S[1]=vec3(.30,.74,.022); S[2]=vec3(.52,.86,.03); S[3]=vec3(.88,.62,.026);
      S[4]=vec3(.20,.56,.02); S[5]=vec3(.72,.82,.024); S[6]=vec3(.95,.92,.02);
      for (int i = 0; i < 7; i++) { vec2 c = vec2(X(S[i].x), S[i].y); float r = S[i].z; vec2 d = p - c; float L = length(d);
        dir += 6.*exp(-L*L/(r*r*7.))*normalize(perp(d)+1e-4);
        col = mix(col, vec3(.93,.93,.72), exp(-pow((L-r*1.9)/(r*.55), 2.))*.85);
        col = mix(col, vec3(1.,.86,.32), smoothstep(r, r*.35, L)); if (L < r*2.6) DET = min(DET, .7); }
      // the moon: a crescent in its own fire
      vec2 mc = vec2(X(.84), .87); float mr = .055; vec2 md = p - mc; float ml = length(md);
      dir += 7.*exp(-ml*ml/(mr*mr*6.))*normalize(perp(md)+1e-4);
      col = mix(col, vec3(1.,.82,.36), exp(-pow((ml-mr*1.7)/(mr*.5), 2.))*.8);
      float cres = smoothstep(mr, mr*.85, ml) * smoothstep(mr*.7, mr*.9, length(p - mc - vec2(-mr*.45, mr*.25)));
      col = mix(col, vec3(1.,.74,.18), cres); if (ml < mr*2.2) DET = min(DET, .65);
    } else {
      // hills and a sleeping village
      col = mix(vec3(.05,.11,.17), vec3(.17,.27,.30), n*.8 + (p.y/hz)*.3);
      dir = vec2(1., .35*sin(p.x/W()*9. + p.y*24.));
          }
    // the cypress, a dark flame from the ground to the stars
    float cx = X(.13) + .02*sin(p.y*11.) + .008*sin(p.y*37.);
    float top = .93, wid = .105*W()*pow(max(0., 1. - p.y/top), .55)*(.78 + .22*sin(p.y*46.)) + .012*sin(p.y*23.+p.x*9.);
    if (abs(p.x - cx) < wid) {
      float e = abs(p.x - cx)/max(wid, 1e-4);
      col = mix(vec3(.05,.12,.08), vec3(.20,.33,.17), vn(p*vec2(30.,60.))*(1.-e*.5));
      col = mix(col, vec3(.35,.42,.18), step(.86, vn(p*vec2(40.,90.)))*.6);
      dir = vec2(.32*sin(p.y*34. + p.x*60.), 1.); DET = .7;
    }
    return col;
  }

  // ---- II. the sower's dawn ----
  vec3 dawn(vec2 p, out vec2 dir){
    float hz = .42;
    vec2 sc = vec2(A*.5, .655); float R = .115*max(.8, W()); vec2 d = p - sc; float L = length(d);
    float n = fbm(p*vec2(6., 9.));
    vec3 col;
    if (p.y > hz + .055) {
      col = mix(vec3(.93,.84,.38), vec3(.60,.70,.42), smoothstep(R, .75, L));
      col += .07*sin(L*95. - n*2.) * vec3(1.,.9,.5);
      col = mix(col, vec3(.98,.95,.62), exp(-pow((L-R*1.25)/(R*.18), 2.))*.6);
      col = mix(col, mix(vec3(1.,.97,.62), vec3(1.,.80,.20), smoothstep(0., R, L)), smoothstep(R, R*.97, L));
      dir = normalize(perp(d) + 1e-4);
      dir = normalize(mix(dir, normalize(d+1e-4), smoothstep(R*1.6, R*1.05, L)*.85));   // rays at the rim
      vec2 loose = vec2(1., .45*sin(p.x*7. + p.y*11.) + .3*(n-.5));
      dir = normalize(mix(dir, loose, smoothstep(R*2.6, R*4.4, L)));                      // far sky: weather, not rings
      col = mix(col, col + vec3(-.06,.04,.08)*(n-.4), smoothstep(R*2.6, R*4.4, L));
    } else if (p.y > hz - .02) {
      // a band of ripe wheat at the horizon
      col = mix(vec3(.80,.55,.10), vec3(.98,.82,.32), n);
      dir = vec2(.25*sin(p.x*60.), 1.);
    } else {
      // furrows running to the sun, violet and orange
      vec2 vp = vec2(A*.5, hz);
      dir = normalize(p - vp + vec2(0., -1e-3));
      float ang = atan(p.x - vp.x, vp.y - p.y + .02);
      float s = fract(ang*12. + n*.4);
      col = s < .34 ? mix(vec3(.88,.42,.14), vec3(.98,.62,.22), n) : mix(vec3(.20,.21,.52), vec3(.40,.36,.74), n);
      col *= .82 + .3*smoothstep(0., hz, p.y);
    }
    // the sower: striding across the furrows, flinging seed toward the sun
    vec2 o = vec2(X(.3), .2); float S = .36;                      // feet at o, height S
    vec2 q = (p - o)/S;
    float body = 1e3;
    body = min(body, seg(q, vec2(.02,.62), vec2(.06,.30), .085));    // torso, leaning into the stride
    body = min(body, seg(q, vec2(.06,.32), vec2(-.17,.02), .055));   // back leg
    body = min(body, seg(q, vec2(.06,.32), vec2(.25,.03), .055));    // front leg, striding
    body = min(body, seg(q, vec2(.02,.58), vec2(-.22,.40), .04));    // throwing arm, swept back
    body = min(body, seg(q, vec2(.04,.56), vec2(.17,.44), .045));    // arm holding the seed bag
    body = min(body, length((q - vec2(.15,.40))*vec2(1.,1.3)) - .075);   // the bag
    body = min(body, length(q - vec2(.0,.74)) - .065);               // head
    body = min(body, length((q - vec2(.0,.785))*vec2(.6,3.4)) - .08);   // hat brim
    if (body < 0.) {
      col = mix(vec3(.06,.07,.20), vec3(.15,.15,.36), n*.7);
      col = mix(col, vec3(.95,.62,.25), smoothstep(-.03, 0., body)*.55);   // the sun catching his edge
      dir = q.y > .76 ? vec2(1., .05) : vec2(.15, 1.); DET = q.y > .76 ? .3 : .38;   // the hat brim is laid flat
    }
    if (body < .05 && body >= 0.) DET = min(DET, .55);              // and a careful edge around him
    // seed flung from his hand, small gold strokes in an arc
    vec2 sd = q - vec2(-.42, .30); float arc = abs(length(sd*vec2(1.,1.6)) - .2);
    if (arc < .025 && q.x < -.2 && q.y > .2 && h21(floor(p*vec2(260.,260.))) > .55) { col = vec3(1.,.82,.32); dir = normalize(perp(sd)); }
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
    // repaint order: outward from the sun, ragged like a hand at work
    float order = .5*rnd.x + .5*clamp(length(p - vec2(A*.5, .655))/1.1, 0., 1.);
    float k = smoothstep(order - .05, order + .05, MIX*1.12 - .03);
    vec2 dir = normalize(mix(normalize(dn+1e-4), normalize(dd+1e-4), k) + 1e-4);
    vec3 col = mix(cn, cd, k);
    float det = mix(detN, detD, k);
    // the hand: no two strokes the same
    float a = (rnd.y - .5)*.42;
    dir = mat2(cos(a), sin(a), -sin(a), cos(a)) * dir;
    col *= .88 + .24*rnd.z;
    col = mix(col, col.gbr*.5 + col*.5, (rnd.w - .5)*.12);
    // the wind: the whole picture breathes along its own current (coherent, travelling across)
    float wave = sin(T*.7 - p.x*3.1 - p.y*2.3 + rnd.x*.8);
    vec2 drift = dir * .0065 * wave * BOIL;
    float wob = .06 * sin(T*.9 + rnd.y*6.28) * BOIL;
    dir = mat2(cos(wob), sin(wob), -sin(wob), cos(wob)) * dir;
    vec2 q = p + drift*det + (dir*corner.x*size.x + perp(dir)*corner.y*size.y)*det;
    gl_Position = vec4(q.x/A*2. - 1., q.y*2. - 1., 0., 1.);
    vUv = corner + .5; vCol = col; vSeed = rnd.w;
  }`;
  const FS = `#version 300 es
  precision mediump float;
  in vec2 vUv; in vec3 vCol; in float vSeed;
  uniform sampler2D B;
  out vec4 o;
  void main(){
    vec4 b = texture(B, vec2(vUv.x, vUv.y*.5 + step(.5, vSeed)*.5));   // two bristle loads
    float a = b.a;
    if (a < .02) discard;
    // impasto: bristle ridges catch the light on one side
    vec3 c = vCol * (.82 + .32*b.r) + .07*smoothstep(.35, 1., b.r)*(1. - vUv.y);
    o = vec4(c, a);
  }`;
  const VS_BG = `#version 300 es
  layout(location=0) in vec2 q; out vec2 vp; uniform float A;
  void main(){ vp = (q*.5+.5)*vec2(A,1.); gl_Position = vec4(q,0.,1.); }`;
  const FS_BG = `#version 300 es
  precision highp float;
  in vec2 vp; uniform float MIX; out vec4 o;
  ${SCENE}
  void main(){
    vec2 d1, d2; vec3 c = mix(night(vp, d1), dawn(vp, d2), smoothstep(.15, .9, MIX));
    float weave = .5 + .5*sin(vp.x*900.)*sin(vp.y*900.);                 // the canvas showing through
    o = vec4(c*.62 + vec3(.05,.04,.03)*weave, 1.);
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
    const u = {}; for (const n of ['A', 'T', 'MIX', 'BOIL', 'B']) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }
  const SP = prog(VS, FS), BG = prog(VS_BG, FS_BG);

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
        const start = r() * 26, end = 256 - r() * 70 - (Math.abs(y - y0 - 32) / 32) * 50;   // shorter at the edges
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
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  const brush = bristles();

  /* strokes: three passes, broad underpainting → body → fine top marks */
  let vao, count = 0, A = 1;
  function lay() {
    A = canvas.clientWidth / canvas.clientHeight;
    const passes = [[1300, .08, .028], [5600, .046, .016], [5200, .026, .0095]];
    const k = A * (phone ? .9 : 1);
    const data = [];
    let seed = 1; const r = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    for (const [n, len, wid] of passes) {
      const N = Math.round(n * k), cols = Math.ceil(Math.sqrt(N * A)), rows = Math.ceil(N / cols);
      for (let i = 0; i < N; i++) {
        // jittered grid so the canvas is evenly covered
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

  let cur = 0, forced = null, last = performance.now(), running = true;
  const target = () => { const m = document.documentElement.scrollHeight - innerHeight; return m > 0 ? Math.min(1, Math.max(0, scrollY / m)) : 0; };
  const smooth = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
  function frame(now, once) {
    if (!running) return;
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    const goal = forced ?? target();
    cur = still || forced !== null ? goal : cur + (goal - cur) * (1 - Math.exp(-dt * 3.2));
    const mix = smooth(.16, .78, cur);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(BG.p); gl.uniform1f(BG.u.A, A); gl.uniform1f(BG.u.MIX, mix);
    gl.bindVertexArray(bgVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(SP.p);
    gl.uniform1f(SP.u.A, A); gl.uniform1f(SP.u.T, still ? 0 : now / 1000); gl.uniform1f(SP.u.MIX, mix); gl.uniform1f(SP.u.BOIL, still ? 0 : 1);
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
