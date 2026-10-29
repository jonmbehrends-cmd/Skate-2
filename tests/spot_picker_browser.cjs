'use strict';
// Real Chromium desktop/mobile navigation acceptance. All clicks/taps are
// browser-trusted inputs; travel uses the production restart, not fake state.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts/newberg/spots');
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,data)=>{
  res.writeHead(err?404:200,{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.glb')?'model/gltf-binary':'text/html'});
  res.end(err?'':data);
 });
});
let browser;
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox']});
 const results=[];
 for(const [label,viewport,mobile] of [['desktop',{width:1280,height:800},false],['mobile',{width:390,height:844},true],['landscape',{width:844,height:390},true]]){
  const page=await browser.newPage({viewport,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__?.park?.spots?.length===6&&window.__SOL_DIAGNOSTICS__?.rig?.status.ready,null,{timeout:60000});
  const spots=await page.evaluate(()=>__SOL_DIAGNOSTICS__.park.spots);
  assert.deepEqual(spots.map(s=>s.id),['core','river','competition','snake','surf','street']);
  assert.equal(await page.locator('#spotsPanel').isVisible(),false);
  assert.equal(await page.locator('#spotsToggle').getAttribute('aria-expanded'),'false');
  const layout=await page.evaluate(()=>{
   const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};
   const a=rect('#spotsToggle'),b=rect('#halfpipe'),c=rect('#restart'),d=rect('[data-t="grind"]'),e=rect('[data-t="boardslide"]'),overlap=(r,s)=>r.x<s.x+s.w&&r.x+r.w>s.x&&r.y<s.y+s.h&&r.y+r.h>s.y;
   return {spots:a,park:b,restart:c,grind:d,boardslide:e,overlaps:[b,c,d,e].some(o=>overlap(a,o))};
  });
  assert(!layout.overlaps,'District menu obstructs existing fixed controls: '+JSON.stringify(layout));
  const tap=async locator=>{if(mobile)await locator.tap();else await locator.click();};
  await tap(page.locator('#spotsToggle'));
  assert(await page.locator('#spotsPanel').isVisible());
  assert.equal(await page.locator('#spotsToggle').getAttribute('aria-expanded'),'true');
  await page.screenshot({path:path.join(out,label+'-menu.png')});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#spotsPanel').isVisible(),false,'ESC must close selection');
  const trials=[];
  // Jump out of park overview and preserve the prior earned score. Every spot
  // must land on solid flat terrain without retaining a grind or a stale push.
  await tap(page.locator('#halfpipe'));
  for(const spot of spots){
   await page.evaluate(()=>{const s=__SOL_DIAGNOSTICS__.state;s.score=1250;s.speed=0;s.vy=0;s.grindRequestType='50-50';s.grindRequestUntil=performance.now()+1200;s.pushBurstUntil=performance.now()+1500;});
   await tap(page.locator('#spotsToggle'));
   await tap(page.locator('#spotsPanel [data-spot="'+spot.id+'"]'));
   assert.equal(await page.locator('#spotsPanel').isVisible(),false,'Selection must close after travel');
   await page.waitForTimeout(130); // Let the active FollowCamera render the jumped district.
   const state=await page.evaluate(()=>{
    const d=__SOL_DIAGNOSTICS__,s=d.state,p=SOLNewberg,B=BABYLON;
    // Camera distance is a reliable invariant. Pixel-space projections from
    // forced camera matrices can differ from the real Chromium render after
    // a FollowCamera reset; inspect screenshots instead of false pixel math.
    const cameraDistance=B.Vector3.Distance(d.camera.position,new B.Vector3(s.x,s.y,s.z));
    return {x:s.x,y:s.y,z:s.z,dir:s.dir,speed:s.speed,ground:p.height(s.x,s.z),score:s.score,
     cameraDistance,
     cameraPosition:d.camera.position.asArray(),cameraRotation:d.camera.rotation.asArray(),
     grounded:s.grounded,grinding:s.grinding,air:!!s.bowlAir,grindRail:!!s.grindRail,
     pushHeld:d.input().pushHeld,pushBurstUntil:s.pushBurstUntil,activeCamera:d.scene.activeCamera.name,
     followCamera:d.camera.name,hoodie:d.rig.status.source,bones:d.rig.status.bones};
   });
   assert(Math.abs(state.x-spot.x)<.04&&Math.abs(state.z-spot.z)<.04,'Travel went to wrong district: '+JSON.stringify({spot,state}));
   assert(Math.abs(state.y-state.ground)<.02,'Travel must land on authoritative concrete: '+JSON.stringify({spot,state}));
   assert(Math.abs(state.ground)<.05,'District spawn should be on a level deck, not partway up a transition: '+JSON.stringify({spot,state}));
   assert(state.score===1250&&state.grounded&&!state.grinding&&!state.air&&!state.grindRail,
    'Travel did not safely reset previous run while preserving score: '+JSON.stringify(state));
   assert(state.speed<.1&&!state.pushHeld&&state.pushBurstUntil===0,'Input/momentum was carried into a new district: '+JSON.stringify(state));
   if(spot.id==='river'||spot.id==='competition'){
    await page.screenshot({path:path.join(out,label+'-'+spot.id+'-after-jump.png')});
   }
   assert(state.activeCamera===state.followCamera,'Travel must restore gameplay-follow camera: '+JSON.stringify(state));
   assert(state.cameraDistance<30,'Long-distance district jump left FollowCamera stranded at previous spot: '+JSON.stringify(state));
   assert(Math.abs(state.cameraPosition[0])<93.4&&Math.abs(state.cameraPosition[2])<69.4,
    'FollowCamera started behind the park perimeter wall after travel: '+JSON.stringify({spot,state}));
   // Actual rider visibility at river/competition must be accepted by
   // inspecting the saved real Chromium screenshot gallery.
   assert(state.hoodie.includes('quaternius-hoodie')&&state.bones===62,'Licensed skater missing after travel');
   trials.push({id:spot.id,x:state.x,y:state.y,z:state.z,score:state.score});
   if(spot.id==='competition'){await page.waitForTimeout(300);await page.screenshot({path:path.join(out,label+'-competition-riding.png')});}
  }
  // RESTART must still return to the original Chehalem start after travel.
  await tap(page.locator('#restart'));
  const reset=await page.evaluate(()=>({x:__SOL_DIAGNOSTICS__.state.x,z:__SOL_DIAGNOSTICS__.state.z}));
  assert(Math.abs(reset.x+22)<.02&&Math.abs(reset.z+19)<.02,'Restart no longer returns to the original spawn: '+JSON.stringify(reset));
  assert.deepEqual(errors,[],'Uncaught browser errors');
  results.push({label,layout,trials,reset});await page.close();
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({result:'PASS',results},null,2));
 console.log('PASS six district spawns, mobile touch, preserved score, reset/input ownership, camera and classic controls');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
