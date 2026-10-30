'use strict';
// Real Chromium projection guards for the low, forward-looking chase camera.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts/camera');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.js')?'application/javascript':'text/html'});res.end(e?'':b);});
});
let browser;
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox']});
 const results=[];
 for(const [label,viewport] of [['desktop',{width:1280,height:800}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{timeout:120000});
  await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__?.rig?.status.ready,null,{timeout:120000});
  await page.waitForTimeout(4000);
  const frame=await page.evaluate(()=>{
   const d=__SOL_DIAGNOSTICS__,B=BABYLON,c=d.camera;
   const project=v=>{const p=B.Vector3.Project(v,B.Matrix.Identity(),d.scene.getTransformMatrix(),c.viewport.toGlobal(d.engine.getRenderWidth(),d.engine.getRenderHeight()));return {x:p.x/d.engine.getRenderWidth(),y:p.y/d.engine.getRenderHeight()};};
   return {board:project(d.skater.position),torso:project(d.skater.position.add(new B.Vector3(0,1.15,0))),pitch:Math.atan2(c.position.y-c.getTarget().y,Math.hypot(c.position.x-c.getTarget().x,c.position.z-c.getTarget().z))*180/Math.PI};
  });
  assert(frame.board.y>.6&&frame.board.y<.78,'Board should sit in lower frame: '+JSON.stringify(frame));
  assert(Math.abs(frame.board.x-.5)<.06,'Rider must remain centered');
  assert(frame.torso.y>.43&&frame.torso.y<.6,'Torso framing');
  assert(frame.pitch>8&&frame.pitch<20,'Low chase pitch: '+JSON.stringify(frame));
  assert.deepEqual(errors,[],'No browser errors');
  await page.screenshot({path:path.join(out,label+'.png')});results.push({label,...frame});await page.close();
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));console.log('PASS desktop/mobile lower chase framing',results);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
