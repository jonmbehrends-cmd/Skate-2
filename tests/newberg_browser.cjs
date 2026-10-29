'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts/newberg');
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.glb')?'model/gltf-binary':'text/html'});res.end(e?'':data)});});
let browser;
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox']});const results=[];
 for(const mobile of [false,true]){
  const label=mobile?'mobile':'desktop',page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__?.park&&window.__SOL_DIAGNOSTICS__?.rig?.status.ready,null,{timeout:60000});
  await page.evaluate(()=>__SOL_DIAGNOSTICS__.scene.whenReadyAsync());
  const geometry=await page.evaluate(()=>{
   const d=__SOL_DIAGNOSTICS__,p=SOLNewberg,B=BABYLON,m=d.park.terrain;let max=0,samples=0;
   for(let i=0;i<250;i++){const x=-30+(i*13.731%60),z=-22+(i*9.137%44),ray=new B.Ray(new B.Vector3(x,15,z),new B.Vector3(0,-1,0),30);const hit=d.scene.pickWithRay(ray,q=>q===m);if(!hit?.hit)throw Error('Missing solid concrete at '+x+','+z);max=Math.max(max,Math.abs(hit.pickedPoint.y-p.height(x,z)));samples++;}
   for(const [x,z]of [[17,10],[-19,-11],[-18,6]]){const hit=d.scene.pickWithRay(new B.Ray(new B.Vector3(x,15,z),new B.Vector3(0,-1,0),30));if(hit?.pickedMesh!==m)throw Error('Bowl obscured by '+hit?.pickedMesh?.name);}
   const coping=d.park.rails.filter(r=>!r.raised);
   if(coping.length!==8||coping.some(r=>!r.closed))throw Error('Each connected basin must have one uninterrupted closed coping loop');
   for(const rail of coping)for(let i=1;i<rail.path.length;i++){
    const a=rail.path[i-1],b=rail.path[i];for(const t of [0,.5,1])if(Math.abs(p.height(a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t))>.025)throw Error('Concrete intersects or buries coping at '+rail.path[i]);
   }
   // This independently inspects *installed WebGL grind-rail positions*, not a
   // duplicate of the terrain's Catmull-Rom source formula. A future knot or
   // outward-offset change must not bury the kidney coping in either hump.
   const kidneyIndex=p.basins.findIndex(b=>b.name==='west kidney and snake run');
   const kidneyRail=coping[kidneyIndex];
   if(!kidneyRail?.closed)throw Error('Missing uninterrupted kidney coping loop');
   let kidneyHumpClearance=Infinity;
   for(let i=1;i<kidneyRail.path.length;i++){
    const a=kidneyRail.path[i-1],b=kidneyRail.path[i];
    for(let sub=0;sub<8;sub++){
     const t=sub/8,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t;
     for(const cz of [-1.8,2.1])kidneyHumpClearance=Math.min(kidneyHumpClearance,Math.hypot((x+7.8)/3.2,(z-cz)/2.4));
    }
   }
   if(kidneyHumpClearance<1.1)throw Error('Kidney coping may collide with a roll-over hump: '+kidneyHumpClearance);

   return {name:d.park.name,replica:d.park.replica,meshCount:d.scene.meshes.length,terrainVertices:m.getTotalVertices(),maxContactError:max,samples,basins:d.park.basins.length,curveRails:d.park.rails.filter(r=>r.path).length,oldCity:d.scene.meshes.filter(m=>/background building|urban facade|solid skatable concrete ramp/.test(m.name)).length,volcano:p.height(-.7,-12),deep:p.height(17,10),shallow:p.height(-19,-11),materialsReady:m.isReady(true),kidneyHumpClearance,version:B.Engine.Version};
  });
  assert.equal(geometry.name,'Newberg / Chehalem');assert.equal(geometry.oldCity,0);assert.equal(geometry.version,'8.32.1');assert(geometry.materialsReady);assert(geometry.maxContactError<.00002,JSON.stringify(geometry));assert(geometry.volcano>1.3&&geometry.deep< -3.5&&geometry.shallow< -.8);assert(geometry.curveRails>=6);
  await page.screenshot({path:path.join(out,label+'-entrance.png')});
  const push=await page.locator('[data-t="push"]').boundingBox();await page.mouse.move(push.x+push.width/2,push.y+push.height/2);await page.mouse.down();await page.waitForFunction(()=>__SOL_DIAGNOSTICS__.state.speed>.3);await page.mouse.up();
  await page.locator('#restart').click();
  await page.evaluate(()=>{document.addEventListener('pointerdown',e=>{if(e.target.closest('[data-t="ollie"]')){const s=__SOL_DIAGNOSTICS__.state;window.__newbergLaunch={trusted:e.isTrusted,vy:s.vy,count:s.count,grounded:s.grounded,y:s.y};}});});
  if(mobile)await page.locator('[data-t="ollie"]').tap();else await page.locator('[data-t="ollie"]').click();
  const launch=await page.evaluate(()=>window.__newbergLaunch);assert(launch.trusted&&launch.vy>0&&launch.count===1&&!launch.grounded,JSON.stringify(launch));
  await page.waitForFunction(()=>__SOL_DIAGNOSTICS__.state.grounded,null,{timeout:10000});
  await page.locator('#halfpipe').click();const overviewPng=await page.screenshot({path:path.join(out,label+'-overview.png')});
  const pixels=await page.evaluate(async data=>{
   const d=__SOL_DIAGNOSTICS__,B=BABYLON,img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
   return [[17,10],[0,-5]].map(([x,z])=>{const q=B.Vector3.Project(new B.Vector3(x,SOLNewberg.height(x,z),z),B.Matrix.Identity(),d.scene.getTransformMatrix(),d.scene.activeCamera.viewport.toGlobal(d.engine.getRenderWidth(),d.engine.getRenderHeight()));const px=ctx.getImageData(Math.round(q.x),Math.round(q.y),1,1).data;return {rgb:Array.from(px).slice(0,3),luma:.2126*px[0]+.7152*px[1]+.0722*px[2]};});
  },overviewPng.toString('base64'));
  assert(pixels.every(p=>p.luma>55&&p.luma<245),'Concrete must be visibly lit: '+JSON.stringify(pixels));
  const reset=await page.evaluate(()=>{const d=__SOL_DIAGNOSTICS__;return {x:d.state.x,z:d.state.z,y:d.state.y,ground:SOLNewberg.height(d.state.x,d.state.z),camera:d.scene.activeCamera.name};});assert.equal(reset.x,-22);assert.equal(reset.z,-19);assert.equal(reset.y,reset.ground);assert.equal(reset.camera,'halfpipe arrival overview');
  const grinds=await page.evaluate(()=>{
   const rail=__SOL_DIAGNOSTICS__.park.rails.find(r=>r.raised),q=SOLNewberg.pointAt(rail,rail.total*.3),s={x:q.p[0],y:q.p[1]+.1,z:q.p[2],dir:Math.atan2(q.dx,q.dz),speed:5,travelSign:1,grounded:false,grinding:false,grindCooldown:0,vy:-1,grindRequestType:'50-50',combo:0};
   const contact=SOLGrind.find(s,[rail],.025,true,true);if(!contact)throw Error('Curved dragon rail catch missed');SOLGrind.attach(s,contact);const before=s.grindArc;for(let i=0;i<4;i++)SOLGrind.advance(s,.025);const target=SOLNewberg.pointAt(rail,s.grindArc),error=Math.hypot(s.x-target.p[0],s.y-target.p[1],s.z-target.p[2]);
   const grounded={...s,x:q.p[0],z:q.p[2],y:SOLNewberg.height(q.p[0],q.p[2]),grounded:true,grinding:false,grindCooldown:0};
   if(SOLGrind.find(grounded,[rail],.025,true,true))throw Error('Grounded rider snapped onto elevated dragon rail');
   const rising={...grounded,grounded:false,y:q.p[1],vy:3};if(SOLGrind.find(rising,[rail],.025,true,false))throw Error('Unassisted rising catch bypassed ollie');
   const closed=__SOL_DIAGNOSTICS__.park.rails.find(r=>r.closed),end=SOLNewberg.pointAt(closed,closed.total-.05),wrap={x:end.p[0],y:end.p[1]+.1,z:end.p[2],dir:Math.atan2(end.dx,end.dz),speed:5,travelSign:1,grounded:false,grinding:false,grindCooldown:0,vy:-1,grindRequestType:'50-50',combo:0};
   const seam=SOLGrind.find(wrap,[closed],.025,true,true);if(!seam)throw Error('Closed coping seam catch missed');SOLGrind.attach(wrap,seam);SOLGrind.advance(wrap,.025);
   if(!wrap.grinding||wrap.grindArc<=closed.total)throw Error('Coping grind exited at the arbitrary spline seam');
   return {type:s.grindType,advanced:s.grindArc>before,error,finite:[s.x,s.y,s.z,s.dir].every(Number.isFinite),groundSnapRejected:true,risingCatchRejected:true,closedSeamWrapped:true};
  });assert(grinds.advanced&&grinds.finite&&grinds.error<1e-8&&grinds.type==='50-50',JSON.stringify(grinds));
  const rolling=await page.evaluate(()=>{
   const d=__SOL_DIAGNOSTICS__,s=d.state,loop=d.engine._activeRenderLoops[0],render=d.scene.render,realNow=performance.now.bind(performance);d.engine.stopRenderLoop();let now=realNow();Object.defineProperty(performance,'now',{configurable:true,value:()=>now});d.scene.render=()=>{};
   try{Object.assign(s,{x:17,z:18,y:SOLNewberg.height(17,18),groundY:SOLNewberg.height(17,18),grounded:true,grinding:false,speed:0,dir:0,travelSign:1,flip:0,spin:0,count:0,combo:0,pushBurstUntil:0,controlSteer:0,controlThrottle:0});
    for(let i=0;i<60;i++){now+=25;loop();}const rollback={x:s.x,z:s.z,y:s.y,expectedY:SOLNewberg.height(s.x,s.z),speed:s.speed,grounded:s.grounded,travelSign:s.travelSign};
    Object.assign(s,{x:17,z:18.9,y:SOLNewberg.height(17,18.9),groundY:SOLNewberg.height(17,18.9),grounded:true,grinding:false,speed:14,dir:0,travelSign:1,vy:0,rampCooldown:0,grindCooldown:0,bowlAir:null,bowlStats:{launches:0,landings:0,recoveries:0}});let takeoff=null,peak=s.y;
    for(let i=0;i<240;i++){const beforeY=s.y;now+=25;loop();peak=Math.max(peak,s.y);if(!takeoff&&s.bowlStats.launches)takeoff={beforeY,y:s.y,vy:s.vy};if(s.bowlStats.landings)break;}
    return {...rollback,vert:{takeoff,peak,stats:s.bowlStats,grounded:s.grounded,finite:[s.x,s.y,s.z,s.speed].every(Number.isFinite)}};
   }finally{Object.defineProperty(performance,'now',{configurable:true,value:realNow});d.scene.render=render;}
  });
  assert(rolling.grounded&&rolling.z<17.9&&rolling.travelSign===-1&&rolling.speed>0&&Math.abs(rolling.y-rolling.expectedY)<1e-7,'Bowl must roll downhill on actual concrete: '+JSON.stringify(rolling));
  assert(rolling.vert.takeoff?.vy>0&&rolling.vert.peak>0&&rolling.vert.stats.landings>0&&rolling.vert.grounded&&rolling.vert.finite,'Deep end needs real vert takeoff and reentry: '+JSON.stringify(rolling.vert));
  assert(rolling.vert.takeoff.y-rolling.vert.takeoff.beforeY<.4&&rolling.vert.stats.recoveries===0,'Vert must take off continuously without floor recovery: '+JSON.stringify(rolling.vert));
  assert.deepEqual(errors,[]);results.push({label,geometry,launch,reset,pixels,grinds,rolling});await page.close();
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({result:'PASS',results},null,2));console.log('PASS Newberg actual production page, desktop/mobile geometry, trusted PUSH/OLLIE, landing, overview, curved rail',results);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
