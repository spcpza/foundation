import puppeteer from 'puppeteer';
const out=process.env.OUT||'shots/';
import fs from 'fs'; fs.mkdirSync(out,{recursive:true});
const b=await puppeteer.launch({headless:'new'});
for (const [name,vp] of [['phone',{width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true}],['desk',{width:1440,height:900}]]) {
  const p=await b.newPage(); await p.setViewport(vp); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await p.goto('http://localhost:8787/',{waitUntil:'networkidle0'}); await new Promise(r=>setTimeout(r,800));
  const H=await p.evaluate(()=>document.documentElement.scrollHeight-innerHeight);
  const stops=[0,0.08,0.2,0.32,0.45,0.62,0.78,1];
  for (const [i,f] of stops.entries()) { await p.evaluate(y=>window.scrollTo(0,y),Math.round(H*f)); await new Promise(r=>setTimeout(r,1700)); await p.screenshot({path:`${out}${name}-${i}.jpg`,quality:70}); }
  console.log(name,H,errs);
}
await b.close();
