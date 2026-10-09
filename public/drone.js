/* solichin.org: 2.5D "drone" fly-through.
   The painting becomes a relief: a dense mesh displaced by a depth map (Depth Anything V2),
   with an inpainted far layer behind it so gaps at depth edges show background, not smears.
   A perspective camera flies a closed spline through Fred's path (dolly, orbit, altitude, roll).
   Plain WebGL 1, no libraries. If anything fails, the 2D pan in app.js keeps running. */
(function () {
  'use strict';
  var cam2d = window.__camera; if (!cam2d) return;
  var ASSET = '/img/';
  var DZ = 0.28;               // relief depth (painting is 2 units tall)
  var LOOP = 36;               // seconds per loop
  var FOV = 46 * Math.PI / 180;
  var EDGE = 0.05;             // depth mismatch (0..1) at which the relief is torn open
  var MARGIN = 0.15;           // mesh extends past the frame (clamped texture) so orbits never see void

  // Fred's path. u,v = point looked at on the painting (0..1), d = distance,
  // yaw/pitch = where the drone sits around that point (degrees), roll = bank.
  var KEYS = [
    { u: 0.30, v: 0.20, d: 1.00, yaw:  -7, pitch:   5, roll: -2 },  // close on God's face
    { u: 0.24, v: 0.32, d: 1.15, yaw: -11, pitch:   2, roll: -4 },  // curve down his shoulder and forearm
    { u: 0.32, v: 0.41, d: 0.88, yaw:  -7, pitch:   1, roll: -2 },  // to his fingertip...
    { u: 0.34, v: 0.43, d: 0.82, yaw:   7, pitch:  -3, roll:  3 },  // ...gently orbit the light
    { u: 0.48, v: 0.52, d: 1.05, yaw:  10, pitch:  -4, roll:  4 },  // follow Adam's arm down-right
    { u: 0.70, v: 0.61, d: 0.92, yaw:   9, pitch:  -2, roll:  2 },  // Adam's face
    { u: 0.58, v: 0.74, d: 1.20, yaw:   5, pitch: -10, roll: -2 },  // drop low under his body
    { u: 0.30, v: 0.70, d: 1.20, yaw:  -9, pitch:  -8, roll: -5 },  // sweep low past the lake
    { u: 0.24, v: 0.58, d: 1.15, yaw: -10, pitch:   0, roll: -4 },  // climb the left side
    { u: 0.36, v: 0.47, d: 0.95, yaw:  -3, pitch:   3, roll:  1 },  // rise back to the light
    { u: 0.64, v: 0.36, d: 1.00, yaw:   9, pitch:   5, roll:  4 },  // up through the cherubs
    { u: 0.68, v: 0.27, d: 1.05, yaw:   8, pitch:   5, roll:  3 },
    { u: 0.42, v: 0.22, d: 1.12, yaw:   2, pitch:   2, roll:  0 }   // arc over the top, back to God
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
  // AVIF is best but cannot be feature-tested synchronously; try it and fall back.
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
  function mul(a, b) { // column-major a*b
    var o = new Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }

  // ---------- shaders ----------
  // Occlusion edges: the foreground mesh is built from a slightly dilated depth (near things grow a
  // few texels past their outline), so no triangle is stretched across an edge. Each pixel then checks
  // the full-res depth map: if it is really further away than the surface it sits on, it is faded out
  // (feathered) and the inpainted far layer shows through. The cut follows the true outline smoothly.
  var VS = 'attribute vec3 p;attribute vec2 uv;uniform mat4 m;uniform float zo;varying vec2 vUv;varying float vD;varying float vZ;' +
    'void main(){vUv=uv;vD=(p.z-zo)/' + DZ.toFixed(3) + ';vec4 q=m*vec4(p,1.);vZ=q.w;gl_Position=q;}';
  var FS = '#define DBG ' + (/[?&]dbg\b/.test(location.search) ? 'true' : 'false') + '\nprecision mediump float;uniform sampler2D t;uniform sampler2D dt;uniform float tol;uniform vec3 fog;' +
    'varying vec2 vUv;varying float vD;varying float vZ;' +
    'void main(){vec2 uv=1.-abs(1.-abs(vUv));' +   // mirror past the frame edges
    'float a=1.;if(tol<1.){float g=vD-texture2D(dt,uv).r;a=1.-smoothstep(tol*.4,tol,g);if(a<.02)discard;}' +
    'vec3 c=texture2D(t,uv).rgb;if(DBG)c=vec3((vD-texture2D(dt,uv).r)*10.,texture2D(dt,uv).r,vD);float f=clamp((vZ-1.3)*0.18,0.,0.2);gl_FragColor=vec4(mix(c,fog,f),a);}';
  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  var prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  var L = { p: gl.getAttribLocation(prog, 'p'), uv: gl.getAttribLocation(prog, 'uv'),
    m: gl.getUniformLocation(prog, 'm'), t: gl.getUniformLocation(prog, 't'), dt: gl.getUniformLocation(prog, 'dt'), tol: gl.getUniformLocation(prog, 'tol'), zo: gl.getUniformLocation(prog, 'zo'), fog: gl.getUniformLocation(prog, 'fog') };

  // ---------- mesh from the depth map ----------
  function readDepth(im) {
    var c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    var x = c.getContext('2d'); x.drawImage(im, 0, 0);
    return { w: im.width, h: im.height, px: x.getImageData(0, 0, im.width, im.height).data };
  }
  function buildMesh(D, ch, step, zOff, dil) {
    var w = D.w, h = D.h, px = D.px;
    var ext = Math.round(MARGIN * w);                       // extra columns/rows beyond the frame
    var cols = Math.floor((w + 2 * ext - 1) / step) + 1, rows = Math.floor((h + 2 * ext - 1) / step) + 1;
    var n = cols * rows;
    if (n > 65535 && !uintOK) { step++; return buildMesh(D, ch, step, zOff, dil); }
    var pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    function dz(ix, iy) { ix = ix < 0 ? 0 : ix >= w ? w - 1 : ix; iy = iy < 0 ? 0 : iy >= h ? h - 1 : iy; return px[(iy * w + ix) * 4 + ch] / 255; }
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      var i = r * cols + c, gx = c * step - ext, gy = r * step - ext;
      var u = (gx + 0.5) / w, v = (gy + 0.5) / h, d = dz(gx, gy);
      if (dil) { // foreground: near things grow a little past their outline, so no triangle is stretched
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
  var fg, bg, tFg, tBg, vw, vh, dpr, qual = 1;
  function resize() {
    dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2) * qual);
    vh = window.innerHeight;
    // wide screens: fly inside a centred portrait column (same shot as on a phone), backdrop on the sides
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
  function render(sec) {
    var c = sample(sec);
    var eye = [c[0], c[1], c[2]], tgt = [c[3], c[4], c[5]];
    var r = c[6] * Math.PI / 180, up = [Math.sin(r), Math.cos(r), 0];
    var m = mul(persp(FOV, vw / vh, 0.05, 20), lookAt(eye, tgt, up));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.09, 0.07, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog); gl.uniformMatrix4fv(L.m, false, new Float32Array(m));
    gl.uniform3f(L.fog, 0.80, 0.70, 0.52);
    draw(bg, tBg, 9.0);           // far layer: always drawn
    draw(fg, tFg, EDGE);          // relief: torn open at depth edges, revealing the far layer
  }

  var running = false, raf = 0, t0 = null, elapsed = 0, last = 0, slow = [];
  var frozen = (location.search.match(/[?&]t=([\d.]+)/) || [])[1];
  function frame(now) {
    if (!running) return;
    if (t0 === null) t0 = now - elapsed * 1000;
    elapsed = (now - t0) / 1000;
    render(frozen !== undefined ? +frozen : elapsed);
    // adaptive resolution: if a slow phone can't hold ~45 fps, render fewer pixels (down to 1x)
    if (last) { slow.push(now - last); if (slow.length === 60) {
      slow.sort(function (a, b) { return a - b; });
      if (slow[30] > 22 && qual > 0.55) { qual -= 0.2; resize(); }
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
    fg = buildMesh(D, 0, 2, 0, 3);    // red = foreground depth (dilated by 3 texels)
    bg = buildMesh(D, 1, 4, -0.015, 0);  // green = background depth, coarser, a hair behind
    gl.activeTexture(gl.TEXTURE1); tex(ims[2]); gl.activeTexture(gl.TEXTURE0);
    tFg = tex(ims[0]); tBg = tex(ims[1]);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // feathered edges
    gl.enableVertexAttribArray(L.p); gl.enableVertexAttribArray(L.uv);
    gl.useProgram(prog); gl.uniform1i(L.t, 0); gl.uniform1i(L.dt, 1);
    prepare(); resize();
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
    render(frozen !== undefined ? +frozen : 0);
    document.querySelector('.scene').appendChild(canvas);
    requestAnimationFrame(function () {   // cross-fade from the flat painting to the 3D flight
      cam2d.stop(); canvas.classList.add('on'); document.documentElement.classList.add('drone-on');
      start();
    });
    window.__drone = { render: function (s) { stop(); render(s); }, LOOP: LOOP,
      keyTimes: function () { return starts.map(function (s) { return +(s / total * LOOP).toFixed(2); }); } };
  }).catch(function (e) { if (window.console) console.warn('drone fallback to 2D:', e && e.message); });
})();
