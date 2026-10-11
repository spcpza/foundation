// Screenshots of the page at scroll stops, phone + desktop. Server on :8787. OUT=dir (default shots/)
import puppeteer from 'puppeteer';
import fs from 'fs';
const out = process.env.OUT || 'shots/'; fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const stops = (process.env.STOPS || '0,0.12,0.25,0.4,0.55,0.7,0.85,1').split(',').map(Number);
for (const [name, vp] of [['phone', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['desk', { width: 1440, height: 900 }]]) {
  const p = await b.newPage(); await p.setViewport(vp);
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => ['error', 'warning'].includes(m.type()) && errs.push(m.text()));
  await p.goto('http://localhost:8787/', { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => window.__scene, { timeout: 30000 }); await new Promise(r => setTimeout(r, 1800));
  const H = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  for (const [i, f] of stops.entries()) {
    await p.evaluate(y => window.scrollTo(0, y), Math.round(H * f));
    await new Promise(r => setTimeout(r, 1600));
    await p.evaluate(f => window.__scene.renderAt(f), f);
    await p.screenshot({ path: `${out}${name}-${i}.jpg`, quality: 80 });
  }
  console.log(name, 'scroll', H, 'errors', errs);
}
await b.close();
