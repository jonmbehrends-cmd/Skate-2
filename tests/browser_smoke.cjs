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

const controllerQA=(()=>{
  // Exercise the production controller adapter deterministically, without
  // relying on a physical Bluetooth controller on the CI runner.
  let time=1000,pads=[];
  const context={window:{},navigator:{getGamepads:()=>pads},performance:{now:()=>time}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'controller.js'),'utf8'),context,{filename:'controller.js'});
  const api=context.window.SOLPad,actions=[];
  const poll=()=>api.poll(action=>actions.push(action),time);
  assert.equal(poll().connected,false,'No controller must leave touch play usable');
  const buttons=Array.from({length:17},()=>({pressed:false,value:0}));
  const pad={index:0,id:'Xbox Wireless Controller',connected:true,axes:[0,0,0,0],buttons};
  pads=[pad];
  assert.equal(poll().connected,true,'Xbox controller should connect');
  assert.equal(actions.length,0,'Connecting with held buttons must not fire tricks');
  pad.axes[0]=.5;pad.axes[1]=-.5;
  let state=poll();
  assert(state.x>.35&&state.y<-.35,'Left stick should steer and throttle with deadzone');
  buttons[7].value=.65;buttons[7].pressed=false;
  assert.equal(poll().boost,true,'Analog right trigger should push even without pressed flag');
  buttons[7].value=0;
  // Android Gamepad APIs sometimes provide a button value without `pressed`.
  buttons[0].value=.85;buttons[0].pressed=false;poll();poll();
  assert.deepEqual(actions,['ollie'],'Analog A must trigger once even if pressed=false');
  buttons[0].value=0;poll();actions.length=0;
  buttons[0].pressed=true;poll();poll();
  assert.deepEqual(actions,['ollie'],'A button should trigger one ollie per press');
  buttons[0].pressed=false;poll();buttons[0].pressed=true;poll();
  assert.deepEqual(actions,['ollie','ollie'],'Re-pressing A should trigger another ollie');
  buttons[0].pressed=false;poll();
  pad.axes[2]=-1;time+=300;poll();poll();
  assert.equal(actions.at(-1),'kick','Right-stick left flick should kickflip');
  const before=actions.length;
  poll();assert.equal(actions.length,before,'Held right stick must not repeat tricks');
  pad.axes[2]=0;poll();time+=300;pad.axes[2]=1;poll();
  assert.equal(actions.at(-1),'heel','Right stick must re-arm after recentering');
  pad.axes=[0,0,0,0];buttons[15].value=.9;buttons[15].pressed=false;
  state=poll();assert.equal(state.x,1,'Analog D-pad right should steer if left stick is neutral');
  pad.connected=false;state=poll();
  assert.equal(state.connected,false,'Disconnect must release controller inputs');
  assert.equal(state.boost,false,'Disconnect must release PUSH');
  // Reconnection with an already-held analog face button must not auto-trick.
  const beforeReconnect=actions.length;
  pad.connected=true;buttons[0].value=.9;poll();
  assert.equal(actions.length,beforeReconnect,'Held analog A on reconnect must not fire');
  buttons[0].value=0;poll();buttons[0].value=.9;poll();
  assert.equal(actions.length,beforeReconnect+1,'Analog A must fire after release and re-press');
  pad.connected=false;poll();
  context.navigator.getGamepads=()=>{throw Error('Gamepad permission denied')};
  assert.equal(poll().connected,false,'Denied Gamepad API must not crash the game');
  return {result:'PASS',analogTrigger:true,analogFaceButtons:true,analogDpad:true,reconnectEdge:true,faceButtonEdge:true,rightStickFlick:true,dpadFallback:true,disconnect:true,apiDenied:true};
})();

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
  // Apparel is visual-only: all 24 details must be attached to animated joints
  // and must not intercept ramp raycasts or alter collision behavior.
  const visualQA=await page.evaluate(()=>{
   const d=window.__SOL_DIAGNOSTICS__;
   const names=['skater smoked glasses lens','skater ear','skater helmet vent',
    'skater jacket seam','skater glasses bridge','skater nose',
    'skater jacket zipper','skater hoodie pocket','skater sleeve cuff',
    'skater knee fabric panel','skater rubber toe cap','skater shoe lace'];
   const meshes=d.scene.meshes.filter(m=>names.includes(m.name));
   return {declared:d.visualDetailCount,count:meshes.length,
    pickable:meshes.filter(m=>m.isPickable).map(m=>m.name),
    collidable:meshes.filter(m=>m.checkCollisions).map(m=>m.name),
    detached:meshes.filter(m=>!m.parent).map(m=>m.name),
    transparent:meshes.filter(m=>m.material?.alpha!==1).map(m=>m.name),
    lensCount:meshes.filter(m=>m.name==='skater smoked glasses lens').length,
    laceCount:meshes.filter(m=>m.name==='skater shoe lace').length};
  });
  assert.equal(visualQA.declared,24,'Skater visual detail module must attach 24 meshes');
  assert.equal(visualQA.count,24,'Every skater detail must exist in the rendered scene');
  assert.equal(visualQA.lensCount,2,'Both protective lenses must be visible');
  assert.equal(visualQA.laceCount,6,'Both animated shoes must have laces');
  for(const key of ['pickable','collidable','detached','transparent'])
   assert.deepEqual(visualQA[key],[],key+' skater details must be empty');
  // The skater must use rounded, animated geometry rather than box primitives.
  // This is geometry QA, not just a screenshot or material-name check.
  const silhouetteQA=await page.evaluate(()=>{
    const scene=window.__SOL_DIAGNOSTICS__.scene;
    const one=name=>scene.meshes.find(m=>m.name===name);
    const all=name=>scene.meshes.filter(m=>m.name===name);
    return {torsoVertices:one('torso')?.getTotalVertices(),
      backpackVertices:one('slim skate backpack')?.getTotalVertices(),
      shoeVertices:all('shoe').map(m=>m.getTotalVertices()),
      soleVertices:all('sole').map(m=>m.getTotalVertices()),
      shoeParents:all('shoe').map(m=>m.parent?.name),
      toeCaps:all('skater rubber toe cap').map(m=>m.getTotalVertices())};
  });
  assert.ok(silhouetteQA.torsoVertices>80,'Torso must have a smooth silhouette');
  assert.ok(silhouetteQA.backpackVertices>80,'Backpack must have rounded geometry');
  assert.equal(silhouetteQA.shoeVertices.length,2,'Both animated feet must have shoes');
  assert.equal(silhouetteQA.soleVertices.length,2,'Both shoes must have separate outsoles');
  assert.ok(silhouetteQA.shoeVertices.every(v=>v>80),'Shoes must be rounded, not boxes');
  assert.ok(silhouetteQA.soleVertices.every(v=>v>80),'Outsoles must be rounded, not boxes');
  assert.ok(silhouetteQA.shoeParents.every(n=>n==='knee joint'),'Shoes must follow the animated rig');
  assert.ok(silhouetteQA.toeCaps.every(v=>v>80)&&silhouetteQA.toeCaps.length===2,
    'Both rounded toe caps must follow the shoes');
  // Background realism must remain one shared atlas with batched rooftop
  // detail, not dozens of individually drawn windows or physics colliders.
  const facadeQA=await page.evaluate(()=>{
    const scene=window.__SOL_DIAGNOSTICS__.scene;
    const mat=scene.getMaterialByName('weathered urban facade');
    const texture=mat?.diffuseTexture;
    const roof=scene.meshes.filter(m=>m.name==='STATIC ART BATCH background roof parapet');
    const buildings=scene.meshes.filter(m=>m.name==='STATIC ART BATCH background building');
    return {atlas:!!texture&&texture.isReady(),width:texture?.getSize().width,
      height:texture?.getSize().height,roofBatches:roof.length,
      buildingBatches:buildings.length,
      collidable:roof.concat(buildings).filter(m=>m.checkCollisions).map(m=>m.name)};
  });
  assert(facadeQA.atlas,'The skyline facade atlas must be loaded in WebGL');
  assert.equal(facadeQA.width,256,'Facade atlas width must stay mobile-friendly');
  assert.equal(facadeQA.height,512,'Facade atlas height must stay mobile-friendly');
  assert.equal(facadeQA.roofBatches,1,'Roof parapets must batch into one mesh');
  assert.equal(facadeQA.buildingBatches,1,'Building facades must batch into one mesh');
  assert.deepEqual(facadeQA.collidable,[],'Background facades cannot affect physics');
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
  // The halfpipe must be genuinely vert at both lips, not a shallow
  // circular bank. Both visual meshes and wheel contact share this profile.
  const halfpipeProfile=await page.evaluate(()=>{
   const p=window.SOLTerrain.profile;
   const left={x:-36,z:-25.8,w:38,d:8.4,h:4.5,curve:'halfpipe-left'};
   const right={x:-36,z:-10.4,w:38,d:8.4,h:4.5,curve:'halfpipe-right'};
   return [0,.0025,.05,.25,.5,.75,1].map(t=>({
    t,left:p(left,t),right:p(right,1-t)
   }));
  });
  assert(halfpipeProfile.every(v=>
   Number.isFinite(v.left.height)&&Number.isFinite(v.left.slope)&&
   Number.isFinite(v.right.height)&&Number.isFinite(v.right.slope)&&
   v.left.height>=-.0001&&v.left.height<=4.5001&&
   Math.abs(v.left.height-v.right.height)<.0001&&
   Math.abs(v.left.slope+v.right.slope)<.0001),
   'Halfpipe transitions must be finite, mirrored and within floor/coping heights: '+JSON.stringify(halfpipeProfile));
  assert(Math.abs(halfpipeProfile[0].left.height-4.5)<.001&&
   halfpipeProfile[1].left.slope< -5&&
   halfpipeProfile[1].right.slope>5&&
   halfpipeProfile[4].left.height<.03&&
   halfpipeProfile[6].left.height<.001,
   'Halfpipe must have near-vertical coping and smooth level floor: '+JSON.stringify(halfpipeProfile));
  // A ground-level board inside a raised halfpipe deck's footprint must not
  // teleport onto its 4.5m top during a real gameplay frame.
  const deckGroundQA=await page.evaluate(async()=>{
   const state=window.__SOL_DIAGNOSTICS__.state;
   Object.assign(state,{x:-36,z:-31.55,y:0,groundY:0,vy:0,dir:0,speed:0,
    grounded:true,grinding:false,travelSign:1,controlSteer:0,controlThrottle:0,
    pushBurstUntil:0,rampCooldown:0,airVX:null,airVZ:null});
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const result={y:state.y,groundY:state.groundY,grounded:state.grounded};
   Object.assign(state,{x:0,z:0,y:0,groundY:0,vy:0,dir:0,speed:0,
    grounded:true,grinding:false,travelSign:1,controlSteer:0,controlThrottle:0});
   return result;
  });
  assert(deckGroundQA.grounded&&Math.abs(deckGroundQA.y)<.15,
   'Ground rider must not teleport to elevated halfpipe deck: '+JSON.stringify(deckGroundQA));
  // Landing impact is the signed velocity along the normalized ramp
  // normal, not an unbounded grade-weighted vertical speed.
  const impactNormals=await page.evaluate(()=>{
   const f=window.SOLWheels.relativeImpact;
   const state={dir:0,speed:0,vy:-10,airVX:0,airVZ:0};
   return {flat:f(state,0,0),steep:f(state,0,3),
    side:f(state,4,0),uphill:f({...state,airVZ:2},0,3)};
  });
  assert(Math.abs(impactNormals.flat+10)<.0001&&
   Math.abs(impactNormals.steep+10/Math.sqrt(10))<.0001&&
   Math.abs(impactNormals.side+10/Math.sqrt(17))<.0001&&
   Math.abs(impactNormals.uphill+16/Math.sqrt(10))<.0001,
   'Ramp touchdown must use normalized contact speed: '+JSON.stringify(impactNormals));
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
   const B=window.BABYLON;
   const bottomRay=new B.Ray(new B.Vector3(-36,4,-18.1),new B.Vector3(0,-1,0),8);
   const bottomPick=d.scene.pickWithRay(bottomRay,m=>m.name==='HALFPIPE FLAT BOTTOM');
   const skins=meshes.filter(m=>m.name==='solid skatable concrete ramp');
   const skinMaterial=skins[0]?.material;
   // A single opaque-looking sample is insufficient: a different ramp can
   // still render the plaza grid through its riding face if depth writing
   // or mesh visibility is accidentally disabled.
   const skinOcclusion=skins.map(m=>({
    name:m.material?.name,
    alpha:m.material?.alpha,
    blending:m.material?.needAlphaBlending?.(),
    textureAlpha:!!m.material?.diffuseTexture?.hasAlpha,
    depthWriteDisabled:!!m.material?.disableDepthWrite,
    meshVisibility:m.visibility,
    meshVisible:m.isVisible,
    meshEnabled:m.isEnabled(),
    indices:m.getTotalIndices()
   }));
   const bottomDepthWriteDisabled=!!bottom?.material?.disableDepthWrite;
   const topRay=new window.BABYLON.Ray(new window.BABYLON.Vector3(-36,12,-28),new window.BABYLON.Vector3(0,-1,0),20);
   const topPick=d.scene.pickWithRay(topRay,m=>m.name==='solid skatable concrete ramp');
   return {rampCheeks:cheeks.length,cores:cores.length,skinCount:skins.length,skinOcclusion,bottomDepthWriteDisabled,skinMaterial:{alpha:skinMaterial?.alpha,blend:skinMaterial?.needAlphaBlending(),textureAlpha:skinMaterial?.diffuseTexture?.hasAlpha,transparency:skinMaterial?.transparencyMode,culled:skinMaterial?.backFaceCulling},topPick:{hit:topPick?.hit,y:topPick?.pickedPoint?.y},
    opaqueCheeks:cheeks.every(m=>m.material&&m.material.alpha===1&&m.material.backFaceCulling===false&&m.getTotalIndices()>0),
    opaqueCores:cores.every(m=>m.material&&m.material.alpha===1),
    minCheekThickness:Math.min(...cheeks.map(m=>m.getBoundingInfo().boundingBox.maximumWorld.x-m.getBoundingInfo().boundingBox.minimumWorld.x)),
    bankCheekAlbedo:cheeks.filter(m=>m.material?.name?.includes(' -12 15')).map(m=>m.material.diffuseColor.asArray()),
    connection:meshes.filter(m=>m.name==='HALFPIPE PARK CONNECTION').length,
    bottom:bottom?[bottom.position.x,bottom.position.z]:null,
    bottomSurface:bottom?{material:bottom.material?.name,alpha:bottom.material?.alpha,blend:bottom.material?.needAlphaBlending(),emissive:bottom.material?.emissiveColor?.asArray(),top:bottom.getBoundingInfo().boundingBox.maximumWorld.y,rayHit:bottomPick?.hit}:null,
    skater:!!d.skater,rendered:d.scene.getFrameId()>1,canvasWidth:d.engine.getRenderingCanvas().width,
    independentCamera:!!d.cameraAnchor&&d.camera.lockedTarget===d.cameraAnchor,staticBatches:d.staticBatchReport};
  });
  // The park is expanded frequently; derive expected cheeks/cores from the
  // actual number of skatable ramp meshes rather than a stale six-ramp layout.
  assert(status.skinCount>=6,'Expected a complete multi-ramp skatepark');
  assert.equal(status.rampCheeks,status.skinCount*2,'Every ramp needs two solid concrete sidewalls');
  assert.equal(status.cores,0,'Sealed ramp bodies must not contain overlapping concrete infill cores');
  assert.equal(status.skinMaterial.alpha,1,'Riding skin must be opaque');
  assert(status.skinOcclusion.every(m=>m.alpha===1&&!m.blending&&!m.textureAlpha&&!m.depthWriteDisabled&&m.meshVisibility===1&&m.meshVisible&&m.meshEnabled&&m.indices>0),
   'Every ramp skin must be visible, opaque, depth-writing geometry to prevent ground-grid bleed-through: '+JSON.stringify(status.skinOcclusion));
  assert.equal(status.bottomDepthWriteDisabled,false,'Halfpipe floor must write depth to occlude the plaza grid');
  assert.equal(status.skinMaterial.blend,false,'Riding skin must not use alpha blending');
  assert.equal(status.skinMaterial.culled,false,'Riding skin must render from both sides');
  assert(status.topPick.hit&&Number.isFinite(status.topPick.y),'A ray must hit the halfpipe riding skin');
  assert(status.opaqueCheeks,'Ramp exterior sidewall materials must be opaque');
  assert(status.minCheekThickness>=.22,'Ramp sidewalls must be thick, capped 3D geometry rather than flat triangles');
  assert.equal(status.bankCheekAlbedo.length,2,'Starting ramp must have both exterior cheeks');
  assert(status.bankCheekAlbedo.every(c=>c.every(v=>v>=.65)),'Starting ramp exterior must be daylight-bright rather than black wedge');
  assert.equal(status.connection,1,'Halfpipe must connect to park');
  assert.deepEqual(status.bottom,[-36,-18.1],'Halfpipe must be at current plaza coordinates');
  assert.equal(status.bottomSurface?.material,'sealed birch skate ramp plywood','Halfpipe flat bottom must continue the wooden riding surface instead of exposing gray plaza concrete');
  assert(status.bottomSurface?.alpha===1&&!status.bottomSurface?.blend&&status.bottomSurface?.rayHit,'Halfpipe floor must be opaque, ray-pickable solid geometry');
  assert(Math.abs(status.bottomSurface.top)<.025,'Halfpipe floor must meet the two transition toes near ground level');
  assert(status.bottomSurface.emissive[0]>=.2,'Wooden transitions need enough fill light to remain visible on mobile');
  assert(status.skater&&status.rendered&&status.canvasWidth>0,'WebGL scene must render');
  // Confirm the actual WebGL scene uses the sculpted nose/tail and curved grip,
  // not a rectangular placeholder deck. These meshes remain skater children.
  const deckVisual=await page.evaluate(()=>{
   const scene=window.__SOL_DIAGNOSTICS__.scene;
   const deck=scene.meshes.find(m=>m.name==='deck');
   const grip=scene.meshes.find(m=>m.name==='grip tape');
   return {deckVertices:deck?.getTotalVertices(),gripVertices:grip?.getTotalVertices(),
    samePivot:!!deck?.parent&&deck.parent===grip?.parent,
    visible:!!deck?.isVisible&&!!grip?.isVisible};
  });
  assert(deckVisual.deckVertices>=160&&deckVisual.gripVertices>=80&&deckVisual.samePivot&&deckVisual.visible,
   'Actual skater must render sculpted board and grip attached to one animated pivot: '+JSON.stringify(deckVisual));
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
  // Wait beyond the pointer de-duplication window before exercising fallback.
  await page.waitForTimeout(500);
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
  // Reproduce the actual left coping launch through the live physics loop.
  // A high bank without vert-air can pass geometry-only tests, so assert the
  // skater really leaves the lip upward and moves back into the halfpipe.
  const vertStart=await page.evaluate(()=>{
   const s=window.__SOL_DIAGNOSTICS__.state;
   const r={x:-36,z:-25.8,w:38,d:8.4,h:4.5,curve:'halfpipe-left'};
   const z=-29.76,ground=window.SOLTerrain.profile(r,(z-(r.z-r.d/2))/r.d).height;
   Object.assign(s,{x:-36,z,y:ground,groundY:ground,dir:Math.PI,
    speed:8,travelSign:1,grounded:true,grinding:false,vy:0,
    rampCooldown:0,grindCooldown:0,flip:0,spin:0});
   return {z,ground};
  });
  await page.waitForFunction(()=>{
   const s=window.__SOL_DIAGNOSTICS__.state;
   return s.name==='HALFPIPE VERT AIR'&&!s.grounded;
  },null,{timeout:6000});
  const vertAir=await page.evaluate(()=>{
   const s=window.__SOL_DIAGNOSTICS__.state;
   return {name:s.name,grounded:s.grounded,y:s.y,vy:s.vy,
    takeoffY:s.vertTakeoffY,previousY:s.vertTakeoffPreviousY,postY:s.vertLaunchPostY,
    airVZ:s.airVZ,airVX:s.airVX,z:s.z,speed:s.speed};
  });
  assert(vertAir.name==='HALFPIPE VERT AIR'&&!vertAir.grounded&&
   vertAir.takeoffY>2.4&&vertAir.takeoffY<4.5&&Math.abs(vertAir.takeoffY-vertAir.previousY)<.08&&Math.abs(vertAir.postY-vertAir.takeoffY)<.08&&Number.isFinite(vertAir.vy)&&vertAir.airVZ>0&&
   Math.abs(vertAir.airVX)<1,
   'Halfpipe must launch vertically above left coping and return inward: '+
    JSON.stringify({vertStart,vertAir}));
  // Clearance must be achieved by upward flight, not by a one-frame Y snap.
  await page.waitForFunction(()=>{
   const s=window.__SOL_DIAGNOSTICS__.state;
   return s.name==='HALFPIPE VERT AIR'&&!s.grounded&&s.y>4.5;
  },null,{timeout:6000});
  // A vertical launch is incomplete until the skater returns to the riding
  // surface. Catch missed collisions and airborne states that never resolve.
  await page.waitForFunction(()=>{
   const s=window.__SOL_DIAGNOSTICS__.state;
   return s.grounded&&!s.grinding&&s.z> -29.7&&s.y>=0&&s.y<4.5;
  },null,{timeout:6000});
  const vertLanding=await page.evaluate(()=>{
   const s=window.__SOL_DIAGNOSTICS__.state;
   const r={x:-36,z:-25.8,w:38,d:8.4,h:4.5,curve:'halfpipe-left'};
   const expected=window.SOLTerrain.profile(r,(s.z-(r.z-r.d/2))/r.d).height;
   return {grounded:s.grounded,z:s.z,y:s.y,expected,speed:s.speed,travelSign:s.travelSign,message:document.querySelector('#msg').textContent};
  });
  assert(vertLanding.grounded&&Math.abs(vertLanding.y-vertLanding.expected)<.15&&
   vertLanding.speed>.65&&!vertLanding.message.includes('BAIL'),
   'Halfpipe vert air must land on the physical transition with rolling momentum: '+
    JSON.stringify({vertStart,vertAir,vertLanding}));
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
  // Rendered-pixel occlusion regression: the concrete plaza is BELOW the
  // halfpipe. Removing it must not change pixels on the visible wooden
  // riding surfaces. Material alpha checks alone cannot catch shader-level
  // depth bugs or coplanar floor bleed-through.
  const floorOcclusionQA=await (async()=>{
   const before=await page.screenshot({animations:'disabled'});
   const hidden=await page.evaluate(()=>{
    const meshes=window.__SOL_DIAGNOSTICS__.scene.meshes.filter(m=>
     m.name==='park continuous concrete'||m.name==='ground');
    for(const m of meshes)m.setEnabled(false);
    return meshes.length;
   });
   await page.waitForTimeout(150);
   const after=await page.screenshot({animations:'disabled'});
   await page.evaluate(()=>{
    for(const m of window.__SOL_DIAGNOSTICS__.scene.meshes)
     if(m.name==='park continuous concrete'||m.name==='ground')m.setEnabled(true);
   });
   // Positive control: removing the visible ramp must noticeably change
   // the same pixels. Otherwise a zero-difference occlusion result could
   // simply be sampling the sky or an unrelated piece of scenery.
   const rampHidden=await page.evaluate(()=>{
    const names=new Set(['solid skatable concrete ramp','SOLID RAMP SIDE WALL',
      'HALFPIPE FLAT BOTTOM','HALFPIPE PARK CONNECTION']);
    const meshes=window.__SOL_DIAGNOSTICS__.scene.meshes.filter(m=>names.has(m.name));
    window.__SOL_RAMP_CHALLENGE__=meshes.map(m=>[m,m.isEnabled()]);
    for(const m of meshes)m.setEnabled(false);
    return meshes.length;
   });
   await page.waitForTimeout(150);
   const rampRemoved=await page.screenshot({animations:'disabled'});
   await page.evaluate(()=>{
    for(const [mesh,enabled] of window.__SOL_RAMP_CHALLENGE__||[])mesh.setEnabled(enabled);
    delete window.__SOL_RAMP_CHALLENGE__;
   });
   const samples=await page.evaluate(async ([a,b,c])=>{
    async function pixels(encoded){
     const img=new Image();img.src='data:image/png;base64,'+encoded;await img.decode();
     const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
     const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
     return ctx.getImageData(0,0,c.width,c.height);
    }
    const p=await pixels(a),q=await pixels(b),r=await pixels(c);
    // Stable interior ramp locations in the dedicated 960x540 side view;
    // exclude the moving rider and the coping silhouette.
    const spots=[[180,350],[780,350],[480,450]];
    return spots.map(([x,y])=>{
     let total=0,control=0,count=0;
     for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const i=((y+dy)*p.width+x+dx)*4;
      for(let k=0;k<3;k++){
       total+=Math.abs(p.data[i+k]-q.data[i+k]);
       control+=Math.abs(p.data[i+k]-r.data[i+k]);
       count++;
      }
     }
     return {x,y,meanChannelDelta:total/count,rampRemovalDelta:control/count};
    });
   },[before.toString('base64'),after.toString('base64'),rampRemoved.toString('base64')]);
   return {hiddenFloorMeshes:hidden,hiddenRampMeshes:rampHidden,samples};
  })();
  assert(floorOcclusionQA.hiddenFloorMeshes>=4,'Expected underlying park floor meshes for the occlusion challenge');
  assert(floorOcclusionQA.samples.every(s=>s.meanChannelDelta<8),
   'Underlying plaza changes visible halfpipe riding pixels (ground bleed-through): '+JSON.stringify(floorOcclusionQA));
  assert(floorOcclusionQA.hiddenRampMeshes>=10&&
    floorOcclusionQA.samples.filter(s=>s.rampRemovalDelta>15).length>=2,
   'Halfpipe occlusion samples must visibly react when ramp geometry is removed: '+JSON.stringify(floorOcclusionQA));

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
   // Advance in the same browser task as capture: an intervening
   // requestAnimationFrame can move the rider up the wall and invalidate
   // the original wall-height baseline without any gameplay defect.
   const initialY=s.y,top=s.grindRail?.y,kind=s.grindRail?.kind,vy=s.vy;
   for(let i=0;i<15;i++)window.SOLGrind.advance(s,1/60);
   return {grinding:s.grinding,kind,vy,y:s.y,wallY,
    entry:{initialY,top,finalY:s.y,grinding:s.grinding}};
  });
  assert(touchCoping.grinding&&touchCoping.kind==='bowl-coping'&&touchCoping.vy===0,
   'GRIND touch control must catch bowl coping without forcing ollie: '+JSON.stringify(touchCoping));
  // Coping capture from a near-vertical wall must not teleport the skater
  // more than a metre upward in a single input frame. The board eases onto
  // the lip over the first 0.22s while staying attached to the circular rail.
  const copingEntry=touchCoping.entry;
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
   const seams=d.scene.meshes.filter(x=>x.name==='BOWL BATCHED CONCRETE SEAMS');
   const oldSeams=d.scene.meshes.filter(x=>x.name.startsWith('radial concrete pour joint ')||x.name==='inset bowl tile ring 0.72'||x.name==='inset bowl tile ring 0.91');
   const blueInlay=d.scene.meshes.filter(x=>x.name==='inset bowl tile ring 0.78');
   return {seamBatchCount:seams.length,seamIndices:seams[0]?.getTotalIndices(),unbatchedSeamCount:oldSeams.length,blueInlayCount:blueInlay.length,
    exists:!!m,indices:m?.getTotalIndices(),materialAlpha:m?.material?.alpha,
    depthWrite:m?.material?.forceDepthWrite,blend:m?.material?.needAlphaBlending(),textureName:m?.material?.diffuseTexture?.name,
    rayHit:!!hit?.hit,rayY:hit?.pickedPoint?.y,surfaceY:sample?.height,
    centerY:window.SOLBowl.sample(0,-106)?.height,
    diameterMeters:window.SOLBowl.bowl.radius*2,depthMeters:window.SOLBowl.bowl.depth,
    meshes:d.scene.meshes.length,fps:d.engine.getFps()};
  });
  assert(bowl.exists&&bowl.indices>30000,'Full tessellated bowl must exist');
  assert(bowl.seamBatchCount===1&&bowl.seamIndices>1000&&bowl.unbatchedSeamCount===0&&bowl.blueInlayCount===1,
   'Decorative bowl seams must render as one batched mesh while retaining the contrasting blue inlay: '+JSON.stringify(bowl));
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


  // End-to-end controller path: emulate the Standard Gamepad API inside
  // actual Chromium/WebGL. This tests the render-loop wiring as well as the
  // isolated adapter, without claiming a physical Bluetooth test.
  await page.evaluate(()=>{
    document.querySelector('#restart').click();
    const buttons=Array.from({length:17},()=>({pressed:false,value:0}));
    window.__qaPad={index:0,id:'Xbox Wireless Controller',connected:true,mapping:'standard',axes:[0,0,0,0],buttons};
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.__qaPad]});
    buttons[7].value=.8; // Some browsers report analog RT without pressed=true.
  });
  await page.waitForTimeout(850);
  const xboxPush=await page.evaluate(()=>({
    speed:window.__SOL_DIAGNOSTICS__.state.speed,
    status:document.querySelector('#status').textContent
  }));
  assert(xboxPush.speed>.3&&xboxPush.status.includes('Xbox connected'),
    'Emulated Xbox analog RT must actually accelerate the skater: '+JSON.stringify(xboxPush));
  await page.evaluate(()=>{
    window.__qaPad.buttons[7].value=0;
    window.__qaPad.buttons[0].pressed=true;
    window.__qaPad.buttons[0].value=1;
  });
  // Synchronize with the first airborne ollie frame, not an arbitrary wall-clock
  // delay: SwiftShader CI can simulate the apex/descent before 350ms elapses.
  await page.waitForFunction(()=>{const s=window.__SOL_DIAGNOSTICS__.state;return s.name==='OLLIE'&&!s.grounded;},null,{timeout:1800});
  const xboxOllie=await page.evaluate(()=>({
    grounded:window.__SOL_DIAGNOSTICS__.state.grounded,
    vy:window.__SOL_DIAGNOSTICS__.state.vy,
    name:window.__SOL_DIAGNOSTICS__.state.name
  }));
  assert(!xboxOllie.grounded&&xboxOllie.name==='OLLIE',
    'Emulated Xbox A button must launch an actual ollie: '+JSON.stringify(xboxOllie));
  await page.evaluate(()=>{window.__qaPad.connected=false});
  await page.waitForTimeout(250);
  const xboxDisconnect=await page.locator('#status').textContent();
  assert(xboxDisconnect.includes('Press a controller button'),
    'Disconnect must return to touch-friendly input status: '+xboxDisconnect);
  const gamepadIntegration={result:'PASS',xboxPush,xboxOllie,xboxDisconnect};

  // Render a close-up of the actual animated skater so visual regressions
  // are reviewable instead of relying on distant park screenshots alone.
  await page.evaluate(()=>{
   const d=window.__SOL_DIAGNOSTICS__,B=window.BABYLON;
   Object.assign(d.state,{x:0,z:0,y:0,vy:0,speed:0,grounded:true,
    grinding:false,halfpipePreviewUntil:0});
   const cam=new B.ArcRotateCamera('QA skater closeup',.15,1.23,4.2,
    new B.Vector3(0,1.25,0),d.scene);
   cam.fov=.75;cam.minZ=.1;d.scene.activeCamera=cam;d.detailCamera=cam;
  });
  await page.setViewportSize({width:960,height:540});
  await page.waitForTimeout(600);
  await page.screenshot({path:'test-artifacts/skater-closeup-chromium.png',animations:'disabled'});
  await checkSceneScreenshot('test-artifacts/skater-closeup-chromium.png','skater');
  await page.evaluate(()=>{
   const d=window.__SOL_DIAGNOSTICS__;
   d.scene.activeCamera=d.camera;d.detailCamera.dispose();delete d.detailCamera;
  });
  // Real WebGL render-loop acceptance for the reported Samsung bug:
  // approach the left wall of the ledge at (5,39) diagonally, slide past
  // its far end, and retain enough momentum to continue skating.
  await page.evaluate(()=>{
    document.querySelector('#restart').click();
    const s=window.__SOL_DIAGNOSTICS__.state;
    Object.assign(s,{x:-1,z:39,y:0,groundY:0,vy:0,dir:Math.PI/4,
      speed:9,travelSign:1,grounded:true,grinding:false,grindRail:null,
      grindCooldown:1,rampCooldown:1,airVX:null,airVZ:null,onRamp:false,
      controlSteer:0,controlThrottle:0,halfpipePreviewUntil:0});
  });
  // Prove contact while still alongside the solid, not just at its far end.
  // This prevents a false positive from a rider who simply crosses z=43
  // without ever touching the wall. Sample live game state during rendering.
  await page.waitForFunction(()=>{
    const s=window.__SOL_DIAGNOSTICS__.state;
    return s.z>39&&s.z<42&&s.x>=.65&&s.x<=.74&&s.grounded;
  },null,{timeout:2400});
  const wallContact=await page.evaluate(()=>{
    const s=window.__SOL_DIAGNOSTICS__.state;
    return {x:s.x,z:s.z,speed:s.speed,grounded:s.grounded};
  });
  assert(wallContact.speed>3,'Wall contact must retain useful momentum: '+JSON.stringify(wallContact));
  await page.screenshot({path:'test-artifacts/ledge-wall-contact.png',animations:'disabled'});
  await page.waitForFunction(()=>{
    const s=window.__SOL_DIAGNOSTICS__.state;
    return s.z>43;
  },null,{timeout:5500});
  const wallSlide=await page.evaluate(()=>{
    const s=window.__SOL_DIAGNOSTICS__.state;
    return {x:s.x,z:s.z,speed:s.speed,grounded:s.grounded};
  });
  assert(wallSlide.x>=.65&&wallSlide.x<=.74&&wallSlide.speed>3&&wallSlide.grounded,
    'Live WebGL skater must slide past ledge end without penetration: '+JSON.stringify(wallSlide));
  await page.screenshot({path:'test-artifacts/ledge-wall-slide.png',animations:'disabled'});

  assert.equal(errors.length,0,'Browser errors: '+errors.join('; '));
  fs.writeFileSync('test-artifacts/browser-result.txt',JSON.stringify({result:'PASS',controllerQA,gamepadIntegration,visualQA,facadeQA,wallContact,wallSlide,spawnView,spawnPixels,cheekNormals,impactNormals,rampGravity,screenshotQA,floorOcclusionQA,status,spin,push,touchTricks,clickFallback,riding,vertStart,vertAir,vertLanding,boardInput,boardslide,touchCoping,copingEntry,coping,bowl,parkWalls},null,2));console.log('PASS Chromium WebGL geometry, independent aerial yaw, joystick, push, halfpipe, bowl raycast and visual screenshots',status,spin,push,riding,bowl);
 }finally{await browser.close()}
})().catch(e=>{fs.mkdirSync('test-artifacts',{recursive:true});fs.writeFileSync('test-artifacts/browser-result.txt','FAIL: '+(e&&e.stack||String(e)));console.error(e);process.exitCode=1}).finally(()=>server.close());
