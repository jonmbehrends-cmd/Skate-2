// Runs the actual game/render loop in Chromium. No per-air resets or physics overrides.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(p,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':p.endsWith('.js')?'application/javascript':'text/html'});res.end(e?'':data)})});
let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
 const page=await browser.newPage({viewport:{width:640,height:480}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdn.babylonjs.com/babylon.js',r=>r.fulfill({path:require.resolve('babylonjs'),contentType:'application/javascript'}));
 await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__,null,{timeout:60000});
 await page.locator('#restart').click();
 await page.evaluate(()=>{
  const d=window.__SOL_DIAGNOSTICS__,s=d.state,b=SOLBowl.bowl;
  // One initial placement only. The next ten airs use ordinary held forward input.
  Object.assign(s,{x:b.x,z:b.z,y:-b.depth,groundY:-b.depth,dir:0,speed:17,travelSign:1,rampCooldown:0,grounded:true});
  const q=window.__bowlQA={frames:0,maxY:-Infinity,errors:[],events:[],lastLaunch:0,lastLand:0};
  d.scene.onAfterRenderObservable.add(()=>{
   q.frames++;q.maxY=Math.max(q.maxY,s.y);const r=Math.hypot(s.x-b.x,s.z-b.z);
   if(!Number.isFinite(s.x+s.y+s.z+s.speed))q.errors.push('nonfinite state');
   if(r>b.radius+.01)q.errors.push('deck escape');
   if(s.y<SOLBowl.height(s.x,s.z)-.021)q.errors.push('surface penetration');
   if(document.querySelector('#msg').textContent.includes('BAIL'))q.errors.push('bail');
   const stats=s.bowlStats||{};
   if(stats.launches!==q.lastLaunch||stats.landings!==q.lastLand){q.events.push({time:performance.now(),x:s.x,z:s.z,y:s.y,speed:s.speed,dir:s.dir,...stats});q.lastLaunch=stats.launches;q.lastLand=stats.landings;}
  });
 });
 await page.keyboard.down('w');
 await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__.state.bowlAir&&window.__SOL_DIAGNOSTICS__.state.y>.7,null,{timeout:60000});
 await page.screenshot({path:path.join(out,'bowl-air.png')});
 await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__.state.bowlStats?.landings>=10||window.__bowlQA.errors.length,null,{timeout:300000});
 await page.keyboard.up('w');
 const result=await page.evaluate(()=>({qa:window.__bowlQA,stats:window.__SOL_DIAGNOSTICS__.state.bowlStats,frame:window.__SOL_DIAGNOSTICS__.scene.getFrameId(),paintedConcrete:window.__SOL_DIAGNOSTICS__.scene.meshes.find(m=>m.name==='100 foot wide 25 foot deep sculpted concrete bowl')?.material?.diffuseTexture?.name==='bowl painted concrete art'}));
 await page.screenshot({path:path.join(out,'bowl-reentry.png')});
 assert(result.frame>10&&result.qa.frames>10,'Actual Babylon scene must render');
 assert.equal(result.stats.landings,10,'Ten consecutive reentries');
 assert.equal(result.stats.recoveries,0,'Safety correction cannot hide failures');
 assert.equal(result.qa.errors.length,0,result.qa.errors.join(', '));
 assert.equal(errors.length,0,errors.join(', '));assert(result.qa.maxY>.7);assert(result.paintedConcrete,'Preserve legible baked bowl graphics');
 fs.writeFileSync(path.join(out,'bowl-result.json'),JSON.stringify({result:'PASS',commit:process.env.GITHUB_SHA,...result},null,2));
 console.log('PASS: 10 uninterrupted bowl airs in real Chromium/WebGL',JSON.stringify(result));
})().catch(e=>{fs.writeFileSync(path.join(out,'bowl-result.json'),JSON.stringify({result:'FAIL',commit:process.env.GITHUB_SHA,error:e.stack},null,2));console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
