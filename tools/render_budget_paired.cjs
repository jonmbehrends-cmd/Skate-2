/* Paired render-only experiment. No simulation clock or FPS extrapolation. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const {installRenderBudgetHooks}=require('./render_budget_support.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts/render-budget');
const blocks=Number(process.env.RENDER_PAIRS)||8,samples=Number(process.env.RENDER_SAMPLES)||5,warmup=3;
if(blocks<2||samples<1)throw Error('Need at least two blocks and one sample');
const views=[['spawn',[5,5,-12],[0,1,8]],['park',[25,28,-50],[-20,1,0]],
 ['left-wall',[-105,4,-70],[-119,1,0]],['right-wall',[105,4,70],[119,1,0]],['halfpipe',[-9,17,-50],[-36,2,-18]]];
const flags=['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox'];
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(p==='/'?'/index.html':p));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});res.end(error?'':data);});
});
const {summarize}=require('./render_budget_statistics.cjs');
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({args:flags});
 const report={source:execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),
  browser:browser.version(),flags,platform:process.platform,cpuCount:os.cpus().length,loadavg:os.loadavg(),
  loadavgNote:process.platform==='win32'?'Windows loadavg is unavailable (reported zeros)':'OS load averages',
  blocks,samples,warmup,viewNames:views.map(v=>v[0]),firstBlockDiscarded:true,canaryRejectionPercent:10,
  canaryMethod:'Median of five fixed-work batches after ten warm-up calls',simulation:'frozen; zero physics substeps',
  rendering:'SwiftShader; rider and shadows disabled in both size conditions; projection held constant',runs:[]};
 try{
  for(const [size,viewport]of [['desktop',{width:960,height:720}],['mobile',{width:390,height:844}]]){
   for(let block=0;block<blocks;block++){
    const order=block%2?['after','before','before','after']:['before','after','after','before'];
    for(const [position,variant]of [...order,'before','before'].entries()){
     const page=await browser.newPage({viewport,hasTouch:size==='mobile',isMobile:size==='mobile'}),errors=[];
     page.on('pageerror',e=>errors.push(e.message));
     await page.route('https://cdn.babylonjs.com/babylon.js',r=>r.fulfill({path:require.resolve('babylonjs'),contentType:'application/javascript'}));
     if(variant==='before')await page.route('**/park_architecture.js*',r=>r.fulfill({path:path.join(root,'tests/fixtures/park_architecture.before.js'),contentType:'application/javascript'}));
     await page.addInitScript(()=>Object.defineProperty(navigator,'getGamepads',{value:()=>[]}));
     const navigationStart=performance.now();await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
     await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__?.riderV2?.diagnostics.frames>2,null,{timeout:60000});
     await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.scene.whenReadyAsync());
     const startupMs=performance.now()-navigationStart;await page.evaluate(installRenderBudgetHooks);
     const data=await page.evaluate(({views,viewport,samples,warmup})=>{
      const d=window.__SOL_DIAGNOSTICS__,B=BABYLON,h=window.__renderBudget,now=h.realNow;
      d.skater.setEnabled(false);d.scene.shadowsEnabled=false;
      function canary(){let sink=123,start;for(let round=0;round<10;round++){
       if(round===5)start=now();for(let i=0;i<350000;i++)sink=Math.imul(sink^i,1664525)+1013904223|0;
      }window.__canarySink=sink;return now()-start;}
      for(let i=0;i<10;i++)canary();
      function stableCanary(){const values=Array.from({length:5},()=>canary()).sort((a,b)=>a-b);return values[2];}
      const result={canaries:[stableCanary()],cases:{},build:[]};
      const inst=h.instrumentation;inst.captureActiveMeshesEvaluationTime=true;inst.captureRenderTime=true;
      h.setCounting(false);
      for(const [name,position,target]of views){
       d.engine.setSize(viewport.width,viewport.height);
       const c=new B.FreeCamera('paired fixed view',new B.Vector3(...position),d.scene);c.setTarget(new B.Vector3(...target));c.minZ=.1;
       d.scene.activeCamera=c;c.freezeProjectionMatrix(c.getProjectionMatrix(true).clone());
       for(const resolution of ['submission64','rasterFull']){
        d.engine.setSize(resolution==='submission64'?64:viewport.width,resolution==='submission64'?64:viewport.height);
        for(let i=0;i<warmup;i++){d.scene.render();h.sync();}
        h.setCounting(true);h.reset();d.scene.render();h.sync();
        const item={drawCalls:h.stats.calls,engineDrawCalls:d.engine._drawCalls.current,
         activeIndices:d.scene.getActiveIndices(),activeMeshes:d.scene.getActiveMeshes().length,rows:[]};h.setCounting(false);
        for(let i=0;i<samples;i++){
         const start=now();d.scene.render();const submitted=now();h.sync();const end=now();
         item.rows.push({submissionMs:submitted-start,synchronizedMs:end-start,syncWaitMs:end-submitted,
          evaluationMs:inst.activeMeshesEvaluationTimeCounter.current,renderMs:inst.renderTimeCounter.current});
        }
        result.cases[`${name}-${resolution}`]=item;
       }
       c.dispose();
      }
      // Separate build/dispose measurements; scene cleanup keeps the baseline's
      // pre-existing material leak from contaminating subsequent runs.
      const ramps=[{curve:'halfpipe-deck',x:-36,z:-31.55,w:38,d:3.1,h:4.5},{curve:'halfpipe-deck',x:-36,z:-4.65,w:38,d:3.1,h:4.5},
       {curve:'halfpipe-left',x:-36,z:-25.8,w:38,d:8.4,h:4.5},{curve:'halfpipe-right',x:-36,z:-10.4,w:38,d:8.4,h:4.5}];
      for(let i=0;i<3;i++){
       const scene=new B.Scene(d.engine),start=now(),art=SOLParkArchitecture.build(B,scene,ramps),built=now();
       art.dispose();const disposed=now();result.build.push({buildMs:built-start,disposeMs:disposed-built,
        remainingMeshes:scene.meshes.length,remainingMaterials:scene.materials.filter(m=>m.name!=='default material').length,
        atlasRetained:scene.textures.some(t=>t.name==='park concrete stencil atlas')});scene.dispose();
      }
      result.canaries.push(stableCanary());inst.dispose();return result;
     },{views,viewport,samples,warmup});
     if(errors.length)throw Error(errors.join('; '));
     for(const [key,c] of Object.entries(data.cases))if(c.drawCalls!==c.engineDrawCalls)
      throw Error(`GL/engine draw-counter mismatch ${key}: GL=${c.drawCalls}, engine=${c.engineDrawCalls}`);
     report.runs.push({size,block,position,variant,role:position<4?'test':'control',startupMs,...data});
     await page.close();fs.writeFileSync(path.join(out,'paired-progress.json'),JSON.stringify(report,null,2));
    }
    console.log(`Completed ${size} block ${block+1}/${blocks}: ${order.join('/')} plus A/A`);
   }
  }
  report.summary=summarize(report);
  fs.writeFileSync(path.join(out,'paired-result.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report.summary,null,2));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
