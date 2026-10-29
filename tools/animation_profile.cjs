/* Measurement only: real production rigs, deterministic simulation, real CPU clock.
 * No optimized variant, FPS inference, or physical-device claim. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts/animation-profile');
const batches=Number(process.env.ANIMATION_BATCHES)||30,calls=Number(process.env.ANIMATION_CALLS)||200,
 frames=Number(process.env.ANIMATION_FRAMES)||30,warmup=Number(process.env.ANIMATION_WARMUP)||400,
 heapIterations=Number(process.env.ANIMATION_HEAP_ITERATIONS)||10000;
if(![batches,calls,frames,warmup,heapIterations].every(n=>Number.isInteger(n)&&n>0))throw Error('Positive integer sample counts required');
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(p==='/'?'/index.html':p));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.glb')?'model/gltf-binary':file.endsWith('.css')?'text/css':'text/html'});res.end(e?'':data);});
});
const flags=['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox',
 '--js-flags=--expose-gc','--enable-precise-memory-info'];
let browser;
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({args:flags});
 const report={source:execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),browser:browser.version(),
  platform:process.platform,cpuCount:os.cpus().length,flags,batches,calls,frames,warmup,heapIterations,
  limitation:'Descriptive instrumented CPU profile on shared Windows/SwiftShader. No optimized comparison, FPS or physical phone inference.',variants:{}};
 for(const variant of ['hoodie','fallback']){
  const page=await browser.newPage({viewport:{width:960,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(variant==='fallback')await page.route('**/hoodie-character.glb',r=>r.abort());
  await page.addInitScript(()=>{
   const p=window.__animationProfile={now:performance.now.bind(performance),rigs:{},enabled:false,metrics:{}};
   p.record=(key,fn,self,args)=>{
    if(!p.enabled)return fn.apply(self,args);
    const start=p.now();try{return fn.apply(self,args);}finally{
     const m=p.metrics[key]||(p.metrics[key]={calls:0,ms:0});m.calls++;m.ms+=p.now()-start;
    }
   };
   for(const [module,method,key]of [['SOLSkaterV2','attach','v2'],['SOLHoodieSkater','attach','hoodie'],['SOLSkater','pose','pose'],['SOLWheels','sample','wheels']]){
    Object.defineProperty(window,module,{configurable:true,set(value){
     Object.defineProperty(window,module,{configurable:true,writable:true,value});
     const original=value[method];
     if(method==='attach')value[method]=function(...args){
      const instrument=rig=>{if(!rig)return rig;const update=rig.update;
       p.rigs[key]={rig,update};rig.update=function(...a){return p.record(key,update,this,a);};return rig;};
      const result=original.apply(this,args);return result?.then?result.then(instrument):instrument(result);
     };
     else value[method]=function(...args){return p.record(key,original,this,args);};
    }});
   }
   Object.defineProperty(navigator,'getGamepads',{value:()=>[]});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__?.riderV2?.diagnostics.frames>2,null,{timeout:60000});
  if(variant==='hoodie')await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__.rig?.status.ready,null,{timeout:30000});
  else await page.waitForFunction(()=>!window.__SOL_DIAGNOSTICS__.scene.isLoading);
  await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.scene.whenReadyAsync());
  const result=await page.evaluate(({batches,calls,frames,warmup,heapIterations,variant})=>{
   const d=window.__SOL_DIAGNOSTICS__,p=window.__animationProfile,B=BABYLON,now=p.now;
   const loop=d.engine._activeRenderLoops[0];d.engine.stopRenderLoop();
   const median=a=>{const v=[...a].sort((a,b)=>a-b),n=v.length;return n%2?v[(n-1)/2]:(v[n/2-1]+v[n/2])/2;};
   const summary=rows=>{const v=[...rows].sort((a,b)=>a-b);return {medianMs:median(v),p95Ms:v[Math.floor(.95*(v.length-1))],rangeMs:[v[0],v.at(-1)]};};
   const modes=['ride','push','ollie','air','flip','shove','grab','grind','boardslide','landing'];
   const pose={crouch:.1,pushing:false,contact:.8,recovery:.1,torsoLean:.1,torsoYaw:0};
   function scenario(mode){
    return {grounded:!['ollie','air','flip','shove','grab'].includes(mode),speed:4,travelSign:1,
     flip:mode==='flip'?1:0,spin:mode==='shove'?1:0,airTime:.27,
     grinding:['grind','boardslide'].includes(mode),grindType:mode==='boardslide'?'boardslide':'50-50',grindTime:.4};
   }
   const workloads=Object.fromEntries(modes.map(mode=>[mode,{state:Object.freeze(scenario(mode)),
    pose:Object.freeze({...pose,pushing:mode==='push'}),actions:Object.freeze({grabbing:mode==='grab',grinding:scenario(mode).grinding,dt:1/60})}]));
   function updateOne(entry,mode){
    const w=workloads[mode];
    if(entry.rig===d.riderV2)entry.update.call(entry.rig,w.state,w.pose,w.actions.grabbing,1/60);
    else entry.update.call(entry.rig,w.state,w.pose,w.actions);
   }
   function update(entry,mode){
    // A landing workload is an air→ground transition, not a stationary grounded
    // pose whose compression decays away during the warm-up.
    if(mode==='landing')updateOne(entry,'air');
    if(mode==='ollie')updateOne(entry,'ride');
    updateOne(entry,mode);
    return ['landing','ollie'].includes(mode)?2:1;
   }
   const result={engine:B.Engine.Version,loadedHoodie:!!d.rig,rigVisibility:{},direct:{},heap:{},cpuCallbacks:{},skeletonPrepare:{}};
   for(const [key,e]of Object.entries(p.rigs))result.rigVisibility[key]=e.rig.meshes.filter(m=>m.isVisible&&m.isEnabled()).length;
   // Direct microbenchmarks distinguish the engine's same-render-id cache from
   // one update per new render id. Hoodie palette preparation is included only
   // in the latter; V2 explicitly invokes prepare inside its updater.
   for(const [key,entry]of Object.entries(p.rigs))for(const cadence of ['same-render-id','new-render-id'])for(const mode of modes){
    const skeletons=entry.rig.skeletons||[entry.rig.skeleton];
    const run=()=>{if(cadence==='new-render-id')d.scene.incrementRenderId();update(entry,mode);
     if(cadence==='new-render-id'){d.scene.incrementRenderId();for(const s of skeletons)s.prepare();}};
    for(let i=0;i<warmup;i++)run();const rows=[];
    for(let b=0;b<batches;b++){const start=now();for(let i=0;i<calls;i++)run();rows.push((now()-start)/calls);}
    result.direct[`${key}-${cadence}-${mode}`]={...summary(rows),rowsPerIterationMs:rows,
     updatesPerIteration:['landing','ollie'].includes(mode)?2:1,
     note:cadence==='new-render-id'?'Updater(s) plus final palette preparation at the next render boundary':'Repeated updater(s) in one cached render id; excludes final render palette preparation',
     mode:entry.rig.status?.mode||entry.rig.diagnostics.mode};
   }
   for(const [key,entry]of Object.entries(p.rigs)){
    const heap=()=>performance.memory?.usedJSHeapSize??null,gcAvailable=typeof window.gc==='function';
    if(gcAvailable)window.gc();const before=heap();
    let updates=0;for(let i=0;i<heapIterations;i++){d.scene.incrementRenderId();updates+=update(entry,modes[i%modes.length]);}
    const beforeGC=heap();if(gcAvailable)window.gc();const afterGC=heap();
    result.heap[key]={iterations:heapIterations,updates,gcAvailable,beforeBytes:before,beforeGCBytes:beforeGC,afterGCBytes:afterGC,
     note:'Heap deltas are retained/transient heap observations, not total allocation volume; GC may run within the batch.'};
   }
   const originalPrepare=B.Skeleton.prototype.prepare,originalCompute=B.Skeleton.prototype._computeTransformMatrices;
   B.Skeleton.prototype.prepare=function(...a){return p.record('prepare:'+this.name,originalPrepare,this,a);};
   B.Skeleton.prototype._computeTransformMatrices=function(...a){return p.record('matrixBuild:'+this.name,originalCompute,this,a);};
   let clock=0;const descriptor=Object.getOwnPropertyDescriptor(performance,'now'),originalRender=d.scene.render;
   Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});d.scene.render=()=>{};
   function reset(mode){
    document.querySelector('#restart').click();const s=d.state;
    Object.assign(s,scenario(mode),{x:0,z:0,y:0,groundY:0,vy:0,dir:0,combo:0,count:0,
     grabHeld:mode==='grab',touchGrabHeld:mode==='grab',grabUntil:mode==='grab'?1e9:0,
     pushBurstUntil:mode==='push'?1e9:0,controlSteer:0,controlThrottle:0});
    if(!s.grounded){s.y=2;s.vy=0;s.airVX=0;s.airVZ=0;}
    if(mode==='landing'){s.grounded=false;s.y=.00001;s.vy=-2;if(p.rigs.hoodie)updateOne(p.rigs.hoodie,'air');}
    if(mode==='ollie'&&p.rigs.hoodie)updateOne(p.rigs.hoodie,'ride');
    if(mode==='air'&&p.rigs.hoodie){const e=p.rigs.hoodie,w=workloads.air;
     for(let i=0;i<6;i++)e.update.call(e.rig,w.state,w.pose,{grabbing:false,grinding:false,dt:.05});}
    if(s.grinding){s.z=19;s.y=1.1;s.grindRail={x:0,z:19,len:14,y:1.1,axis:'z',kind:'rail'};}
    d.riderV2.diagnostics.grounded=mode!=='landing';d.riderV2.diagnostics.landing=0;
   }
   try{
    for(const [steps,elapsed]of [[1,1000/60],[2,50],[4,100],[10,250]])for(const mode of modes){
     clock=0;reset(mode);loop();const rows=[];
     for(let i=0;i<frames+5;i++){
      reset(mode);p.metrics={};p.enabled=true;d.scene.incrementRenderId();clock+=elapsed;
      const start=now();loop();const totalMs=now()-start;p.enabled=false;
      if(p.metrics.v2?.calls!==steps||(variant==='hoodie'&&p.metrics.hoodie?.calls!==steps))
       throw Error(`Substep mismatch ${variant}/${mode}/${steps}: `+JSON.stringify(p.metrics));
      if(i>=5)rows.push({totalMs,metrics:p.metrics});
     }
     const times=rows.map(r=>r.totalMs),shares=key=>rows.map(r=>100*(r.metrics[key]?.ms||0)/r.totalMs);
     result.cpuCallbacks[`${steps}-${mode}`]={steps,elapsedMs:elapsed,rows,callback:summary(times),
      v2SharePercent:median(shares('v2')),hoodieSharePercent:median(shares('hoodie')),
      poseSharePercent:median(shares('pose')),wheelsSharePercent:median(shares('wheels')),
      note:'Production physics/animation/DOM callback with scene.render suppressed; nested prepare timings must not be added to updater timings.'};
    }
   }finally{
    p.enabled=false;d.scene.render=originalRender;B.Skeleton.prototype.prepare=originalPrepare;
    B.Skeleton.prototype._computeTransformMatrices=originalCompute;
    if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;
   }
   // Inspect the real engine's caching semantics rather than assuming prepare
   // recomputes on every substep. Both passes write the complete production rig.
   for(const [key,entry]of Object.entries(p.rigs)){
    const s=(entry.rig.skeletons||[entry.rig.skeleton])[0];let builds=0;
    const compute=s._computeTransformMatrices;s._computeTransformMatrices=function(...a){builds++;return compute.apply(this,a);};
    try{
     d.scene.incrementRenderId();update(entry,'ride');s.prepare();const first=builds;
     update(entry,'grab');s.prepare();const sameId=builds;
     d.scene.incrementRenderId();s.prepare();const nextId=builds;
     result.skeletonPrepare[key]={firstUpdateBuilds:first,secondUpdateSameRenderIdBuilds:sameId-first,
      nextRenderIdBuilds:nextId-sameId,renderId:d.scene.getRenderId(),
      note:'Counts actual _computeTransformMatrices invocations; pose correctness is a separate preservation test.'};
    }finally{s._computeTransformMatrices=compute;}
   }
   return result;
  },{batches,calls,frames,warmup,heapIterations,variant});
  if(errors.length)throw Error(errors.join('; '));
  if(result.loadedHoodie!==(variant==='hoodie'))throw Error('Wrong production/fallback variant');
  report.variants[variant]=result;await page.close();
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));
  console.log(`Completed ${variant}: ${Object.keys(result.direct).length} direct cases, ${Object.keys(result.cpuCallbacks).length} callback cases`);
 }
 console.log('PASS real production/fallback animation profiling; no gameplay source changed');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
