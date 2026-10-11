/* solichin.org — one light in the dark; scrolling opens the darkness until the two hands are seen,
   then the words light up as you read. Only transforms, opacity and one gradient change per frame,
   and nothing runs while nobody scrolls. */
(function () {
  'use strict';
  // where the light between the fingers sits in each crop (0..1), from tools/crops.py
  var LIGHT = { wide: [0.3294, 0.556], tall: [0.4684, 0.5284] };
  var INK = '12,9,7';
  // darkness around the light: [fraction of radius, opacity] — an inverse-square-ish falloff, no hard rim
  var FALL = [[0, 0], [0.12, 0.05], [0.28, 0.3], [0.5, 0.66], [0.75, 0.88], [1, 1]];

  var reveal = document.getElementById('reveal');
  var art = document.getElementById('art'), img = art.querySelector('img');
  var veil = document.getElementById('veil'), glow = document.getElementById('glow');
  var headline = document.getElementById('headline'), cue = document.getElementById('cue');
  var read = document.getElementById('read');
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- words of the statement, one span each ----------
  var GOLD = { faith: 1, in: 1, 'God.': 1 }, words = [];
  var text = read.textContent.trim().split(/\s+/);
  read.textContent = '';
  text.forEach(function (w, i) {
    var s = document.createElement('span'); s.className = 'w'; s.textContent = w;
    if (i >= text.length - 3 && GOLD[w]) s.classList.add('gold');
    read.appendChild(s); if (i < text.length - 1) read.appendChild(document.createTextNode(' '));
    words.push(s);
  });

  // ---------- layout ----------
  var vw, vh, iw, ih, L, s0, s1, a0, a1, revealTop, revealLen;
  function layout() {
    vw = window.innerWidth; vh = window.innerHeight;
    var tall = vw / vh < 1;
    iw = img.naturalWidth || (tall ? 982 : 1536); ih = img.naturalHeight || (tall ? 1446 : 982);
    L = LIGHT[iw / ih < 1 ? 'tall' : 'wide'];
    art.style.width = iw + 'px'; art.style.height = ih + 'px';
    var cover = Math.max(vw / iw, vh / ih);
    // start: very close on the light, centred. end: the whole crop, light where the painter put it.
    s0 = cover * 3.4; s1 = cover * 1.04;
    a0 = [vw * 0.5, vh * 0.44];
    var w1 = iw * s1, h1 = ih * s1;
    a1 = [clamp(L[0] * w1, vw - w1 + L[0] * w1, vw * 0.5) , clamp(L[1] * h1, vh - h1 + L[1] * h1, vh * 0.42)];
    revealTop = reveal.offsetTop; revealLen = reveal.offsetHeight - vh;
    words.forEach(function (w) { var r = w.getBoundingClientRect(); w._y = r.top + window.scrollY; });
  }
  function clamp(hi, lo, x) { return Math.max(lo, Math.min(hi, x)); }   // keep the image covering the screen
  function mix(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function band(a, b, x) { return Math.min(1, Math.max(0, (x - a) / (b - a))); }

  // ---------- one frame ----------
  function draw() {
    raf = 0;
    var y = window.scrollY;
    var p = still ? 1 : band(0, 1, (y - revealTop) / revealLen);
    var t = ease(band(0, 0.72, p));
    var s = mix(s0, s1, t);
    var lx = mix(a0[0], a1[0], t), ly = mix(a0[1], a1[1], t);       // where the light is on screen
    art.style.transform = 'translate3d(' + (lx - L[0] * iw * s).toFixed(1) + 'px,' + (ly - L[1] * ih * s).toFixed(1) + 'px,0) scale(' + s.toFixed(4) + ')';
    var diag = Math.hypot(vw, vh), r = mix(Math.min(vw, vh) * 0.16, diag * 1.15, Math.pow(t, 1.15));
    var dark = mix(0.985, 0.0, band(0.55, 1, t));
    r *= 1.6;   // the soft falloff needs a wider reach than a hard hole
    veil.style.background =
      'linear-gradient(to top,rgba(' + INK + ',' + (0.78 * band(0.5, 0.9, p)).toFixed(3) + ') 0%,rgba(' + INK + ',0) 55%),' +
      'radial-gradient(circle at ' + lx.toFixed(1) + 'px ' + ly.toFixed(1) + 'px,' + FALL.map(function (f) {   // soft, light-like falloff
        return 'rgba(' + INK + ',' + (f[1] * dark).toFixed(3) + ') ' + (f[0] * r).toFixed(1) + 'px'; }).join(',') + ')';
    glow.style.transform = 'translate3d(' + lx.toFixed(1) + 'px,' + ly.toFixed(1) + 'px,0)';
    glow.style.opacity = mix(1, 0.55, t).toFixed(3);
    headline.classList.toggle('on', p > 0.6);
    cue.classList.toggle('off', p > 0.02);
    // statement: a word lights when it rises past 62% of the screen
    var line = y + vh * 0.62;
    for (var i = 0; i < words.length; i++) words[i].classList.toggle('lit', still || words[i]._y < line);
  }
  var raf = 0;
  function kick() { if (!raf) raf = requestAnimationFrame(draw); }

  function init() { layout(); draw(); }
  if (img.complete && img.naturalWidth) init(); else { init(); img.addEventListener('load', init); }
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', function () { layout(); kick(); }, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(); kick(); });
})();
