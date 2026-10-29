'use strict';
/* Real production engine + Chromium/WebGL shallow-bowl launch acceptance.
 * Uses the actual SOL SKATE render loop at deterministic 25ms steps after
 * initializing a grounded approach. No mocked physics or direct vertLaunch
 * invocation; screenshot evidence is captured at the first airborne frame. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts/newberg/shallow-vert');
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.glb')?'model/gltf-binary':'text/html'});res.end(e?'':data)});
});
let browser;
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox']});
 const results=[];
 for(const [label,viewport,mobile]of [['desktop',{width:1280,height:800},false],['mobile',{width:390,height:844},true]]){
  const page=await browser.newPage({viewport,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__?.rig?.status.ready&&window.__SOL_DIAGNOSTICS__?.park?.terrainMeshes,null,{timeout:60000});
  const conditions=[
   {name:'kidney',x:-14.389994679025422,z:-.17904051316835665},
   {name:'capsule',x:5.095181938727743,z:-8.416307109383567},
   {name:'beginner',x:-18.523593098311096,z:-17.410014116018257}
  ];
  for(const spot of conditions){
   const launch=await page.evaluate(({name,x,z,mobile})=>{
    const d=__SOL_DIAGNOSTICS__,p=SOLNewberg,s=d.state,B=BABYLON;
    if(!window.__shallowLoop){
     window.__shallowLoop=d.engine._activeRenderLoops[0];
     d.engine.stopRenderLoop();
     window.__shallowClock=performance.now();
     Object.defineProperty(performance,'now',{configurable:true,value:()=>window.__shallowClock});
     window.__shallowRender=d.scene.render;
     d.scene.render=()=>{};
     window.__shallowLoop();
    }
    const g=p.gradient(x,z),mag=Math.hypot(g.x,g.z),dx=g.x/mag,dz=g.z/mag;
    if(!Number.isFinite(mag)||mag<.25)throw Error('No uphill lip gradient near '+name);
    const initialX=x-dx*.22,initialZ=z-dz*.22,dir=Math.atan2(dx,dz);
    Object.assign(s,{x:initialX,z:initialZ,dir,groundY:p.height(initialX,initialZ),y:p.height(initialX,initialZ),
     speed:14,travelSign:1,grounded:true,grinding:false,grindRail:null,
     grindRequestType:null,grindRequestUntil:0,grindCooldown:0,rampCooldown:0,
     vy:0,airVX:null,airVZ:null,airTime:0,bowlAir:null,bowlStats:{launches:0,landings:0,recoveries:0},
     controlSteer:0,controlThrottle:0,pushBurstUntil:0,flip:0,spin:0,rollAngle:0,rollVelocity:0,yawAngle:0,yawVelocity:0});
    let takeoff=null,maxStep=0,last={x:s.x,z:s.z,y:s.y};
    for(let i=0;i<25;i++){
     window.__shallowClock+=25;window.__shallowLoop();
     maxStep=Math.max(maxStep,Math.hypot(s.x-last.x,s.z-last.z));last={x:s.x,z:s.z,y:s.y};
     if(s.bowlStats.launches>0){takeoff={frame:i,x:s.x,y:s.y,z:s.z,vy:s.vy,grounded:s.grounded,kind:s.name,shallow:s.bowlAir?.shallow,pitch:d.skater.rotation.x,feetY:d.rig.status.feet.map(f=>f[1]),rearPop:d.rig.status.footPose.rearPop};break;}
    }
    if(takeoff){
     const old=d.scene.activeCamera;
     if(window.__shallowCamera)window.__shallowCamera.dispose();
     window.__shallowCamera=new B.ArcRotateCamera('shallow evidence '+name,-.9,1.18,mobile?14:19,new B.Vector3(s.x,s.y+.8,s.z),d.scene);
     d.scene.activeCamera=window.__shallowCamera;
     d.scene.render=window.__shallowRender;d.scene.render();d.scene.render=()=>{};
    }
    return {name,takeoff,maxStep,initial:{x:initialX,z:initialZ,y:p.height(initialX,initialZ)},speed:s.speed,source:d.rig.status.source,bones:d.rig.status.bones};
   },{...spot,mobile});
   assert(launch.takeoff?.vy>0&&!launch.takeoff.grounded&&launch.takeoff.kind==='NEWBERG VERT AIR',
    'Running engine did not launch shallow '+label+'/'+spot.name+': '+JSON.stringify(launch));
   assert(launch.takeoff.feetY.every(y=>Math.abs(y-.47)<.05)&&launch.takeoff.rearPop===0,
    'Shallow-air shoes must stay with the rising board: '+JSON.stringify(launch));
   assert(launch.maxStep<.5,'Unexpected horizontal teleport '+JSON.stringify(launch));
   assert(launch.takeoff.shallow&&Math.abs(launch.takeoff.pitch)<.82,
    'Shallow takeoff must not pitch the visible hoodie nearly horizontal: '+JSON.stringify(launch));
   assert(launch.bones===62&&launch.source.includes('quaternius-hoodie'),'Production hoodie missing');
   await page.screenshot({path:path.join(out,label+'-'+spot.name+'-air.png')});
   // Continue the *same* production-loop flight through actual gravity, turn
   // and collision; detect the first touchdown, not an artificial reset.
   const landing=await page.evaluate(()=>{
    const d=__SOL_DIAGNOSTICS__,s=d.state,p=SOLNewberg,B=BABYLON;
    let peak=s.y,maxStep=0,landed=false;
    let lastX=s.x,lastZ=s.z;
    for(let i=0;i<150;i++){
     window.__shallowClock+=25;window.__shallowLoop();
     maxStep=Math.max(maxStep,Math.hypot(s.x-lastX,s.z-lastZ));
     lastX=s.x;lastZ=s.z;peak=Math.max(peak,s.y);
     if(s.bowlStats?.landings>0){landed=true;break;}
    }
    window.__shallowCamera.setTarget(new B.Vector3(s.x,s.y+.8,s.z));
    d.scene.render=window.__shallowRender;d.scene.render();d.scene.render=()=>{};
    return {landed,grounded:s.grounded,peak,maxStep,recoveries:s.bowlStats?.recoveries,
     y:s.y,ground:p.height(s.x,s.z),landings:s.bowlStats?.landings};
   });
   assert(landing.landed&&landing.grounded&&landing.landings>0,
    'Shallow vert must re-enter and land, not fly out of park: '+JSON.stringify({label,spot,launch,landing}));
   assert(landing.peak-launch.takeoff.y>.18&&landing.maxStep<.5&&Math.abs(landing.y-landing.ground)<.0001,
    'Shallow vert had a teleport or no meaningful flight: '+JSON.stringify({label,spot,launch,landing}));
   assert(landing.recoveries===0,'Shallow vert must not need forced recovery: '+JSON.stringify(landing));
   await page.screenshot({path:path.join(out,label+'-'+spot.name+'-landing.png')});
   results.push({label,...launch,landing});
  }
  assert.deepEqual(errors,[],'Browser page errors');
  await page.close();
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({result:'PASS',results},null,2));
 console.log('PASS desktop/mobile real Chromium shallow launch production-loop entries and screenshots',results);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
