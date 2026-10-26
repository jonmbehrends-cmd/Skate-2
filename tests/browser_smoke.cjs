/* Real headless Chromium WebGL smoke test, executed in GitHub Actions. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const full=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
 fs.readFile(full,(error,body)=>{if(error){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':types[path.extname(full)]||'application/octet-stream'});res.end(body)});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>!!window.__SOL_DIAGNOSTICS__,null,{timeout:60000});
  await page.waitForTimeout(1400);
  const status=await page.evaluate(()=>{
   const d=window.__SOL_DIAGNOSTICS__,meshes=d.scene.meshes;
   return {rampCheeks:meshes.filter(m=>m.name==='SOLID RAMP SIDE WALL').length,
    cores:meshes.filter(m=>m.name==='SOLID RAMP CONCRETE CORE').length,
    connection:meshes.filter(m=>m.name==='HALFPIPE PARK CONNECTION').length,
    skater:!!d.skater,rendered:d.scene.getFrameId()>1,canvasWidth:d.engine.getRenderingCanvas().width};
  });
  assert.equal(status.rampCheeks,12,'Six ramps must have two solid sidewalls each');
  assert.equal(status.cores,6,'Six ramps must have batched concrete cores');
  assert.equal(status.connection,1,'Halfpipe must be connected to park');
  assert(status.skater&&status.rendered&&status.canvasWidth>0,'WebGL scene must render');
  await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;Object.assign(s,{x:46,z:-46.1,y:0,groundY:0,dir:0,speed:0,travelSign:1,grounded:true,grinding:false,vy:0})});
  await page.waitForTimeout(900);
  fs.mkdirSync('test-artifacts',{recursive:true});
  await page.screenshot({path:'test-artifacts/halfpipe-chromium.png',animations:'disabled'});
  assert.equal(errors.length,0,'Browser script errors: '+errors.join('; '));
  console.log('PASS: real Chromium WebGL render, solid sidewalls, merged cores, connected halfpipe',status);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
