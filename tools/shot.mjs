// quick look: node tools/shot.mjs t1 t2 ... -> proof/dev-t*.png (phone 390x844 DPR3)
import puppeteer from 'puppeteer';
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); const errs=[];
p.on('console',m=>{if(['error','warning'].includes(m.type()))errs.push(m.type()+': '+m.text())}); p.on('pageerror',e=>errs.push(e.message));
await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true});
await p.goto('http://localhost:8787/'+(process.env.Q||''),{waitUntil:'networkidle0'});
await p.waitForFunction(()=>window.__drone,{timeout:30000});
await p.waitForFunction(()=>document.getElementById('words').dataset.done==='1'); await new Promise(r=>setTimeout(r,1800));
console.log('keys',await p.evaluate(()=>window.__drone.keyTimes()));
for(const t of process.argv.slice(2)){ await p.evaluate(t=>window.__drone.render(+t),t); await p.screenshot({path:`proof/dev-t${t}.png`}); }
console.log('errors',errs); await b.close();
