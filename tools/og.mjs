// Renders public/og.jpg (1200x630) from the scene at the dawn frame, words hidden. Server on :8787.
import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: 'new', args: ['--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 630 });
await p.goto('http://localhost:8787/', { waitUntil: 'networkidle0' }); await p.waitForFunction(() => window.__scene);
await p.addStyleTag({ content: '.copy,.nav{display:none!important}.atmos{background:radial-gradient(120% 85% at 50% 45%,transparent 45%,rgba(5,4,3,.6) 100%)!important}.atmos::after{display:none}' });
await new Promise(r => setTimeout(r, 1500));
await p.evaluate(() => window.__scene.renderAt(0.82));
await p.screenshot({ path: 'public/og.jpg', type: 'jpeg', quality: 86 });
// fps over 2 s of free running at the hero
const fps = await p.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); })(); }));
console.log('og written; fps (headless, this Mac):', fps);
await b.close();
