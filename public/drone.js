/* solichin.org: 2.5D FPV drone fly-through.
   The painting becomes a relief: a dense mesh displaced by a depth map (Depth Anything V2),
   with an inpainted far layer behind it so gaps at depth edges show background, not smears.
   Camera flies Fred's FPV path (wide → God OTS → through the light → Adam OTS → low → cherubs → wide).
   Additive fingertip glow + cheap 5-tap DOF. Plain WebGL 1, no libraries.
   If anything fails, the 2D pan in app.js keeps running. */
(function () {
  'use strict';
  var cam2d = window.__camera; if (!cam2d) return;
  var ASSET = '/img/';
  var DZ = 0.30;               // relief depth (painting is 2 units tall)
  var LOOP = 32;               // seconds per loop (matches reference/fpv-preview)
  var FOV = 48 * Math.PI / 180; // FPV-wide but still fills the painting on the wide hover
  var EDGE = 0.05;             // depth mismatch (0..1) at which the relief is torn open
  var MARGIN = 0.08;           // small skirt past the frame; keep wide keys close enough to hide it
  var DOF = 0.85;              // shallow-focus strength (5-tap blur; auto-off if frames stay slow)
  // Fingertip light in painting UV (kept as its own additive sprite so depth tears don't snuff it)
  var GLOW = { u: 0.345, v: 0.435, size: 0.18, zLift: 0.022 };

  // FPV path (from C preview stills + Fred's route). u,v = look-at on the painting (0..1),
  // d = distance, yaw/pitch = drone seat around that point (degrees), roll = bank.
  // Stay inset and avoid looking "through" the relief from behind — that stretches the mesh.
  // Wide keys use d≲1.65 so FOV never frames the clamp-stretched skirt.
  var KEYS = [
    { u: 0.42, v: 0.44, d: 1.62, yaw:   0, pitch:   0, roll:  0 },  // 0s  wide hover — full scene
    { u: 0.30, v: 0.20, d: 1.15, yaw:  -8, pitch:   5, roll: -2 },  // 3s  push in to God's face
    { u: 0.27, v: 0.34, d: 0.82, yaw: -24, pitch:   2, roll: -7 },  // 6s  OTS God — down the arm
    { u: 0.34, v: 0.43, d: 0.52, yaw:  -4, pitch:  -1, roll:  2 },  // 8s  through the light (closest)
    { u: 0.42, v: 0.48, d: 0.72, yaw:  18, pitch:   2, roll:  5 },  // 10s past the spark, glance Adam-side
    { u: 0.55, v: 0.54, d: 0.88, yaw:  20, pitch:  -4, roll:  5 },  // 13s along Adam's arm
    { u: 0.70, v: 0.61, d: 0.78, yaw:  22, pitch:  -2, roll:  4 },  // 16s OTS Adam's face
    { u: 0.58, v: 0.78, d: 1.18, yaw:   8, pitch: -14, roll: -3 },  // 19s low over body / lake
    { u: 0.36, v: 0.58, d: 1.25, yaw:  -8, pitch:  -6, roll: -4 },  // 22s pull back, hands in frame
    { u: 0.36, v: 0.45, d: 1.00, yaw:  -2, pitch:   1, roll:  1 },  // 24s rise toward the light
    { u: 0.62, v: 0.34, d: 1.12, yaw:  12, pitch:   5, roll:  4 },  // 26s cherubs
    { u: 0.50, v: 0.32, d: 1.35, yaw:   4, pitch:   2, roll:  1 },  // 29s pull out
    { u: 0.44, v: 0.42, d: 1.55, yaw:   1, pitch:   0, roll:  0 }   // 31s ease to wide (seam)
  ];

  var stage = document.getElementById('stage');
  var IMG_W = +document.getElementById('painting').getAttribute('width');
  var IMG_H = +document.getElementById('painting').getAttribute('height');
  var PW = 2 * IMG_W / IMG_H, PH = 2;   // painting size in world units

  var canvas = document.createElement('canvas');
  canvas.className = 'drone';
  var gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance' });
  if (!gl) return;
  var uintOK = !!gl.getExtension('OES_element_index_uint');
  function pick(base) {
    var c = document.createElement('canvas');
    if (c.toDataURL('image/webp').indexOf('image/webp') === 5) return base + '.webp';
    return base + '.jpg';
  }
  function loadImg(srcs) {
    return new Promise(function (res, rej) {
      var i = 0;
      (function next() {
        if (i >= srcs.length) return rej(new Error('image failed'));
        var im = new Image(); im.decoding = 'async';
        im.onload = function () { res(im); }; im.onerror = function () { i++; next(); };
        im.src = srcs[i];
      })();
    });
  }

  // ---------- tiny matrix helpers ----------
  function persp(f, a, n, fa) {
    var t = 1 / Math.tan(f / 2), nf = 1 / (n - fa);
    return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) * nf, -1, 0, 0, 2 * fa * n * nf, 0];
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function lookAt(e, c, up) {
    var z = norm(sub(e, c)), x = norm(cross(up, z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
  }
  function mul(a, b) {
    var o = new Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }

  // ---------- shaders ----------
  // Occlusion edges: dilated foreground mesh + full-res depth check fades pixels that sit past the
  // true outline, so the far layer shows through cleanly. Mipmap LOD bias gives a cheap shallow DOF.
  var VS = 'attribute vec3 p;attribute vec2 uv;uniform mat4 m;uniform float zo;varying vec2 vUv;varying float vD;varying float vZ;' +
    'void main(){vUv=uv;vD=(p.z-zo)/' + DZ.toFixed(3) + ';vec4 q=m*vec4(p,1.);vZ=q.w;gl_Position=q;}';
  // Cheap DOF: 5-tap blur scaled by circle-of-confusion. (WebGL1 cannot mipmap NPOT textures, so no LOD bias.)
  var FS = '#define DBG ' + (/[?&]dbg\b/.test(location.search) ? 'true' : 'false') + '\nprecision mediump float;uniform sampler2D t;uniform sampler2D dt;uniform float tol;uniform vec3 fog;uniform float focusZ;uniform float dof;' +
    'varying vec2 vUv;varying float vD;varying float vZ;' +
    'void main(){vec2 uv=clamp(vUv,0.,1.);' +
    'float a=1.;if(tol<1.){float g=vD-texture2D(dt,uv).r;a=1.-smoothstep(tol*.4,tol,g);if(a<.02)discard;}' +
    'float coc=clamp(abs(vZ-focusZ)*dof,0.,1.);vec2 px=vec2(0.0035,0.002)*coc;' +
    'vec3 c=texture2D(t,uv).rgb;' +
    'if(coc>0.04){c=c*0.36+texture2D(t,uv+vec2(px.x,0.)).rgb*0.16+texture2D(t,uv-vec2(px.x,0.)).rgb*0.16+texture2D(t,uv+vec2(0.,px.y)).rgb*0.16+texture2D(t,uv-vec2(0.,px.y)).rgb*0.16;}' +
    'if(DBG)c=vec3((vD-texture2D(dt,uv).r)*10.,texture2D(dt,uv).r,vD);float f=clamp((vZ-1.3)*0.18,0.,0.22);gl_FragColor=vec4(mix(c,fog,f),a);}';

  // Additive soft glow billboard at the fingertip light
  var GVS = 'attribute vec2 c;uniform mat4 m;uniform vec3 pos;uniform vec3 right;uniform vec3 up;uniform float sz;varying vec2 vC;' +
    'void main(){vC=c;vec3 w=pos+right*(c.x*sz)+up*(c.y*sz);gl_Position=m*vec4(w,1.);}';
  var GFS = 'precision mediump float;varying vec2 vC;void main(){float r=length(vC);float core=exp(-r*r*9.);float halo=exp(-r*r*2.2)*.45;float rays=0.;' +
    'for(int i=0;i<6;i++){float ang=float(i)*1.047;vec2 d=vec2(cos(ang),sin(ang));float along=max(0.,dot(vC,d));float side=abs(vC.x*d.y-vC.y*d.x);rays+=exp(-side*side*90.)*exp(-along*along*1.8)*.18;}' +
    'float a=core+halo+rays;gl_FragColor=vec4(1.,.92,.62,1.)*a;}';

  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function link(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  var prog = link(VS, FS);
  var L = { p: gl.getAttribLocation(prog, 'p'), uv: gl.getAttribLocation(prog, 'uv'),
    m: gl.getUniformLocation(prog, 'm'), t: gl.getUniformLocation(prog, 't'), dt: gl.getUniformLocation(prog, 'dt'),
    tol: gl.getUniformLocation(prog, 'tol'), zo: gl.getUniformLocation(prog, 'zo'), fog: gl.getUniformLocation(prog, 'fog'),
    focusZ: gl.getUniformLocation(prog, 'focusZ'), dof: gl.getUniformLocation(prog, 'dof') };
  var gProg = link(GVS, GFS);
  var GL = { c: gl.getAttribLocation(gProg, 'c'), m: gl.getUniformLocation(gProg, 'm'),
    pos: gl.getUniformLocation(gProg, 'pos'), right: gl.getUniformLocation(gProg, 'right'),
    up: gl.getUniformLocation(gProg, 'up'), sz: gl.getUniformLocation(gProg, 'sz') };
  var glowQuad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, glowQuad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

  // ---------- mesh from the depth map ----------
  function readDepth(im) {
    var c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    var x = c.getContext('2d'); x.drawImage(im, 0, 0);
    return { w: im.width, h: im.height, px: x.getImageData(0, 0, im.width, im.height).data };
  }
  function buildMesh(D, ch, step, zOff, dil) {
    var w = D.w, h = D.h, px = D.px;
    var ext = Math.round(MARGIN * w);
    var cols = Math.floor((w + 2 * ext - 1) / step) + 1, rows = Math.floor((h + 2 * ext - 1) / step) + 1;
    var n = cols * rows;
    if (n > 65535 && !uintOK) { step++; return buildMesh(D, ch, step, zOff, dil); }
    var pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    function dz(ix, iy) { ix = ix < 0 ? 0 : ix >= w ? w - 1 : ix; iy = iy < 0 ? 0 : iy >= h ? h - 1 : iy; return px[(iy * w + ix) * 4 + ch] / 255; }
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      var i = r * cols + c, gx = c * step - ext, gy = r * step - ext;
      var u = (gx + 0.5) / w, v = (gy + 0.5) / h, d = dz(gx, gy);
      if (dil) {
        for (var oy = -dil; oy <= dil; oy++) for (var ox = -dil; ox <= dil; ox++) { var q = dz(gx + ox, gy + oy); if (q > d) d = q; }
      }
      pos[i * 3] = (u - 0.5) * PW; pos[i * 3 + 1] = (0.5 - v) * PH; pos[i * 3 + 2] = d * DZ + zOff;
      uv[i * 2] = u; uv[i * 2 + 1] = v;
    }
    var idx = new (n > 65535 ? Uint32Array : Uint16Array)((cols - 1) * (rows - 1) * 6), k2 = 0;
    for (r = 0; r < rows - 1; r++) for (c = 0; c < cols - 1; c++) {
      var a = r * cols + c, b = a + 1, cc = a + cols, dd = cc + 1;
      idx[k2++] = a; idx[k2++] = cc; idx[k2++] = b; idx[k2++] = b; idx[k2++] = cc; idx[k2++] = dd;
    }
    function buf(data, target) { var b = gl.createBuffer(); gl.bindBuffer(target || gl.ARRAY_BUFFER, b); gl.bufferData(target || gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; }
    return { zo: zOff, p: buf(pos), uv: buf(uv), i: buf(idx, gl.ELEMENT_ARRAY_BUFFER), count: idx.length, type: n > 65535 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
  }
  function tex(im) {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  // ---------- camera path: closed Catmull-Rom over pose, timed by distance flown ----------
  var depthAt = function () { return 0.5; };
  function pose(k) {
    var tx = (k.u - 0.5) * PW, ty = (0.5 - k.v) * PH, tz = depthAt(k.u, k.v) * DZ;
    var yw = k.yaw * Math.PI / 180, pt = k.pitch * Math.PI / 180;
    return [tx + k.d * Math.sin(yw) * Math.cos(pt), ty + k.d * Math.sin(pt), tz + k.d * Math.cos(yw) * Math.cos(pt), tx, ty, tz, k.roll];
  }
  var P = [], starts = [], durs = [], total = 0, N = KEYS.length;
  function prepare() {
    P = KEYS.map(pose); starts = []; durs = []; total = 0;
    for (var i = 0; i < N; i++) {
      var a = P[i], b = P[(i + 1) % N];
      var d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) + 0.35 * Math.hypot(b[3] - a[3], b[4] - a[4], b[5] - a[5]);
      d = Math.max(0.1, d); starts.push(total); durs.push(d); total += d;
    }
  }
  function cr(p0, p1, p2, p3, t) { var t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
  function sample(sec) {
    var s = ((sec % LOOP) + LOOP) % LOOP / LOOP * total, k = N - 1;
    for (var j = 0; j < N; j++) if (s < starts[j] + durs[j]) { k = j; break; }
    var t = (s - starts[k]) / durs[k]; t = t * 0.85 + t * t * (3 - 2 * t) * 0.15;
    var a = P[(k - 1 + N) % N], b = P[k], c = P[(k + 1) % N], d = P[(k + 2) % N], o = [];
    for (var q = 0; q < 7; q++) o.push(cr(a[q], b[q], c[q], d[q], t));
    return o;
  }

  // ---------- render ----------
  var fg, bg, tFg, tBg, vw, vh, dpr, qual = 1, dofOn = true;
  function resize() {
    dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2) * qual);
    vh = window.innerHeight;
    vw = window.innerWidth / vh > 0.75 ? Math.round(vh * PW / PH) : window.innerWidth;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
    canvas.style.left = Math.round((window.innerWidth - vw) / 2) + 'px';
  }
  function draw(mesh, texture, tol) {
    gl.uniform1f(L.tol, tol); gl.uniform1f(L.zo, mesh.zo);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.p); gl.vertexAttribPointer(L.p, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uv); gl.vertexAttribPointer(L.uv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.i);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.type, 0);
  }
  function drawGlow(m, eye, tgt) {
    var gz = depthAt(GLOW.u, GLOW.v) * DZ + GLOW.zLift;
    var pos = [(GLOW.u - 0.5) * PW, (0.5 - GLOW.v) * PH, gz];
    var fwd = norm(sub(tgt, eye)), right = norm(cross(fwd, [0, 1, 0]));
    if (Math.hypot(right[0], right[1], right[2]) < 0.01) right = [1, 0, 0];
    var upv = cross(right, fwd);
    gl.disableVertexAttribArray(L.p); gl.disableVertexAttribArray(L.uv);
    gl.useProgram(gProg);
    gl.uniformMatrix4fv(GL.m, false, new Float32Array(m));
    gl.uniform3f(GL.pos, pos[0], pos[1], pos[2]);
    gl.uniform3f(GL.right, right[0], right[1], right[2]);
    gl.uniform3f(GL.up, upv[0], upv[1], upv[2]);
    gl.uniform1f(GL.sz, GLOW.size);
    gl.depthMask(false);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindBuffer(gl.ARRAY_BUFFER, glowQuad);
    gl.enableVertexAttribArray(GL.c);
    gl.vertexAttribPointer(GL.c, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(GL.c);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);
    gl.useProgram(prog);
    gl.enableVertexAttribArray(L.p); gl.enableVertexAttribArray(L.uv);
  }
  function render(sec) {
    var c = sample(sec);
    var eye = [c[0], c[1], c[2]], tgt = [c[3], c[4], c[5]];
    var r = c[6] * Math.PI / 180, up = [Math.sin(r), Math.cos(r), 0];
    var m = mul(persp(FOV, vw / vh, 0.05, 20), lookAt(eye, tgt, up));
    var focusZ = Math.hypot(tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.09, 0.07, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog); gl.uniformMatrix4fv(L.m, false, new Float32Array(m));
    gl.uniform3f(L.fog, 0.80, 0.70, 0.52);
    gl.uniform1f(L.focusZ, focusZ);
    gl.uniform1f(L.dof, dofOn ? DOF : 0.0);
    gl.enableVertexAttribArray(L.p); gl.enableVertexAttribArray(L.uv);
    draw(bg, tBg, 9.0);
    draw(fg, tFg, EDGE);
    drawGlow(m, eye, tgt);
  }

  var running = false, raf = 0, t0 = null, elapsed = 0, last = 0, slow = [];
  var frozen = (location.search.match(/[?&]t=([\d.]+)/) || [])[1];
  function frame(now) {
    if (!running) return;
    if (t0 === null) t0 = now - elapsed * 1000;
    elapsed = (now - t0) / 1000;
    render(frozen !== undefined ? +frozen : elapsed);
    if (last) { slow.push(now - last); if (slow.length === 60) {
      slow.sort(function (a, b) { return a - b; });
      if (slow[30] > 22 && qual > 0.55) { qual -= 0.2; resize(); }
      // drop DOF before resolution if still struggling — keeps silhouettes sharp on weak GPUs
      if (slow[30] > 28 && dofOn) dofOn = false;
      slow = [];
    } }
    last = now;
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!running) { running = true; t0 = null; last = 0; slow = []; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  Promise.all([
    loadImg([ASSET + 'painting-3d.avif', pick(ASSET + 'painting-3d')]),
    loadImg([ASSET + 'bg.avif', pick(ASSET + 'bg')]),
    loadImg([ASSET + 'depth.webp'])
  ]).then(function (ims) {
    var D = readDepth(ims[2]);
    depthAt = function (u, v) { var x = Math.min(D.w - 1, Math.max(0, Math.round(u * D.w))), y = Math.min(D.h - 1, Math.max(0, Math.round(v * D.h))); return D.px[(y * D.w + x) * 4] / 255; };
    fg = buildMesh(D, 0, 2, 0, 3);
    bg = buildMesh(D, 1, 4, -0.015, 0);
    gl.activeTexture(gl.TEXTURE1); tex(ims[2]); gl.activeTexture(gl.TEXTURE0);
    tFg = tex(ims[0]); tBg = tex(ims[1]);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enableVertexAttribArray(L.p); gl.enableVertexAttribArray(L.uv);
    gl.useProgram(prog); gl.uniform1i(L.t, 0); gl.uniform1i(L.dt, 1);
    prepare(); resize();
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
    render(frozen !== undefined ? +frozen : 0);
    document.querySelector('.scene').appendChild(canvas);
    requestAnimationFrame(function () {
      cam2d.stop(); canvas.classList.add('on'); document.documentElement.classList.add('drone-on');
      start();
    });
    window.__drone = { render: function (s) { stop(); render(s); }, LOOP: LOOP,
      keyTimes: function () { return starts.map(function (s) { return +(s / total * LOOP).toFixed(2); }); } };
  }).catch(function (e) { if (window.console) console.warn('drone fallback to 2D:', e && e.message); });
})();
