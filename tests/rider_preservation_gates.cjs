// tests/rider_preservation_gates.cjs — Direct-drive real-engine preservation gates
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const EPS={exact:0,scalar:1e-9,mutant:1e-6},DT=.025,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const near=(a,b,m,e=EPS.scalar)=>assert(Math.abs(a-b)<=e,`${m}: ${a} vs ${b}`);

// ---- trace DSL: one token = one substep; a window = one scene.render() ----
// G ground  I idle  C crouch  P push  A air  F air+flip  W air+spin  B air+grab
// K grind 50-50  S boardslide.  "G@.2" overrides dt.  Objects allowed for combos.
const TOK={G:{g:1,speed:5},I:{g:1,speed:0},C:{g:1,speed:.5,crouch:.3},
 P:{g:1,speed:5,push:1,contact:.5,recovery:.25},A:{g:0,speed:5},F:{g:0,speed:5,flip:1},
 W:{g:0,speed:5,spin:1},B:{g:0,speed:5,grab:1},K:{grind:1,gt:'50-50',speed:5},S:{grind:1,gt:'boardslide',speed:5}};
function expand(windows,{grindGrounded=false}={}){
 let air=0;
 return windows.map(w=>w.map(t=>{
  const [name,dtText]=typeof t==='string'?t.split('@'):[t,undefined];
  const d=typeof name==='string'?TOK[name]:name,dt=dtText===undefined?DT:+dtText;
  const grinding=!!d.grind,grounded=grinding?grindGrounded:!!d.g;
  air=!grounded&&!grinding?air+dt:0;                 // airTime includes the current substep
  return {tok:typeof name==='string'?name:'obj',dt,grab:!!d.grab,
   state:{grounded,grinding,grindType:d.gt,flip:d.flip||0,spin:d.spin||0,airTime:air,travelSign:1,speed:d.speed??5},
   pose:{pushing:!!d.push,contact:d.contact||0,recovery:d.recovery||0,crouch:d.crouch||0}};
 }));
}
const TRACES={
 'air-ground-air':    {windows:[['G','G'],['A','G','A'],['A','A'],['A','G','G']]},
 'air-ground-ground':{windows:[['G','G'],['A','G','G'],['G','G','G']]},
 'repeated-ground':  {windows:[['G','G','G','G'],['G','G','G','G'],['P','P','P','P'],['G','G','G','G']]},
 'grab-release':     {windows:[['G','G'],['A','B','B'],['B','A','A'],['A','G','G']]},
 // SOLGrind.attach and advance keep grounded=false during and after a grind.
 'grind-to-air':     {windows:[['G','G'],['K','K','K'],['K','A','A'],['A','G']],variants:[{grindGrounded:false}]},
 'landing-decay':    {windows:[['G','G'],['A','G'],['G@.2','G@.2'],['G','G','G']]},
 'landing-threshold':{windows:[['G','G'],['A',...Array(14).fill('G')]]},
};
const SETTLE=Array(8).fill('G@.05');   // zeroes hoodie landing/takeoff; V2 landing falls below .08
const MODES=[ // single call from a settled state; priorities pinned as they are today
 {seq:['G'],v2:'ride',h:'ride'},{seq:['I'],v2:'ride',h:'idle'},{seq:['C'],v2:'ride',h:'crouch'},{seq:['P'],v2:'push',h:'push'},
 {seq:['A','G'],v2:'landing',h:'landing',note:'edge call'},
 {seq:['A'],v2:'ollie',h:'ollie',note:'V2 "air" is unreachable today; hoodie ollie = takeoff window'},
 {seq:Array(9).fill('A'),v2:'ollie',h:'air',note:'hoodie leaves ollie when takeoff<=.05 (9th call at dt .025)'},
 {seq:['F'],v2:'flip',h:'flip'},{seq:['W'],v2:'shove',h:'ollie',note:'hoodie ignores state.spin'},
 {seq:['B'],v2:'grab',h:'grab'},{seq:[{g:0,grab:1,flip:1}],v2:'grab',h:'grab',note:'grab outranks flip in both'},
 {seq:['K'],v2:'grind',h:'grind'},{seq:['S'],v2:'boardslide',h:'grind'},
 {seq:[{grind:1,gt:'50-50',grab:1}],v2:'grab',h:'grind',note:'not producible by the call site (grabbing requires !grinding); pins divergent priority'},
];

