/* solichin.org — a living painting.
   Thousands of brushstrokes, painted live in WebGL2, each one laid along the current of the picture
   the way Van Gogh laid his. It opens on a starry night; scrolling repaints the canvas stroke by stroke
   into the city that hath foundations, whose builder and maker is God (Heb 11:10; Rev 21-22).
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
const ready = () => requestAnimationFrame(() => root.classList.add('ready'));

/* ---------------- the painting ---------------- */
const canvas = document.getElementById('scene');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, depth: true });
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
  // where things sit: the composition lives in a centred square on wide screens
  float W(){ return min(A, 1.0); }
  float X(float f){ return A*.5 + (f-.5)*W(); }
  // the twelve foundation stones of the city, in order (Rev 21:19-20)
  vec3 gem(int i){
    vec3 G[12];
    G[0]=vec3(.42,.70,.56); G[1]=vec3(.14,.30,.80); G[2]=vec3(.62,.72,.84); G[3]=vec3(.08,.62,.36);   // jasper, sapphire, chalcedony, emerald
    G[4]=vec3(.74,.38,.26); G[5]=vec3(.76,.12,.14); G[6]=vec3(.82,.78,.24); G[7]=vec3(.34,.76,.78);   // sardonyx, sardius, chrysolite, beryl
    G[8]=vec3(.96,.70,.22); G[9]=vec3(.46,.74,.32); G[10]=vec3(.92,.46,.14); G[11]=vec3(.56,.30,.74); // topaz, chrysoprasus, jacinth, amethyst
    return G[i];
  }
  // the foundation: three courses of great cut stones, each one of the twelve. Same place in both pictures.
  const float F0 = .385, FH = .04, FTOP = .385 + 3.*.04;
  bool foundation(vec2 p, out vec3 c, out vec2 dir){
    float x0 = X(.08), x1 = X(.92);
    if (p.x < x0 || p.x > x1 || p.y < F0 || p.y > FTOP) return false;
    float cy = (p.y - F0)/FH, course = floor(cy), bl = .15*W();
    float bx = (p.x - x0)/bl + mod(course, 2.)*.5, block = floor(bx);
    c = gem(int(mod(course*5. + block*7. + 3., 12.)));
    float fy = fract(cy), fx = fract(bx);
    c *= .78 + .38*smoothstep(.0, .9, fy);                                    // lit from above, shadowed at the foot
    c = mix(c, vec3(1.,.98,.92), smoothstep(.82, .97, fy)*.35);               // the bevel catching the light
    c = mix(c, c*1.35 + .08, smoothstep(.06, .0, abs(fx - .3 - .2*fy))*.5);  // a polished glint across the face
    float edge = min(min(fx, 1. - fx)*bl, min(fy, 1. - fy)*FH);
    c = mix(vec3(.08,.07,.16), c, smoothstep(.0015, .0045, edge));            // dark joints between the stones
    dir = vec2(1., .06*sin(p.x*40. + course));
    return true;
  }
  float seg(vec2 p, vec2 a, vec2 b, float r){ vec2 pa = p-a, ba = b-a; float h = clamp(dot(pa,ba)/dot(ba,ba), 0., 1.); return length(pa - ba*h) - r; }

  // ---- I. the night: the foundations laid, under the bright and morning star (Rev 22:16) ----
  vec3 night(vec2 p, out vec2 dir){
    float hz = .41 + .03*sin(p.x/W()*6.+.5) + .015*sin(p.x/W()*15.);
    float n = fbm(p*vec2(5., 9.));
    vec3 col; dir = vec2(1., .18*sin(p.x/W()*5.+1.));
    vec2 mc = vec2(A*.5, .655);                                     // where the morning star stands
    if (p.y > hz) {
      col = mix(vec3(.07,.13,.38), vec3(.20,.34,.66), clamp((p.y-hz)*1.1 + .35*n, 0., 1.));
      // the great swirl, high in the sky
      float line = .82 + .05*sin(p.x/W()*4.6 + .8);
      float band = exp(-pow((p.y-line)/.06, 2.));
      col = mix(col, vec3(.48,.64,.86), band*.75*(.6+.6*n));
      dir += vec2(0., .5*cos(p.x/W()*4.6+.8)) * band;
      vec2 V[2]; V[0] = vec2(X(.30), .8); V[1] = vec2(X(.70), .84);
      float R[2]; R[0] = .09; R[1] = .07;
      for (int i = 0; i < 2; i++) { vec2 d = p - V[i]; float L = length(d);
        float w = exp(-L*L/(R[i]*R[i]*1.6)); dir += 5.*w*normalize(perp(d)+1e-4);
        float ring = exp(-pow((L - R[i]*.62)/(R[i]*.22), 2.)); col = mix(col, vec3(.62,.76,.93), ring*.75);
        col = mix(col, vec3(.16,.27,.58), exp(-L*L/(R[i]*R[i]*.08))*.8); }
      // seven stars (Rev 1:20)
      vec3 S[7]; S[0]=vec3(.10,.93,.02); S[1]=vec3(.22,.66,.018); S[2]=vec3(.50,.93,.022); S[3]=vec3(.86,.66,.02);
      S[4]=vec3(.36,.56,.015); S[5]=vec3(.66,.55,.016); S[6]=vec3(.94,.91,.018);
      for (int i = 0; i < 7; i++) { vec2 c = vec2(X(S[i].x), S[i].y); float r = S[i].z; vec2 d = p - c; float L = length(d);
        dir += 6.*exp(-L*L/(r*r*7.))*normalize(perp(d)+1e-4);
        col = mix(col, vec3(.93,.93,.72), exp(-pow((L-r*1.9)/(r*.55), 2.))*.85);
        col = mix(col, vec3(1.,.86,.32), smoothstep(r, r*.35, L)); if (L < r*2.6) DET = min(DET, .7); }
      // the morning star: the greatest of the lights, ring upon ring of white fire
      vec2 md = p - mc; float ml = length(md);
      col = mix(col, vec3(.55,.70,.95), exp(-ml*ml/.02)*.45);
      col = mix(col, vec3(.90,.94,.98), exp(-pow((ml-.075)/.016, 2.))*.8);
      col = mix(col, vec3(.98,.96,.80), exp(-pow((ml-.045)/.011, 2.))*.9);
      col = mix(col, vec3(1.,1.,.94), smoothstep(.026, .012, ml));
      dir = normalize(mix(dir, perp(md), exp(-ml*ml/.03)) + 1e-4);
      if (ml < .11) DET = min(DET, mix(.5, 1., ml/.11));
    } else {
      // the dark earth the foundations are laid in
      col = mix(vec3(.05,.10,.17), vec3(.15,.24,.28), n*.8 + (p.y/hz)*.3);
      dir = vec2(1., .3*sin(p.x/W()*9. + p.y*24.));
    }
    // the foundations, laid in the night: the jewels only catch the starlight
    vec3 fc; vec2 fd;
    if (foundation(p, fc, fd)) {
      float lit = .12 + .42*exp(-pow(length(p - mc)/.35, 2.)) + .12*smoothstep(FTOP - .012, FTOP, p.y);
      col = mix(vec3(.04,.06,.14), mix(fc, vec3(dot(fc, vec3(.33))), .35), lit); dir = fd; DET = .6;
    }
    // the cypress, a dark flame from the ground to the stars
    float cx = X(.06) + .02*sin(p.y*11.) + .008*sin(p.y*37.);
    float top = .95, wid = .1*W()*pow(max(0., 1. - p.y/top), .55)*(.78 + .22*sin(p.y*46.)) + .012*sin(p.y*23.+p.x*9.);
    if (abs(p.x - cx) < wid) {
      float e = abs(p.x - cx)/max(wid, 1e-4);
      col = mix(vec3(.05,.12,.08), vec3(.20,.33,.17), vn(p*vec2(30.,60.))*(1.-e*.5));
      col = mix(col, vec3(.35,.42,.18), step(.86, vn(p*vec2(40.,90.)))*.6);
      dir = vec2(.32*sin(p.y*34. + p.x*60.), 1.); DET = .7;
    }
    return col;
  }

  // a pilgrim in a white robe with a palm branch raised (Rev 7:9), walking toward the city; feet at 0, height 1
  float pilgrim(vec2 q, float stride, out vec3 c){
    // a white robe (Rev 7:9): narrow at the shoulders, falling wide to the hem, a gold sash at the waist
    float hw = .085 + .075*clamp(1. - q.y/.66, 0., 1.) + .01*sin(q.y*30.)*stride;
    float robe = max(abs(q.x - .02*q.y) - hw, max(-q.y, q.y - .66));
    robe = min(robe, seg(q, vec2(-.05,.60), vec2(.09,.60), .06));         // shoulders
    float arm = seg(q, vec2(.08,.60), vec2(.17,.86), .042);
    float head = length(q - vec2(.03,.78)) - .09;
    float stem = seg(q, vec2(.17,.84), vec2(.22,1.26), .02);
    float frond = 1e3;                                                    // the palm branch: leaves along the stem
    for (int k = 0; k < 5; k++) { float t = float(k)/4.; vec2 a = mix(vec2(.18,.94), vec2(.22,1.26), t);
      frond = min(frond, min(seg(q, a, a + vec2(.13, -.05 + .02*t), .022), seg(q, a, a + vec2(-.10, -.05 + .02*t), .022))); }
    float palm = min(stem, frond);
    float d = min(min(robe, arm), min(palm, head));
    if (d == palm) c = vec3(.30,.70,.26);
    else if (d == head) c = q.y > .8 || q.x < .0 ? vec3(.22,.14,.10) : vec3(.86,.60,.40);   // dark hair, face to the light
    else c = abs(q.y - .42) < .025 && d == robe ? vec3(.98,.78,.30) : vec3(1.,.99,.96);
    return d;
  }

  // ---- II. the morning: the city that hath foundations (Heb 11:10; Rev 21-22) ----
  // a box with a dark painted contour, Van Gogh's way with buildings; returns 1 inside, sets the edge distance
  float box(vec2 p, vec2 lo, vec2 hi, out float edge){
    vec2 a = p - lo, b = hi - p; edge = min(min(a.x, b.x), min(a.y, b.y)); return step(0., edge);
  }
  vec3 dawn(vec2 p, out vec2 dir){
    vec2 sc = vec2(A*.5, .655); vec2 d = p - sc; float L = length(d);
    float n = fbm(p*vec2(6., 9.));
    vec3 INK = vec3(.10,.14,.38);
    vec3 col;
    // the sky: no sun, for the city is the light (Rev 21:23); an emerald bow round about (Rev 4:3)
    col = mix(vec3(1.,.95,.72), vec3(.58,.78,.68), smoothstep(.05, .7, L));
    col += .06*sin(L*100. - n*2.) * vec3(1.,.9,.6) * smoothstep(.6, .1, L);
    float bow = exp(-pow((L - .33*max(.85, W()))/.026, 2.)) * smoothstep(sc.y - .06, sc.y + .06, p.y);
    col = mix(col, vec3(.14,.70,.42), bow*.85);
    dir = normalize(perp(d) + 1e-4);
    dir = normalize(mix(dir, vec2(1., .45*sin(p.x*7. + p.y*11.) + .3*(n-.5)), smoothstep(.45, .8, L)));
    if (bow > .3) DET = .7;
    // ground on either side
    if (p.y < F0 + .01) { col = mix(vec3(.40,.62,.24), vec3(.74,.82,.36), n); dir = vec2(.25*sin(p.x*40.), 1.); }
    // the city
    float cw = .40*W(), wallTop = FTOP + .085, e, inside = 0.;
    vec3 GOLD = mix(vec3(.98,.76,.26), vec3(1.,.90,.52), vn(p*vec2(50., 14.)));
    GOLD = mix(GOLD, vec3(.78,.90,.98), smoothstep(.75, .95, vn(p*vec2(18., 120.)))*.45);   // gold like clear glass
    // towers behind the wall, the middle one highest
    for (int i = 0; i < 7; i++) {
      float f = float(i) - 3., tx = A*.5 + f*.105*W(), tw = (i == 3 ? .05 : .036)*W();
      float th = wallTop + (i == 3 ? .15 : .055 + .035*(1. - abs(f)/3.) + .02*mod(float(i), 2.));
      if (box(p, vec2(tx - tw, wallTop - .01), vec2(tx + tw, th), e) > 0.) {
        inside = 1.; col = GOLD*.95; dir = vec2(.06*sin(p.y*80.), 1.); DET = .4;
        vec2 wq = (p - vec2(tx, wallTop))/vec2(tw, .02);
        if (abs(fract(wq.x*1.2 + .5) - .5) < .17 && fract(wq.y) > .35 && fract(wq.y) < .8 && p.y < th - .012) col = vec3(1.,1.,.92);   // lit windows
        col = mix(INK, col, smoothstep(.0012, .004, e));
      }
      // a roof: a pointed top on each tower
      vec2 rq = p - vec2(tx, th); float rh = tw*(i == 3 ? 2.2 : 1.4);
      if (rq.y > 0. && rq.y < rh && abs(rq.x) < tw*(1. - rq.y/rh)) {
        inside = 1.; col = mix(vec3(.96,.62,.20), vec3(1.,.86,.40), vn(p*vec2(70.,70.))); dir = normalize(vec2(sign(rq.x), 1.4)); DET = .45;
        float re = tw*(1. - rq.y/rh) - abs(rq.x); col = mix(INK, col, smoothstep(.001, .0035, re));
      }
    }
    // the wall of gold with its battlements
    float merlon = step(.5, fract((p.x - A*.5)/(.03*W())));
    if (box(p, vec2(A*.5 - cw, FTOP), vec2(A*.5 + cw, wallTop + .012*merlon), e) > 0.) {
      inside = 1.; col = GOLD; dir = vec2(1., .05*sin(p.x*60.)); DET = .5;
      float row = fract((p.y - FTOP)/.017); col *= .92 + .1*smoothstep(.0, .2, row);
      col = mix(INK, col, smoothstep(.0012, .004, e));
      // three gates of pearl (Rev 21:21), the middle one open with light
      for (int g = -1; g <= 1; g++) {
        float gx = A*.5 + float(g)*.24*W(), gw = (g == 0 ? .04 : .028)*W(), gh = .055;
        vec2 gq = p - vec2(gx, FTOP);
        float arch = gq.y < gh - gw ? gw - abs(gq.x) : gw - length(gq - vec2(0., gh - gw));
        if (arch > 0.) {
          col = mix(vec3(.93,.91,.96), vec3(1.,.88,.92), vn(p*vec2(90.,90.)));
          col = mix(col, vec3(.80,.90,1.), smoothstep(.6, .9, vn(p*vec2(40., 140.)))*.5);
          if (g == 0) col = mix(col, vec3(1.,1.,.94), smoothstep(gw*.15, gw*.8, arch));
          col = mix(INK, col, smoothstep(.0012, .004, arch));
          dir = normalize(vec2(gq.x, .6)); DET = .4;
        }
      }
    }
    // the foundations, in full colour now
    vec3 fc; vec2 fd;
    if (foundation(p, fc, fd)) { col = fc*1.12; dir = fd; DET = .5; inside = 1.; }
    // below: the river of life, clear as crystal, flowing out to us (Rev 22:1)
    if (p.y < F0) {
      float rx = A*.5 + .025*sin(p.y*12. + 1.) * (1. - p.y/F0);
      float rw = mix(.30*W(), .03*W(), pow(p.y/F0, .8));
      float r = abs(p.x - rx)/rw;
      if (r < 1.) {
        col = mix(vec3(.66,.86,1.), vec3(.28,.52,.88), vn(p*vec2(26., 60.))*.8);
        col = mix(col, vec3(1.,.98,.9), smoothstep(.62, 1., vn(p*vec2(50.,140.)))*.6);
        dir = normalize(vec2((p.x - rx)*1.2, -1.));
      } else {
        col = mix(vec3(.36,.60,.22), vec3(.72,.82,.34), n);
        col = mix(col, vec3(1.,.95,.62), step(.9, vn(p*vec2(110.,110.)))*.6);   // flowers
        dir = vec2(.25*sin(p.x*40.), 1.);
        if (r < 1.12) { col = mix(col, vec3(.85,.80,.55), .5); }               // the bank
      }
      // trees of life on either side of the river, bearing twelve manner of fruits (Rev 22:2)
      for (int i = 0; i < 4; i++) {
        float side = i < 2 ? -1. : 1., k = mod(float(i), 2.);
        float ty = mix(.30, .20, k), tr = mix(.042, .062, k)*max(.85, W());
        float tx = A*.5 + side*(mix(.13, .25, k)*W() + .02);
        vec2 tc = vec2(tx, ty + tr*1.5), tq = p - tc;
        float crown = length(tq*vec2(.9, 1.)) - tr;
        if (abs(p.x - tx) < tr*.15 && p.y < tc.y && p.y > ty) { col = vec3(.32,.20,.12); dir = vec2(0., 1.); DET = .5; }
        if (crown < 0.) {
          col = mix(vec3(.10,.42,.18), vec3(.42,.72,.26), vn(p*vec2(60.,60.)));
          float fr = h21(floor(p*vec2(150., 150.)));
          if (fr > .84) col = gem(int(mod(floor(fr*997.), 12.)));
          col = mix(INK, col, smoothstep(0., .004, -crown));
          dir = normalize(perp(tq) + 1e-4); DET = .45;
        }
      }
      // the nations walking in the light of it (Rev 21:24)
      vec4 P[8];
      P[0]=vec4(.17,.20,.085,1.); P[1]=vec4(.27,.11,.12,1.); P[2]=vec4(.07,.03,.16,1.); P[3]=vec4(.34,.26,.065,1.);
      P[4]=vec4(.83,.21,.085,-1.); P[5]=vec4(.73,.11,.12,-1.); P[6]=vec4(.93,.03,.16,-1.); P[7]=vec4(.66,.26,.065,-1.);
      for (int i = 0; i < 8; i++) {
        if (A < .8 && (i == 3 || i == 7)) continue;
        float S = P[i].z * (.5 + .5*W()); vec2 o = vec2(X(P[i].x), P[i].y);
        if (abs(p.x - o.x) > S*.6 + .05 || p.y < o.y - .05 || p.y > o.y + 1.3*S + .05) continue;
        vec2 q = (p - o)/S; q.x *= P[i].w;
        vec3 c; float dd = pilgrim(q, .8 + .4*h21(vec2(float(i), 3.)), c);
        if (dd < 0.) { col = mix(INK, c*(.92 + .1*vn(p*vec2(90.,90.))), smoothstep(-.0, -.014, dd)); dir = vec2(.1, 1.); DET = clamp(S*2.2, .3, .45); }
        else DET = min(DET, mix(clamp(S*2.4, .25, .55), 1., smoothstep(0., .04, dd*S)));
      }
    }
    if (inside < .5 && abs(p.x - A*.5) < cw + .03 && p.y > FTOP - .02 && p.y < wallTop + .25) DET = min(DET, .75);
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
    float order = .5*rnd.x + .5*clamp(length(p - vec2(A*.5, .655))/1.1, 0., 1.);   // repainted outward from the light
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
    float a = b.a;
    if (a < .3) discard;
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
    vec2 d1, d2; float m = smoothstep(.15, .9, MIX);
    DET = 1.; vec3 cn = night(vp, d1); float dn = DET; DET = 1.; vec3 cd = dawn(vp, d2); float dd = DET;
    vec3 c = mix(cn, cd, m);
    float fine = 1. - smoothstep(.4, .75, mix(dn, dd, m));     // where a small brush works, the ground beneath is already painted
    float weave = .5 + .5*sin(vp.x*900.)*sin(vp.y*900.);                 // the canvas showing through
    o = vec4(c*mix(.62, .97, fine) + vec3(.05,.04,.03)*weave*(1. - fine), 1.);
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
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    gl.useProgram(BG.p); gl.uniform1f(BG.u.A, A); gl.uniform1f(BG.u.MIX, mix);
    gl.bindVertexArray(bgVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.clear(gl.DEPTH_BUFFER_BIT);
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
