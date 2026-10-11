/* solichin.org — The Cornerstone.
   One gold cornerstone floats in the dark. As you scroll, ivory stones fall into place around it,
   course by course, until a foundation stands — and the light turns from night to dawn.
   "Behold, I lay in Zion for a foundation a stone, a tried stone, a precious corner stone" (Isa 28:16). */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const root = document.documentElement;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;

/* ---------------- words: split, then reveal as they enter ---------------- */
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
// one slide at a time: the panel whose screen holds the middle of the viewport is active
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

/* ---------------- the scene ---------------- */
const canvas = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) { root.classList.add('no-gl'); ready(); throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, phone ? 1.75 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const NIGHT = new THREE.Color('#090807'), DAWN = new THREE.Color('#120d09');
const scene = new THREE.Scene();
scene.background = NIGHT.clone();
scene.fog = new THREE.Fog(NIGHT.clone(), 20, 50);   // re-fitted every frame to the camera's distance
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(studio(), 0.02).texture;
// a dark studio with a few big softboxes: gold needs bright shapes to reflect, and dark between them
function studio() {
  const env = new THREE.Scene(); env.background = new THREE.Color(0x050403);
  const box = (w, h, x, y, z, c, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
  // (the planes' brightness k is > 1 on purpose: the PMREM keeps HDR values, so they read as real lights)
  box(14, 4, 0, 9, 4, 0xfff1dc, 6);       // overhead strip
  box(4, 10, -10, 3, 3, 0xffe2b8, 3.2);   // warm side box
  box(3, 8, 9, 2, -5, 0xc8d6ff, 1.6);     // cool kicker
  box(20, 2, 0, -1, -10, 0xffd9a0, 0.8);  // low horizon band
  box(18, 8, 2, 3, 12, 0xffe6c4, 7);     // big front box: what the gold's face reflects toward us
  box(7, 5, -7, 7, 9, 0xfff4e6, 12);      // key reflection, a bright highlight high on the face
  return env;
}

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);

// light: a cool key at night that swings low and warm for dawn, a cold rim, a little sky
const hemi = new THREE.HemisphereLight(0x8d9bb3, 0x120c08, 0.12);
const key = new THREE.SpotLight(0xdfe6f0, 3, 0, 0.62, 0.85, 0);   // one pool of light, edges falling into dark
key.castShadow = true;
key.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
Object.assign(key.shadow.camera, { near: 4, far: 70 });
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; key.shadow.radius = 5;
const rim = new THREE.DirectionalLight(0x9fb4d9, 0.45);
// a warm kiss on the gold while it floats alone
const glint = new THREE.PointLight(0xffd9a0, 0, 7, 1.6);
rim.position.set(6, 6, -12);
scene.add(hemi, key, key.target, rim, glint);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240),
  new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 1, metalness: 0, envMapIntensity: 0 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);

