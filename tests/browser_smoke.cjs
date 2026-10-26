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
   const skins=meshes.filter(m=>m.name==='solid skatable concrete ramp');
   const skinMaterial=skins[0]?.material;
   const topRay=new window.BABYLON.Ray(new window.BABYLON.Vector3(-36,12,-28),new window.BABYLON.Vector3(0,-1,0),20);
   const topPick=d.scene.pickWithRay(topRay,m=>m.name==='solid skatable concrete ramp');
   return {rampCheeks:cheeks.length,cores:cores.length,skinCount:skins.length,skinMaterial:{alpha:skinMaterial?.alpha,blend:skinMaterial?.needAlphaBlending(),textureAlpha:skinMaterial?.diffuseTexture?.hasAlpha,transparency:skinMaterial?.transparencyMode,culled:skinMaterial?.backFaceCulling},topPick:{hit:topPick?.hit,y:topPick?.pickedPoint?.y},
    opaqueCheeks:cheeks.every(m=>m.material&&m.material.alpha===1&&m.material.backFaceCulling===false&&m.getTotalIndices()>0),
    opaqueCores:cores.every(m=>m.material&&m.material.alpha===1),
    connection:meshes.filter(m=>m.name==='HALFPIPE PARK CONNECTION').length,
    bottom:bottom?[bottom.position.x,bottom.position.z]:null,
    skater:!!d.skater,rendered:d.scene.getFrameId()>1,canvasWidth:d.engine.getRenderingCanvas().width,
    independentCamera:!!d.cameraAnchor&&d.camera.lockedTarget===d.cameraAnchor,staticBatches:d.staticBatchReport};
  });
  // The park is expanded frequently; derive expected cheeks/cores from the
  // actual number of skatable ramp meshes rather than a stale six-ramp layout.
  assert(status.skinCount>=6,'Expected a complete multi-ramp skatepark');
  assert.equal(status.rampCheeks,status.skinCount*2,'Every ramp needs two solid concrete sidewalls');
  assert.equal(status.cores,status.skinCount,'Every ramp needs one merged concrete core');
  assert.equal(status.skinMaterial.alpha,1,'Riding skin must be opaque');
  assert.equal(status.skinMaterial.blend,false,'Riding skin must not use alpha blending');
  assert.equal(status.skinMaterial.culled,false,'Riding skin must render from both sides');
  assert(status.topPick.hit&&Number.isFinite(status.topPick.y),'A ray must hit the halfpipe riding skin');
  assert(status.opaqueCheeks&&status.opaqueCores,'Ramp exterior and core materials must be opaque');
  assert.equal(status.connection,1,'Halfpipe must connect to park');
  assert.deepEqual(status.bottom,[-36,-18.1],'Halfpipe must be at current plaza coordinates');
  assert(status.skater&&status.rendered&&status.canvasWidth>0,'WebGL scene must render');
  assert(status.independentCamera,'Camera must not rotate with rider during airborne spins');
  assert(status.staticBatches?.merged>80&&status.staticBatches?.groups>=8,'Static park art must be batched to avoid hundreds of unnecessary mobile draw calls: '+JSON.stringify(status.staticBatches));
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
  // SwiftShader CI can render slowly; wait for a simulated push frame rather
  // than assuming 350ms wall time guarantees a game-loop tick.
  await page.waitForFunction(()=>{const s=window.__SOL_DIAGNOSTICS__.state;return s.speed>.05&&s.pushPhase>0},null,{timeout:6000}).catch(()=>{});
  const push=await page.evaluate(()=>{const d=window.__SOL_DIAGNOSTICS__,s=d.state;return {speed:s.speed,phase:s.pushPhase,grounded:s.grounded,onRamp:s.onRamp,grinding:s.grinding,bowlAir:!!s.bowlAir,burstUntil:s.pushBurstUntil,now:performance.now(),frame:d.scene.getFrameId(),y:s.y,z:s.z}});
  await page.locator('[data-t="push"]').dispatchEvent('pointerup',{pointerId:11});
  assert(push.speed>.05&&push.phase>0,'PUSH must animate foot and increase speed: '+JSON.stringify({push,errors}));
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
  // Boardslide is a real touch-triggered rail state with a 90-degree rendered
  // board stance, while physical travel continues lengthwise along the rail.
  await page.evaluate(()=>{const d=window.__SOL_DIAGNOSTICS__,s=d.state;
   Object.assign(s,{x:0,z:19,y:0,groundY:0,dir:0,speed:5,travelSign:1,grounded:true,grinding:false,vy:0,grindCooldown:0,grindRequestType:null});
  });
  assert(await page.locator('[data-t="boardslide"]').count()===1,'Touch BOARD SLIDE control must exist');
  await page.locator('[data-t="boardslide"]').dispatchEvent('pointerdown',{pointerId:17});
  const boardInput=await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;
   return {type:s.grindRequestType,airborne:!s.grounded,vy:s.vy}});
  assert(boardInput.type==='boardslide'&&boardInput.airborne&&boardInput.vy>0,
   'Touch boardslide must request a real ollie-assisted rail catch: '+JSON.stringify(boardInput));
  await page.evaluate(()=>{const d=window.__SOL_DIAGNOSTICS__,s=d.state,B=window.BABYLON;
   Object.assign(s,{x:.1,z:19,y:1.24,groundY:0,dir:0,speed:5,travelSign:1,grounded:false,
    grinding:false,vy:-3,grindCooldown:0,grindVisualYaw:0,airVX:null,airVZ:null});
   const rail={x:0,z:19,len:14,y:1.1,axis:'z',kind:'rail'};
   const contact=window.SOLGrind.find(s,[rail],.025,true,true);
   if(!contact||!window.SOLGrind.attach(s,contact))throw Error('Boardslide did not attach to rail');
   d.scene.activeCamera=new B.ArcRotateCamera('boardslide QA camera',.6,1.16,12,new B.Vector3(0,1.5,19),d.scene);
  });
  await page.waitForFunction(()=>{const d=window.__SOL_DIAGNOSTICS__;
   return d.state.grinding&&Math.abs(d.skater.rotation.y-d.state.dir)>.9;
  },null,{timeout:8000});
  const boardslide=await page.evaluate(()=>{const d=window.__SOL_DIAGNOSTICS__,s=d.state;
   return {type:s.grindType,grinding:s.grinding,yaw:d.skater.rotation.y-s.dir,
    x:s.x,z:s.z,speed:s.speed,score:s.combo,rail:s.grindRail?.kind};
  });
  assert(boardslide.grinding&&boardslide.type==='boardslide'&&Math.abs(boardslide.yaw)>1,
   'Rendered board and rider must turn across the rail: '+JSON.stringify(boardslide));
  assert(Math.abs(boardslide.x)<.01&&boardslide.z>19&&boardslide.speed>1,
   'Boardslide must keep moving along the rail rather than strafing sideways: '+JSON.stringify(boardslide));
  await page.screenshot({path:'test-artifacts/boardslide-chromium.png',animations:'disabled'});
  assert(fs.statSync('test-artifacts/boardslide-chromium.png').size>10000,
   'Boardslide screenshot unexpectedly blank');
  // Verify the recessed bowl is real pickable geometry, not a visual-only decal.
  // Save a full 3D perspective for visual review of the 100-foot / 25-foot bowl.
  const bowl=await page.evaluate(()=>{
   const d=window.__SOL_DIAGNOSTICS__,B=window.BABYLON;
   const m=d.scene.meshes.find(x=>x.name==='100 foot wide 25 foot deep sculpted concrete bowl');
   const ray=new B.Ray(new B.Vector3(6.5,12,-106),new B.Vector3(0,-1,0),30);
   const hit=d.scene.pickWithRay(ray,x=>x===m);
   const sample=window.SOLBowl.sample(6.5,-106);
   return {exists:!!m,indices:m?.getTotalIndices(),materialAlpha:m?.material?.alpha,
    depthWrite:m?.material?.forceDepthWrite,blend:m?.material?.needAlphaBlending(),textureName:m?.material?.diffuseTexture?.name,
    rayHit:!!hit?.hit,rayY:hit?.pickedPoint?.y,surfaceY:sample?.height,
    centerY:window.SOLBowl.sample(0,-106)?.height,
    diameterMeters:window.SOLBowl.bowl.radius*2,depthMeters:window.SOLBowl.bowl.depth,
    meshes:d.scene.meshes.length,fps:d.engine.getFps()};
  });
  assert(bowl.exists&&bowl.indices>30000,'Full tessellated bowl must exist');
  assert.equal(bowl.materialAlpha,1,'Bowl concrete must be opaque');
  assert.equal(bowl.blend,false,'Bowl surface must not alpha blend');
  assert.equal(bowl.depthWrite,true,'Bowl must write to the depth buffer');
  assert.equal(bowl.textureName,'bowl painted concrete art','Bowl must use the baked nontransparent graphics rather than clipping decals');
  assert(bowl.rayHit&&Math.abs(bowl.rayY-bowl.surfaceY)<.15,'Visual bowl must match riding physics: '+JSON.stringify(bowl));
  assert(Math.abs(bowl.centerY+7.62)<.01,'Bowl must be 25 feet deep');
  assert(Math.abs(bowl.diameterMeters-30.48)<.01,'Bowl must be 100 feet across');
  await page.evaluate(()=>{
   const d=window.__SOL_DIAGNOSTICS__,B=window.BABYLON;
   const c=new B.ArcRotateCamera('bowl QA architectural overview',.72,1.03,48,
    new B.Vector3(0,-3.1,-106),d.scene);
   c.fov=.96;d.scene.activeCamera=c;
  });
  await page.waitForTimeout(650);
  await page.screenshot({path:'test-artifacts/bowl-chromium.png',animations:'disabled'});
  assert(fs.statSync('test-artifacts/bowl-chromium.png').size>14000,'Bowl screenshot unexpectedly blank');
  // Diagnostic only: force an unmistakable unlit magenta surface for one frame.
  // If the saved debug bowl remains green, the mesh is being occluded/culled,
  // rather than merely shaded or textured incorrectly.
  await page.evaluate(()=>{
   const B=window.BABYLON,d=window.__SOL_DIAGNOSTICS__;
   const m=d.scene.meshes.find(x=>x.name==='100 foot wide 25 foot deep sculpted concrete bowl');
   const a=m.material;
   window.__qaBowlOriginal={texture:a.diffuseTexture,diffuse:a.diffuseColor.clone(),
    emissive:a.emissiveColor.clone(),unlit:a.disableLighting};
   a.diffuseTexture=null;a.diffuseColor=new B.Color3(1,0,1);
   a.emissiveColor=new B.Color3(1,0,1);a.disableLighting=true;
  });
  await page.waitForTimeout(400);
  await page.screenshot({path:'test-artifacts/bowl-debug.png',animations:'disabled'});
  await page.evaluate(()=>{
   const d=window.__SOL_DIAGNOSTICS__,a=d.scene.meshes.find(x=>x.name==='100 foot wide 25 foot deep sculpted concrete bowl').material;
   const p=window.__qaBowlOriginal;
   a.diffuseTexture=p.texture;a.diffuseColor=p.diffuse;a.emissiveColor=p.emissive;a.disableLighting=p.unlit;
  });

  // The old tall teal architectural-edge boxes obscured skating approaches.
  // Ensure the park shows sculpted riding surfaces rather than decorative walls.
  const parkWalls=await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.scene.meshes.filter(m=>m.name==='ramp architectural edge').length);
  assert.equal(parkWalls,0,'Tall decorative ramp walls must not return');
  await page.evaluate(()=>{
   const d=window.__SOL_DIAGNOSTICS__,B=window.BABYLON;
   const c=new B.ArcRotateCamera('park QA connected riding lines',.55,1.10,88,
    new B.Vector3(4,1.3,42),d.scene);
   c.fov=1.0;d.scene.activeCamera=c;
  });
  await page.waitForTimeout(550);
  await page.screenshot({path:'test-artifacts/park-chromium.png',animations:'disabled'});
  assert(fs.statSync('test-artifacts/park-chromium.png').size>14000,'Park overview screenshot unexpectedly blank');

  assert.equal(errors.length,0,'Browser errors: '+errors.join('; '));
  fs.writeFileSync('test-artifacts/browser-result.txt',JSON.stringify({result:'PASS',status,spin,push,riding,boardInput,boardslide,bowl,parkWalls},null,2));console.log('PASS Chromium WebGL geometry, independent aerial yaw, joystick, push, halfpipe, bowl raycast and visual screenshots',status,spin,push,riding,bowl);
 }finally{await browser.close()}
})().catch(e=>{fs.mkdirSync('test-artifacts',{recursive:true});fs.writeFileSync('test-artifacts/browser-result.txt','FAIL: '+(e&&e.stack||String(e)));console.error(e);process.exitCode=1}).finally(()=>server.close());
