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
 const url='http://127.0.0.1:'+server.address().port+'/';
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
 await page.locator('#restart').click();
 await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;
  Object.assign(s,{grounded:true,y:0,groundY:0,vy:0,speed:0,count:0,combo:0,
   flip:0,spin:0,name:'',grabUntil:0,grabHeld:false,padGrabHeld:false});
  window.__qaPad.buttons[7].pressed=false;window.__qaPad.buttons[7].value=.8;
  window.__qaPad.buttons[5].pressed=true;
 });
 await page.waitForFunction(()=>{const s=window.__SOL_DIAGNOSTICS__.state;
  return s.speed>.5&&s.padGrabHeld&&s.grabHeld;
 });
 const xboxHeld=await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;
  return {speed:s.speed,padGrabHeld:s.padGrabHeld,grabHeld:s.grabHeld};
 });
 await page.evaluate(()=>{window.__qaPad.connected=false});
 await page.waitForFunction(()=>{const s=window.__SOL_DIAGNOSTICS__.state;
  return !s.padGrabHeld&&!s.grabHeld&&s.grabUntil===0&&
   document.querySelector('#status').textContent.includes('Press a controller button');
 });
 const xboxDisconnectHeld=await page.evaluate(()=>({speed:window.__SOL_DIAGNOSTICS__.state.speed,
  padGrabHeld:window.__SOL_DIAGNOSTICS__.state.padGrabHeld,
  grabHeld:window.__SOL_DIAGNOSTICS__.state.grabHeld,
  grabUntil:window.__SOL_DIAGNOSTICS__.state.grabUntil,
  status:document.querySelector('#status').textContent}));
 assert(xboxHeld.speed>.5&&xboxHeld.padGrabHeld&&xboxHeld.grabHeld,
  'Xbox RT/RB should be active together before disconnect: '+JSON.stringify(xboxHeld));
 assert(xboxDisconnectHeld.speed>0&&xboxDisconnectHeld.speed<xboxHeld.speed&&
  !xboxDisconnectHeld.padGrabHeld&&!xboxDisconnectHeld.grabHeld&&
  xboxDisconnectHeld.grabUntil===0,
  'Disconnect must release RT/RB without erasing rolling momentum: '+JSON.stringify({xboxHeld,xboxDisconnectHeld}));
 await page.waitForTimeout(250);
 const xboxCoast=await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.state.speed);
 assert(xboxCoast<xboxDisconnectHeld.speed,
  'RT boost must stop after disconnect while unboosted momentum coasts: '+JSON.stringify({xboxDisconnectHeld,xboxCoast}));
 await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;
  Object.assign(s,{grounded:true,y:0,groundY:0,vy:0,speed:0,count:0,combo:0,
   flip:0,spin:0,name:'',grabUntil:0,grabHeld:false,padGrabHeld:false});
  window.__qaPad.buttons.forEach(button=>{button.pressed=false;button.value=0});
  window.__qaPad.buttons[0].pressed=true;window.__qaPad.buttons[0].value=1;
  window.__qaPad.connected=true;
 });
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Xbox connected'));
 const reconnectFrame=await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.scene.getFrameId());
 await page.waitForFunction(frame=>window.__SOL_DIAGNOSTICS__.scene.getFrameId()>frame+3,reconnectFrame);
 const xboxReconnectHeld=await page.evaluate(()=>{const s=window.__SOL_DIAGNOSTICS__.state;
  return {grounded:s.grounded,count:s.count,name:s.name,vy:s.vy};
 });
 assert(xboxReconnectHeld.grounded&&xboxReconnectHeld.count===0&&xboxReconnectHeld.name==='',
  'A held during reconnect must not trigger an ollie: '+JSON.stringify(xboxReconnectHeld));
 await page.evaluate(()=>{window.__qaPad.buttons[0].pressed=false;window.__qaPad.buttons[0].value=0});
 const releaseFrame=await page.evaluate(()=>window.__SOL_DIAGNOSTICS__.scene.getFrameId());
 await page.waitForFunction(frame=>window.__SOL_DIAGNOSTICS__.scene.getFrameId()>frame+2,releaseFrame);
 await page.evaluate(()=>{const d=window.__SOL_DIAGNOSTICS__,s=d.state;
  window.__qaXboxRepress=null;
  const observer=d.scene.onAfterRenderObservable.add(()=>{
   if(!s.grounded&&s.name==='OLLIE'&&s.count===1&&s.vy>0){
    window.__qaXboxRepress={grounded:s.grounded,count:s.count,name:s.name,
     vy:s.vy,y:s.y,frame:d.scene.getFrameId()};
    d.scene.onAfterRenderObservable.remove(observer);
   }
  });
  window.__qaPad.buttons[0].pressed=true;window.__qaPad.buttons[0].value=1;
 });
 await page.waitForFunction(()=>!!window.__qaXboxRepress,null,{timeout:3000});
 const xboxRepress=await page.evaluate(()=>window.__qaXboxRepress);
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
 fs.writeFileSync(path.join(out,'input-result.json'),JSON.stringify({result:'PASS',commit:process.env.GITHUB_SHA,xboxHeld,xboxDisconnectHeld,xboxCoast,xboxReconnectHeld,xboxRepress,checks:['keyboard chords','outside pointer release','Xbox LB grind','RB release','simultaneous RT/RB disconnect release','boost stops while momentum coasts','held A reconnect negative control','A release/re-press positive control','Gamepad permission denial','WebGL recovery','playable compatibility mode']},null,2));
 console.log('PASS: keyboard, touch release, Xbox mappings, held-input disconnect/reconnect, denied Gamepad API, WebGL recovery and compatibility game');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
