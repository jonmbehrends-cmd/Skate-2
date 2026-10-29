/* Diagnostic preservation gate, not a production optimization.
 * Compare the real hoodie with V2 intact, V2 omitted, and explicit shared refresh.
 * The omitted path deliberately tests whether V2 has hidden transform side effects. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts/animation-profile');
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(p==='/'?'/index.html':p));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.glb')?'model/gltf-binary':'text/html'});res.end(e?'':b);});
});
let browser;
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox']});
 const report={source:execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),browser:browser.version(),
  purpose:'Hidden shared-transform dependency probe; no production source changed',variants:{},comparisons:{}};
 for(const variant of ['baseline','omit-v2','refresh-shared']){
  const page=await browser.newPage({viewport:{width:320,height:240}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>Object.defineProperty(navigator,'getGamepads',{value:()=>[]}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/?park=classic');
  await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__?.rig?.status.ready,null,{timeout:60000});
  await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.scene.whenReadyAsync());
  const cases=await page.evaluate(variant=>{
   const d=__SOL_DIAGNOSTICS__,B=BABYLON,loop=d.engine._activeRenderLoops[0];d.engine.stopRenderLoop();
   const stance=d.scene.getTransformNodeByName('rider terrain stance'),body=d.scene.getTransformNodeByName('body'),
    board=d.scene.getTransformNodeByName('board pivot');
   if(!stance||!body||!board)throw Error('Production driver hierarchy was not found');
   const originalUpdate=d.riderV2.update,originalHoodieUpdate=d.rig.update,
    descriptor=Object.getOwnPropertyDescriptor(performance,'now');let clock=0,observedSubsteps=0;
   d.rig.update=function(...a){observedSubsteps++;return originalHoodieUpdate.apply(this,a);};
   const cases={};Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});
   if(variant!=='baseline')d.riderV2.update=()=>{
    if(variant==='refresh-shared')for(const n of [d.skater,body,stance,board])n.computeWorldMatrix(true);
   };
   try{
    for(const [steps,elapsed]of [[1,1000/60],[2,50],[4,100],[10,250]]){
     clock=0;document.querySelector('#restart').click();loop();
     // Settle private hoodie landing/takeoff state equally on all three pages.
     for(let i=0;i<40;i++)d.rig.update({grounded:true,speed:4},{crouch:.1},{dt:1/60});
     for(const [index,mode]of ['ride','push','ramp','ollie','flip','shove','grab','grind','boardslide','landing'].entries()){
      document.querySelector('#restart').click();const s=d.state;
      Object.assign(s,{x:0,z:0,y:0,groundY:0,vy:0,dir:.23+index*.11,speed:4,travelSign:index%2?-1:1,
       grounded:true,grinding:false,flip:0,spin:0,airTime:0,rollAngle:0,yawAngle:0,combo:0,count:0,
       grabHeld:false,touchGrabHeld:false,grabUntil:0,pushBurstUntil:mode==='push'?1e9:0});
      if(mode==='ramp')Object.assign(s,{x:-36,z:-24,y:1.5,groundY:1.5,dir:0,speed:3});
      if(['ollie','flip','shove','grab','landing'].includes(mode))Object.assign(s,{grounded:false,y:2,vy:0,airTime:.27,airVX:.3,airVZ:.2});
      if(mode==='flip')s.flip=1;if(mode==='shove')s.spin=1;
      if(mode==='grab')Object.assign(s,{grabHeld:true,touchGrabHeld:true,grabUntil:1e9});
      if(mode==='landing'){s.y=.00001;s.vy=-2;d.rig.update({grounded:false,speed:4},{crouch:.1},{dt:1/60});}
      if(['grind','boardslide'].includes(mode))Object.assign(s,{z:19,y:1.1,grinding:true,grindType:mode==='boardslide'?'boardslide':'50-50',
       grindRail:{x:0,z:19,len:14,y:1.1,axis:'z',kind:'rail'},grindTime:.3});
      observedSubsteps=0;clock+=elapsed;loop();
      if(observedSubsteps!==steps)throw Error(`Expected ${steps} production substeps, observed ${observedSubsteps}`);
      // scene.render has completed. Read the world matrices and skin palette
      // actually available to that render; do not force a corrective refresh.
      const nodes=d.rig.root.getChildTransformNodes(false).filter(n=>/Hips|Chest|UpperLeg|LowerLeg|Foot|UpperArm|LowerArm|Wrist/.test(n.name));
      const palettes=d.rig.skeletons.map(s=>Array.from(s.getTransformMatrices(d.rig.meshes.find(m=>m.skeleton===s))));
      if(nodes.length<16||!palettes.length||!palettes.every(p=>p.length>=800&&p.every(Number.isFinite)))
       throw Error('Probe needs real joint matrices and finite production skin palettes');
      cases[`${steps}-${mode}`]={actualSubsteps:observedSubsteps,world:Object.fromEntries(nodes.map(n=>[n.name,Array.from(n.getWorldMatrix().m)])),
       palettes,
       state:{x:s.x,y:s.y,z:s.z,dir:s.dir,speed:s.speed,grounded:s.grounded,grinding:s.grinding},
       feet:d.rig.status.feet,hands:d.rig.status.hands,grip:d.rig.status.grip,mode:d.rig.status.mode,
       grabHelpers:d.scene.meshes.filter(m=>/grab (upper arm|forearm|hand)/.test(m.name)).map(m=>({name:m.name,visible:m.isVisible,enabled:m.isEnabled()}))};
     }
    }
   }finally{d.riderV2.update=originalUpdate;d.rig.update=originalHoodieUpdate;if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;}
   return cases;
  },variant);
  assert.deepEqual(errors,[]);report.variants[variant]=cases;await page.close();
  console.log(`Captured ${variant}: ${Object.keys(cases).length} production render cases`);
 }
 const maxDelta=(a,b)=>{assert.equal(a.length,b.length);return Math.max(0,...a.map((x,i)=>Math.abs(x-b[i])));};
 for(const variant of ['omit-v2','refresh-shared']){
  const differences=[];
  for(const [key,a]of Object.entries(report.variants.baseline)){
   const b=report.variants[variant][key];assert.deepEqual(b.state,a.state,'The diagnostic must not change gameplay physics');
   const world=Math.max(0,...Object.keys(a.world).map(n=>maxDelta(a.world[n],b.world[n]))),
    palette=Math.max(0,...a.palettes.map((p,i)=>maxDelta(p,b.palettes[i]))),
    contact=maxDelta([...a.feet.flat(),...a.hands.flat()],[...b.feet.flat(),...b.hands.flat()]);
   differences.push({key,worldMaxDelta:world,paletteMaxDelta:palette,contactMaxDelta:contact,
    equivalent:world<=1e-4&&palette<=1e-6&&contact<=1e-4,grabHelpersHidden:b.grabHelpers.every(m=>!m.visible)});
  }
  report.comparisons[variant]={cases:differences,equivalent:differences.every(d=>d.equivalent),
   grabHelpersHidden:differences.every(d=>d.grabHelpersHidden)};
 }
 fs.writeFileSync(path.join(out,'ancestor-probe.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report.comparisons,null,2));
 // A failing omit path is a valid diagnostic finding. The explicit-refresh
 // control must preserve the baseline before it can support a future split.
 assert(report.comparisons['refresh-shared'].equivalent,'Shared refresh alone did not preserve baseline; inspect raw probe before optimizing');
 console.log('PASS shared-refresh preservation control; omission outcome retained without changing production');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
