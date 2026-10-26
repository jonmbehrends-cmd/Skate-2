/* Real mobile Chromium/WebGL gameplay and halfpipe visual regression. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
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
  await page.waitForTimeout(1200);
  const status=await page.evaluate(()=>{
   const d=window.__SOL_DIAGNOSTICS__,meshes=d.scene.meshes;
   const cheeks=meshes.filter(m=>m.name==='SOLID RAMP SIDE WALL');
   const cores=meshes.filter(m=>m.name==='SOLID RAMP CONCRETE CORE');
   const bottom=meshes.find(m=>m.name==='HALFPIPE FLAT BOTTOM');
   return {rampCheeks:cheeks.length,cores:cores.length,
    opaqueCheeks:cheeks.every(m=>m.material&&m.material.alpha===1&&m.material.backFaceCulling===false&&m.getTotalIndices()>0),
    opaqueCores:cores.every(m=>m.material&&m.material.alpha===1),
    connection:meshes.filter(m=>m.name==='HALFPIPE PARK CONNECTION').length,
    bottom:bottom?[bottom.position.x,bottom.position.z]:null,
    skater:!!d.skater,rendered:d.scene.getFrameId()>1,canvasWidth:d.engine.getRenderingCanvas().width,
    independentCamera:!!d.cameraAnchor&&d.camera.lockedTarget===d.cameraAnchor};
  });
  assert.equal(status.rampCheeks,12,'Six ramps need two visible concrete sidewalls each');
  assert.equal(status.cores,6,'Six ramps need merged concrete cores');
  assert(status.opaqueCheeks&&status.opaqueCores,'Ramp exterior and core materials must be opaque');
  assert.equal(status.connection,1,'Halfpipe must connect to park');
  assert.deepEqual(status.bottom,[-36,-18.1],'Halfpipe must be at current plaza coordinates');
  assert(status.skater&&status.rendered&&status.canvasWidth>0,'WebGL scene must render');
  assert(status.independentCamera,'Camera must not rotate with rider during airborne spins');
  // Exercise the actual mobile joystick: the board and skater must visibly yaw,
  // while the camera's orientation remains fixed during an aerial spin.
  await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;
   Object.assign(s,{x:0,z:0,y:60,groundY:0,vy:0,dir:0,speed:0,airVX:0,airVZ:0,grounded:false,grinding:false,airCameraHeading:0,controlSteer:0,controlThrottle:0})});
  const stick=await page.locator('#stick').boundingBox();
  assert(stick,'Mobile joystick must be visible');
  await page.mouse.move(stick.x+stick.width*.83,stick.y+stick.height*.5);
  await page.mouse.down();await page.waitForTimeout(700);await page.mouse.up();
  const spin=await page.evaluate(()=>{const d=window.__SOL_DIAGNOSTICS__;return {yaw:d.state.dir,skaterYaw:d.skater.rotation.y,cameraYaw:d.cameraAnchor.rotation.y,grounded:d.state.grounded}});
  assert(!spin.grounded&&spin.yaw>1.5,'Touch joystick must rotate airborne skater: '+JSON.stringify(spin));
  assert(Math.abs(spin.skaterYaw-spin.yaw)<.2,'Rendered skater must follow airborne yaw');
  assert(Math.abs(spin.cameraYaw)<.15,'Camera must not follow rider spin');
  // A deterministic 360-degree simulation independent of render-frame speed.
  await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;
   for(let i=0;i<25;i++)window.SOLMotion.step(s,1,0,false,.025)});
  const fullSpin=await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.state.dir);
  assert(fullSpin>Math.PI*2,'Full 360-degree air rotation must be possible');
  // Touch PUSH should advance the animated foot cycle and actually accelerate.
  await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;
   Object.assign(s,{x:0,z:0,y:0,groundY:0,vy:0,dir:0,speed:0,grounded:true,grinding:false,travelSign:1,pushPhase:0})});
  await page.locator('[data-t="push"]').dispatchEvent('pointerdown',{pointerId:11});
  await page.waitForTimeout(350);
  const push=await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;return {speed:s.speed,phase:s.pushPhase}});
  await page.locator('[data-t="push"]').dispatchEvent('pointerup',{pointerId:11});
  assert(push.speed>.05&&push.phase>0,'PUSH must animate foot and increase speed: '+JSON.stringify(push));
  // Move into the real connected halfpipe and confirm actual travel.
  await page.locator('#halfpipe').click();
  assert(await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.scene.activeCamera.name==='halfpipe arrival overview'),'HALFPIPE button must reveal a real 3D overview before riding');
  await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;
   Object.assign(s,{x:-36,z:-18.1,y:0,groundY:0,dir:0,speed:7,travelSign:-1,grounded:true,grinding:false,vy:0})});
  await page.waitForTimeout(800);
  const riding=await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;return {x:s.x,z:s.z,y:s.y,speed:s.speed}});
  assert(Math.abs(riding.z+18.1)>1.2,'Halfpipe riding must advance across its flat bottom: '+JSON.stringify(riding));
  // Preserve a screenshot of the real in-game mobile camera.
  await page.evaluate(()=>{const d=window.__SOL_DIAGNOSTICS__,s=d.state;
   Object.assign(s,{x:-36,z:-18.1,y:0,groundY:0,dir:0,speed:0,travelSign:1,grounded:true,grinding:false,vy:0});
   d.camera.position.set(-36,8,-31);d.camera.cameraAcceleration=.7;d.camera.maxCameraSpeed=120});
  await page.waitForTimeout(1000);
  fs.mkdirSync('test-artifacts',{recursive:true});
  await page.screenshot({path:'test-artifacts/halfpipe-mobile.png',animations:'disabled'});
  // Dedicated side-on overview exposes the entire U profile, both coping lips
  // and the filled concrete sidewalls; this is the visual QA evidence.
  await page.setViewportSize({width:960,height:540});
  await page.evaluate(()=>{const d=window.__SOL_DIAGNOSTICS__,B=window.BABYLON;
   const c=new B.ArcRotateCamera('halfpipe QA side elevation',0,1.27,31,new B.Vector3(-36,1,-18.1),d.scene);
   c.fov=.86;d.scene.activeCamera=c;
   for(const id of ['hud','status','buttons','stick','restart','halfpipe','msg']){const el=document.getElementById(id);if(el)el.style.display='none'}
  });
  await page.waitForTimeout(500);
  await page.screenshot({path:'test-artifacts/halfpipe-chromium.png',animations:'disabled'});
  assert(fs.statSync('test-artifacts/halfpipe-chromium.png').size>10000,'Halfpipe screenshot unexpectedly blank');
  assert.equal(errors.length,0,'Browser errors: '+errors.join('; '));
  fs.writeFileSync('test-artifacts/browser-result.txt',JSON.stringify({result:'PASS',status,spin,push,riding},null,2));console.log('PASS Chromium WebGL geometry, visible independent aerial yaw, joystick, foot push, halfpipe riding, screenshots',status,spin,push,riding);
 }finally{await browser.close()}
})().catch(e=>{fs.mkdirSync('test-artifacts',{recursive:true});fs.writeFileSync('test-artifacts/browser-result.txt','FAIL: '+(e&&e.stack||String(e)));console.error(e);process.exitCode=1}).finally(()=>server.close());
