/* Same-browser A/B of unchanged art versus local material batches. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const {installRenderBudgetHooks}=require('../tools/render_budget_support.cjs');
const {PNG}=require(path.join(path.dirname(require.resolve('playwright-core')),'lib/utilsBundle.js'));
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts/render-budget');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});res.end(error?'':data);});
});
const views=[['spawn',[5,5,-12],[0,1,8]],['park',[25,28,-50],[-20,1,0]],
 ['left-wall',[-105,4,-70],[-119,1,0]],['right-wall',[105,4,70],[119,1,0]],
 ['halfpipe',[-9,17,-50],[-36,2,-18]],['rider-on-deck',[-31,6.5,-35],[-36,5.6,-31.55]]];
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox']});
 const report={browser:browser.version(),renderer:'SwiftShader software rendering',cases:{}};
 try{
  fs.mkdirSync(out,{recursive:true});
  for(const [size,viewport] of [['desktop',{width:960,height:720}],['mobile',{width:390,height:844}]]){
   const images={};
   for(const variant of ['before','after']){
    const page=await browser.newPage({viewport,hasTouch:size==='mobile',isMobile:size==='mobile'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://cdn.babylonjs.com/babylon.js',r=>r.fulfill({path:require.resolve('babylonjs'),contentType:'application/javascript'}));
    if(variant==='before')await page.route('**/park_architecture.js*',r=>r.fulfill({path:path.join(__dirname,'fixtures/park_architecture.before.js'),contentType:'application/javascript'}));
    await page.addInitScript(()=>Object.defineProperty(navigator,'getGamepads',{value:()=>[]}));
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__?.riderV2?.diagnostics.frames>2,null,{timeout:60000});
    await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.scene.whenReadyAsync());
    await page.evaluate(installRenderBudgetHooks);
    for(const [view,position,target] of views){
     const stats=await page.evaluate(({view,position,target})=>{
      const d=window.__SOL_DIAGNOSTICS__,B=BABYLON,c=new B.FreeCamera('render parity',new B.Vector3(...position),d.scene);
      if(view==='rider-on-deck')d.skater.position.set(-36,4.5,-31.55);
      c.setTarget(new B.Vector3(...target));c.minZ=.1;d.scene.activeCamera=c;
      for(let i=0;i<4;i++){d.engine.beginFrame();d.scene.render();d.engine.endFrame();}
      window.__renderBudget.reset();
      d.scene.render();
      window.__renderBudget.sync();
      return {meshes:d.scene.meshes.length,activeMeshes:d.scene.getActiveMeshes().length,
       drawCalls:window.__renderBudget.stats.calls,drawKinds:window.__renderBudget.stats.byKind,
       engineDrawCalls:d.engine._drawCalls.current,activeIndices:d.scene.getActiveIndices()};
     },{view,position,target});
     assert.equal(stats.drawCalls,stats.engineDrawCalls,'GL draws must cross-check the per-render engine counter');
     const file=path.join(out,`${size}-${view}-${variant}.png`),data=await page.screenshot({path:file});
     const key=size+'-'+view;report.cases[key]||={};report.cases[key][variant]=stats;
     const png=PNG.sync.read(data);
     if(variant==='before')images[key]=png;
     else{
      const before=images[key];assert.equal(png.width,before.width);assert.equal(png.height,before.height);
      let changed=0,total=0,max=0;
      for(let i=0;i<png.data.length;i+=4){let delta=0;for(let c=0;c<3;c++)delta=Math.max(delta,Math.abs(png.data[i+c]-before.data[i+c]));if(delta>2)changed++;total+=delta;max=Math.max(max,delta);}
      const diff={changedPixels:changed,fraction:changed/(png.width*png.height),meanMaxChannelDelta:total/(png.width*png.height),maxChannelDelta:max};
      report.cases[key].pixels=diff;
      assert.equal(diff.maxChannelDelta,0,`${key}: every RGB pixel must match exactly: ${JSON.stringify(diff)}`);
      assert(stats.drawCalls<=report.cases[key].before.drawCalls,`${key}: batching must not increase submissions`);
      console.log(key,JSON.stringify(report.cases[key]));
     }
    }
    assert.deepEqual(errors,[]);await page.close();
   }
  }
  assert(Object.values(report.cases).filter(c=>c.after.drawCalls<c.before.drawCalls).length>=6,
   'At least six views must reduce draw submissions');
  console.log('PASS exact park/rider/shadow parity and GL draw reduction across desktop/mobile and six views');
 }finally{
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));
  await browser.close();server.close();
 }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
