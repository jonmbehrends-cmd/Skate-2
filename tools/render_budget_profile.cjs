/* Fixed-scene profiling; production source is served without transformations. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),req=createRequire(path.join(root,'index.html')),{chromium}=req('playwright');
const label=process.argv[2]||'after',frames=Number(process.env.PERF_FRAMES)||60,warmup=20;
if(!['before','after'].includes(label))throw Error('Choose before or after');
const output=path.join(root,'test-artifacts/render-budget');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((request,response)=>{const url=new URL(request.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep))return response.writeHead(403).end();fs.readFile(file,(e,b)=>{response.writeHead(e?404:200,{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});response.end(e?'':b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox']});const result={label,source:require('child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),browser:browser.version(),renderer:'SwiftShader software rendering',frames,warmup,cases:{}};
try{for(const [size,viewport] of [['desktop',{width:1280,height:800}],['mobile',{width:390,height:844}]]){
 const page=await browser.newPage({viewport,hasTouch:size==='mobile',isMobile:size==='mobile'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[]}));
 await page.route('https://cdn.babylonjs.com/babylon.js',r=>r.fulfill({path:req.resolve('babylonjs'),contentType:'application/javascript'}));if(label==='before')await page.route('**/park_architecture.js*',r=>r.fulfill({path:path.join(root,'tests/fixtures/park_architecture.before.js'),contentType:'application/javascript'}));const start=performance.now();await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__?.scene.getFrameId()>4,null,{timeout:60000});await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.scene.whenReadyAsync());
 result[size+'StartupMs']=performance.now()-start;
 await page.evaluate(()=>{const d=window.__SOL_DIAGNOSTICS__,B=BABYLON;window.__profileLoop=d.engine._activeRenderLoops[0];d.engine.stopRenderLoop();window.__profileCounters={};
  const wrap=(object,key,label)=>{const original=object[key];object[key]=function(...args){const start=performance.now();try{return original.apply(this,args)}finally{const c=window.__profileCounters[label]||(window.__profileCounters[label]={calls:0,ms:0});c.calls++;c.ms+=performance.now()-start;}}};
  for(const [object,key,label] of [[d.riderV2,'update','riderV2'],[SOLWheels,'sample','wheelPose'],[SOLMotion,'step','motion'],[SOLObstacles,'sweep','obstacles'],[SOLTerrain,'sample','terrain'],[d.scene,'render','sceneRender']])wrap(object,key,label);
  window.__sceneProfile=new B.SceneInstrumentation(d.scene);for(const key of ['captureActiveMeshesEvaluationTime','captureRenderTargetsRenderTime','captureRenderTime','captureFrameTime'])window.__sceneProfile[key]=true;
 });
 for(const [view,position,target] of [['spawn',[5,5,-12],[0,1,8]],['park',[25,28,-50],[-20,1,0]]]){
  await page.evaluate(({position,target,frames,warmup})=>{const d=window.__SOL_DIAGNOSTICS__,B=BABYLON,c=new B.FreeCamera('fixed profile',new B.Vector3(...position),d.scene);c.setTarget(new B.Vector3(...target));c.minZ=.1;d.scene.activeCamera=c;
   let seen=0;window.__perfRows=[];window.__perfDone=false;let previous=performance.now();
   d.engine.runRenderLoop(()=>{window.__profileCounters={};const start=performance.now();window.__profileLoop();const end=performance.now(),inst=window.__sceneProfile;
    if(seen++>=warmup){const active=d.scene.getActiveMeshes();window.__perfRows.push({loopMs:end-start,intervalMs:end-previous,drawCalls:d.engine._drawCalls?.current??null,activeMeshes:active.length,activeIndices:d.scene.getActiveIndices(),renderTargetsMs:inst.renderTargetsRenderTimeCounter.current,renderMs:inst.renderTimeCounter.current,activeMeshEvaluationMs:inst.activeMeshesEvaluationTimeCounter.current,functions:window.__profileCounters});}
    previous=end;if(window.__perfRows.length>=frames){d.engine.stopRenderLoop();window.__perfDone=true;}
   });
  },{position,target,frames,warmup});
  await page.waitForFunction(()=>window.__perfDone,null,{timeout:180000});
  const data=await page.evaluate(()=>{const d=window.__SOL_DIAGNOSTICS__,B=BABYLON,shadow=d.scene.lights.map(l=>l.getShadowGenerator?.()).find(Boolean),list=shadow?.getShadowMap()?.renderList||[];const used=new Set(d.scene.materials.flatMap(m=>m.getActiveTextures?.()||[]));const gl=d.engine._gl,ext=gl.getExtension('WEBGL_debug_renderer_info');return {engine:B.Engine.Version,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),meshes:d.scene.meshes.length,materials:d.scene.materials.length,textures:d.scene.textures.length,unusedDynamicTextures:d.scene.textures.filter(t=>t instanceof B.DynamicTexture&&!used.has(t)).map(t=>({name:t.name,size:t.getSize()})),vertices:d.scene.meshes.reduce((n,m)=>n+m.getTotalVertices(),0),triangles:d.scene.meshes.reduce((n,m)=>n+m.getTotalIndices()/3,0),shadowCasters:list.length,hiddenShadowCasters:list.filter(m=>!m.isVisible||!m.isEnabled()).map(m=>m.name),rows:window.__perfRows};});
  result.cases[size+'-'+view]=data;await page.screenshot({path:path.join(output,'profile-'+label+'-'+size+'-'+view+'.png')});
  const summary=key=>{const a=data.rows.map(r=>r[key]).sort((a,b)=>a-b);return {median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)]}};
  const functions={};for(const name of Object.keys(data.rows[0].functions)){functions[name]={ms:data.rows.reduce((a,r)=>a+(r.functions[name]?.ms||0),0)/frames,calls:data.rows.reduce((a,r)=>a+(r.functions[name]?.calls||0),0)/frames};}
  console.log(size+'-'+view,JSON.stringify({loop:summary('loopMs'),interval:summary('intervalMs'),drawCalls:summary('drawCalls'),renderTargets:summary('renderTargetsMs'),meshes:data.meshes,activeMeshes:summary('activeMeshes'),shadowCasters:data.shadowCasters,hiddenShadowCasters:data.hiddenShadowCasters.length,unusedDynamicTextures:data.unusedDynamicTextures.length,functions}));
 }
 if(errors.length)throw Error(errors.join('; '));await page.close();
}fs.writeFileSync(path.join(output,'performance-'+label+'.json'),JSON.stringify(result,null,2));console.log('Saved profile',label);}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});

