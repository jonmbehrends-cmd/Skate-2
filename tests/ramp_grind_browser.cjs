/* Regress the reported ramp disappearance at the actual render boundary,
 * plus distinct production touch, keyboard and Xbox GRIND/OLLIE dispatch. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts','ramp-grind');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.js')?'application/javascript':'text/html'});res.end(e?'':b);});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox']});
 const result={};
 try{for(const [label,viewport] of [['desktop',{width:1280,height:800}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,hasTouch:label==='mobile',isMobile:label==='mobile'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://cdn.babylonjs.com/babylon.js',r=>r.fulfill({path:require.resolve('babylonjs'),contentType:'application/javascript'}));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__?.riderV2?.diagnostics.frames>2);
  await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.scene.whenReadyAsync());
  await page.evaluate(()=>{const d=window.__SOL_DIAGNOSTICS__;window.__qaLoop=d.engine._activeRenderLoops[0];d.engine.stopRenderLoop();});
  const textures=await page.evaluate(()=>{const d=window.__SOL_DIAGNOSTICS__,B=BABYLON;return d.scene.meshes.filter(m=>['solid skatable concrete ramp','SOLID RAMP SIDE WALL','park continuous concrete','HALFPIPE FLAT BOTTOM'].includes(m.name)).map(m=>({name:m.name,ready:m.isReady(true),texture:m.material.diffuseTexture?.isReady()??true,opaque:m.material.alpha===1&&!m.material.needAlphaBlending(),normalY:m.name==='solid skatable concrete ramp'?m.getVerticesData(B.VertexBuffer.NormalKind)[1]:null}));});
  const art=await page.evaluate(()=>{const scene=window.__SOL_DIAGNOSTICS__.scene;
   const murals=scene.meshes.filter(m=>['halfpipe deck front fascia','halfpipe deck back fascia','park perimeter painted mural'].includes(m.name));
   return {count:murals.length,opaque:murals.every(m=>m.material?.alpha===1&&!m.material.needAlphaBlending()),ready:murals.every(m=>m.material?.diffuseTexture?.isReady()),safe:murals.every(m=>!m.isPickable&&!m.checkCollisions),materialNames:[...new Set(murals.map(m=>m.material?.name))]};});
  assert(art.count>=8&&art.opaque&&art.ready&&art.safe,'Architectural murals must render opaque and stay non-colliding: '+JSON.stringify(art));
  result[label]={art};
  assert(textures.length>=40);assert(textures.every(m=>m.ready&&m.texture&&m.opaque),'All solid surfaces must be render-ready: '+JSON.stringify(textures));assert(textures.filter(m=>m.normalY!==null).every(m=>m.normalY>0),'Top normals must face daylight in Babylon');
  const deckVertices=await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.scene.getMeshByName('deck').getTotalVertices());
  assert(deckVertices>1000,'Production board must use the imported V2 mesh');
  result[label]={textures,deckVertices,views:[],input:{}};
  for(const [name,pos,target] of [['bank-front',[-27,9,-3],[-12,1,15]],['bank-back',[-2,7,36],[-12,1,15]],['halfpipe',[-9,17,-50],[-36,2,-18]]]){
   const active=await page.evaluate(({name,pos,target})=>{const d=window.__SOL_DIAGNOSTICS__,B=BABYLON,c=new B.FreeCamera(name,new B.Vector3(...pos),d.scene);c.setTarget(new B.Vector3(...target));c.minZ=.03;d.scene.activeCamera=c;d.scene.render();return d.scene.getActiveMeshes().data.filter(m=>m?.name==='solid skatable concrete ramp').length;},{name,pos,target});assert(active>0,'Riding skins must enter the active render pass');
   await page.screenshot({path:path.join(out,label+'-'+name+'.png')});result[label].views.push({name,active});
  }
  async function reset(near=false){await page.evaluate(near=>{document.querySelector('#restart').click();const s=window.__SOL_DIAGNOSTICS__.state;Object.assign(s,{x:0,z:near?19:0,y:0,groundY:0,vy:0,dir:0,speed:near?5:0,grounded:true,grinding:false,grindCooldown:0,grindAirborneUntil:0});},near);}
  async function state(){return page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;return {grounded:s.grounded,grinding:s.grinding,type:s.grindType,request:s.grindRequestType,vy:s.vy,y:s.y,x:s.x,z:s.z,count:s.count};});}
  await reset();await page.locator('[data-t="grind"]').click();let s=await state();assert(!s.grounded&&!s.grinding&&s.vy>0&&s.request==='50-50'&&s.count===1,'GRIND must ollie even away from a rail: '+JSON.stringify(s));result[label].input.armed=s;
  await reset(true);await page.locator('[data-t="grind"]').click();s=await state();assert(!s.grounded&&!s.grinding&&s.vy>0&&s.request==='50-50','GRIND must launch before rail contact: '+JSON.stringify(s));result[label].input.touchGrind=s;
  // Continue the real callback: a grind must travel along the rail, not only set a flag.
  await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.engine.runRenderLoop(window.__qaLoop));await page.waitForFunction(()=>{const s=window.__SOL_DIAGNOSTICS__.state;return s.grinding&&s.grindType==='50-50'&&s.z>19.5},null,{timeout:8000});await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.engine.stopRenderLoop());s=await state();assert(s.grinding&&s.type==='50-50'&&Math.abs(s.x)<.001&&s.y===1.1,'GRIND must land into moving 50-50: '+JSON.stringify(s));result[label].input.traversal=s;
  await reset();await page.locator('[data-t="ollie"]').click();s=await state();assert(!s.grounded&&!s.grinding&&s.vy>0&&s.count===1);result[label].input.touchOllie=s;
  await reset(true);await page.keyboard.press('g');s=await state();assert(!s.grounded&&!s.grinding&&s.vy>0&&s.request==='50-50','Keyboard G must launch a 50-50 ollie: '+JSON.stringify(s));result[label].input.keyboardGrind=s;
  await reset();await page.keyboard.press('Space');s=await state();assert(!s.grounded&&s.vy>0);result[label].input.keyboardOllie=s;
  await page.evaluate(()=>{window.__pad={index:0,id:'Xbox Wireless Controller',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.__pad]});window.__qaLoop();});
  await reset(true);await page.evaluate(()=>{window.__qaLoop();window.__pad.buttons[4].pressed=true;window.__qaLoop();});s=await state();assert(!s.grounded&&!s.grinding&&s.vy>0&&s.request==='50-50','Xbox LB must launch a 50-50 ollie: '+JSON.stringify(s));result[label].input.xboxGrind=s;
  await page.evaluate(()=>{window.__pad.buttons[4].pressed=false;window.__qaLoop();});await reset();await page.evaluate(()=>{window.__qaLoop();window.__pad.buttons[0].pressed=true;window.__qaLoop();});s=await state();assert(!s.grounded&&s.vy>0&&!s.grinding);result[label].input.xboxOllie=s;
  assert.deepEqual(errors,[]);await page.close();
 }result.result='PASS';fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log('PASS desktop/mobile: actual ramp render readiness, lit normals, three camera angles, touch/keyboard/Xbox grind vs ollie, constrained grind traversal');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
