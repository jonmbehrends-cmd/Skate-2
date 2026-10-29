/* Production expansion acceptance. Geometry queries use the rendered Babylon
 * meshes independently of contact arithmetic. Long routes advance the actual
 * production loop; only the initial route state and elapsed clock are controlled.
 * Software Chromium evidence does not establish physical mobile frame rates. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts/newberg/expansion');
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.glb')?'model/gltf-binary':'text/html'});res.end(e?'':data)});
});
let browser;
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const source=execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim();
 const trackedChanges=execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root}).toString().trim();
 const sourceHashes=Object.fromEntries(['index.html','newberg_park.js','tests/expansion_browser.cjs'].map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox']});
 const results=[];
 for(const [label,viewport,mobile]of [['desktop',{width:1280,height:800},false],['mobile',{width:390,height:844},true],['landscape',{width:844,height:390},true]]){
  const page=await browser.newPage({viewport,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1}),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__?.park?.terrainMeshes&&window.__SOL_DIAGNOSTICS__?.rig?.status.ready,null,{timeout:60000});
  await page.evaluate(()=>__SOL_DIAGNOSTICS__.scene.whenReadyAsync());
  const geometry=await page.evaluate(()=>{
   const d=__SOL_DIAGNOSTICS__,p=SOLNewberg,B=BABYLON,meshes=d.park.terrainMeshes;
   let maxError=0,samples=0,minHeight=Infinity,maxSeamStep=0;
   const probe=(x,z)=>{
    const ray=new B.Ray(new B.Vector3(x,25,z),new B.Vector3(0,-1,0),40),hit=d.scene.pickWithRay(ray,m=>meshes.includes(m));
    if(!hit?.hit)throw Error('Missing rendered concrete at '+[x,z]);
    const y=p.height(x,z);maxError=Math.max(maxError,Math.abs(hit.pickedPoint.y-y));minHeight=Math.min(minHeight,y);samples++;
   };
   // Each tile gets its own stratified grid, including outermost riding edges.
   for(let row=0;row<3;row++)for(let col=0;col<3;col++)for(let j=0;j<9;j++)for(let i=0;i<11;i++){
    probe(-p.width/2+(col+(i+.37)/11)*p.width/3,-p.depth/2+(row+(j+.61)/9)*p.depth/3);
   }
   for(const x of [-p.width/2+.01,p.width/2-.01])for(const z of [-p.depth/2+.01,0,p.depth/2-.01])probe(x,z);
   for(const seam of [-31,31])for(let i=0;i<=100;i++){
    const z=-68+i*1.36;probe(seam-.001,z);probe(seam+.001,z);
    maxSeamStep=Math.max(maxSeamStep,Math.abs(p.height(seam-.001,z)-p.height(seam+.001,z)));
   }
   for(const seam of [-23,23])for(let i=0;i<=100;i++){
    const x=-92+i*1.84;probe(x,seam-.001);probe(x,seam+.001);
    maxSeamStep=Math.max(maxSeamStep,Math.abs(p.height(x,seam-.001)-p.height(x,seam+.001)));
   }
   // Probe basin floors away from intentional internal roll-over humps.
   const centers=[[-65,10],[61,20],[0,-44],[0,46]];
   const floors=centers.map(([x,z])=>{
    const hit=d.scene.pickWithRay(new B.Ray(new B.Vector3(x,25,z),new B.Vector3(0,-1,0),40));
    if(!hit?.hit||!meshes.includes(hit.pickedMesh))throw Error('Expansion bowl capped by '+hit?.pickedMesh?.name+' at '+[x,z]);
    return {x,z,height:p.height(x,z),visibleHeight:hit.pickedPoint.y};
   });
   const outside=(x,z)=>Math.abs(x)>p.width/2||Math.abs(z)>p.depth/2;
   const masts=d.scene.meshes.filter(m=>m.name==='perimeter light mast');
   if(masts.length!==18||masts.some(m=>!outside(m.position.x,m.position.z)))throw Error('Noncolliding light mast inside riding rectangle');
   const trunks=d.scene.meshes.find(m=>m.name==='Ewing Young woodland Oregon tree bark');
   if(!trunks)throw Error('Missing perimeter tree trunk batch');
   const positions=trunks.getVerticesData(B.VertexBuffer.PositionKind),world=trunks.computeWorldMatrix(true);
   for(let i=0;i<positions.length;i+=3){const v=B.Vector3.TransformCoordinates(new B.Vector3(positions[i],positions[i+1],positions[i+2]),world);if(!outside(v.x,v.z))throw Error('Noncolliding tree trunk inside riding rectangle');}
   return {width:p.width,depth:p.depth,tiles:meshes.length,coreVertices:d.park.terrain.getTotalVertices(),basins:p.basins.length,samples,maxError,maxSeamStep,minHeight,floors,
    opaque:meshes.every(m=>m.isReady(true)&&m.material.alpha===1&&m.material.transparencyMode===B.Material.MATERIAL_OPAQUE),
    hoodieSource:d.rig.status.source,hoodieBones:d.rig.status.bones};
  });
  assert.equal(geometry.width,186);assert.equal(geometry.depth,138);assert.equal(geometry.tiles,9);assert.equal(geometry.coreVertices,201*151);assert.equal(geometry.basins,8);
  assert(geometry.opaque&&geometry.maxError<.00004,'Render/contact mismatch: '+JSON.stringify(geometry));
  assert(geometry.maxSeamStep<.025,'Tile seam has a vertical step: '+JSON.stringify(geometry));
  assert(geometry.floors.every(f=>f.height<-.5),'Expansion must contain actual recessed terrain: '+JSON.stringify(geometry.floors));
  assert(geometry.minHeight>=-6.10001&&geometry.minHeight< -5.9,'Large bowl depth missing or invalid');
  assert(geometry.hoodieSource.includes('quaternius-hoodie')&&geometry.hoodieBones===62,'Production licensed rider missing');
  const flatbars=await page.evaluate(()=>{
   const p=SOLNewberg,bars=__SOL_DIAGNOSTICS__.park.rails.filter(r=>r.raised&&r.path.length===2),records=[];
   for(const rail of bars)for(const direction of [-1,1]){
    const q=p.pointAt(rail,rail.total*.5),s={x:q.p[0],y:q.p[1]+.05,z:q.p[2],dir:Math.atan2(q.dx*direction,q.dz*direction),speed:5,travelSign:1,grounded:false,grinding:false,grindCooldown:0,vy:-1,grindRequestType:'50-50',combo:0};
    const contact=SOLGrind.find(s,[rail],.025,true,false);
    if(!contact)throw Error('Expanded flatbar cannot catch in direction '+direction);
    SOLGrind.attach(s,contact);const start=s.grindArc;for(let i=0;i<8;i++)SOLGrind.advance(s,.025);
    const expected=p.pointAt(rail,s.grindArc),error=Math.hypot(s.x-expected.p[0],s.y-expected.p[1],s.z-expected.p[2]);
    const grounded={...s,x:q.p[0],z:q.p[2],y:p.height(q.p[0],q.p[2]),grounded:true,grinding:false,grindCooldown:0};
    if(SOLGrind.find(grounded,[rail],.025,true,true))throw Error('Expanded flatbar teleported a grounded rider');
    records.push({direction,distance:(s.grindArc-start)*direction,error,grinding:s.grinding});
   }
   return {count:bars.length,records};
  });
  // Four promenade flatbars plus the new southwest island grind edge.
  assert.equal(flatbars.count,5);assert.equal(flatbars.records.length,10);
  assert(flatbars.records.every(r=>r.grinding&&r.distance>.8&&r.error<1e-8),'Expanded flatbar traversal failed: '+JSON.stringify(flatbars));

  // The held gesture and release are trusted browser input, including actual
  // touchscreen pointer ownership on mobile (a mouse click is not equivalent).
  await page.evaluate(()=>{
   window.__expansionPointers=[];
   for(const type of ['pointerdown','pointerup'])document.addEventListener(type,e=>{
    if(e.target.closest('[data-t="push"]'))__expansionPointers.push({type,trusted:e.isTrusted,pointerType:e.pointerType});
   });
  });
  const box=await page.locator('[data-t="push"]').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  let cdp;
  if(mobile){cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:7}]});}
  else{await page.mouse.move(x,y);await page.mouse.down();}
  await page.waitForFunction(()=>__SOL_DIAGNOSTICS__.input().pushHeld&&__SOL_DIAGNOSTICS__.state.speed>.3);
  const held=await page.evaluate(()=>({held:__SOL_DIAGNOSTICS__.input().pushHeld,speed:__SOL_DIAGNOSTICS__.state.speed}));
  if(mobile)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
  await page.waitForFunction(()=>!__SOL_DIAGNOSTICS__.input().pushHeld);
  const pointers=await page.evaluate(()=>__expansionPointers);
  assert.equal(pointers.length,2);assert(pointers.every(e=>e.trusted&&e.pointerType===(mobile?'touch':'mouse')));assert(held.held&&held.speed>.3);
  await page.locator('#restart').click();

  // Set each route start once. Every later position is produced by the real
  // loop with a held W input; assertions catch old bounds and state teleports.
  await page.keyboard.down('KeyW');
  const routes=await page.evaluate(()=>{
   const d=__SOL_DIAGNOSTICS__,p=SOLNewberg,s=d.state,loop=d.engine._activeRenderLoops[0],render=d.scene.render;
   d.engine.stopRenderLoop();const descriptor=Object.getOwnPropertyDescriptor(performance,'now');let clock=performance.now();
   Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});d.scene.render=()=>{};
   const records=[];
   try{
    // Synchronize the production loop's previous timestamp before recording;
    // browser scheduling before evaluate may otherwise create several substeps.
    loop();
    for(const route of [{name:'north promenade',x:-85,z:-62,dir:Math.PI/2,axis:'x',minimum:92},{name:'east promenade',x:86,z:-61,dir:0,axis:'z',minimum:68}]){
     Object.assign(s,{x:route.x,z:route.z,dir:route.dir,y:p.height(route.x,route.z),groundY:p.height(route.x,route.z),speed:8,grounded:true,grinding:false,grindRail:null,grindRequestUntil:0,grindCooldown:0,rampCooldown:0,vy:0,travelSign:1,bowlAir:null,airVX:null,airVZ:null,controlSteer:0,controlThrottle:0,pushBurstUntil:0,rollAngle:0,rollVelocity:0,yawAngle:0,yawVelocity:0});
     let maxStep=0,maxGroundError=0,groundedSteps=0,maxAbsX=0,maxAbsZ=0;
     for(let i=0;i<700;i++){
      const previous={x:s.x,y:s.y,z:s.z};clock+=25;loop();
      if(![s.x,s.y,s.z,s.speed].every(Number.isFinite))throw Error('Nonfinite route state');
      maxStep=Math.max(maxStep,Math.hypot(s.x-previous.x,s.z-previous.z));
      maxAbsX=Math.max(maxAbsX,Math.abs(s.x));maxAbsZ=Math.max(maxAbsZ,Math.abs(s.z));
      if(s.grounded){groundedSteps++;maxGroundError=Math.max(maxGroundError,Math.abs(s.y-p.height(s.x,s.z)));}
     }
     records.push({name:route.name,end:{x:s.x,y:s.y,z:s.z},axis:route.axis,minimum:route.minimum,maxStep,maxGroundError,groundedSteps,maxAbsX,maxAbsZ});
    }
   }finally{if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;d.scene.render=render;d.engine.runRenderLoop(loop);}
   return records;
  });
  await page.keyboard.up('KeyW');
  for(const route of routes){
   assert(route.end[route.axis]>=route.minimum,'Old bounds blocked expanded route: '+JSON.stringify(route));
   assert(route.maxStep<=17*.025+.001,'Movement exceeded physical step budget: '+JSON.stringify(route));
   assert(route.groundedSteps===700&&route.maxGroundError<.00001,'Flat route lost support: '+JSON.stringify(route));
   assert(route.maxAbsX<=geometry.width/2-.299&&route.maxAbsZ<=geometry.depth/2-.299,'Expanded boundary failed: '+JSON.stringify(route));
  }
  await page.locator('#restart').click();await page.locator('#halfpipe').click();
  await page.screenshot({path:path.join(out,label+'-overview.png')});
  for(const [zone,x,z]of [['west-flow',-65,0],['east-bowl',61,10],['north-snake',0,-44],['south-surf',0,46]]){
   await page.evaluate(({zone,x,z})=>{
    const d=__SOL_DIAGNOSTICS__,B=BABYLON;
    d.engine.stopRenderLoop();
    if(window.__expansionCamera)window.__expansionCamera.dispose();
    const c=new B.ArcRotateCamera('expansion evidence '+zone,-1.08,.86,53*Math.max(1,1/d.engine.getAspectRatio(d.scene.activeCamera)),new B.Vector3(x,-1,z),d.scene);
    c.fov=.95;d.scene.activeCamera=c;window.__expansionCamera=c;d.scene.render();
   },{zone,x,z});
   await page.screenshot({path:path.join(out,label+'-'+zone+'.png')});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);results.push({label,geometry,flatbars,input:{held,pointers},routes});await page.close();
 }
 const screenshots=Object.fromEntries(fs.readdirSync(out).filter(f=>f.endsWith('.png')).map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(out,f))).digest('hex')]));
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({result:'PASS',source,trackedChanges,sourceHashes,browser:browser.version(),results,screenshots},null,2));
 console.log('PASS expanded terrain render/contact, seams, uncovered bowls, mobile touch ownership, production-loop traversals and desktop/mobile gallery');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
