/* Real WebGL skin, gameplay transitions, contact and visual review evidence. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts','skater-v2');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/html');res.end(b);});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox']});
 const result={poses:{},errors:[]};
 try{const page=await browser.newPage({viewport:{width:960,height:720}});page.on('pageerror',e=>result.errors.push(e.message));
  await page.route('https://cdn.babylonjs.com/babylon.js',r=>r.fulfill({path:require.resolve('babylonjs'),contentType:'application/javascript'}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/?park=classic');await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__?.riderV2?.diagnostics.frames>2,null,{timeout:30000});
  await page.evaluate(()=>{const d=window.__SOL_DIAGNOSTICS__;window.__qaLoops=d.engine._activeRenderLoops.slice();d.engine.stopRenderLoop();});
  for(const mode of ['ride','push','ollie','flip','shove','grab','grind','boardslide','landing']){
   result.poses[mode]=await page.evaluate(async mode=>{
    const d=window.__SOL_DIAGNOSTICS__,B=window.BABYLON,s=d.state;
    document.querySelector('#restart').click();
    Object.assign(s,{x:0,z:0,y:0,groundY:0,vy:0,speed:0,dir:0,grounded:true,grinding:false,flip:0,spin:0,airTime:0,grabHeld:false,grabUntil:0,pushBurstUntil:0});
    if(mode==='push'){s.pushPhase=Math.PI/2;s.pushBurstUntil=performance.now()+3000;}
    if(['ollie','flip','shove','grab'].includes(mode)){s.y=.9;s.vy=1;s.grounded=false;s.airTime=.25;s.airVX=0;s.airVZ=0;}
    if(mode==='flip'){s.flip=1;s.rollAngle=1.2;}
    if(mode==='shove'){s.spin=1;s.yawAngle=1.2;}
    if(mode==='grab'){s.grabHeld=true;s.touchGrabHeld=true;s.grabUntil=performance.now()+3000;}
    if(mode==='grind'||mode==='boardslide'){
     s.x=0;s.z=19;s.y=1.1;s.speed=2;s.grinding=true;s.grindType=mode==='boardslide'?'boardslide':'50-50';s.grindRail={x:0,z:19,len:14,y:1.1,axis:'z',kind:'rail'};s.grindTime=.3;
    }
    if(mode==='landing'){s.y=.00001;s.vy=-10;s.grounded=false;s.airTime=.6;s.airVX=0;s.airVZ=0;d.riderV2.diagnostics.grounded=false;}
    // Execute the actual game/render callback; a tiny bounded step also produces
    // the real air-to-ground transition used by the landing compression.
    window.__qaLoops[0]();
    if(mode==='push'){
     // Capture the real planted-foot portion of the cyclic PUSH input, not
     // an arbitrary recovery frame that looks identical to ordinary riding.
     for(let n=0;n<85&&d.riderV2.diagnostics.feet[0][0]<.27;n++){
      await new Promise(resolve=>setTimeout(resolve,16));
      window.__qaLoops[0]();
     }
    }
    const cam=new B.FreeCamera('V2 QA '+mode,new B.Vector3(s.x+3.2,s.y+2.0,s.z+3),d.scene);cam.setTarget(new B.Vector3(s.x,s.y+1.15,s.z));cam.minZ=.03;d.scene.activeCamera=cam;d.scene.render();
    const r=d.riderV2,palette=Array.from(r.skeleton.getTransformMatrices(r.meshes[0]));
    const hidden=d.scene.getTransformNodeByName('body').getChildMeshes().every(m=>!m.isVisible);
    return {mode:r.diagnostics.mode,bones:r.skeleton.bones.length,meshes:r.meshes.length,vertices:r.meshes.reduce((n,m)=>n+m.getTotalVertices(),0),hidden,feet:r.diagnostics.feet,grabError:r.diagnostics.grabError,landing:r.diagnostics.landing,palette,finite:palette.every(Number.isFinite),ready:r.meshes.every(m=>m.isReady(true)),grounded:s.grounded};
   },mode);
   await page.screenshot({path:path.join(out,mode+'.png')});
   const p=result.poses[mode];assert.equal(p.bones,20);assert.equal(p.meshes,13);assert(p.vertices>1000&&p.hidden&&p.finite&&p.ready,mode+' skin must render');assert.equal(p.mode,mode,mode+' must use its actual gameplay state');
  }
  assert(result.poses.push.feet[0][0]>.25&&result.poses.push.feet[0][1]<.30,'Real gameplay PUSH must put the rear foot off the board toward pavement');
  assert(result.poses.grab.grabError<.04,'Authored palm must reach the deck');
  assert(result.poses.ollie.feet.every(f=>Math.abs(f[1]-.385)<.025),'Real WebGL ollie must keep both shoes on deck');
  assert(result.poses.landing.grounded&&result.poses.landing.landing>0,'Actual landing must compress the skin');
  for(const mode of ['push','ollie','flip','shove','grab','grind','landing'])assert.notDeepEqual(result.poses[mode].palette,result.poses.ride.palette,mode+' must deform bones');
  assert.deepEqual(result.errors,[]);result.result='PASS';
 }finally{await browser.close();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));}
 console.log('PASS V2 skinned rider: ride, push, ollie, flip, shove, grab, grind, boardslide, landing');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
