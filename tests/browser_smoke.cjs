/* Real mobile Chromium/WebGL gameplay and halfpipe visual regression. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const vm=require('node:vm');
// Catch malformed inline game JavaScript before opening a browser.
for(const match of fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
 if(match[1].trim())new vm.Script(match[1],{filename:'index.html:inline'});
}
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
  // PNG byte length is not a visual quality metric: an efficiently compressed
  // but valid render can be smaller than an arbitrary 10 KB threshold.
  // Check actual rendered pixel diversity in the clean, HUD-free QA views.
  const screenshotQA={};
  async function checkSceneScreenshot(file,label){
   const png=fs.readFileSync(file);
   const stats=await page.evaluate(async encoded=>{
    const img=new Image();img.src='data:image/png;base64,'+encoded;await img.decode();
    const canvas=document.createElement('canvas');
    canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(img,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const colors=new Set();let minLuma=255,maxLuma=0;
    for(let iy=1;iy<11;iy++)for(let ix=1;ix<19;ix++){
     const x=Math.floor(ix*canvas.width/20),y=Math.floor(iy*canvas.height/12);
     const k=(y*canvas.width+x)*4,r=pixels[k],g=pixels[k+1],b=pixels[k+2];
     colors.add((r>>4)+','+(g>>4)+','+(b>>4));
     const luma=.2126*r+.7152*g+.0722*b;
     minLuma=Math.min(minLuma,luma);maxLuma=Math.max(maxLuma,luma);
    }
    return {width:canvas.width,height:canvas.height,colors:colors.size,
      lumaRange:Math.round(maxLuma-minLuma)};
   },png.toString('base64'));
   screenshotQA[label]=stats;
   assert(stats.width>=390&&stats.height>=390&&stats.colors>=8&&stats.lumaRange>=35,
    label+' screenshot appears visually blank or unrendered: '+JSON.stringify(stats));
  }

  // The live game uses a Babylon CDN, but CI must not fail just because
  // that remote CDN is unreachable from a GitHub runner. Serve the exact
  // installed Babylon UMD bundle locally during browser verification.
  const babylonBundle=require.resolve('babylonjs');
  await page.route('https://cdn.babylonjs.com/babylon.js',route=>route.fulfill({path:babylonBundle,contentType:'application/javascript'}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded',timeout:30000});
  try{await page.waitForFunction(()=>!!window.__SOL_DIAGNOSTICS__,null,{timeout:30000});}
  catch(e){const startup=await page.evaluate(()=>({error:document.querySelector('#error')?.textContent,babylon:!!window.BABYLON,grind:!!window.SOLGrind,html:document.readyState}));throw Error('Game startup failed: '+JSON.stringify({startup,errors,cause:String(e)}));}
  await page.waitForTimeout(1200);
  // Reproduce the player's exact initial mobile camera, not only a scenic
  // overview. Record the mesh underneath the dark diagonal visible in user
  // screenshots so we can distinguish a wall, shadow, or missing riding skin.
  fs.mkdirSync('test-artifacts',{recursive:true});
  await page.screenshot({path:'test-artifacts/spawn-mobile.png',animations:'disabled'});
  const spawnView=await page.evaluate(()=>{
   const d=window.__SOL_DIAGNOSTICS__,scene=d.scene;
   const pts=[[120,170],[160,170],[200,170],[240,170],[280,170],
    [120,210],[160,210],[200,210],[240,210],[280,210],
    [120,250],[160,250],[200,250],[240,250],[280,250]];
   return {camera:{position:d.camera.position.asArray(),rotationOffset:d.camera.rotationOffset},
    picks:pts.map(([x,y])=>{
     const hit=scene.pick(x,y,m=>m.isVisible&&m.isEnabled()&&m.isPickable);
     const mesh=hit?.pickedMesh,material=mesh?.material;
     return {x,y,name:mesh?.name||null,point:hit?.pickedPoint?.asArray()||null,
      material:material?.name||null,alpha:material?.alpha||null,
      diffuse:material?.diffuseColor?.asArray()||null};
    })};
  });
  // A pickable opaque cheek can still render as a black wedge. Decode the
  // *actual captured Chromium screenshot* and check exposed sidewall pixels.
  // The earlier QA only inspected mesh/material metadata, which missed this.
  const spawnPixels=await page.evaluate(async encoded=>{
   const img=new Image();img.src='data:image/png;base64,'+encoded;await img.decode();
   const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
   const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
   const points=[[200,210],[240,210]];
   return points.map(([x,y])=>{const p=Array.from(ctx.getImageData(x,y,1,1).data);return {x,y,rgb:p.slice(0,3),luma:Math.round(.2126*p[0]+.7152*p[1]+.0722*p[2])}});
  },fs.readFileSync('test-artifacts/spawn-mobile.png').toString('base64'));
  // If the pixel is dark, isolate whether it comes from the cheek, core,
  // foundation, or a separate occluding mesh. Keep these experiments out of
  // the player's game; only the CI browser scene is temporarily modified.
  let darkPixelIsolation=null;
  if(spawnPixels.some(p=>p.luma<45)){
   darkPixelIsolation=[];
   for(const target of ['SOLID RAMP SIDE WALL','SOLID RAMP CONCRETE CORE','ramp side foundation','solid skatable concrete ramp']){
    await page.evaluate(name=>window.__SOL_DIAGNOSTICS__.scene.meshes.filter(m=>m.name===name).forEach(m=>m.setEnabled(false)),target);
    await page.waitForTimeout(70);
    const png=await page.screenshot({animations:'disabled'});
    const color=await page.evaluate(async encoded=>{
     const img=new Image();img.src='data:image/png;base64,'+encoded;await img.decode();
     const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
     const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
     return Array.from(ctx.getImageData(200,210,1,1).data).slice(0,3);
    },png.toString('base64'));
    darkPixelIsolation.push({hidden:target,color});
    await page.evaluate(name=>window.__SOL_DIAGNOSTICS__.scene.meshes.filter(m=>m.name===name).forEach(m=>m.setEnabled(true)),target);
   }
  }
  assert(spawnPixels.every(p=>p.luma>=45),'Spawn-view ramp cheek still renders as a near-black wedge: '+JSON.stringify({spawnPixels,darkPixelIsolation}));
  // Validate triangle winding, not merely backFaceCulling=false. A mirrored
  // cheek with inward normals can be opaque yet render almost black.
  const cheekNormals=await page.evaluate(()=>{
   const r={x:-12,z:15,w:13,d:19,h:2.35};
   return [-1,1].map(side=>{
    const g=window.SOLRampGeometry.sideWall(r,window.SOLTerrain.profile,side,8);
    const [a,b,c]=g.indices.slice(0,3).map(i=>g.positions.slice(i*3,i*3+3));
    const u=b.map((v,i)=>v-a[i]),v=c.map((w,i)=>w-a[i]);
    const nx=u[1]*v[2]-u[2]*v[1];
    return {side,nx};
   });
  });
  assert(cheekNormals.every(n=>n.side*n.nx>0),'Exterior ramp cheek triangle normals must point outward: '+JSON.stringify(cheekNormals));
  // Steep ramp gravity must be physically bounded. The old raw-slope force
  // exceeded 9.81 m/s² on the halfpipe and caused instant fakie reversals.
  const rampGravity=await page.evaluate(()=>{
   const cases=[{slope:10000,dir:0,sign:1},{slope:-10000,dir:0,sign:1},
    {slope:10000,dir:Math.PI/2,sign:1},{slope:10000,dir:0,sign:-1}];
   return cases.map(c=>{const s={speed:3,dir:c.dir,travelSign:c.sign};
    window.SOLTerrain.rollOnSlope(s,{slope:c.slope},.025);
    return {...c,speed:s.speed,travelSign:s.travelSign};});
  });
  assert(rampGravity.every(c=>Number.isFinite(c.speed)&&c.speed>=0&&Math.abs(c.speed-3)<=9.81*.025+.0001),
   'Ramp gravity must not exceed physical gravity: '+JSON.stringify(rampGravity));
  assert(rampGravity[0].speed<3&&rampGravity[1].speed>3&&
   Math.abs(rampGravity[2].speed-3)<.000001&&rampGravity[3].speed>3,
   'Uphill/downhill/fakie ramp gravity direction is incorrect: '+JSON.stringify(rampGravity));
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
    minCheekThickness:Math.min(...cheeks.map(m=>m.getBoundingInfo().boundingBox.maximumWorld.x-m.getBoundingInfo().boundingBox.minimumWorld.x)),
    bankCheekAlbedo:cheeks.filter(m=>m.material?.name?.includes(' -12 15')).map(m=>m.material.diffuseColor.asArray()),
    connection:meshes.filter(m=>m.name==='HALFPIPE PARK CONNECTION').length,
    bottom:bottom?[bottom.position.x,bottom.position.z]:null,
    skater:!!d.skater,rendered:d.scene.getFrameId()>1,canvasWidth:d.engine.getRenderingCanvas().width,
    independentCamera:!!d.cameraAnchor&&d.camera.lockedTarget===d.cameraAnchor,staticBatches:d.staticBatchReport};
  });
  // The park is expanded frequently; derive expected cheeks/cores from the
  // actual number of skatable ramp meshes rather than a stale six-ramp layout.
  assert(status.skinCount>=6,'Expected a complete multi-ramp skatepark');
  assert.equal(status.rampCheeks,status.skinCount*2,'Every ramp needs two solid concrete sidewalls');
  assert.equal(status.cores,0,'Sealed ramp bodies must not contain overlapping concrete infill cores');
  assert.equal(status.skinMaterial.alpha,1,'Riding skin must be opaque');
  assert.equal(status.skinMaterial.blend,false,'Riding skin must not use alpha blending');
  assert.equal(status.skinMaterial.culled,false,'Riding skin must render from both sides');
  assert(status.topPick.hit&&Number.isFinite(status.topPick.y),'A ray must hit the halfpipe riding skin');
  assert(status.opaqueCheeks,'Ramp exterior sidewall materials must be opaque');
  assert(status.minCheekThickness>=.22,'Ramp sidewalls must be thick, capped 3D geometry rather than flat triangles');
  assert.equal(status.bankCheekAlbedo.length,2,'Starting ramp must have both exterior cheeks');
  assert(status.bankCheekAlbedo.every(c=>c.every(v=>v>=.65)),'Starting ramp exterior must be daylight-bright rather than black wedge');
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
  // Verify every mobile trick button through real pointer events. The click
  // fallback must not trigger a second trick after pointerdown.
  const touchTricks=[];
  for(const [name,expectedFlip,expectedSpin,expectedCount] of [
   ['ollie',0,0,1],['kick',1,0,1],['heel',-1,0,1],
   ['shove',0,1,1],['grab',0,0,2]
  ]){
   await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;
    Object.assign(s,{x:0,z:0,y:0,groundY:0,vy:0,dir:0,speed:0,
     grounded:true,grinding:false,travelSign:1,flip:0,spin:0,count:0,
     combo:0,grabUntil:0,grabHeld:false,touchGrabHeld:false,grindCooldown:0});
   });
   await page.locator('[data-t="'+name+'"]').click();
   const outcome=await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;
    return {airborne:!s.grounded,vy:s.vy,flip:s.flip,spin:s.spin,
     count:s.count,name:s.name};});
   assert(outcome.airborne&&outcome.vy>0&&outcome.flip===expectedFlip&&
    outcome.spin===expectedSpin&&outcome.count===expectedCount,
    'Mobile '+name+' must activate once with correct physics: '+JSON.stringify(outcome));
   touchTricks.push({button:name,...outcome});
  }
  // Programmatic click is a separate accessibility/fallback path: it must
  // still work when a pointerdown event was not dispatched.
  await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;
   Object.assign(s,{grounded:true,grinding:false,y:0,groundY:0,vy:0,
    flip:0,spin:0,count:0,combo:0,grabUntil:0,grabHeld:false});
   document.querySelector('[data-t="ollie"]').click();
  });
  const clickFallback=await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;
   return {airborne:!s.grounded,count:s.count,vy:s.vy};});
  assert(clickFallback.airborne&&clickFallback.count===1&&clickFallback.vy>0,
   'Mobile click fallback must activate OLLIE once: '+JSON.stringify(clickFallback));
  await page.locator('#restart').click();
  // Exercise the actual mobile boardslide button while it is visible.
  await page.evaluate(()=>{const d=window.__SOL_DIAGNOSTICS__,s=d.state;
   Object.assign(s,{x:0,z:19,y:0,groundY:0,dir:0,speed:5,travelSign:1,grounded:true,grinding:false,vy:0,grindCooldown:0,grindRequestType:null});
  });
  assert(await page.locator('[data-t="boardslide"]').count()===1,'Touch BOARD SLIDE control must exist');
  await page.locator('[data-t="boardslide"]').click();
  const boardInput=await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;
   return {type:s.grindRequestType,airborne:!s.grounded,vy:s.vy,y:s.y}});
  assert(boardInput.type==='boardslide'&&boardInput.airborne&&(boardInput.vy>0||boardInput.y>.1),
   'Touch boardslide must request a real ollie-assisted rail catch: '+JSON.stringify(boardInput));
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
  await checkSceneScreenshot('test-artifacts/halfpipe-chromium.png','halfpipe');
  // The player's actual GRIND touch button must catch bowl coping without ollie.
  // Set a physically valid position on the steep bowl wall (not 1.3m
  // above the concrete) and press the real button in the SAME browser frame.
  // A Playwright click can wait for layout stability while the moving skater
  // travels beyond the lip, making a correct grind falsely fail QA.
  const touchCoping=await page.evaluate(()=>{
   const s=window.__SOL_DIAGNOSTICS__.state;
   const wallY=window.SOLBowl.height(15.10,-106);
   Object.assign(s,{x:15.10,z:-106,y:wallY,groundY:wallY,dir:Math.PI/2,speed:6,travelSign:1,
    grounded:true,grinding:false,vy:0,grindCooldown:0,grindRequestType:null});
   document.querySelector('#buttons').style.display='';
   document.querySelector('[data-t="grind"]').dispatchEvent(
    new PointerEvent('pointerdown',{bubbles:true,pointerId:31,pointerType:'touch'}));
   return {grinding:s.grinding,kind:s.grindRail?.kind,vy:s.vy,y:s.y,wallY};
  });
  assert(touchCoping.grinding&&touchCoping.kind==='bowl-coping'&&touchCoping.vy===0,
   'GRIND touch control must catch bowl coping without forcing ollie: '+JSON.stringify(touchCoping));
  // Coping capture from a near-vertical wall must not teleport the skater
  // more than a metre upward in a single input frame. The board eases onto
  // the lip over the first 0.22s while staying attached to the circular rail.
  const copingEntry=await page.evaluate(()=>{
   const s=window.__SOL_DIAGNOSTICS__.state;
   const initialY=s.y,top=s.grindRail.y;
   for(let i=0;i<15;i++)window.SOLGrind.advance(s,1/60);
   return {initialY,top,finalY:s.y,grinding:s.grinding};
  });
  assert(Math.abs(copingEntry.initialY-touchCoping.wallY)<.05&&
   Math.abs(copingEntry.finalY-copingEntry.top)<.02&&copingEntry.grinding,
   'Coping must blend smoothly from the wall to the steel rim: '+JSON.stringify(copingEntry));
  // Validate circular bowl coping capture and actual curved movement, not only rendering.
  const coping=await page.evaluate(()=>{
   const s=window.__SOL_DIAGNOSTICS__.state;
   const rail={x:0,z:-106,radius:15.24,y:.09,kind:'bowl-coping'};
   Object.assign(s,{x:15.10,z:-106,y:.09,dir:Math.PI/2,speed:6,travelSign:1,
    grounded:true,grinding:false,vy:0,grindCooldown:0,grindRequestType:'50-50'});
   const c=window.SOLGrind.find(s,[rail],.016,true,true);
   if(!c)return {found:false};
   window.SOLGrind.attach(s,c);
   const start={x:s.x,z:s.z};
   for(let i=0;i<60;i++)window.SOLGrind.advance(s,1/60);
   const nx=(s.x-rail.x)/rail.radius,nz=(s.z-rail.z)/rail.radius;
   const tangentAlignment=(Math.sin(s.dir)*-nz+Math.cos(s.dir)*nx)*s.grindDirection;
   return {found:true,kind:s.grindRail?.kind,grinding:s.grinding,delta:Math.hypot(s.x-start.x,s.z-start.z),
    radius:Math.hypot(s.x-rail.x,s.z-rail.z),speed:s.speed,tangentAlignment};
  });
  assert(coping.found&&coping.grinding&&coping.kind==='bowl-coping'&&coping.delta>2&&Math.abs(coping.radius-15.24)<.03,
   'Bowl coping must attach and travel around its circular rail: '+JSON.stringify(coping));
  assert(coping.tangentAlignment>.999,'Coping heading must follow travel around the rim: '+JSON.stringify(coping));
  await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;s.grinding=false;s.grindRail=null;s.grindCooldown=0});
  // Boardslide is a real touch-triggered rail state with a 90-degree rendered
  // board stance, while physical travel continues lengthwise along the rail.
  await page.evaluate(()=>{const d=window.__SOL_DIAGNOSTICS__,s=d.state,B=window.BABYLON;
   Object.assign(s,{x:.1,z:19,y:1.24,groundY:0,dir:0,speed:5,travelSign:1,grounded:false,
    grinding:false,vy:-3,grindCooldown:0,grindRequestType:'boardslide',grindVisualYaw:0,airVX:null,airVZ:null});
   const rail={x:0,z:19,len:14,y:1.1,axis:'z',kind:'rail'};
   const contact=window.SOLGrind.find(s,[rail],.025,true,true);
   if(!contact||!window.SOLGrind.attach(s,contact))throw Error('Boardslide did not attach to rail');
   d.scene.activeCamera=new B.ArcRotateCamera('boardslide QA camera',.6,1.16,12,new B.Vector3(0,1.5,19),d.scene);
  });
  await page.waitForFunction(()=>{const d=window.__SOL_DIAGNOSTICS__;
   return d.state.grinding&&Math.abs(d.skater.rotation.y-d.state.dir)>.9;
  },null,{timeout:8000});
  // Rotation is visible on the attachment frame; translation needs at
  // least one subsequent physics frame, especially under software WebGL.
  await page.waitForFunction(()=>{const s=window.__SOL_DIAGNOSTICS__.state;
   return s.grinding&&s.z>19.25;
  },null,{timeout:10000});
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
  await checkSceneScreenshot('test-artifacts/park-chromium.png','park');

  assert.equal(errors.length,0,'Browser errors: '+errors.join('; '));
  fs.writeFileSync('test-artifacts/browser-result.txt',JSON.stringify({result:'PASS',spawnView,spawnPixels,cheekNormals,rampGravity,screenshotQA,status,spin,push,touchTricks,clickFallback,riding,boardInput,boardslide,touchCoping,copingEntry,coping,bowl,parkWalls},null,2));console.log('PASS Chromium WebGL geometry, independent aerial yaw, joystick, push, halfpipe, bowl raycast and visual screenshots',status,spin,push,riding,bowl);
 }finally{await browser.close()}
})().catch(e=>{fs.mkdirSync('test-artifacts',{recursive:true});fs.writeFileSync('test-artifacts/browser-result.txt','FAIL: '+(e&&e.stack||String(e)));console.error(e);process.exitCode=1}).finally(()=>server.close());