/* limestone: a soft speckled map so the stones read as stone, not plastic */
function stoneTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#d9d2c4'; g.fillRect(0, 0, 512, 512);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [n, r0, r1, a] of [[90, 30, 90, .05], [900, 2, 8, .07], [9000, .4, 1.6, .16]]) {
    for (let i = 0; i < n; i++) {
      const v = rnd() < .5 ? 255 : 120;
      g.fillStyle = `rgba(${v},${v - 8},${v - 22},${a * rnd()})`;
      g.beginPath(); g.arc(rnd() * 512, rnd() * 512, r0 + rnd() * (r1 - r0), 0, 7); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
const ivory = new THREE.MeshStandardMaterial({ color: 0xdcd1bd, map: stoneTexture(), roughness: 0.88, metalness: 0, envMapIntensity: 0.22 });
const gold = new THREE.MeshPhysicalMaterial({ color: 0xe8bd72, metalness: 1, roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 2.2 });

/* ---------------- the foundation plan: 4 courses in running bond ---------------- */
const W = 10, Z = 7, COURSES = 4, GAP = 0.06;
const stones = [];   // {len, x, y, z, axis, order}
for (let c = 0; c < COURSES; c++) {
  const even = c % 2 === 0, y = c + 0.5;
  const walls = [
    { axis: 'x', fixed: Z / 2 - 0.5, from: even ? -W / 2 : -W / 2 + 1, to: even ? W / 2 : W / 2 - 1, side: 0 },   // front
    { axis: 'z', fixed: W / 2 - 0.5, from: even ? Z / 2 - 1 : Z / 2, to: even ? -Z / 2 + 1 : -Z / 2, side: 1 },   // right, front→back
    { axis: 'x', fixed: -(Z / 2 - 0.5), from: even ? W / 2 : W / 2 - 1, to: even ? -W / 2 : -W / 2 + 1, side: 2 }, // back, right→left
    { axis: 'z', fixed: -(W / 2 - 0.5), from: even ? -Z / 2 + 1 : -Z / 2, to: even ? Z / 2 - 1 : Z / 2, side: 3 }, // left, back→front
  ];
  for (const w of walls) {
    const dir = Math.sign(w.to - w.from), span = Math.abs(w.to - w.from);
    let a = 0, first = true;
    while (a < span - 1e-6) {
      const len = Math.min(first && !even ? 1 : 2, span - a); first = false;
      const mid = w.from + dir * (a + len / 2);
      stones.push({ len, y, axis: w.axis, x: w.axis === 'x' ? mid : w.fixed, z: w.axis === 'x' ? w.fixed : mid,
        order: c * 100 + w.side * 20 + a });
      a += len;
    }
  }
}
// the cornerstone: the first stone of the front wall, front-left corner
stones.sort((a, b) => a.order - b.order);
const cornerIdx = stones.findIndex(s => s.y === 0.5 && s.axis === 'x' && s.len === 2 && s.x < -3.5);
const corner = stones.splice(cornerIdx, 1)[0];

const geo = { 1: new RoundedBoxGeometry(1 - GAP, 1 - GAP, 1 - GAP, 3, 0.045), 2: new RoundedBoxGeometry(2 - GAP, 1 - GAP, 1 - GAP, 3, 0.045) };
const meshes = {};
for (const len of [1, 2]) {
  const list = stones.filter(s => s.len === len);
  const m = new THREE.InstancedMesh(geo[len], ivory, list.length);
  m.castShadow = m.receiveShadow = true;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const col = new THREE.Color();
  list.forEach((s, i) => { s.mesh = m; s.i = i; const t = 0.93 + 0.09 * ((i * 0.618 + len * 0.31) % 1); col.setRGB(t, t * 0.985, t * 0.955); m.setColorAt(i, col); });
  meshes[len] = m; scene.add(m);
}
stones.forEach((s, j) => { s.start = 0.1 + 0.6 * (j / stones.length); s.spin = ((j * 7919) % 13) / 13 - 0.5; });

const cornerstone = new THREE.Mesh(new RoundedBoxGeometry(2 - GAP, 1 - GAP, 1 - GAP, 4, 0.05), gold);
cornerstone.castShadow = cornerstone.receiveShadow = true;
scene.add(cornerstone);

/* ---------------- camera path over the scroll ---------------- */
const C = new THREE.Vector3(corner.x, corner.y, corner.z);
const KEYS = [   // p, camera position, look-at
  [0.00, [-1.1, 1.7, 9.6], [C.x, 0.1, C.z]],
  [0.22, [4.5, 4.2, 13.5], [-1.2, 0.2, 1.2]],
  [0.48, [13, 8.5, 9], [0, 0.6, 0]],
  [0.74, [-7, 14, 15], [0, 1, 0]],
  [1.00, [0.01, 27, 7.5], [0, 1, 0]],
].map(([p, a, b]) => ({ p, pos: new THREE.Vector3(...a), tgt: new THREE.Vector3(...b) }));
const smooth = t => t * t * (3 - 2 * t);
function camAt(p, pos, tgt) {
  let i = 0; while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = smooth(Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p))));
  pos.lerpVectors(a.pos, b.pos, t); tgt.lerpVectors(a.tgt, b.tgt, t);
}

