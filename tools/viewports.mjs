// Renders night (?p=0) and day (?p=0.9) at seven screen shapes, iPhone SE to ultra-wide. Server on :8787.
import puppeteer from 'puppeteer';
const out=process.env.OUT||'shots/viewports/'; import fs from 'fs'; fs.mkdirSync(out,{recursive:true});
const b=await puppeteer.launch({headless:'new',args:['--use-angle=metal']});
const V={iphoneSE:[375,667],iphone:[393,852],ipadP:[820,1180],ipadL:[1180,820],laptop:[1440,900],fhd:[1920,1080],ultra:[2560,1080]};
for (const [n,[w,h]] of Object.entries(V)) { const p=await b.newPage(); await p.setViewport({width:w,height:h,deviceScaleFactor:1});
  const e=[]; p.on('pageerror',x=>e.push(x.message));
  for (const f of [0,0.9]) { await p.goto(`http://localhost:8787/?p=${f}`,{waitUntil:'networkidle0'}); await new Promise(r=>setTimeout(r,1500)); await p.screenshot({path:`${out}${n}-${f}.jpg`,quality:70}); }
  if (e.length) console.log(n,e); await p.close(); }
await b.close();
