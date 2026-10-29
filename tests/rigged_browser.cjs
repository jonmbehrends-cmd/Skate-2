/* Actual Chromium + WebGL. No mocked engine, loader, or GLB; also runs on Pages. */
const {chromium}=require('playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(p,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':p.endsWith('.js')?'application/javascript':p.endsWith('.glb')?'model/gltf-binary':p.endsWith('.png')?'image/png':'text/html'});res.end(e?'':data)})});
let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
 const url=process.env.SOL_GAME_URL||'http://127.0.0.1:'+server.address().port+'/?park=classic';
 const results=[];
 for(const mobile of [false,true]){
  const label=mobile?'mobile':'desktop';
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:1});
  const errors=[],requests=[],warnings=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>requests.push(r.url()));page.on('console',m=>{if(['error','warning'].includes(m.type()))warnings.push(m.text())});
  await page.goto(url);
  try{await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__?.rig?.status.ready,null,{timeout:12000})}
  catch(e){const diagnostic=await page.evaluate(()=>({build:window.__SOL_BUILD__,diagnostics:!!window.__SOL_DIAGNOSTICS__,plugin:window.BABYLON?.SceneLoader?.IsPluginForExtensionAvailable?.('.glb'),skinnedMeshes:window.__SOL_DIAGNOSTICS__?.scene?.meshes.filter(m=>m.skeleton).map(m=>m.name),errorBox:document.querySelector('#error')?.textContent}));throw Error('Rig startup failed: '+JSON.stringify({diagnostic,errors,requests,warnings})+'; '+e.message)};
  const ready=await page.evaluate(()=>{const d=__SOL_DIAGNOSTICS__;return {version:BABYLON.Engine.Version,build:__SOL_BUILD__,status:d.rig.status,active:d.rig.meshes.filter(m=>m.isEnabled()&&m.isVisible&&m.skeleton&&m.getTotalVertices()>0).length,legacy:d.scene.meshes.filter(m=>['torso','head','thigh','shin','shoe'].includes(m.name)&&m.isVisible).length}});
  assert.equal(ready.version,'8.32.1');assert(ready.active>=4,'Hoodie apparel must have at least four skinned meshes');assert.equal(ready.legacy,0);assert.equal(ready.status.bones,62);assert(ready.status.source.includes('quaternius-hoodie'));
  await page.screenshot({path:path.join(out,'skeletal-'+label+'-spawn.png')});
  // The production PUSH control is the button, not keyboard W (W only steers throttle).
  // Dispatch the same pointerdown handler for desktop and mobile, then observe the
  // animation in a real running Chromium/WebGL frame rather than a mocked pose.
  await page.locator('[data-t="push"]').dispatchEvent('pointerdown',{
   pointerId:1,pointerType:mobile?'touch':'mouse',isPrimary:true
  });
  const sawPush=await page.evaluate(()=>new Promise(resolve=>{
   let frames=0;
   function sample(){
    const d=window.__SOL_DIAGNOSTICS__;
    if(d?.rig?.status.mode==='push')return resolve(true);
    if(++frames>180)return resolve(false);
    requestAnimationFrame(sample);
   }
   requestAnimationFrame(sample);
  }));
  assert(sawPush,'PUSH button must animate production rig: '+JSON.stringify(await page.evaluate(()=>({
   input:__SOL_DIAGNOSTICS__.input(),
   state:{grounded:__SOL_DIAGNOSTICS__.state.grounded,onRamp:__SOL_DIAGNOSTICS__.state.onRamp,speed:__SOL_DIAGNOSTICS__.state.speed,pushBurstUntil:__SOL_DIAGNOSTICS__.state.pushBurstUntil},
   rig:__SOL_DIAGNOSTICS__.rig.status.mode
  }))));
  await page.screenshot({path:path.join(out,'skeletal-'+label+'-push.png')});
  await page.locator('[data-t="push"]').dispatchEvent('pointerup',{pointerId:1,pointerType:mobile?'touch':'mouse'});
  await page.locator('[data-t="kick"]').click();
  await page.waitForFunction(()=>__SOL_DIAGNOSTICS__.rig.status.mode==='flip');
  await page.waitForFunction(()=>__SOL_DIAGNOSTICS__.state.grounded,null,{timeout:15000});
  // Close-up pose gallery uses the exact production joint updater in the real
  // scene, with physics paused only while taking deterministic inspection views.
  await page.evaluate(()=>{const d=__SOL_DIAGNOSTICS__,B=BABYLON;d.engine.stopRenderLoop();d.skater.position.set(0,0,0);d.skater.rotation.set(0,0,0);d.scene.activeCamera=new B.ArcRotateCamera('rig QA',-.9,1.25,4.3,new B.Vector3(0,1.2,0),d.scene);d.scene.getTransformNodeByName('rider terrain stance').rotation.set(0,0,0);d.scene.getTransformNodeByName('board pivot').rotation.set(0,0,0)});
  // Let the previous gameplay landing recovery finish before asserting a new PUSH pose.
  await page.evaluate(()=>{for(let i=0;i<40;i++)__SOL_DIAGNOSTICS__.rig.update({grounded:true,speed:5},{crouch:0},{dt:1/60})});
  const signatures=new Map();
  for(const mode of ['ride','push','push-toe-lift','push-recovery','push-cycle-end','crouch','ollie','push-ollie','flip','grab','grind','landing']){
   const evidence=await page.evaluate(mode=>{const d=__SOL_DIAGNOSTICS__,state={grounded:['ride','push','push-toe-lift','push-recovery','push-cycle-end','crouch','landing'].includes(mode),speed:5,travelSign:1,flip:mode==='flip'?1:0,airTime:mode==='flip'?.21:0};const pose={crouch:mode==='crouch'?.23:.1,pushing:['push','push-toe-lift','push-recovery','push-cycle-end','push-ollie'].includes(mode),contact:mode==='push-toe-lift'||mode==='push-recovery'||mode==='push-cycle-end'?0:.8,recovery:mode==='push-toe-lift'?.7:mode==='push-recovery'?1:0,pushPhase:mode==='push'?Math.PI/2:mode==='push-toe-lift'?Math.PI*1.25:mode==='push-recovery'?Math.PI*1.5:mode==='push-cycle-end'?2*Math.PI-.001:undefined};d.rig.update(state,pose,{grabbing:mode==='grab',grinding:mode==='grind'});d.scene.render();return {status:d.rig.status,matrices:Array.from(d.rig.skeletons[0].getTransformMatrices(d.rig.meshes[0])),vertices:d.rig.meshes[0].getTotalVertices()};},mode);
   assert(evidence.vertices>100);assert(evidence.matrices.every(Number.isFinite));
   if(mode==='ollie')assert.equal(evidence.status.mode,'ollie','Takeoff pose must render in Chromium');signatures.set(mode,JSON.stringify(evidence.matrices));
   await page.screenshot({path:path.join(out,'skeletal-'+label+'-'+mode+'-closeup.png')});
   // A single three-quarter camera can conceal an anatomically implausible
   // seated or prone grab. Preserve real GLB side/opposite-side WebGL evidence.
   if(mode==='grab'||mode==='grind'||mode==='flip'){
    for(const [view,alpha] of [['side',0],['opposite',Math.PI]]){
     await page.evaluate(angle=>{const d=__SOL_DIAGNOSTICS__;d.scene.activeCamera.alpha=angle;d.scene.render()},alpha);
     await page.screenshot({path:path.join(out,'skeletal-'+label+'-'+mode+'-'+view+'.png')});
    }
    await page.evaluate(()=>{const d=__SOL_DIAGNOSTICS__;d.scene.activeCamera.alpha=-.9;d.scene.render()});
   }
   if(mode==='flip'){
    assert(evidence.status.flipFootPitch>.15&&evidence.status.flipFootPitch<.17,
     'Real hoodie kickflip must rotate the leading ankle in Chromium');
    assert(evidence.status.toeDirections[0][1]<-.08&&Math.abs(evidence.status.toeDirections[1][1])<.1,
     'Actual skinned GLB toes must flick down on the leading foot only');
   }
   if(mode==='grind'){
    assert(evidence.status.grindLean>.08&&evidence.status.grindLean<.09,
     'Real hoodie grind pose must lean across the trucks');
    assert(evidence.status.feet.every(f=>Math.abs(f[1]-.45)<.035),
     'Real hoodie grind must keep both shoes on the board');
   }
   if(mode==='grab'){const dist=Math.hypot(...evidence.status.hands[1].map((n,i)=>n-evidence.status.grip[i]));assert(dist<.12,'Hoodie hand must touch board: '+JSON.stringify({dist,hands:evidence.status.hands,grip:evidence.status.grip,feet:evidence.status.feet}));
    assert(evidence.status.grabReachShift<.45,'Grab must not require extreme chest displacement: '+evidence.status.grabReachShift);
   }
   if(mode==='push-ollie'){
    assert.equal(evidence.status.mode,'ollie','Held PUSH must transition into airborne ollie');
    assert.equal(evidence.status.pushingNow,false,'No grounded push after takeoff');
    assert.equal(evidence.status.pushCompression,0);
    assert.equal(evidence.status.pushLean,0);
    assert.equal(evidence.status.armPose.counter,0);
    assert(evidence.status.feet[1][1]>.45,'Airborne back shoe must not remain planted on pavement');
   }
   if(mode==='push'){
    assert(evidence.status.feet[1][1]<.25,'Hoodie pushing foot must reach pavement');
    assert(evidence.status.pushLean>.05&&evidence.status.pushLean<.09,'Hoodie chest must balance the push without excessive hunch');
   }
   if(mode==='push-toe-lift'){
    assert.equal(evidence.status.mode,'push');
    assert(evidence.status.pushFootRoll>.12&&evidence.status.pushFootRoll<.15,
     'Shoe must roll during airborne push return in real WebGL');
    assert(evidence.status.toeDirections[1][1]>.1,
     'Imported GLB toes must lift, not point downward: '+JSON.stringify(evidence.status.toeDirections));
    assert(evidence.status.feet[1][1]>.26&&evidence.status.feet[1][1]<.4,
     'Recovery roll should occur while the pushing shoe is rising');
   }
   if(mode==='push-recovery'||mode==='push-cycle-end'){
    assert.equal(evidence.status.mode,'push');
    const f=evidence.status.feet[1];
    assert(Math.abs(f[0]-.015)<.035&&Math.abs(f[1]-.45)<.035&&Math.abs(f[2]+.36)<.035,
     'Recovered push foot must plant on deck: '+JSON.stringify(f));
   }
   if(['ride','push-recovery','ollie','grind','landing'].includes(mode))
    assert(evidence.status.toeDirections?.length===2&&evidence.status.toeDirections.every(t=>t[0]>.95&&Math.abs(t[1])<.1&&Math.abs(t[2])<.18),
     'Both real GLB shoes must face across the board in '+mode+': '+JSON.stringify(evidence.status.toeDirections));
   if(mode==='ride')assert.equal(evidence.status.pushLean,0,'Neutral ride must have no push lean');
   if(mode==='landing'){
    assert(evidence.status.landingCompression>.14&&evidence.status.landingHinge>.08,
     'Landing must absorb impact through knees and hips in real Chromium');
    assert(evidence.status.armPose.drop>.19,'Landing arms must lower for balance');
    assert(evidence.status.feet.every(f=>Math.abs(f[1]-.45)<.035),
     'Landing shoes must remain planted on the deck');
   }
  }
  assert(new Set(signatures.values()).size>=6,'Skate, crouch, ollie, flip, grab and landing must deform the skin differently');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  results.push({label,result:'PASS',ready,distinctPoses:new Set(signatures.values()).size});await page.close();
 }
 // A synthetic pointerdown can bypass mobile hit-testing and release timing.
 // Exercise an actual Chromium touch tap on the visible PUSH button in both
 // parks, including the default Newberg experience, and require acceleration.
 for(const park of ['classic','newberg']){
  const touchPage=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const touchUrl=new URL(url);touchUrl.searchParams.set('park',park);
  await touchPage.goto(touchUrl.toString());
  await touchPage.waitForFunction(park=>{
   const d=window.__SOL_DIAGNOSTICS__;
   return !!(d?.inputReady&&d.rig?.status.ready&&(park==='classic'||d.park?.name));
  },park,{timeout:20000});
  const pushButton=touchPage.locator('[data-t="push"]'),rect=await pushButton.boundingBox();
  assert(rect&&rect.width>=44&&rect.height>=44,'PUSH must have a real mobile hit target in '+park);
  const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
  const topmost=await touchPage.evaluate(({x,y})=>{
   const button=document.querySelector('[data-t="push"]');
   return button===document.elementFromPoint(x,y);
  },{x,y});
  assert(topmost,'PUSH is covered by another element in '+park+' at '+JSON.stringify({x,y}));
  const before=await touchPage.evaluate(()=>__SOL_DIAGNOSTICS__.state.speed);
  await touchPage.touchscreen.tap(x,y);
  const accelerated=await touchPage.waitForFunction(before=>
   __SOL_DIAGNOSTICS__.state.speed>Math.max(.65,before+.5),before,{timeout:1600}).then(()=>true,()=>false);
  await touchPage.screenshot({path:path.join(out,'skeletal-mobile-'+park+'-real-push.png')});
  const after=await touchPage.evaluate(()=>({
   speed:__SOL_DIAGNOSTICS__.state.speed,
   grounded:__SOL_DIAGNOSTICS__.state.grounded,
   onRamp:__SOL_DIAGNOSTICS__.state.onRamp,
   burst:__SOL_DIAGNOSTICS__.state.pushBurstUntil,
   mode:__SOL_DIAGNOSTICS__.rig?.status.mode
  }));
  assert(accelerated,'Real mobile PUSH tap did not accelerate in '+park+': '+JSON.stringify({before,after}));
  results.push({label:'mobile-real-push-'+park,result:'PASS',before,after});
  await touchPage.close();
 }
 // Verify fallback visually at both viewport sizes. The production GLB
 // intentionally fails to load; a skinned, visible V2 rider must remain.
 for(const mobile of [false,true]){
  const label=mobile?'mobile':'desktop';
  const fallback=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:1});
  await fallback.route('**/hoodie-character.glb',r=>r.abort());
  await fallback.goto(url);
  await fallback.waitForFunction(()=>window.__SOL_DIAGNOSTICS__);
  await fallback.waitForTimeout(1000);
  assert(await fallback.evaluate(()=>!__SOL_DIAGNOSTICS__.rig&&__SOL_DIAGNOSTICS__.riderV2?.meshes.some(m=>m.isVisible&&m.isEnabled()&&m.skeleton&&m.getTotalVertices()>0)),
   'GLB load failure must preserve visible, skinned V2 fallback ('+label+')');
  await fallback.screenshot({path:path.join(out,'skeletal-'+label+'-fallback.png')});
  await fallback.close();
 }
 fs.writeFileSync(path.join(out,'skeletal-result.json'),JSON.stringify({url,result:'PASS',commit:process.env.GITHUB_SHA,results},null,2));console.log('PASS desktop/mobile Chromium: real GLB, skin deformation, gameplay push/flip/landing, adult hoodie IK poses, fallback, no startup errors');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