// ---- scalar oracle: mirrors the source arithmetic, op for op ----
function oracle(recs){
 const v={g:true,landing:0},h={was:true,landing:0,takeoff:0};
 return recs.map(r=>{
  const s=r.state,p=r.pose,grab=r.grab,grinding=!!s.grinding;
  // V2: edge sets 1, THEN the same call decays exponentially
  if(s.grounded&&!v.g)v.landing=1;
  v.g=!!s.grounded;v.landing*=Math.exp(-Math.max(0,r.dt)*10);
  const ollie=!s.grounded&&!grinding&&!s.flip&&!s.spin&&!grab;
  const v2mode=grab?'grab':grinding?(s.grindType==='boardslide'?'boardslide':'grind'):!s.grounded?(s.flip?'flip':s.spin?'shove':ollie?'ollie':'air'):v.landing>.08?'landing':p.pushing?'push':'ride';
  const tuck=ollie?Math.sin(Math.PI*Math.min(1,Math.max(0,s.airTime||0)/.55))*.13:0;
  // hoodie: edge sets 1; other calls decay linearly, dt clamped to .05 (dt 0 becomes 1/60)
  const dt=clamp(r.dt||1/60,0,.05);
  if(s.grounded&&!h.was)h.landing=1;else h.landing=Math.max(0,h.landing-dt*5);
  if(!s.grounded&&h.was)h.takeoff=1;else h.takeoff=Math.max(0,h.takeoff-dt*5);
  h.was=!!s.grounded;
  const air=!s.grounded&&!grinding,flip=air&&Math.abs(s.flip||0)>0,plain=air&&!grab&&!flip;
  const hmode=grinding?'grind':grab?'grab':flip?'flip':air&&h.takeoff>.05?'ollie':air?'air':h.landing>.05?'landing':p.pushing?'push':(p.crouch||0)>.1?'crouch':Math.abs(s.speed)>1?'ride':'idle';
  // Intentional visual-only cruising knee flex. Keep the independent scalar
  // oracle aligned with the hoodie while still rejecting unintended changes
  // to push, landing, grind, airborne and V2 pose arithmetic.
  const athleticCompression=s.grounded&&!grinding&&!p.pushing&&h.landing<=.05?
   clamp(Math.abs(s.speed||0)/7,0,1)*.045:0;
  // Grab-only pelvis clearance is intentionally raised in the athletic tuck;
  // keep every other frozen pose scalar and V2 oracle unchanged.
  const crouch=clamp((p.crouch||0)*.20+h.landing*.15+h.takeoff*.06+athleticCompression+(grab?.22:0)+(grinding?.12:0),0,.78);
  const push=p.pushing?.15+.22*clamp(p.contact||0,0,1)+.09*clamp(p.recovery||0,0,1):0;
  return {v2:{landing:v.landing,mode:v2mode,tuck},
   h:{mode:hmode,drop:h.landing*.20,rearPop:plain?h.takeoff*.11:0,frontLevel:plain?(1-h.takeoff)*.05:0,crouchDelta:crouch,pushCompression:push}};
 });
}
function assertOracle(recs,a,label){
 const flat=recs.flat(),exp=oracle(flat),got=a.per.flat();
 assert.equal(got.length,exp.length,label+': call count');
 got.forEach((g,i)=>{const e=exp[i],at=`${label} call ${i} (${flat[i].tok})`;
  near(g.v2.landing,e.v2.landing,at+' v2 landing (exp)');assert.equal(g.v2.mode,e.v2.mode,at+' v2 mode');
  near(g.v2.ollieTuck,e.v2.tuck,at+' v2 ollieTuck');assert.equal(g.v2.frames,i+1,at+' v2 frames (current field)');
  assert.equal(g.h.mode,e.h.mode,at+' hoodie mode');near(g.h.drop,e.h.drop,at+' hoodie landing via armPose.drop (linear)');
  near(g.h.rearPop,e.h.rearPop,at+' rearPop');near(g.h.frontLevel,e.h.frontLevel,at+' frontLevel');
  near(g.h.pushCompression,e.h.pushCompression,at+' pushCompression');near(g.h.crouchDelta,e.h.crouchDelta,at+' crouch term');});
}
function maxDelta(a,b,p=''){
 if(typeof a==='number'||typeof b==='number'){assert(Number.isFinite(a)&&Number.isFinite(b),'non-finite or mismatched number '+p);return {max:Math.abs(a-b),path:p};}
 if(a&&b&&typeof a==='object'&&typeof b==='object'){assert.equal(Array.isArray(a),Array.isArray(b),'container type '+p);assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort(),'keys '+p);} // numeric tree compare; strings/null by equality
 if(typeof a==='number'&&typeof b==='number')return {max:Math.abs(a-b),path:p};
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return {max:a===b?0:Infinity,path:p};
 if(Array.isArray(a)&&a.length!==b.length)return {max:Infinity,path:p+'.length'};
 let best={max:0,path:p};
 for(const k of Object.keys(a)){const d=maxDelta(a[k],b[k],p+'/'+k);if(d.max>best.max)best=d;}
 return best;
}
const v2Only=h=>({l:h.v2Local,p:h.v2Palette,j:h.v2Joints});

