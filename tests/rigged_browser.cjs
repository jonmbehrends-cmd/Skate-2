/* Actual Chromium + WebGL. No mocked engine, loader, or GLB; also runs on Pages. */
const {chromium}=require('playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(p,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':p.endsWith('.js')?'application/javascript':p.endsWith('.glb')?'model/gltf-binary':p.endsWith('.png')?'image/png':'text/html'});res.end(e?'':data)})});
let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
 const url=process.env.SOL_GAME_URL||'http://127.0.0.1:'+server.address().port+'/';
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
  for(const mode of ['ride','push','crouch','ollie','flip','grab','grind','landing']){
   const evidence=await page.evaluate(mode=>{const d=__SOL_DIAGNOSTICS__,state={grounded:['ride','push','crouch','landing'].includes(mode),speed:5,travelSign:1,flip:mode==='flip'?1:0};const pose={crouch:mode==='crouch'?.23:.1,pushing:mode==='push',contact:.8};d.rig.update(state,pose,{grabbing:mode==='grab',grinding:mode==='grind'});d.scene.render();return {status:d.rig.status,matrices:Array.from(d.rig.skeletons[0].getTransformMatrices(d.rig.meshes[0])),vertices:d.rig.meshes[0].getTotalVertices()};},mode);
   assert(evidence.vertices>100);assert(evidence.matrices.every(Number.isFinite));
   if(mode==='ollie')assert.equal(evidence.status.mode,'ollie','Takeoff pose must render in Chromium');signatures.set(mode,JSON.stringify(evidence.matrices));
   await page.screenshot({path:path.join(out,'skeletal-'+label+'-'+mode+'-closeup.png')});
   if(mode==='grab'){const dist=Math.hypot(...evidence.status.hands[1].map((n,i)=>n-evidence.status.grip[i]));assert(dist<.12,'Hoodie hand must touch board: '+JSON.stringify({dist,hands:evidence.status.hands,grip:evidence.status.grip,feet:evidence.status.feet}));
    assert(evidence.status.grabReachShift<.45,'Grab must not require extreme chest displacement: '+evidence.status.grabReachShift);
   }
   if(mode==='push'){
    assert(evidence.status.feet[1][1]<.25,'Hoodie pushing foot must reach pavement');
    assert(evidence.status.pushLean>.05&&evidence.status.pushLean<.09,'Hoodie chest must balance the push without excessive hunch');
   }
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
 const fallback=await browser.newPage();await fallback.route('**/hoodie-character.glb',r=>r.abort());await fallback.goto(url);await fallback.waitForFunction(()=>window.__SOL_DIAGNOSTICS__);await fallback.waitForTimeout(1000);
 assert(await fallback.evaluate(()=>!__SOL_DIAGNOSTICS__.rig&&__SOL_DIAGNOSTICS__.riderV2?.meshes.some(m=>m.isVisible&&m.isEnabled()&&m.skeleton&&m.getTotalVertices()>0)),'GLB load failure must preserve visible, skinned V2 fallback');
 await fallback.close();
 fs.writeFileSync(path.join(out,'skeletal-result.json'),JSON.stringify({url,result:'PASS',commit:process.env.GITHUB_SHA,results},null,2));console.log('PASS desktop/mobile Chromium: real GLB, skin deformation, gameplay push/flip/landing, adult hoodie IK poses, fallback, no startup errors');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
