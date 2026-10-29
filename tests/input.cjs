const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8'),start=html.indexOf("const stick=document.querySelector('#stick')"),end=html.indexOf('}catch(e){err.style.display=',start);
function target(t){return {dataset:{t},style:{},handlers:{},addEventListener(type,fn){(this.handlers[type]??=[]).push(fn)},fire(type,e={}){for(const f of this.handlers[type]||[])f({preventDefault(){},...e})},setPointerCapture(id){this.captured=id},getBoundingClientRect(){return {left:0,top:0,width:100,height:100}}}}
const stick=target(),nub=target(),push=target('push'),grab=target('grab'),doc=target(),win=target();
doc.querySelector=s=>s==='#stick'?stick:s==='#nub'?nub:null;doc.querySelectorAll=()=>[push,grab];
const actions=[],ctx={document:doc,window:{},state:{},joy:{x:0,y:0,id:null},keys:new Set(),keyboard:{x:0,y:0},pushHeld:false,boost:false,gpX:0,gpY:0,performance:{now:()=>100},trick:t=>actions.push(t),restart(){},addEventListener:win.addEventListener.bind(win)};
vm.runInNewContext(html.slice(start,end),ctx);
win.fire('keydown',{code:'KeyW'});win.fire('keydown',{code:'KeyA'});win.fire('keyup',{code:'KeyA'});assert.equal(ctx.keyboard.y,-1,'Releasing steer preserves forward input');assert.equal(ctx.keyboard.x,0);
win.fire('keydown',{code:'Space',repeat:false});win.fire('keydown',{code:'Space',repeat:true});assert.equal(actions.filter(x=>x==='ollie').length,1,'Key repeat cannot stack tricks');
push.fire('pointerdown',{isTrusted:true,pointerId:9});assert(ctx.pushHeld);assert.equal(push.captured,9);push.fire('lostpointercapture',{pointerId:9});assert.equal(ctx.pushHeld,false);
grab.fire('pointerdown',{pointerId:10});assert(ctx.state.touchGrabHeld);ctx.state.grabUntil=1000;grab.fire('pointercancel',{pointerId:10});assert.equal(ctx.state.grabHeld,false);assert.equal(ctx.state.grabUntil,0);
stick.fire('pointerdown',{pointerId:1,clientX:90,clientY:20});assert(ctx.joy.x>0);stick.fire('lostpointercapture',{pointerId:1});assert.equal(ctx.joy.x,0);assert.equal(ctx.joy.id,null);
push.fire('pointerdown');ctx.state.padGrabHeld=true;win.fire('blur');assert.equal(ctx.pushHeld,false);assert.equal(ctx.state.padGrabHeld,false);assert.equal(ctx.keyboard.y,0);assert.equal(ctx.keys.size,0);
console.log('PASS: independent keyboard holds, key repeat, touch capture/cancel, joystick capture loss and focus reset');
