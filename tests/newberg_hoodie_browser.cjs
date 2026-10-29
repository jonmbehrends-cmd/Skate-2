/* Production Newberg + Quaternius hoodie visual acceptance.
 * Real desktop/mobile Chromium/WebGL; the existing classic park gallery does
 * not exercise the newly default Newberg scene. Screenshots are evidence, not
 * proof of anatomical quality: review them before approving visual changes.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts/newberg');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,data)=>{
  res.writeHead(err?404:200,{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.glb')?'model/gltf-binary':'text/html'});
  res.end(err?'':data);
 });
});
let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/?park=newberg';
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox']});
 const results=[];
 for(const mobile of [false,true]){
  const label=mobile?'mobile':'desktop';
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  const errors=[],failedRequests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>failedRequests.push(r.url()));
  await page.goto(url);
  await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__?.park?.terrain&&window.__SOL_DIAGNOSTICS__?.rig?.status?.ready,null,{timeout:60000});
  const initial=await page.evaluate(()=>{
   const d=__SOL_DIAGNOSTICS__,B=BABYLON;
   return {park:d.park.name,bones:d.rig.status.bones,source:d.rig.status.source,
    skinned:d.rig.meshes.filter(m=>m.skeleton&&m.isVisible&&m.isEnabled()&&m.getTotalVertices()>0).length,
    oldRider:d.scene.meshes.filter(m=>['torso','head','thigh','shin','shoe'].includes(m.name)&&m.isVisible).length,
    concreteOpaque:d.park.terrain.material.alpha===1&&d.park.terrain.material.transparencyMode===B.Material.MATERIAL_OPAQUE};
  });
  assert.equal(initial.park,'Newberg / Chehalem');
  assert.equal(initial.bones,62);
  assert(initial.source.includes('quaternius-hoodie'));
  assert(initial.skinned>=4&&initial.oldRider===0&&initial.concreteOpaque,JSON.stringify(initial));
  await page.screenshot({path:path.join(out,'hoodie-'+label+'-park-spawn.png')});
  await page.evaluate(()=>{
   const d=__SOL_DIAGNOSTICS__,B=BABYLON;
   d.engine.stopRenderLoop();
   d.skater.position.set(0,0,0);d.skater.rotation.set(0,0,0);
   d.scene.getTransformNodeByName('rider terrain stance').rotation.set(0,0,0);
   d.scene.getTransformNodeByName('board pivot').rotation.set(0,0,0);
   d.scene.activeCamera=new B.ArcRotateCamera('Newberg hoodie QA',-.9,1.25,4.3,new B.Vector3(0,1.2,0),d.scene);
   for(let i=0;i<40;i++)d.rig.update({grounded:true,speed:5},{crouch:0},{dt:1/60});
  });
  const poses=[];
  for(const mode of ['ride','push','push-recovery','push-cycle-end','ollie','flip','grab','grind','landing']){
   const pose=await page.evaluate(mode=>{
    const d=__SOL_DIAGNOSTICS__,state={grounded:['ride','push','push-recovery','push-cycle-end','landing'].includes(mode),speed:5,travelSign:1,flip:mode==='flip'?1:0};
    const stance={crouch:.1,pushing:['push','push-recovery','push-cycle-end'].includes(mode),
     contact:mode==='push'?.8:0,recovery:mode==='push-recovery'?1:0,
     pushPhase:mode==='push'?Math.PI/2:mode==='push-recovery'?Math.PI*1.5:mode==='push-cycle-end'?2*Math.PI-.001:undefined};
    d.rig.update(state,stance,{grabbing:mode==='grab',grinding:mode==='grind'});
    d.scene.render();
    const r=d.rig.status;
    return {mode:r.mode,feet:r.feet,hands:r.hands,grip:r.grip,reach:r.grabReachShift,
     skinned:d.rig.meshes.filter(m=>m.skeleton&&m.isVisible).length,
     finite:Array.from(d.rig.skeletons[0].getTransformMatrices(d.rig.meshes[0])).every(Number.isFinite)};
   },mode);
   assert.equal(pose.mode,['push-recovery','push-cycle-end'].includes(mode)?'push':mode,'Newberg hoodie pose: '+JSON.stringify(pose));
   assert(pose.skinned>=4&&pose.finite,'Visible deforming GLB required: '+mode);
   if(mode==='grab'){
    const distance=Math.hypot(...pose.hands[1].map((n,i)=>n-pose.grip[i]));
    assert(distance<.12&&pose.reach<.45,'Grab must contact deck without extreme torso shift: '+JSON.stringify({distance,pose}));
   }
   if(mode==='push')assert(pose.feet[1][1]<.25,'Grounded push foot must contact pavement');
   if(mode==='push-recovery'||mode==='push-cycle-end'){
    const f=pose.feet[1];
    assert(Math.abs(f[0]-.015)<.035&&Math.abs(f[1]-.45)<.035&&Math.abs(f[2]+.36)<.035,
     'Recovered push foot must plant on deck before release: '+JSON.stringify(f));
   }
   if(mode==='landing')assert(pose.feet.every(f=>Math.abs(f[1]-.45)<.035),'Landing shoes must stay on deck');
   await page.screenshot({path:path.join(out,'hoodie-'+label+'-'+mode+'.png')});
   poses.push({mode,feet:pose.feet,hands:pose.hands,reach:pose.reach});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(failedRequests,[]);
  results.push({label,initial,poses});await page.close();
 }
 // The default Newberg park must retain the visible skinned V2 fallback when
 // the licensed hoodie asset is unavailable, on both desktop and mobile.
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
  await page.route('**/hoodie-character.glb',route=>route.abort());
  await page.goto(url);
  await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__?.park?.terrain&&window.__SOL_DIAGNOSTICS__?.riderV2,null,{timeout:60000});
  await page.waitForTimeout(750);
  const fallback=await page.evaluate(()=>{
   const d=__SOL_DIAGNOSTICS__;
   return {hoodie:!!d.rig,visible:d.riderV2.meshes.filter(m=>m.isVisible&&m.isEnabled()&&m.skeleton&&m.getTotalVertices()>0).length,park:d.park.name};
  });
  assert(!fallback.hoodie&&fallback.visible>0&&fallback.park==='Newberg / Chehalem',JSON.stringify(fallback));
  await page.screenshot({path:path.join(out,'hoodie-'+(mobile?'mobile':'desktop')+'-fallback.png')});
  await page.close();
 }
 fs.writeFileSync(path.join(out,'hoodie-result.json'),JSON.stringify({result:'PASS',url,results},null,2));
 console.log('PASS real Newberg desktop/mobile Quaternius hoodie GLB poses, opaque concrete and fallback');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
