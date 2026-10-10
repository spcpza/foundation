import puppeteer from 'puppeteer';
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox']});
const errs=[];
for (const [w,h] of [[1440,900],[1280,720]]){
const p=await b.newPage(); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(e.message));
await p.setViewport({width:w,height:h}); await p.goto('http://localhost:8787/',{waitUntil:'networkidle0'});
await p.waitForFunction(()=>document.getElementById('words').dataset.done==='1'); await new Promise(r=>setTimeout(r,2000));
await p.screenshot({path:`/workspace/solichin-org/proof/desktop-${w}x${h}.png`});}
console.log('errors',errs.length,errs); await b.close();