/* ---------------- frame ---------------- */
const pos = new THREE.Vector3(), tgt = new THREE.Vector3(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
const COOL = new THREE.Color(0xdfe6f0), WARM = new THREE.Color(0xffc98c);
const clamp01 = x => Math.min(1, Math.max(0, x));
const easeOut = x => 1 - Math.pow(1 - x, 4);
let cur = 0, last = performance.now(), running = true, forced = null, reach = 1;

function target() {
  const max = document.documentElement.scrollHeight - innerHeight;
  return max > 0 ? clamp01(scrollY / max) : 0;
}
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const portrait = w / h < 0.8;
  camera.fov = portrait ? 50 : 34;
  reach = portrait ? 1.3 : 1;        // phones stand further back to see the same width of the world
  camera.setViewOffset(w, h, 0, h * (portrait ? 0.16 : 0.1), w, h);   // lift the subject above the words
  camera.updateProjectionMatrix();
}
function frame(now, once) {
  if (!running) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const t = now / 1000, goal = forced ?? target();
  cur = still || forced !== null ? goal : cur + (goal - cur) * (1 - Math.exp(-dt * 4.5));

  // camera, with a slow breath so the scene is never frozen
  camAt(cur, pos, tgt);
  pos.sub(tgt).multiplyScalar(1 + (reach - 1) * smooth(clamp01(cur / 0.2))).add(tgt);   // phones: close on the stone first, then stand back
  if (!still) pos.add(P.set(Math.sin(t * 0.21) * 0.3, Math.sin(t * 0.17) * 0.18, Math.cos(t * 0.19) * 0.3));
  camera.position.copy(pos); camera.lookAt(tgt);

  // cornerstone floats alone, then settles into its place as the first stones come
  const settle = still ? 1 : smooth(clamp01(cur / 0.1));
  cornerstone.position.set(C.x, C.y + (1 - settle) * (0.55 + Math.sin(t * 0.9) * 0.08), C.z);
  cornerstone.rotation.set((1 - settle) * Math.sin(t * 0.5) * 0.05, (1 - settle) * (0.35 + Math.sin(t * 0.3) * 0.18), (1 - settle) * Math.sin(t * 0.4) * 0.04);

  // stones fall into place, in order around the walls
  for (const s of stones) {
    const k = clamp01((cur - s.start) / 0.05), e = easeOut(k);
    P.set(s.x, s.y + (1 - e) * 3.2, s.z);
    E.set((1 - e) * s.spin * 0.6, (s.axis === 'z' ? Math.PI / 2 : 0) + (1 - e) * s.spin, (1 - e) * s.spin * 0.5);
    S.setScalar(k > 0 ? 0.82 + 0.18 * easeOut(Math.min(1, k * 2.5)) : 0);
    s.mesh.setMatrixAt(s.i, M.compose(P, Q.setFromEuler(E), S));
  }
  meshes[1].instanceMatrix.needsUpdate = meshes[2].instanceMatrix.needsUpdate = true;

  // night → dawn: the key light swings low and warm, long shadows across the new walls
  const d = smooth(clamp01((cur - 0.35) / 0.65));
  key.color.lerpColors(COOL, WARM, d);
  key.intensity = 3.2 + d * 2.2;
  key.position.set(-9 + d * 25, 17 - d * 9, 11 - d * 7);
  hemi.intensity = 0.35 + d * 0.15;
  scene.background.lerpColors(NIGHT, DAWN, d); scene.fog.color.copy(scene.background);
  

  const dist = camera.position.distanceTo(tgt);
  scene.fog.near = dist * 0.85; scene.fog.far = dist * 2.1;
  key.target.position.set(cur < 0.1 ? C.x : 0, 0, cur < 0.1 ? C.z : 0).lerp(P.set(0, 0, 0), smooth(clamp01(cur / 0.25)));
  key.angle = 0.3 + 0.32 * smooth(clamp01(cur / 0.3));
  glint.position.set(C.x + 1.8, C.y + 1.6, C.z + 2.2);
  glint.intensity = 4 * (1 - settle);
  renderer.render(scene, camera);
  if (!once) requestAnimationFrame(frame);
}

resize();
addEventListener('resize', resize, { passive: true });
document.addEventListener('visibilitychange', () => {
  running = !document.hidden;
  if (running) { last = performance.now(); requestAnimationFrame(frame); }
});
cur = target();
requestAnimationFrame(t => { frame(t); ready(); });
window.__scene = { renderAt: p => { forced = p; frame(performance.now(), true); } };   // proof hook for screenshots
