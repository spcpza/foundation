import puppeteer from 'puppeteer';
import fs from 'fs';
const BASE='http://localhost:8787/';
const OUT='proof/';
const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const report={};
const errs=[];
async function newPage(vp,opts={}){
  const p=await browser.newPage();
  p.on('console',m=>{if(['error','warning'].includes(m.type()))errs.push(`[${vp.width}x${vp.height}] ${m.type()}: ${m.text()}`)});
  p.on('pageerror',e=>errs.push(`[${vp.width}x${vp.height}] pageerror: ${e.message}`));
  p.on('requestfailed',r=>errs.push(`requestfailed ${r.url()}`));
  p.on('response',r=>{if(r.status()>=400)errs.push(`HTTP ${r.status()} ${r.url()}`)});
  await p.setViewport(vp);
  if(opts.reduce) await p.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  return p;
}
// 1) phone first load: bytes + timeline
{
  const p=await newPage({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  const cdp=await p.createCDPSession(); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  const reqs={}; let total=0;
  cdp.on('Network.responseReceived',e=>{reqs[e.requestId]={url:e.response.url,mime:e.response.mimeType}});
  cdp.on('Network.loadingFinished',e=>{total+=e.encodedDataLength; if(reqs[e.requestId])reqs[e.requestId].bytes=e.encodedDataLength});
  await p.goto(BASE,{waitUntil:'domcontentloaded'});
  await p.screenshot({path:OUT+'phone-00-0s.png'});
  await p.waitForFunction(()=>document.getElementById('words').dataset.done==='1',{timeout:15000});
  const tDone=await p.evaluate(()=>performance.now());
  await new Promise(r=>setTimeout(r,2000));
  await p.screenshot({path:OUT+'phone-01-text-resolved+2s.png'});
  await p.waitForNetworkIdle();
  report.phoneFirstLoad={totalBytes:total,requests:Object.values(reqs),textResolvedAtMs:Math.round(tDone)};
  report.chosenImage=await p.evaluate(()=>document.getElementById('painting').currentSrc);
  // smoothness sample: frame intervals over 3s
  report.frames=await p.evaluate(()=>new Promise(res=>{const d=[];let l=performance.now();const f=n=>{d.push(n-l);l=n;if(d.length<180)requestAnimationFrame(f);else{d.sort((a,b)=>a-b);res({median:d[90].toFixed(1),p95:d[171].toFixed(1),max:d[179].toFixed(1)})}};requestAnimationFrame(f)}));
  await p.close();
}
// 1b) slow 3G (400 kbps down, 400 ms RTT): when is the painting sharp?
{
  const p=await newPage({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const cdp=await p.createCDPSession(); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:400,downloadThroughput:400*1024/8,uploadThroughput:400*1024/8});
  const t=Date.now();
  await p.goto(BASE,{waitUntil:'domcontentloaded'});
  const dcl=Date.now()-t;
  await p.waitForSelector('.stage.loaded',{timeout:60000});
  report.slow3G={domContentLoadedMs:dcl,paintingSharpMs:Date.now()-t};
  await p.close();
}
// 2) every waypoint of Fred's path (camera frozen with ?t=)
{
  const names=['gods-face','gods-shoulder-forearm','fingertip-and-light','adams-arm','adams-face','under-adams-body','bottom-left','over-the-lake','back-toward-light','cherubs','cherubs-up','arc-over-top'];
  const p=await newPage({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await p.goto(BASE+'?t=0',{waitUntil:'networkidle0'});
  const times=await p.evaluate(()=>window.__camera.keyTimes());
  report.waypointSeconds=times;
  let i=2;
  for(const [k,t] of times.entries()){
    await p.goto(BASE+'?t='+t,{waitUntil:'networkidle0'});
    await p.waitForFunction(()=>document.getElementById('words').dataset.done==='1');
    await new Promise(r=>setTimeout(r,1900));
    await p.screenshot({path:`${OUT}phone-${String(i++).padStart(2,'0')}-wp${k+1}-t${t}s-${names[k]}.png`});
  }
  await p.close();
}
// 3) desktop
{
  const p=await newPage({width:1440,height:900,deviceScaleFactor:1});
  await p.goto(BASE,{waitUntil:'networkidle0'});
  await p.waitForFunction(()=>document.getElementById('words').dataset.done==='1');
  await new Promise(r=>setTimeout(r,2000));
  await p.screenshot({path:OUT+'desktop-1440x900.png'});
  await p.close();
}
// 4) reduced motion
{
  const p=await newPage({width:390,height:844,deviceScaleFactor:3,isMobile:true},{reduce:true});
  await p.goto(BASE,{waitUntil:'networkidle0'});
  const a=await p.evaluate(()=>document.getElementById('stage').style.transform);
  await new Promise(r=>setTimeout(r,3000));
  const b=await p.evaluate(()=>document.getElementById('stage').style.transform);
  report.reducedMotionStatic=a===b; report.reducedTransform=b;
  await p.screenshot({path:OUT+'phone-reduced-motion.png'});
  await p.close();
}
// 5) screen recording (phone viewport, 1x so the file stays small)
{
  const p=await newPage({width:390,height:844,deviceScaleFactor:2,isMobile:true});
  await p.goto(BASE,{waitUntil:'domcontentloaded'});
  try{
    const rec=await p.screencast({path:OUT+'phone-loop.webm'});
    await new Promise(r=>setTimeout(r,38000));
    await rec.stop();
  }catch(e){report.screencastError=String(e)}
  await p.close();
}
report.consoleErrors=errs;
fs.writeFileSync(OUT+'report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
await browser.close();
