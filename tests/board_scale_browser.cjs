'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts/board-scale');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.glb')?'model/gltf-binary':'text/html'});res.end(e?'':data);});});
let browser;
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox']});
 const results=[];
 for(const mobile of [false,true])for(const fallback of [false,true]){
  const label=(mobile?'mobile':'desktop')+(fallback?'-fallback':'-hoodie');
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(fallback)await page.route('**/hoodie-character.glb',route=>route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/?board=realistic');
  await page.waitForFunction(fallback=>window.__SOL_DIAGNOSTICS__&&(fallback?__SOL_DIAGNOSTICS__.scene.meshes.some(m=>m.name.startsWith('V2 ')&&m.skeleton):__SOL_DIAGNOSTICS__.rig?.status.ready),fallback,{timeout:60000});
  await page.evaluate(()=>__SOL_DIAGNOSTICS__.scene.whenReadyAsync());
  const geometry=await page.evaluate(()=>{
   const d=__SOL_DIAGNOSTICS__,s=SOLBoardDimensions.current,B=BABYLON;
   const deck=d.scene.getMeshByName('deck'),p=deck.getVerticesData(B.VertexBuffer.PositionKind),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
   for(let i=0;i<p.length;i++) {const k=i%3;lo[k]=Math.min(lo[k],p[i]);hi[k]=Math.max(hi[k],p[i]);}
   const wheels=d.scene.meshes.filter(m=>m.name==='wheel'),contacts=SOLWheels.sample(0,0,0,0,()=>({height:0})).points;
   const e=Math.max(...wheels.map(w=>Math.min(...contacts.map(c=>Math.hypot(w.position.x-c.side,w.position.z-c.forward)))));
   return {deckL:hi[2]-lo[2],deckW:hi[0]-lo[0],expectedL:s.deckL,expectedW:s.deckW,wheelContactError:e,wheels:wheels.length,rig:d.rig?.status.mode||null,bones:d.rig?.status.bones||null};
  });
  assert(Math.abs(geometry.deckL-geometry.expectedL)<1e-5&&Math.abs(geometry.deckW-geometry.expectedW)<1e-3,JSON.stringify(geometry));
  assert.equal(geometry.wheels,4);assert(geometry.wheelContactError<1e-12);
  await page.screenshot({path:path.join(out,label+'.png')});
  const push=await page.locator('[data-t="push"]').boundingBox();
  await page.mouse.move(push.x+push.width/2,push.y+push.height/2);await page.mouse.down();
  await page.waitForFunction(()=>__SOL_DIAGNOSTICS__.state.speed>.3);await page.mouse.up();
  await page.evaluate(()=>document.addEventListener('pointerdown',e=>{if(e.target.closest('[data-t="ollie"]')){const s=__SOL_DIAGNOSTICS__.state;window.__scaleLaunch={trusted:e.isTrusted,grounded:s.grounded,vy:s.vy};}}));
  if(mobile)await page.locator('[data-t="ollie"]').tap();else await page.locator('[data-t="ollie"]').click();
  const launch=await page.evaluate(()=>window.__scaleLaunch);
  assert(launch.trusted&&!launch.grounded&&launch.vy>0,JSON.stringify(launch));
  await page.waitForFunction(()=>__SOL_DIAGNOSTICS__.state.grounded,null,{timeout:10000});
  const landed=await page.evaluate(()=>{const s=__SOL_DIAGNOSTICS__.state;return {x:s.x,y:s.y,z:s.z,speed:s.speed};});
  assert(Object.values(landed).every(Number.isFinite));
  assert.deepEqual(errors,[]);results.push({label,geometry,launch,landed});await page.close();
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({result:'PASS',results},null,2));console.log('PASS candidate board geometry/contact, hoodie/V2 fallback, trusted PUSH/OLLIE and landing at desktop/mobile');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close();});
