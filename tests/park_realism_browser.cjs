'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts/newberg/realism');
// Compare presentation on/off against the SAME geometry revision. A fixed
// historical park script is not a valid baseline for an intentional 20%
// heightfield change: it conflates terrain design with surface rendering.
// Only suppress the art hook; leave every basin, contact sample and rail in
// the geometry-only comparison byte-for-byte identical to the candidate.
const candidate=fs.readFileSync(path.join(root,'newberg_park.js'),'utf8');
const baseline=candidate.replaceAll('root.SOLParkSurfaceArt?.','undefined?.');
assert.notEqual(baseline,candidate,'Presentation baseline must disable the art hook');
const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!p.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(p,(e,d)=>{res.writeHead(e?404:200,{'Content-Type':p.endsWith('.js')?'application/javascript':p.endsWith('.glb')?'model/gltf-binary':'text/html'});res.end(e?'':d);});});
let browser;
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox']});
 const rows=[];
 for(const mobile of [false,true])for(const before of [true,false]){
  const label=(mobile?'mobile':'desktop')+(before?'-before':'-after'),errors=[];
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));if(before)await page.route('**/newberg_park.js?*',r=>r.fulfill({body:baseline,contentType:'application/javascript'}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForFunction(()=>__SOL_DIAGNOSTICS__?.rig?.status.ready,null,{timeout:60000});await page.evaluate(()=>__SOL_DIAGNOSTICS__.scene.whenReadyAsync());
  const geometry=await page.evaluate(()=>{
   const d=__SOL_DIAGNOSTICS__,B=BABYLON,terrain=d.park.terrainMeshes;
   d.engine.stopRenderLoop();
   const positions=terrain.flatMap(m=>Array.from(m.getVerticesData(B.VertexBuffer.PositionKind))),indices=terrain.flatMap(m=>Array.from(m.getIndices()));
   const rails=d.park.rails.map(r=>r.path||[r.x1,r.z1,r.x2,r.z2,r.y]);
   const bytes=d.park.surfaceArt?.textureBytes||0,vertices=d.scene.meshes.reduce((s,m)=>s+m.getTotalVertices(),0);
   const sample=SOLNewberg.sample(17,10),t=sceneTex=>sceneTex?.getSize();
   const joints=d.scene.getMeshByName('concrete saw-cut slab joints');
   const lawn=d.scene.getMeshByName('Ewing Young surrounding lawn');
   if(d.park.surfaceArt&&!lawn)throw Error('Missing candidate surrounding landscape');
   if(lawn){const lp=lawn.getVerticesData(B.VertexBuffer.PositionKind),lm=lawn.computeWorldMatrix(true);for(let i=0;i<lp.length;i+=3){const v=B.Vector3.TransformCoordinates(new B.Vector3(lp[i],lp[i+1],lp[i+2]),lm);if(Math.abs(v.x)<SOLNewberg.width/2-.001&&Math.abs(v.z)<SOLNewberg.depth/2-.001)throw Error('Surrounding landscape caps the riding rectangle');}}
   return {positions,indices,rails,meshCount:d.scene.meshes.length,vertices,bytes,districts:d.park.surfaceArt?.districts||[],diffuse:t(terrain[0].material.diffuseTexture),normal:t(terrain[0].material.bumpTexture),joints:{alpha:joints.alpha,blended:joints.material.needAlphaBlending()},sample};
  });
  const signature=createHash('sha256').update(JSON.stringify([geometry.positions,geometry.indices,geometry.rails,geometry.sample])).digest('hex');delete geometry.positions;delete geometry.indices;delete geometry.rails;
  if(!before){assert(geometry.bytes<=3*1024*1024);assert.equal(geometry.districts.length,6);assert.equal(geometry.normal.width,512);assert(geometry.joints.blended&&geometry.joints.alpha===.22,'Slab joints must actually blend, not render opaque');}
  for(const [view,x,z,radius,beta]of [['core',0,0,60,.95],['river',-64,0,52,1.02],['surface',-22,-19,8,1.05],['woodland',-93,20,35,1.14]]){
   await page.evaluate(({x,z,radius,beta})=>{const d=__SOL_DIAGNOSTICS__,B=BABYLON;if(window.__artCamera)window.__artCamera.dispose();const camera=new B.ArcRotateCamera('realism fixed evidence',-1.08,beta,radius,new B.Vector3(x,SOLNewberg.height(x,z),z),d.scene);camera.fov=.95;d.scene.activeCamera=camera;window.__artCamera=camera;d.scene.render();},{x,z,radius,beta});
   await page.screenshot({path:path.join(out,label+'-'+view+'.png')});
  }
  assert.deepEqual(errors,[]);rows.push({label,signature,geometry});await page.close();
 }
 for(let i=0;i<rows.length;i+=2){assert.equal(rows[i].signature,rows[i+1].signature,'Presentation pass changed terrain/contact/rail geometry');assert(rows[i+1].geometry.meshCount<=rows[i].geometry.meshCount+2,'Presentation added excessive draw objects');}
 const source=execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),dirty=execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root}).toString().trim();
 const sourceHashes=Object.fromEntries(['index.html','newberg_park.js','park_surface_art.js','tests/park_realism_browser.cjs'].map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({result:'PASS',source,dirty,sourceHashes,baseline:'current geometry, art hook disabled',browser:browser.version(),rows},null,2));
 console.log('PASS paired desktop/mobile realism images, presentation-independent geometry/contact/rails, bounded texture memory and mesh count');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close();});
