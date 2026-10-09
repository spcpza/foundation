// Proof for the 3D drone: bytes, errors, fps (normal + 4x CPU throttle), waypoint shots, parallax pairs, desktop, full-loop frames.
import puppeteer from 'puppeteer';
import fs from 'fs';
const BASE='http://localhost:8787/', OUT='proof/';
const ARGS=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:ARGS});
const R={}, errs=[];
const PHONE={width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true};
async function page(vp){const p=await b.newPage();
  p.on('console',m=>{if(['error','warning'].includes(m.type()))errs.push(m.type()+': '+m.text())});
  p.on('pageerror',e=>errs.push('pageerror: '+e.message)); p.on('requestfailed',r=>errs.push('failed '+r.url()));
  p.on('response',r=>{if(r.status()>=400)errs.push(r.status()+' '+r.url())}); await p.setViewport(vp); return p;}
const ready=async p=>{await p.waitForFunction(()=>window.__drone,{timeout:60000});await p.waitForFunction(()=>document.getElementById('words').dataset.done==='1');await new Promise(r=>setTimeout(r,1800));};
const fpsProbe=p=>p.evaluate(()=>new Promise(res=>{const d=[];let l=performance.now();const f=n=>{d.push(n-l);l=n;if(d.length<150)requestAnimationFrame(f);else{d.sort((a,b)=>a-b);const avg=d.reduce((a,b)=>a+b)/d.length;res({fps:+(1000/avg).toFixed(1),medianMs:+d[75].toFixed(1),p95Ms:+d[142].toFixed(1)})}};requestAnimationFrame(f)}));
// 1) first load bytes + fps
{ const p=await page(PHONE);
  const c=await p.createCDPSession(); await c.send('Network.enable'); await c.send('Network.setCacheDisabled',{cacheDisabled:true});
  const q={}; let tot=0; c.on('Network.responseReceived',e=>q[e.requestId]={url:e.response.url.replace(BASE,'/'),mime:e.response.mimeType});
  c.on('Network.loadingFinished',e=>{tot+=e.encodedDataLength;if(q[e.requestId])q[e.requestId].bytes=e.encodedDataLength});
  await p.goto(BASE,{waitUntil:'networkidle0'}); await ready(p);
  R.firstLoadBytes=tot; R.requests=Object.values(q).filter(x=>!x.url.startsWith('data:'));
  R.fps_swiftshader_dpr3=await fpsProbe(p);
  await c.send('Emulation.setCPUThrottlingRate',{rate:4});
  R.fps_swiftshader_dpr3_cpu4x=await fpsProbe(p);
  await c.send('Emulation.setCPUThrottlingRate',{rate:1});
  R.loopSeconds=await p.evaluate(()=>window.__drone.LOOP);
  R.waypoints=await p.evaluate(()=>window.__drone.keyTimes());
  // 2) waypoint stills
  const names=['gods-face','gods-shoulder','fingertip','orbit-the-light','adams-arm','adams-face','low-under-adam','low-past-lake','left-side-climb','back-to-light','cherubs','cherubs-up','arc-over-top'];
  for(const [i,t] of R.waypoints.entries()){await p.evaluate(t=>window.__drone.render(t),t);
    await p.screenshot({path:`${OUT}drone-wp${String(i+1).padStart(2,'0')}-t${t}s-${names[i]}.jpg`,quality:85});}
  // 3) parallax pairs: same target, two moments 1.2 s apart
  for(const t of [7.0,19.5]){for(const dt of [0,1.2]){await p.evaluate(t=>window.__drone.render(t),t+dt);await p.screenshot({path:`/tmp/par-${t}-${dt}.png`});}}
  await p.close(); }
// 4) desktop
{ const p=await page({width:1440,height:900}); await p.goto(BASE,{waitUntil:'networkidle0'}); await ready(p);
  await p.evaluate(()=>window.__drone.render(6.5)); await p.screenshot({path:OUT+'drone-desktop-1440x900.jpg',quality:85}); await p.close(); }
// 5) reduced motion + no-webgl fallback
{ const p=await page(PHONE); await p.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await p.goto(BASE,{waitUntil:'networkidle0'}); await new Promise(r=>setTimeout(r,1500));
  R.reducedMotion={droneLoaded:await p.evaluate(()=>!!window.__drone||!!document.querySelector('script[src="/drone.js"]'))};
  await p.screenshot({path:OUT+'drone-reduced-motion.jpg',quality:85}); await p.close(); }
{ const b2=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--disable-webgl','--disable-3d-apis']});
  const p=await b2.newPage(); const e2=[]; p.on('pageerror',e=>e2.push(e.message)); await p.setViewport(PHONE);
  await p.goto(BASE,{waitUntil:'networkidle0'}); await new Promise(r=>setTimeout(r,3000));
  R.noWebGL={droneCanvas:await p.evaluate(()=>!!document.querySelector('canvas.drone.on')),pageErrors:e2};
  await p.screenshot({path:OUT+'drone-fallback-no-webgl.jpg',quality:85}); await b2.close(); }
R.errors=errs; fs.writeFileSync(OUT+'report-3d.json',JSON.stringify(R,null,2)); console.log(JSON.stringify(R,null,2));
// 6) full loop frames (deterministic render, 30 fps)
if(process.env.FRAMES){ const p=await page({width:390,height:844,deviceScaleFactor:2,isMobile:true}); await p.goto(BASE,{waitUntil:'networkidle0'}); await ready(p);
  fs.mkdirSync('/tmp/frames',{recursive:true}); const L=await p.evaluate(()=>window.__drone.LOOP); const n=Math.round(L*30);
  for(let i=0;i<n;i++){await p.evaluate(t=>window.__drone.render(t),i/30); await p.screenshot({path:`/tmp/frames/f${String(i).padStart(5,'0')}.jpg`,quality:88});}
  console.log('frames',n); await p.close(); }
await b.close();
