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
else fetch('/img/scene.json?v=1791963822').then(r => r.json()).then(meta =>
  Promise.all([shape === 'wide' ? 'night-wide' : 'night', shape === 'wide' ? 'night-wide-flow' : 'night-flow', shape === 'wide' ? 'day' : 'day-tall', shape === 'wide' ? 'day-flow' : 'day-tall-flow', shape === 'wide' ? 'supper' : 'supper-tall', shape === 'wide' ? 'supper-flow' : 'supper-tall-flow', shape === 'wide' ? 'day-rift' : 'day-tall-rift', shape === 'wide' ? 'supper-aura' : 'supper-tall-aura'].map(n => load(`/img/${n}.webp?v=1791963822`)))
    .then(ims => paint(gl, ims, meta[shape])))
  .catch(e => { console.error(String(e && e.message || e)); root.classList.add('no-gl'); ready(); });   // log, then fall back

function paint(gl, [nightImg, nightFlow, dayImg, dayFlow, supImg, supFlow, riftImg, auraImg], meta) {
  // Each picture: its figures cut free of the plaster and placed (see place()), in a painted
  // world around it — a starry night, or a sunlit sky — so any screen shape is a whole picture.
  // Each picture is one whole painting: Michelangelo's fresco, grown past its frame in his manner.
  // It covers the screen around its focus; the brush engine repaints it stroke by stroke.
  const SCENE = /* glsl */`
  uniform float A;                       // canvas width / height (height is 1)
  uniform vec4 RN, RD, RL;               // where each painting lies on the canvas: x, y, w, h
  uniform vec2 LJ;                       // Christ at the centre of the Last Supper
  uniform vec2 GL;                       // God's light in the night
  uniform vec3 MOON;                     // the moon in the night painting: u, v, radius (in widths)
  uniform vec2 LC;                       // the light: between the two hands
  uniform vec3 FINE[4];                  // the day's faces and hands: u, v, radius (in widths) — always the finest brush
  uniform sampler2D TN, FN, TD, FD, TL, FL;   // paintings and their flow maps
  float DET = 1.;                        // brush size here (small for faces, hands and edges)
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ return .55*vn(p) + .28*vn(p*2.1+3.1) + .17*vn(p*4.3+7.7); }
  vec2 perp(vec2 d){ return vec2(-d.y, d.x); }
  float lum(vec3 c){ return dot(c, vec3(.3,.55,.15)); }
  // the finishing touch: every picture has a heart of light. Near it the free brush turns around it (or, in the
  // upper room, runs along Leonardo's perspective into Christ's head); the light glows, the edges fall into shade.
  vec3 finish(vec3 col, vec2 p, inout vec2 dir, float free, vec2 F, float radial, float glow){
    vec2 d = p - F; float L = length(d) + 1e-4;
    vec2 swirl = normalize(perp(d)*(1. - radial) + d*radial + 1e-4);
    float reach = (.25 + .75*free) * (1. - smoothstep(.2, 1.25, L));
    if (dot(swirl, dir) < 0.) swirl = -swirl;
    dir = normalize(mix(dir, swirl, min(1., reach*1.1)) + 1e-4);
    col += glow * vec3(1.,.86,.58) * (exp(-L*L/.03) + .5*exp(-L*L/.18)) * (.7 + .3*free);
    vec2 e = p - vec2(A*.5, .5);
    col *= 1. - .48*smoothstep(.35, 1.05, length(e*vec2(1./max(A,.6), 1.)));
    return col;
  }

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

  // ---- night: Aivazovsky, "Chaos. The Creation" (1841) — the Spirit of God, a figure of light, over the face of the deep ----
  vec3 night(vec2 p, out vec2 dir){
    vec2 uv; float coh, det, plaster;
    vec3 c = paintAt(TN, FN, RN, p, uv, dir, coh, det, plaster);
    // deepen the night a little: darks sink toward blue-black, the light stays warm
    float l = lum(c);
    vec3 g = mix(c*vec3(.78,.80,.95), c*vec3(1.06,1.,.92), smoothstep(.25, .75, l));
    g = (g - .5)*1.08 + .48;
    // around God the brush is finest and circles his light, so the figure is never painted away
    vec2 gd = (uv - MOON.xy)*vec2(1., RN.w/RN.z); float gl = length(gd)/MOON.z;
    if (gl < 1.6) dir = normalize(mix(dir, perp(gd), .5*(1. - smoothstep(.6, 1.6, gl))) + 1e-4);
    DET = mix(1., .3, smoothstep(.08, .55, det));
    DET = min(DET, mix(.14, 1., smoothstep(1., 3.2, gl)));
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
    DET = min(DET, mix(1., .11, smoothstep(.5, .85, det)));     // eyes, fingertips: the finest brush
    for (int i = 0; i < 4; i++) {                                // faces and hands are named, not guessed
      float fd = length((uv - FINE[i].xy)*vec2(1., RD.w/RD.z))/FINE[i].z;
      DET = min(DET, mix(.1, 1., smoothstep(.7, 2.2, fd)));
    }
    return g;
  }

  // ---- the third picture: Leonardo, The Last Supper (1495-98) ----
  vec3 supper(vec2 p, out vec2 dir){
    vec2 uv; float coh, det, plaster;
    vec3 c = paintAt(TL, FL, RL, p, uv, dir, coh, det, plaster);
    vec3 g = mix(vec3(lum(c)), c, 1.25); g = (g - .5)*1.08 + .5;          // the faded fresco, a little fuller
    vec2 d = p - LJ; float L = length(d);
    g += vec3(.05,.04,.02)*smoothstep(.35, .0, L);                         // the light around Christ
    DET = mix(1., .26, smoothstep(.06, .5, det));
    DET = min(DET, mix(1., .11, smoothstep(.45, .8, det)));
    DET = min(DET, mix(.16, 1., smoothstep(.05, .14, L)));                   // his face and hands: the finest brush
    return g;
  }`;

  const VS = `#version 300 es
  precision highp float;
  layout(location=0) in vec2 corner;
  layout(location=1) in vec2 base;
  layout(location=2) in vec4 rnd;
  layout(location=3) in vec2 size;
  uniform float T, MIX, MIX2, BOIL;
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
    // then the third: repainted outward from Christ
    vec2 dl; DET = 1.; vec3 cl = supper(p, dl); float detL = DET;
    float order2 = .5*rnd.y + .5*clamp(length(p - LJ)/1.1, 0., 1.);
    float k2 = smoothstep(order2 - .05, order2 + .05, MIX2*1.12 - .03);
    dir = normalize(mix(dir, dl, k2) + 1e-4); col = mix(col, cl, k2); det = mix(det, detL, k2);
    vec2 F = mix(mix(GL, LC, k), LJ, k2);
    col = finish(col, p, dir, smoothstep(.35, 1., det), F, k2, mix(mix(.2, .15, k), .11, k2));
    float free = smoothstep(.35, 1., det);                  // how free the brush is here (low detail = free)
    // the hand: no two strokes the same
    float calm0 = 1. - k;
    float a = (rnd.y - .5)*(.32 + .5*free)*det*(1. - .75*calm0);   // at night the hand is steady
    dir = mat2(cos(a), sin(a), -sin(a), cos(a)) * dir;
    // Beethoven, not Bach: each stroke pushes its colour — warmer or cooler, fuller or greyer — and the
    // value range opens up (deeper darks, brighter lights), more where the brush is free (low detail)
    float lv = dot(col, vec3(.3,.55,.15));
    col = lv + (col - lv)*(1.08 + .5*(rnd.z - .5)*mix(.25, 1., free));                  // chroma: some strokes sing, some whisper
    col += (rnd.w - .5)*(.03 + .12*free)*(1. - .7*(1. - k))*vec3(.9, .1, -.9);                              // warm / cool broken colour (quiet on faces)
    col *= mix(.94, .84, free) + mix(.12, .32, free)*rnd.z;
    col = mix(col, smoothstep(0., 1., col), .25);                                        // dynamics: open the value range
    // the wind: the whole picture breathes along its own current
    float wave = sin(T*.7 - p.x*3.1 - p.y*2.3 + rnd.x*.8);
    vec2 drift = dir * .006 * wave * BOIL;
    float wob = .05 * sin(T*.9 + rnd.y*6.28) * BOIL;
    dir = mat2(cos(wob), sin(wob), -sin(wob), cos(wob)) * dir;
    // the stroke swings: it bends along its length, and presses hard at the head then lifts thin at the tail
    float calm = 1. - k;                                    // 1 at night (Aivazovsky's soft clouds), 0 by day
    float bend = (rnd.x - .5)*(.35 + 1.1*free)*(1. - .6*calm);
    float press = mix(1.15, .5, smoothstep(-.5, .5, corner.x)) * (1. + .18*sin(corner.x*9. + rnd.y*20.));
    vec2 along = dir*corner.x*size.x, across = perp(dir)*(corner.y*size.y*press + bend*(corner.x*corner.x - .25)*size.x);
    float sweep = size.x > .06 ? mix(.3, 1., free) : 1.;   // great sweeps belong to the open sky, not across a face
    vec2 q = p + drift*det + (along + across)*det*sweep*mix(1., .55, calm);   // Aivazovsky's soft clouds want a smaller, smoother brush
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
    vec3 c = vCol * (.78 + .4*b.r) + .11*smoothstep(.4, 1., b.r)*(1. - vUv.y) - .05*smoothstep(.5, 0., b.r);   // thick impasto: ridges catch light, grooves hold shadow
    o = vec4(c, b.a);
  }`;
  const VS_BG = `#version 300 es
  layout(location=0) in vec2 q; out vec2 vp; uniform float A;
  void main(){ vp = (q*.5+.5)*vec2(A,1.); gl_Position = vec4(q,0.,1.); }`;
  const FS_BG = `#version 300 es
  precision highp float;
  in vec2 vp; uniform float MIX, MIX2; out vec4 o;
  ${SCENE}
  void main(){
    vec2 d1, d2; float m = smoothstep(.15, .9, MIX);
    DET = 1.; vec3 cn = night(vp, d1); float dn = DET; DET = 1.; vec3 cd = dawn(vp, d2); float dd = DET;
    vec3 c = mix(cn, cd, m);
    float dm = mix(dn, dd, m);
    vec2 d3; DET = 1.; vec3 cl = supper(vp, d3); float m2 = smoothstep(.15, .9, MIX2);
    c = mix(c, cl, m2); dm = mix(dm, DET, m2);
    vec2 dz = vec2(1., 0.); vec2 F = mix(mix(GL, LC, m), LJ, m2);
    c = finish(c, vp, dz, smoothstep(.35, 1., dm), F, m2, mix(mix(.2, .15, m), .11, m2));
    float fine = 1. - smoothstep(.4, .8, dm);
    fine = max(fine, .85*(1. - m));                            // at night the ground is Aivazovsky's own soft painting     // where a small brush works, the ground beneath is painted true
    float weave = .5 + .5*sin(vp.x*900.)*sin(vp.y*900.);
    o = vec4(c*mix(.66, 1., fine) + vec3(.05,.04,.03)*weave*(1. - fine), 1.);
  }`;

  // ---- glitches from heaven: at each picture's heart of light the canvas breaks into slices, colour splits and
  // blocks of light, in bursts — the classical painting interrupted by something not of this world ----
  const FS_GL = `#version 300 es
  precision highp float;
  in vec2 vp; uniform float MIX, MIX2, T; uniform sampler2D TG, TA; out vec4 o;
  ${SCENE}
  float hh(float n){ return fract(sin(n*127.1)*43758.5453); }
  // one torn strip of another painting: a fragment of the other two pictures shows through the tear
  // a torn strip of another painting, showing its heart at a size you can recognise (a hand, a face, the light)
  uniform vec2 FN_, FD_, FL_;
  uniform vec3 HALO;               // Christ's head in the Last Supper: u, v (from top), radius (in widths)      // focal points (uv) of the night, the day, the Last Supper
  vec3 other(sampler2D SA, vec2 fa, sampler2D SB, vec2 fb, vec2 p, float k){
    bool useA = hh(k*5.3) < .5; vec2 f = useA ? fa : fb;
    vec2 jit = (vec2(hh(k*1.7), hh(k*3.1 + 2.)) - .5) * vec2(.06, .04);
    float row = fract(p.y*12. + hh(floor(T*5.) + 4.)*5.) - .5;               // where in the torn strip we are
    float sx = hh(k*9.1) - .5;                                               // the strip slides as one piece
    vec2 u2 = clamp(f + jit + vec2((p.x - A*.5 + sx*.3)*.55, -row*.18), .001, .999);   // that painting's heart, at a natural scale
    return useA ? texture(SA, u2).rgb : texture(SB, u2).rgb;
  }
  float GA;   // how much of this pixel is actually torn (the rest lets the painting show)
  vec3 glitch(sampler2D Tx, sampler2D Oa, vec2 fa, sampler2D Ob, vec2 fb, vec4 R, vec2 p, float amt, float seed){
    // torn slices that slide, a rolling wave, a colour split, smears; and some slices are torn from the other paintings
    float fr = floor(T*14. + seed), fr2 = floor(T*5. + seed);
    float band = floor(p.y*140. + hh(fr2)*30.), band2 = floor(p.y*34. + hh(fr2 + 1.)*9.), band3 = floor(p.y*12. + hh(fr2 + 4.)*5.);
    float on = step(.6 - .12*amt, hh(band2*3.1 + fr*.7 + seed));
    float slice = on * (hh(band*1.7 + fr) - .5) * .16 * amt;
    float wave = sin(p.y*38. + T*7. + seed) * .006 * amt + sin(p.y*170. - T*23.) * .0018 * amt;
    vec2 q = p + vec2(slice + wave, 0.);
    vec2 uv = clamp(vec2((q.x - R.x)/R.z, 1. - (q.y - R.y)/R.w), .001, .999);
    float ch = (.012 + .03*on*hh(band + fr*3.)) * amt / R.z;
    vec3 c = vec3(texture(Tx, uv + vec2(ch, ch*.25)).r, texture(Tx, uv).g, texture(Tx, uv - vec2(ch, ch*.25)).b);
    vec3 sm = vec3(0.); for (int i = 1; i <= 6; i++) sm += texture(Tx, uv - vec2(float(i)*.008*on/R.z, 0.)).rgb;
    c = mix(c, max(c, sm/6.), .35*on);
    // strips torn from the other paintings, with their own colour split
    float tear = step(.72 - .1*amt, hh(band3*2.3 + floor(T*6. + seed)*1.1 + seed));
    float xs = smoothstep(.0, .02, fract(p.x*1.3 + hh(band3 + fr2)) ) * step(fract(p.x*1.3 + hh(band3 + fr2)), .55 + .4*hh(band3*7.));
    vec3 oc = other(Oa, fa, Ob, fb, p, band3 + fr2*13. + seed);
    c = mix(c, oc*vec3(1.05, 1., .95), tear*xs);
    GA = clamp(max(on*.95, tear*xs) + .12, 0., 1.);
    c = c*vec3(1.08, 1.03, .92) + vec3(.07, .06, .03);
    c *= .94 + .06*sin(gl_FragCoord.y*2.2 + T*30.);
    return c;
  }
  void main(){
    float m = smoothstep(.1, .36, MIX), m2 = smoothstep(.1, .9, MIX2);
    float wN = 1. - m, wD = m*(1. - m2), wS = m2;
    float burst = .6 + .4*smoothstep(.3, .7, hh(floor(T*2.4)));
    vec3 col = vec3(0.); float a = 0.;
    // night: the whole storm glitches, hardest at God's light
    float mn = .22 + .5*smoothstep(.6, .05, length(vp - GL));
    if (wN > .01) { vec3 c = glitch(TN, TD, FD_, TL, FL_, RN, vp, 1.1, 1.); float g_ = wN*mn*GA; col += c*g_; a += g_; }
    // day: the rift around God
    vec2 du = clamp(vec2((vp.x - RD.x)/RD.z, 1. - (vp.y - RD.y)/RD.w), 0., 1.);
    float md = texture(TG, du).r;
    if (wD*md > .01) { vec3 c = glitch(TD, TN, FN_, TL, FL_, RD, vp, 1.3, 7.); float g_ = wD*md*GA; col += c*g_; a += g_; }
    // the Last Supper: the air breaking around Christ
    vec2 su = clamp(vec2((vp.x - RL.x)/RL.z, 1. - (vp.y - RL.y)/RL.w), 0., 1.);
    vec4 au = texture(TA, su); float ms = clamp(au.r*1.5, 0., 1.); float cm = smoothstep(.12, .4, au.g);   /* cm: Christ himself */
    vec2 hc = vec2(RL.x + HALO.x*RL.z, RL.y + (1. - HALO.y)*RL.w); float hr = HALO.z*RL.z;
    float hd = length((vp - hc)*vec2(1., 1.08));
    float halo = smoothstep(hr*.16, 0., abs(hd - hr*1.45)) * step(hc.y - hr*.55, vp.y);   /* a glitching halo ring behind his head */
    ms = max(ms, halo*.6) * (1. - cm);                   /* the glitch stays behind him */
    if (wS*ms > .01) { vec3 c = glitch(TL, TN, FN_, TD, FD_, RL, vp, 2.2, 13.); float g_ = wS*ms*GA; col += c*g_; a += g_; }
    // the halo itself: a ring of gold light behind his head, split into colour and torn by the scan like a signal from heaven
    float hfr = floor(T*12.), hb = floor(vp.y*160.);
    float hj = (hh(hb + hfr) - .5) * hr * .22 * step(.55, hh(floor(vp.y*40.) + hfr*.7));
    float rr = length((vp + vec2(hj, 0.) - hc - vec2(hr*.05, 0.))*vec2(1., 1.08)), rg = length((vp + vec2(hj, 0.) - hc)*vec2(1., 1.08)), rb = length((vp + vec2(hj, 0.) - hc + vec2(hr*.05, 0.))*vec2(1., 1.08));
    float w = hr*.07, R0 = hr*1.45, up = smoothstep(hc.y - hr*.7, hc.y - hr*.35, vp.y);
    vec3 ring = vec3(exp(-pow((rr - R0)/w, 2.)), exp(-pow((rg - R0)/w, 2.)), exp(-pow((rb - R0)/w, 2.))) * up;
    ring += vec3(1., .85, .5) * exp(-pow((rg - R0)/(w*4.), 2.)) * .35 * up;                      // its soft glow
    ring *= 1. - cm;
    float hv = wS * clamp(max(max(ring.r, ring.g), ring.b), 0., 1.) * (.75 + .25*hh(hb*.3 + hfr));
    if (hv > .01) { col += vec3(1., .9, .62)*ring*3.*wS + vec3(.2,.1,0.)*ring.r; a += hv; }
    if (a < .01) discard;
    o = vec4(col/a, clamp(a*1.35, 0., 1.) * burst);
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
    const u = {}; for (const n of ['A', 'T', 'MIX', 'MIX2', 'BOIL', 'B', 'RN', 'RD', 'RL', 'LJ', 'GL', 'MOON', 'LC', 'FINE[0]', 'TN', 'FN', 'TD', 'FD', 'TL', 'FL', 'TG', 'TA', 'FN_', 'FD_', 'FL_', 'HALO']) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }
  const SP = prog(VS, FS), BG = prog(VS_BG, FS_BG), GLX = prog(VS_BG, FS_GL);

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
  const tex = { TN: texture(nightImg), FN: texture(nightFlow), TD: texture(dayImg), FD: texture(dayFlow), TL: texture(supImg), FL: texture(supFlow), TG: texture(riftImg), TA: texture(auraImg) };

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
  let A = 1, RN = [0, 0, 1, 1], RD = [0, 0, 1, 1], RL = [0, 0, 1, 1], LC = [.5, .5], LJ = [.5, .5], GLp = [.5, .5], MOON = meta.moon;
  const FINE = new Float32Array([].concat(...(meta.dayFine || []).slice(0, 4), ...Array(12).fill(0)).slice(0, 12));
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
    GLp = [RN[0] + MOON[0] * RN[2], RN[1] + (1 - MOON[1]) * RN[3]];
    RL = cover(supImg, meta.supperFocus);
    LJ = [RL[0] + meta.christ[0] * RL[2], RL[1] + (1 - meta.christ[1]) * RL[3]];
  }

  /* strokes: three passes, broad underpainting → body → fine top marks */
  let vao, count = 0; const SEG = 8;
  function readAlpha(im) {          // the detail map (alpha of a flow map), read once on the CPU
    if (im._a) return im._a;
    const c = document.createElement('canvas'); c.width = Math.min(360, im.width); c.height = Math.round(c.width * im.height / im.width);
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data, a = new Uint8Array(c.width * c.height);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    return (im._a = { a, w: c.width, h: c.height });
  }
  function lay() {
    A = canvas.clientWidth / canvas.clientHeight; place();
    // a narrow screen shows the figures smaller, so it gets a smaller brush (and more strokes to cover)
    const narrow = A < .8, sm = narrow ? .6 : 1;
    const passes = [[260, .16 * sm, .045 * sm], [1100, .075 * sm, .026 * sm], [5600, .04 * sm, .014 * sm], [7200, .021 * sm, .008 * sm]];
    const k = A * (narrow ? 1.9 : 1);
    const data = [];
    let seed = 1; const r = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    for (const [n, len, wid] of passes) {
      const N = Math.round(n * k), cols = Math.ceil(Math.sqrt(N * A)), rows = Math.ceil(N / cols);
      for (let i = 0; i < N; i++) {
        const x = (i % cols + r()) / cols, y = (Math.floor(i / cols) + r()) / rows;
        const g = Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.2832 * r());   // a wide spread of sizes
        const f = Math.min(2.4, Math.max(.4, Math.exp(g * .42)));
        data.push(x * 1.04 - .02, y * 1.04 - .02, r(), r(), r(), r(), len * f, wid * f);
      }
    }
    // the figures are painted, not sprinkled: where a painting has detail (faces, hands, folds), lay many more
    // small strokes, in proportion to the detail, so the form is built entirely out of paint
    const dens = [[dayFlow, RD], [nightFlow, RN], [supFlow, RL]].map(([im, R]) => ({ R, ...readAlpha(im) }));
    const detailAt = (x, y) => { let m = 0; for (const d of dens) {
      const u = (x * A - d.R[0]) / d.R[2], v = 1 - (y - d.R[1]) / d.R[3];
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      m = Math.max(m, d.a[Math.min(d.h - 1, v * d.h | 0) * d.w + Math.min(d.w - 1, u * d.w | 0)] / 255); }
      for (let i = 0; i < 4; i++) { const fu = FINE[i * 3], fv = FINE[i * 3 + 1], fr = FINE[i * 3 + 2]; if (!fr) continue;
        const u = (x * A - RD[0]) / RD[2], v = 1 - (y - RD[1]) / RD[3];
        if (Math.hypot(u - fu, (v - fv) * RD[3] / RD[2]) < fr * 1.6) m = Math.max(m, .9); }
      return m; };
    const NX = Math.round(42000 * A * (narrow ? 2.2 : 1));
    for (let i = 0; i < NX; i++) {
      const x = r(), y = r(), dv = detailAt(x, y);
      if (r() > Math.pow(Math.max(0, dv - .06) / .6, 1.1)) continue;
      const f = .7 + r() * .6;
      data.push(x * 1.04 - .02, y * 1.04 - .02, r(), r(), r(), r(), .05 * sm * f, .018 * sm * f);
    }
    const NF = Math.round(70000 * A * (narrow ? 2.2 : 1));     // and the finest touches, only where the detail is highest
    for (let i = 0; i < NF; i++) {
      const x = r(), y = r(), dv = detailAt(x, y);
      if (dv < .45 || r() > (dv - .45) / .4) continue;
      const f = .75 + r() * .5;
      data.push(x * 1.04 - .02, y * 1.04 - .02, r(), r(), r(), r(), .055 * sm * f, .02 * sm * f);
    }
    count = data.length / 8;
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    const strip = []; for (let i = 0; i <= SEG; i++) { const x = -.5 + i / SEG; strip.push(x, -.5, x, .5); }   // a bendable stroke
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(strip), gl.STATIC_DRAW);
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
    gl.uniform1f(P.u.A, A); gl.uniform4fv(P.u.RN, RN); gl.uniform4fv(P.u.RD, RD); gl.uniform4fv(P.u.RL, RL); gl.uniform2fv(P.u.LJ, LJ); if (P.u.HALO) gl.uniform3fv(P.u.HALO, meta.halo || [0, 0, 0]); if (P.u.FN_) { gl.uniform2fv(P.u.FN_, [MOON[0], 1 - MOON[1]]); gl.uniform2fv(P.u.FD_, [meta.hands[0], 1 - meta.hands[1]]); gl.uniform2fv(P.u.FL_, [meta.christ[0], 1 - meta.christ[1] - .06]); } gl.uniform2fv(P.u.GL, GLp); gl.uniform3fv(P.u.MOON, MOON); gl.uniform3fv(P.u['FINE[0]'], FINE); gl.uniform2fv(P.u.LC, LC);
    ['TN', 'FN', 'TD', 'FD', 'TL', 'FL', 'TG', 'TA'].forEach((n, i) => { gl.activeTexture(gl.TEXTURE1 + i); gl.bindTexture(gl.TEXTURE_2D, tex[n]); gl.uniform1i(P.u[n], 1 + i); });
  }

  const gt = (location.search.match(/[?&]gt=([\d.]+)/) || [])[1];   // test hook: ?gt=2.3 freezes the glitch clock
  const pin = (location.search.match(/[?&]p=([\d.]+)/) || [])[1];   // test hook: ?p=0.9 holds the scroll at 90%
  let cur = 0, forced = pin ? +pin : null, last = performance.now(), running = true;
  const target = () => { const m = document.documentElement.scrollHeight - innerHeight; return m > 0 ? Math.min(1, Math.max(0, scrollY / m)) : 0; };
  const smooth = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
  function frame(now, once) {
    if (!running) return;
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    const goal = forced ?? target();
    cur = still || forced !== null ? goal : cur + (goal - cur) * (1 - Math.exp(-dt * 3.2));
    const mix = smooth(.1, .36, cur), mix2 = smooth(.5, .7, cur);     // night → day → the Last Supper
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    gl.useProgram(BG.p); bind(BG); gl.uniform1f(BG.u.MIX, mix); gl.uniform1f(BG.u.MIX2, mix2);
    gl.bindVertexArray(bgVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(SP.p); bind(SP);
    gl.uniform1f(SP.u.T, still ? 0 : now / 1000); gl.uniform1f(SP.u.MIX, mix); gl.uniform1f(SP.u.MIX2, mix2); gl.uniform1f(SP.u.BOIL, still ? 0 : 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, brush); gl.uniform1i(SP.u.B, 0);
    gl.bindVertexArray(vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, (SEG + 1) * 2, count);
    gl.disable(gl.DEPTH_TEST); gl.useProgram(GLX.p); bind(GLX);
    gl.uniform1f(GLX.u.MIX, mix); gl.uniform1f(GLX.u.MIX2, mix2); gl.uniform1f(GLX.u.T, gt ? +gt : still ? 3. : now / 1000);
    gl.bindVertexArray(bgVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!once) requestAnimationFrame(frame);
  }
  resize();
  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { last = performance.now(); requestAnimationFrame(frame); } });
  cur = target();
  requestAnimationFrame(t => { frame(t); ready(); });
  window.__scene = { renderAt: p => { forced = p; frame(performance.now(), true); } };
}
