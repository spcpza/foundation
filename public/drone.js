/* solichin.org: true POV / FPV fly-through of the painting.
   The painting is a relief (depth-displaced mesh + inpainted far layer). The camera is the
   drone: it flies a path close over the surface and looks ALONG its velocity (not at an
   orbit target). That is what makes it POV instead of a pan.
   Plain WebGL 1, no libraries. Falls back to the 2D pan in app.js on failure. */
(function () {
  'use strict';
  var cam2d = window.__camera; if (!cam2d) return;
  var ASSET = '/img/';
  var DZ = 0.34;               // relief depth — enough for skim parallax without tearing
  var LOOP = 28;               // seconds per loop
  var FOV = 58 * Math.PI / 180; // FPV-wide, still fills Fred's portrait on the wide hover
  var EDGE = 0.05;
  var MARGIN = 0.08;
  var DOF = 0.70;
  var LOOK = 0.70;             // seconds of look-ahead along the flight path
  // Fingertip light on Fred's painting (additive so depth tears don't snuff it)
  var GLOW = { u: 0.345, v: 0.435, size: 0.17, zLift: 0.028 };

  // True POV path over Fred's portrait (God upper-left, Adam lower-right, spark between fingers).
  // u,v = drone position on the painting; h = height above local relief; roll = bank.
  // Look aims at the surface ahead on the path — you are the drone, not orbiting a fixed point.
  var KEYS = [
    { u: 0.42, v: 0.46, h: 0.98, roll:   0 },  // wide hover — full scene
    { u: 0.34, v: 0.28, h: 0.48, roll:  -6 },  // dive toward God
    { u: 0.29, v: 0.22, h: 0.30, roll:  -8 },  // close on God's face
    { u: 0.28, v: 0.34, h: 0.24, roll: -10 },  // skim OTS down His arm
    { u: 0.34, v: 0.43, h: 0.16, roll:   2 },  // punch through the light
    { u: 0.48, v: 0.52, h: 0.22, roll:   8 },  // race along Adam's arm
    { u: 0.66, v: 0.60, h: 0.26, roll:  10 },  // past Adam's face
    { u: 0.58, v: 0.76, h: 0.34, roll:  -4 },  // drop low over the lake
    { u: 0.34, v: 0.64, h: 0.40, roll:  -8 },  // climb the left side
    { u: 0.36, v: 0.46, h: 0.30, roll:   0 },  // rise back toward the light
    { u: 0.58, v: 0.34, h: 0.36, roll:   6 },  // through the cherubs
    { u: 0.48, v: 0.26, h: 0.52, roll:   2 },  // arc over the top
    { u: 0.42, v: 0.42, h: 0.88, roll:   0 }   // ease to wide (seam)
  ];

  var IMG_W = +document.getElementById('painting').getAttribute('width');
  var IMG_H = +document.getElementById('painting').getAttribute('height');
  var PW = 2 * IMG_W / IMG_H, PH = 2;

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

  function persp(f, a, n, fa) {
    var t = 1 / Math.tan(f / 2), nf = 1 / (n - fa);
    return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) * nf, -1, 0, 0, 2 * fa * n * nf, 0];
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
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

  var VS = 'attribute vec3 p;attribute vec2 uv;uniform mat4 m;uniform float zo;varying vec2 vUv;varying float vD;varying float vZ;' +
    'void main(){vUv=uv;vD=(p.z-zo)/' + DZ.toFixed(3) + ';vec4 q=m*vec4(p,1.);vZ=q.w;gl_Position=q;}';
  var FS = '#define DBG ' + (/[?&]dbg\b/.test(location.search) ? 'true' : 'false') + '\nprecision mediump float;uniform sampler2D t;uniform sampler2D dt;uniform float tol;uniform vec3 fog;uniform float focusZ;uniform float dof;' +
    'varying vec2 vUv;varying float vD;varying float vZ;' +
    'void main(){vec2 uv=clamp(vUv,0.,1.);' +
    'float a=1.;if(tol<1.){float g=vD-texture2D(dt,uv).r;a=1.-smoothstep(tol*.4,tol,g);if(a<.02)discard;}' +
    'float coc=clamp(abs(vZ-focusZ)*dof,0.,1.);vec2 px=vec2(0.004,0.0022)*coc;' +
    'vec3 c=texture2D(t,uv).rgb;' +
    'if(coc>0.05){c=c*0.36+texture2D(t,uv+vec2(px.x,0.)).rgb*0.16+texture2D(t,uv-vec2(px.x,0.)).rgb*0.16+texture2D(t,uv+vec2(0.,px.y)).rgb*0.16+texture2D(t,uv-vec2(0.,px.y)).rgb*0.16;}' +
    'if(DBG)c=vec3((vD-texture2D(dt,uv).r)*10.,texture2D(dt,uv).r,vD);float f=clamp((vZ-0.9)*0.22,0.,0.28);gl_FragColor=vec4(mix(c,fog,f),a);}';

  var GVS = 'attribute vec2 c;uniform mat4 m;uniform vec3 pos;uniform vec3 right;uniform vec3 up;uniform float sz;varying vec2 vC;' +
    'void main(){vC=c;vec3 w=pos+right*(c.x*sz)+up*(c.y*sz);gl_Position=m*vec4(w,1.);}';
  var GFS = 'precision mediump float;varying vec2 vC;void main(){float r=length(vC);float core=exp(-r*r*10.);float halo=exp(-r*r*2.4)*.5;float rays=0.;' +
    'for(int i=0;i<6;i++){float ang=float(i)*1.047;vec2 d=vec2(cos(ang),sin(ang));float along=max(0.,dot(vC,d));float side=abs(vC.x*d.y-vC.y*d.x);rays+=exp(-side*side*90.)*exp(-along*along*1.8)*.2;}' +
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

  // ---------- FPV path: positions over the relief; look = velocity ----------
  var depthAt = function () { return 0.5; };
  function worldPos(k) {
    var u = Math.min(0.92, Math.max(0.08, k.u)), v = Math.min(0.92, Math.max(0.08, k.v));
    var x = (u - 0.5) * PW, y = (0.5 - v) * PH;
    var z = depthAt(u, v) * DZ + Math.max(0.04, k.h);
    return [x, y, z, k.roll];
  }
  var P = [], starts = [], durs = [], total = 0, N = KEYS.length;
  function prepare() {
    P = KEYS.map(worldPos); starts = []; durs = []; total = 0;
    for (var i = 0; i < N; i++) {
      var a = P[i], b = P[(i + 1) % N];
      // time ~ distance flown (height changes count less — keep speed feeling forward)
      var d = Math.hypot(b[0] - a[0], b[1] - a[1], (b[2] - a[2]) * 0.55);
      d = Math.max(0.12, d); starts.push(total); durs.push(d); total += d;
    }
  }
  function cr(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  function samplePos(sec) {
    var s = ((sec % LOOP) + LOOP) % LOOP / LOOP * total, k = N - 1;
    for (var j = 0; j < N; j++) if (s < starts[j] + durs[j]) { k = j; break; }
    var t = (s - starts[k]) / durs[k];
    // slight ease keeps corners from snapping, but keep it closer to constant speed than before
    t = t * 0.92 + t * t * (3 - 2 * t) * 0.08;
    var a = P[(k - 1 + N) % N], b = P[k], c = P[(k + 1) % N], d = P[(k + 2) % N], o = [];
    for (var q = 0; q < 4; q++) o.push(cr(a[q], b[q], c[q], d[q], t));
    return o;
  }
  // FPV sample: eye on path, look at the surface you're flying toward (where you're going).
  // That is the POV difference from a pan: pan stares at a fixed point while sliding; POV
  // aims at the next place on the path and lets near geometry rush past the sides.
  function sample(sec) {
    var eye = samplePos(sec);
    var ahead = samplePos(sec + LOOK);
    var vel = sub(ahead, eye);
    var speed = Math.hypot(vel[0], vel[1], vel[2]) || 1e-4;
    // Aim point: on the relief under the ahead drone position (drop most of the height)
    var aimZ = Math.max(0.03, ahead[2] - 0.55 * Math.max(0.14, ahead[2] - DZ * 0.3));
    // Keep some forward lead so we don't nose-dive into the mesh
    var tgt = [
      eye[0] + (ahead[0] - eye[0]) * 1.15,
      eye[1] + (ahead[1] - eye[1]) * 1.15,
      aimZ
    ];
    // Auto-bank from horizontal turn rate, blended with keyed roll
    var ahead2 = samplePos(sec + LOOK * 2);
    var v1 = [(ahead[0] - eye[0]) / speed, (ahead[1] - eye[1]) / speed];
    var sp2 = Math.hypot(ahead2[0] - ahead[0], ahead2[1] - ahead[1]) || 1e-4;
    var v2 = [(ahead2[0] - ahead[0]) / sp2, (ahead2[1] - ahead[1]) / sp2];
    var turn = v1[0] * v2[1] - v1[1] * v2[0];
    var autoRoll = Math.max(-24, Math.min(24, -turn * 160));
    var roll = eye[3] * 0.55 + autoRoll * 0.45;
    var focus = Math.hypot(tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]);
    return { eye: eye, tgt: tgt, roll: roll, focus: focus };
  }

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
    var s = sample(sec);
    var eye = s.eye, tgt = s.tgt;
    var r = s.roll * Math.PI / 180, up = [Math.sin(r), Math.cos(r), 0];
    var m = mul(persp(FOV, vw / vh, 0.02, 20), lookAt(eye, tgt, up));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.09, 0.07, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog); gl.uniformMatrix4fv(L.m, false, new Float32Array(m));
    gl.uniform3f(L.fog, 0.80, 0.70, 0.52);
    gl.uniform1f(L.focusZ, Math.max(0.15, s.focus));
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
    depthAt = function (u, v) {
      var x = Math.min(D.w - 1, Math.max(0, Math.round(u * D.w)));
      var y = Math.min(D.h - 1, Math.max(0, Math.round(v * D.h)));
      return D.px[(y * D.w + x) * 4] / 255;
    };
    fg = buildMesh(D, 0, 2, 0, 3);
    bg = buildMesh(D, 1, 4, -0.02, 0);
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
