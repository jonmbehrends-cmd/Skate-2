const {chromium}=require('playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(p,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':p.endsWith('.js')?'application/javascript':'text/html'});res.end(e?'':data)})});
let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const url='http://127.0.0.1:'+server.address().port+'/?park=classic';
 // Keep the real WebGL test deterministic when GitHub runners cannot reach Babylon CDN.
 // Serve the same installed Babylon UMD bundle as tests/browser_smoke.cjs.
 const babylonBundle=require.resolve('babylonjs');
 await page.route('https://cdn.babylonjs.com/babylon.js',route=>route.fulfill({path:babylonBundle,contentType:'application/javascript'}));
 await page.goto(url);await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__,null,{timeout:60000});
 await page.keyboard.down('w');await page.keyboard.down('a');await page.keyboard.up('a');
 await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__.state.controlThrottle<-.8);
 assert.equal(await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.input().keyboard.y),-1);
 await page.keyboard.up('w');await page.locator('#restart').click();
 const rect=await page.locator('[data-t="push"]').boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(5,200);await page.mouse.up();
 assert.equal(await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.input().pushHeld),false,'Outside release must end PUSH');
 await page.evaluate(()=>{window.__qaPad={index:0,connected:true,id:'Xbox Wireless Controller',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.__qaPad]})});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Xbox connected'));
 await page.evaluate(()=>window.__qaPad.buttons[4].pressed=true);await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__.state.grindRequestUntil>performance.now());
 await page.evaluate(()=>{window.__qaPad.buttons[4].pressed=false;window.__qaPad.buttons[5].pressed=true});await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__.state.grabHeld);
 await page.evaluate(()=>window.__qaPad.buttons[5].pressed=false);await page.waitForFunction(()=>!window.__SOL_DIAGNOSTICS__.state.grabHeld&&window.__SOL_DIAGNOSTICS__.state.grabUntil===0);
 await page.evaluate(()=>{Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>{throw new DOMException('Denied','SecurityError')}});window.__beforeFrame=window.__SOL_DIAGNOSTICS__.scene.getFrameId()});
 await page.waitForFunction(()=>window.__SOL_DIAGNOSTICS__.scene.getFrameId()>window.__beforeFrame+2);
 assert.equal(errors.length,0,errors.join('; '));
 // Real page startup with unavailable WebGL: recovery must be clickable and playable.
 const recovery=await browser.newPage({viewport:{width:390,height:844}});
 await recovery.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:get.call(this,type,...args)}});
 await recovery.route('https://cdn.babylonjs.com/babylon.js',route=>route.fulfill({path:babylonBundle,contentType:'application/javascript'}));
 await recovery.goto(url);await recovery.getByRole('link',{name:'PLAY COMPATIBILITY VERSION'}).waitFor();await recovery.screenshot({path:path.join(out,'startup-recovery.png')});
 await recovery.getByRole('link',{name:'PLAY COMPATIBILITY VERSION'}).click();await recovery.waitForURL('**/legacy.html?compat=1');
 await recovery.locator('[data-t="push"]').click();await recovery.waitForFunction(()=>Number(document.querySelector('#speed').textContent.replace(/\D/g,''))>0);
 await recovery.screenshot({path:path.join(out,'compatibility-play.png')});
 fs.writeFileSync(path.join(out,'input-result.json'),JSON.stringify({result:'PASS',commit:process.env.GITHUB_SHA,checks:['keyboard chords','outside pointer release','Xbox LB grind','RB release','Gamepad permission denial','WebGL recovery','playable compatibility mode']},null,2));
 console.log('PASS: keyboard, touch release, Xbox mapping/release, denied Gamepad API, WebGL recovery and playable compatibility game');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
