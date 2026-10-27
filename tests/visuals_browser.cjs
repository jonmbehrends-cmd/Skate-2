/* Real WebGL before/after evidence and rendering-boundary regression. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts','visuals');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(e,data)=>{
  if(e)return res.writeHead(404).end();
  if(url.searchParams.has('baseline'))data=Buffer.from(data.toString().replace('SOLVisuals.enhance(B,scene);','').replace('window.SOLBoardV2?SOLBoardV2.build():',''));
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/html');res.end(data);
 });
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox']});
 const results={};
 try{
  for(const baseline of [true,false]){
   const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://cdn.babylonjs.com/babylon.js',r=>r.fulfill({path:require.resolve('babylonjs'),contentType:'application/javascript'}));
   await page.goto('http://127.0.0.1:'+server.address().port+'/?'+(baseline?'baseline':''));
   await page.waitForFunction(()=>!!window.__SOL_DIAGNOSTICS__);
   if(!baseline)await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.scene.whenReadyAsync());
   else await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__.scene.getFrameId()>3);
   // Freeze physics after startup so both variants show identical framing.
   await page.evaluate(()=>{const d=window.__SOL_DIAGNOSTICS__;d.engine.stopRenderLoop();});
   const label=baseline?'before':'after';
   results[label]=await page.evaluate(()=>{
    const d=window.__SOL_DIAGNOSTICS__,B=window.BABYLON;
    const meshes=d.scene.meshes.filter(m=>m.name==='solid skatable concrete ramp');
    return {ramps:meshes.map(m=>{
     const n=m.getVerticesData(B.VertexBuffer.NormalKind);
     return {name:m.material.name,topNormalY:n[1],alpha:m.material.alpha,blending:m.material.needAlphaBlending(),textureAlpha:m.material.diffuseTexture?.hasAlpha,textureReady:m.material.diffuseTexture?.isReady()};
    }),board:d.scene.getMeshByName('deck')?.getTotalVertices()>8,v2Vertices:d.scene.getMeshByName('deck')?.getTotalVertices(),v2Hash:window.SOLBoardV2?.sourceHash,meshCount:d.scene.meshes.length};
   });
   for(const [name,position,target] of [
    ['spawn',null,null],
    ['bank',[-27,9,-3],[-12,1,15]],
    ['bank-reverse',[-2,7,36],[-12,1,15]],
    ['halfpipe',[-9,17,-50],[-36,2,-18]],
    ['skater',[3,2.2,2],[0,1.2,0]],
    ['board',[1.3,.8,1.4],[0,.23,0]]
   ]){
    await page.evaluate(({name,position,target})=>{
     const d=window.__SOL_DIAGNOSTICS__,B=window.BABYLON;
     if(position){
      const c=new B.FreeCamera('art QA '+name,new B.Vector3(...position),d.scene);
      c.setTarget(new B.Vector3(...target));c.minZ=.03;d.scene.activeCamera=c;
     }
     d.scene.render();
    },{name,position,target});
    await page.screenshot({path:path.join(out,label+'-'+name+'.png')});
    if(name==='bank'){
     results[label].surfacePixels=await page.evaluate(async encoded=>{
      const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
      return [[600,480],[650,550],[500,440]].map(([x,y])=>{
       const p=ctx.getImageData(x,y,1,1).data;
       return {x,y,rgb:Array.from(p).slice(0,3),luma:.2126*p[0]+.7152*p[1]+.0722*p[2]};
      });
     },fs.readFileSync(path.join(out,label+'-'+name+'.png')).toString('base64'));
    }
   }
   assert.equal(errors.length,0,errors.join('\n'));
   await page.close();
  }
  assert(results.before.ramps.some(m=>m.topNormalY<0),'Baseline must reproduce inward lighting normals');
  assert(results.after.ramps.every(m=>m.topNormalY>0),'Rendered ramp tops must face daylight');
  assert(results.after.ramps.every(m=>m.alpha===1&&!m.blending&&!m.textureAlpha),'All riding skins must remain opaque');
  assert(results.before.ramps.some(m=>!m.textureReady),'Baseline must reproduce unuploaded cloned textures');
  assert(results.after.ramps.every(m=>m.textureReady),'Every ramp texture must be uploaded and renderable');
  assert(results.after.surfacePixels.every((p,i)=>p.luma>results.before.surfacePixels[i].luma+12),
   'Actual ramp pixels must show the solid lit surface, not the floor behind it');
  assert(results.after.board&&results.after.v2Vertices>1000,'Reviewed V2 deck geometry must be installed');
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://cdn.babylonjs.com/babylon.js',r=>r.fulfill({path:require.resolve('babylonjs'),contentType:'application/javascript'}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.waitForFunction(()=>!!window.__SOL_DIAGNOSTICS__);
  // Capture each rendered simulation frame rather than polling at a fixed
  // wall-clock delay: software WebGL can pass the apex between tool calls.
  await page.evaluate(()=>{
   window.__artSamples=[];
   window.__SOL_DIAGNOSTICS__.scene.onAfterRenderObservable.add(()=>{
    const s=window.__SOL_DIAGNOSTICS__.state;
    window.__artSamples.push({grounded:s.grounded,y:s.y,vy:s.vy,name:s.name,roll:s.rollAngle,yaw:s.yawAngle,score:s.score});
    if(window.__artSamples.length>500)window.__artSamples.shift();
   });
  });
  results.gameplay={};
  for(const action of ['ollie','kick','heel','shove']){
   await page.locator('#restart').click();
   await page.evaluate(()=>window.__artSamples=[]);
   await page.locator('[data-t="'+action+'"]').click();
   await page.waitForFunction(()=>window.__artSamples.some(s=>!s.grounded&&s.vy>0),null,{timeout:10000});
   await page.waitForFunction(()=>{const a=window.__artSamples,i=a.findIndex(s=>!s.grounded);return i>=0&&a.slice(i+1).some(s=>s.grounded);},null,{timeout:10000});
   const samples=await page.evaluate(()=>window.__artSamples);
   const air=samples.filter(s=>!s.grounded);
   assert(air.some(s=>s.name===action.toUpperCase()),action+' must trigger its production trick');
   if(action==='kick'||action==='heel')assert(air.some(s=>Math.abs(s.roll)>.1),'Board must visibly flip');
   if(action==='shove')assert(air.some(s=>Math.abs(s.yaw)>.1),'Board must visibly spin');
   results.gameplay[action]={launch:air[0],maxHeight:Math.max(...air.map(s=>s.y)),landed:true};
  }
  await page.locator('#restart').click();
  const push=await page.locator('[data-t="push"]').boundingBox();
  await page.mouse.move(push.x+push.width/2,push.y+push.height/2);await page.mouse.down();
  await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__.state.speed>.4);
  await page.mouse.up();
  await page.keyboard.down('a');
  await page.waitForFunction(()=>Math.abs(window.__SOL_DIAGNOSTICS__.state.dir)>.2);
  await page.keyboard.up('a');
  results.gameplay.pushAndSteer=true;
  await page.screenshot({path:path.join(out,'after-mobile-controls.png')});
  assert.equal(errors.length,0,errors.join('\n'));
  await page.close();
  results.result='PASS';
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));
  console.log('PASS real Chromium before/after ramp normals, opaque surfaces, shaped deck and six visual QA views',JSON.stringify(results));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