// part 2/3 — injected with page.addInitScript(`(${pageLib})()`); globals resolve lazily
function pageLib(){
 'use strict';
 const NAMES=['Hips','Chest','UpperLeg.L','LowerLeg.L','LowerLeg.L_end','UpperLeg.R','LowerLeg.R','LowerLeg.R_end',
  'UpperArm.L','LowerArm.L','Wrist.L','UpperArm.R','LowerArm.R','Wrist.R','Foot.L','Foot.R'];
 const arr=m=>Array.from(m.m);
 function makeHost(scene){ // TEST-OWNED stand-in for the production hierarchy
  const b=BABYLON,n=(name,p)=>{const t=new b.TransformNode(name,scene);if(p)t.parent=p;return t};
  const skater=n('skater'),body=n('body',skater),stanceRig=n('stanceRig',skater),boardPivot=n('boardPivot',skater);
  const arms=[-1,1].map((s,i)=>{const a=n('arm'+i,body);a.position.set(s*.28,1.3,0);return a});
  const elbows=arms.map((a,i)=>{const e=n('elbow'+i,a);e.position.y=-.3;return e});
  b.MeshBuilder.CreateBox('legacy torso',{size:.3},scene).parent=body;
  const grabMeshes=[0,1,2].map(i=>b.MeshBuilder.CreateBox('grab'+i,{size:.04},scene));
  return {skater,body,stanceRig,boardPivot,elbows,grabMeshes};
 }
 const vis=c=>({v2:c.v2.meshes.map(m=>m.isVisible),body:c.host.body.getChildMeshes(false).map(m=>m.isVisible)});
 const graph=c=>({meshes:c.scene.meshes.length,nodes:c.scene.transformNodes.length,skeletons:c.scene.skeletons.length,
  hoodieRoot:!!c.scene.getTransformNodeByName('rigged skater')});
 async function build(o){
  const b=BABYLON,canvas=document.querySelector('#c'),engine=window.__e||(window.__e=new b.Engine(canvas,false));
  const scene=new b.Scene(engine);new b.FreeCamera('cam',new b.Vector3(0,1.4,-7),scene).setTarget(new b.Vector3(0,1,0));
  const host=makeHost(scene),v2=SOLSkaterV2.attach(b,scene,host);if(!v2)throw Error('SOLSkaterV2Data missing');
  // same construction order as production: body descendants, then V2 meshes
  const c={b,engine,scene,host,v2,h:null,legacy:[...host.body.getChildMeshes(false),...v2.meshes]};
  c.visBefore=vis(c);c.graphBefore=graph(c);
  if(o.hoodie){c.h=await SOLHoodieSkater.attach(b,scene,host.stanceRig,c.legacy,{board:host.boardPivot,url:o.url});c.baseY=c.h.root.position.y;}
  return c;
 }
 const draw=c=>{c.engine.beginFrame();c.scene.render();c.engine.endFrame();};
 function scalars(c){const o={};
  if(c.v2){const d=c.v2.diagnostics;o.v2={landing:d.landing,mode:d.mode,ollieTuck:d.ollieTuck??null,grabError:d.grabError,frames:d.frames};}
  if(c.h){const s=c.h.status;o.h={mode:s.mode,drop:s.armPose.drop,rearPop:s.footPose.rearPop,frontLevel:s.footPose.frontLevel,
   pushCompression:s.pushCompression,crouchDelta:c.baseY-c.h.root.position.y-s.pushCompression,grip:s.grip};}
  return o;}
 function snap(c){const o={};
  if(c.v2){const sk=c.v2.skeleton,m=c.v2.meshes.find(x=>x.skeleton);
   o.v2Local=sk.bones.map(x=>arr(x.getLocalMatrix()));o.v2Palette=Array.from(sk.getTransformMatrices(m));
   o.v2Joints=c.v2.meshes.filter(x=>/^V2 (knee|elbow)\./.test(x.name)).map(x=>x.position.asArray());
   if(o.v2Local.length<10||o.v2Palette.length<100||o.v2Joints.length!==4)throw Error('Incomplete V2 snapshot');}
  if(c.h){const names=new Set(NAMES),sk=c.h.skeletons[0],m=c.h.meshes.find(x=>x.skeleton);
   // cached world matrices as the engine consumes them (no forced recompute)
   o.hJoints=c.h.root.getChildTransformNodes(false).filter(n=>names.has(n.name)).sort((a,b)=>a.name<b.name?-1:1).map(n=>[n.name,arr(n.getWorldMatrix())]);
   o.hPalette=Array.from(sk.getTransformMatrices(m));o.hRootY=c.h.root.position.y;
   const s=c.h.status;o.hStatus={feet:s.feet,hands:s.hands,legs:s.legGeometry,grip:s.grip};
   if(o.hJoints.length!==NAMES.length||o.hPalette.length<800)throw Error('Incomplete hoodie snapshot');}
  return o;}
 // deterministic host motion keyed to the ORIGINAL substep index, so every strategy sees the same final host transform
 function driveHost(c,i,r){const h=c.host;h.skater.position.set(.05*i,0,.03*i);h.skater.rotation.y=.02*i;
  h.boardPivot.rotation.z=.01*Math.sin(i);h.body.position.y=r.state.grounded?0:-.18;}
 function runWindows(c,o){
  const per=[],heavy=[];let gi=0;
  for(const [wi,w] of o.windows.entries()){
   const start=gi;gi+=w.length;
   let calls=w,idx=w.map((_,k)=>start+k);
   if(o.strategy==='collapsed'){calls=[{...w.at(-1),dt:w.reduce((a,r)=>a+r.dt,0)}];idx=[start+w.length-1];} // NEGATIVE-CONTROL MUTANT
   const rows=[];
   calls.forEach((r,k)=>{
    Object.freeze(r.state);Object.freeze(r.pose);driveHost(c,idx[k],r);   // frozen inputs: any write throws in strict mode
    if(c.v2&&wi<(o.suppressV2From??Infinity))c.v2.update(r.state,r.pose,r.grab,r.dt);   // production order: V2 then hoodie
    if(c.h)c.h.update(r.state,r.pose,Object.freeze({grabbing:r.grab,grinding:!!r.state.grinding,dt:r.dt}));
    rows.push(scalars(c));});
   per.push(rows);
   if(o.render!==false){draw(c);heavy.push(snap(c));}
  }
  return {per,heavy};
 }
 window.GATES={
  async scenario(o){
   const c=await build(o),out=runWindows(c,o);
   if(o.reveal){ // between frames: dispose, null the rig, inspect BEFORE any further render
    c.h.dispose();c.h=null;
    out.reveal={visAfter:vis(c),graphAfter:graph(c),visBefore:c.visBefore,graphBefore:c.graphBefore};
    draw(c);const act=c.scene.getActiveMeshes();
    out.reveal.v2Active=c.v2.meshes.filter(m=>m.skeleton).every(m=>act.indexOf(m)>=0);
    out.reveal.final=snap(c);
   }
   c.scene.dispose();return out;
  },
  async failure(o){
   const b=BABYLON,c=await build({hoodie:false}),before=graph(c),vis0=vis(c);
   const orig=b.SceneLoader.LoadAssetContainerAsync;let rejected=false,message='';
   if(o.kind==='empty-container')b.SceneLoader.LoadAssetContainerAsync=async(r,f,sc)=>new b.AssetContainer(sc); // loader seam only; transforms stay real
   try{await SOLHoodieSkater.attach(b,c.scene,c.host.stanceRig,c.legacy,{board:c.host.boardPivot,url:o.kind==='missing-asset'?'assets/__missing__.glb':undefined});}
   catch(e){rejected=true;message=String(e&&e.message||e);}
   finally{b.SceneLoader.LoadAssetContainerAsync=orig;}
   const after=graph(c),vis1=vis(c),run=runWindows(c,o);c.scene.dispose();
   return {rejected,message,before,after,vis0,vis1,run};
  }};
}

// part 3/3
function serve(){return new Promise(res=>{const s=http.createServer((q,r)=>{const u=new URL(q.url,'http://x'),f=path.resolve(root,'.'+u.pathname);
 if(!f.startsWith(root+path.sep))return r.writeHead(403).end();
 fs.readFile(f,(e,d)=>{r.writeHead(e?404:200,{'Content-Type':/\.js$/.test(f)?'application/javascript':/\.css$/.test(f)?'text/css':/\.glb$/.test(f)?'model/gltf-binary':'text/html'});r.end(e?'':d)})});
 s.listen(0,'127.0.0.1',()=>res(s))})}
(async()=>{
 let browser;const srv=await serve();try{browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox']});
 const page=await browser.newPage({viewport:{width:64,height:64}}),R=[];
 // route Babylon + loaders exactly as the existing browser suites do; the version assert below enforces parity
 await page.addInitScript(`(${pageLib})()`);
 await page.goto(`http://127.0.0.1:${srv.address().port}/tests/fixtures/rider_gates.html`);
 assert.equal(await page.evaluate(()=>BABYLON.Engine.Version),'8.32.1');
 const run=o=>page.evaluate(x=>GATES.scenario(x),o);
 const t=async(name,fn)=>{try{await fn();R.push(['PASS',name])}catch(e){R.push(['FAIL',name,String(e.stack)])}};
 const lastOf=(a,w)=>a.per[w].at(-1);

 for(const [name,spec] of Object.entries(TRACES))for(const variant of spec.variants||[{}]){
  const recs=expand(spec.windows,variant),tag=name+(spec.variants?` [grindGrounded=${variant.grindGrounded}]`:'');
  await t(`[GATE] oracle (frozen inputs, current scalars): ${tag}`,async()=>assertOracle(recs,await run({windows:recs,hoodie:true}),tag));
  await t(`[GATE] replay is exact: ${tag}`,async()=>{const a=await run({windows:recs,hoodie:true}),b=await run({windows:recs,hoodie:true});
   assert.equal(maxDelta(a.heavy,b.heavy).max,EPS.exact);});
  await t(`[GATE] hoodie presence does not perturb V2: ${tag}`,async()=>{
   const a=await run({windows:recs,hoodie:true}),c=await run({windows:recs,hoodie:false});
   assert.equal(maxDelta(a.per.flat().map(x=>x.v2),c.per.flat().map(x=>x.v2)).max,0);
   assert.equal(maxDelta(a.heavy.map(v2Only),c.heavy.map(v2Only)).max,0);});
 }

 await t('[GATE] mode priority table (settled single call)',async()=>{
  const wins=expand(MODES.map(c=>[...SETTLE,...c.seq])),a=await run({windows:wins,hoodie:true,render:false});
  MODES.forEach((c,i)=>{const l=a.per[i].at(-1);assert.equal(l.v2.mode,c.v2,`v2 ${JSON.stringify(c.seq)}`);assert.equal(l.h.mode,c.h,`hoodie ${JSON.stringify(c.seq)}`)});});

 // hand-derived anchors (independent of the oracle)
 await t('[GATE] anchor: air-ground-air, intermediate landing survives',async()=>{
  const e=lastOf(await run({windows:expand(TRACES['air-ground-air'].windows),hoodie:true}),1);
  near(e.v2.landing,Math.exp(-.5),'v2 landing = exp(-10*.05)');assert.equal(e.v2.mode,'ollie');
  near(e.h.drop,.875*.20,'hoodie landing .875');near(e.h.rearPop,.11,'second air edge re-arms takeoff');near(e.h.crouchDelta,.875*.15+.06,'crouch term');});
 await t('[GATE] anchor: air-ground-ground',async()=>{
  const e=lastOf(await run({windows:expand(TRACES['air-ground-ground'].windows),hoodie:true}),1);
  near(e.v2.landing,Math.exp(-.5),'v2: edge call already decayed once');assert.equal(e.v2.mode,'landing');
  near(e.h.drop,.875*.20,'hoodie: edge=1, then one linear decay');near(e.h.crouchDelta,.875*.15+.75*.06,'crouch term');assert.equal(e.h.mode,'landing');});
 await t('[GATE] anchor: repeated ground has no edges; push compression',async()=>{
  const a=await run({windows:expand(TRACES['repeated-ground'].windows),hoodie:true});
  for(const w of [0,1,3]){const e=lastOf(a,w);near(e.v2.landing,0,'v2');near(e.h.drop,0,'hoodie');near(e.h.crouchDelta,5/7*.045,'cruising crouch');near(e.h.pushCompression,0,'push');}
  const p=lastOf(a,2);near(p.h.pushCompression,.15+.22*.5+.09*.25,'push compression');assert.equal(p.v2.mode,'push');assert.equal(p.h.mode,'push');});
 await t('[GATE] anchor: V2 exponential vs hoodie linear + dt clamp',async()=>{
  const a=await run({windows:expand(TRACES['landing-decay'].windows),hoodie:true}),edge=lastOf(a,1);
  near(edge.v2.landing,Math.exp(-.25),'v2 edge call is already decayed');near(edge.h.drop,.20,'hoodie edge call is exactly 1');
  near(a.per[2][0].v2.landing,Math.exp(-.25-2),'v2 dt .2 unclamped');near(a.per[2][0].h.drop,.75*.20,'hoodie dt .2 clamps to .05');
  near(a.per[2][1].h.drop,.5*.20,'hoodie second clamped decay');assert.equal(a.per[2][1].v2.mode,'ride');});
 await t('[GATE] anchor: mode thresholds',async()=>{
  const p=(await run({windows:expand(TRACES['landing-threshold'].windows),hoodie:true})).per[1];
  assert.equal(p[10].v2.mode,'landing');assert.equal(p[11].v2.mode,'ride');assert.equal(p[8].h.mode,'landing');assert.equal(p[9].h.mode,'ride');});
 await t('[GATE] anchor: grab-release edge',async()=>{
  const a=await run({windows:expand(TRACES['grab-release'].windows),hoodie:true});
  assert(Number.isFinite(a.per[1][2].v2.grabError));assert.equal(a.per[1][2].h.grip.length,3);
  assert(Number.isFinite(a.per[2][0].v2.grabError));assert.equal(a.per[2][1].v2.grabError,null);assert.equal(a.per[2][1].h.grip,null);});
 await t('[GATE] anchor: grind-to-air (grindGrounded=false)',async()=>{
  const a=await run({windows:expand(TRACES['grind-to-air'].windows,{grindGrounded:false}),hoodie:true});
  assert.equal(lastOf(a,1).v2.mode,'grind');assert.equal(lastOf(a,1).h.mode,'grind');
  assert.equal(lastOf(a,2).v2.mode,'ollie');assert.equal(lastOf(a,2).h.mode,'ollie');});

 for(const kind of ['missing-asset','empty-container'])await t(`[GATE] hoodie load failure: ${kind}`,async()=>{
  const windows=expand(TRACES['air-ground-air'].windows),f=await page.evaluate(x=>GATES.failure(x),{kind,windows}),c=await run({windows,hoodie:false});
  assert.equal(f.rejected,true);assert.deepEqual(f.after,f.before,'no stray meshes/nodes/skeletons');
  assert.deepEqual(f.vis1,f.vis0,'failed attach must not touch visibility');
  assert.equal(maxDelta(f.run.heavy.map(v2Only),c.heavy.map(v2Only)).max,0,'V2 fallback pose == never-attempted run');
  assert(f.run.per.flat().every((s,i)=>s.v2.frames===i+1));});

 const rev=expand(TRACES['air-ground-air'].windows);
 await t('[GATE] dispose/reveal before next visible frame (today: V2 never paused)',async()=>{
  const v=await run({windows:rev,hoodie:true,reveal:true}),c=await run({windows:rev,hoodie:false}),r=v.reveal;
  assert.deepEqual(r.visAfter,r.visBefore,'visibility restored before any render');   // checked pre-render
  assert.deepEqual(r.graphAfter,r.graphBefore,'hoodie graph fully disposed');
  assert.equal(r.v2Active,true,'V2 skinned meshes are active in the first frame after reveal');
  assert.equal(maxDelta(v2Only(r.final),v2Only(c.heavy.at(-1))).max,0,'revealed pose == V2-only control');});

 // ---- NEGATIVE CONTROLS: pass only if the fixture DETECTS the mutant ----
 for(const name of ['air-ground-air','air-ground-ground'])await t(`[NEG] collapsed final-only loses the intermediate landing: ${name}`,async()=>{
  const windows=expand(TRACES[name].windows),ref=await run({windows,hoodie:true}),mut=await run({windows,hoodie:true,strategy:'collapsed'});
  const r=lastOf(ref,1),m=lastOf(mut,1);
  assert(Math.abs(r.v2.landing-m.v2.landing)>.05,`v2 landing not detected (${r.v2.landing} vs ${m.v2.landing})`);
  assert(Math.abs(r.h.drop-m.h.drop)>.01,'hoodie landing not detected');
  assert(maxDelta(ref.heavy[1],mut.heavy[1]).max>EPS.mutant,'skin/joint comparison blind to the lost landing');});
 await t('[NEG] stale fallback pose is detected',async()=>{
  const c=await run({windows:rev,hoodie:false}),s=await run({windows:rev,hoodie:true,reveal:true,suppressV2From:1});
  assert(s.per.flat().at(-1).v2.frames<rev.flat().length,'control did not actually suppress V2');
  const d=maxDelta(v2Only(s.reveal.final),v2Only(c.heavy.at(-1)));
  assert(d.max>EPS.mutant,`stale reveal not detected (max ${d.max})`);});

 await t('[GATE] existing frame counter counts every substep',async()=>{const windows=expand(TRACES['repeated-ground'].windows),a=await run({windows,hoodie:true});assert.equal(a.per.flat().at(-1).v2.frames,windows.flat().length);});
 await t('[NEG] comparison rejects NaN and asymmetric keys',async()=>{assert.throws(()=>maxDelta([NaN],[0]));assert.throws(()=>maxDelta({a:1},{a:1,b:2}));assert.throws(()=>maxDelta([1],{'0':1}));});
 for(const r of R)console.log(r.join(' | '));
 process.exitCode=R.some(r=>r[0]==='FAIL')?1:0;
 fs.mkdirSync(path.join(root,'test-artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'test-artifacts/rider-preservation.json'),JSON.stringify(R,null,2));
 }finally{if(browser)await browser.close();srv.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
