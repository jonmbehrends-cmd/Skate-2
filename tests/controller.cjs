// Run with: node tests/controller.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let pad = {index:0,connected:true,id:'Xbox Wireless Controller',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false}))};
const context = {window:{},navigator:{getGamepads:()=>[pad]},performance:{now:()=>1000}};
vm.runInNewContext(fs.readFileSync('controller.js','utf8'),context);
let actions = [];
const poll = t => context.window.SOLPad.poll(action => actions.push(action),t);
assert.equal(poll(1000).connected,true);
pad.buttons[0].pressed=true;poll(1010);poll(1020);
assert.deepEqual(actions,['ollie']);
pad.buttons[0].pressed=false;pad.axes[2]=-1;poll(1300);
assert.equal(actions.at(-1),'kick');
poll(1400);assert.equal(actions.length,2);
pad.axes[2]=0;poll(1500);pad.axes[2]=1;poll(1700);
assert.equal(actions.at(-1),'heel');
pad.axes[2]=0;poll(1800);pad.axes[3]=-1;poll(2000);
assert.equal(actions.at(-1),'ollie');
pad.axes[3]=0;poll(2100);pad.axes[0]=.5;pad.buttons[7].pressed=true;
let p=poll(2200);assert(p.x>.35&&p.boost);
pad.axes[0]=0;pad.buttons[15].pressed=true;p=poll(2300);
assert.equal(p.x,1);
pad.connected=false;p=poll(2400);
assert.equal(p.connected,false);assert.equal(p.x,0);
console.log('SOL SKATE controller regression checks passed');

pad.connected=true;pad.buttons.forEach(b=>b.pressed=false);pad.axes=[0,0,0,0];poll(2500);
pad.buttons[4].pressed=true;poll(2510);poll(2520);assert.equal(actions.at(-1),'grind');assert.equal(actions.filter(a=>a==='grind').length,1,'LB grind is edge-triggered');
pad.buttons[11].pressed=true;poll(2525);poll(2526);
assert.equal(actions.at(-1),'boardslide','R3 should trigger a boardslide');
assert.equal(actions.filter(a=>a==='boardslide').length,1,'Holding R3 cannot spam boardslides');
pad.buttons[11].pressed=false;poll(2527);
pad.buttons[11].pressed=true;poll(2528);
assert.equal(actions.filter(a=>a==='boardslide').length,2,'R3 must rearm after release');
pad.buttons[11].pressed=false;poll(2529);
pad.buttons[5].pressed=true;assert.equal(poll(2530).grabHeld,true);pad.buttons[5].pressed=false;assert.equal(poll(2540).grabHeld,false,'RB release ends hold');
pad.buttons[7].pressed=true;pad.buttons[7].value=.8;
p=poll(2545);assert(p.boost&&p.grabHeld===false,'RT push can be held independently of RB');
pad.buttons[5].pressed=true;p=poll(2546);assert(p.boost&&p.grabHeld,'RT and RB may be held together');
pad.connected=false;p=poll(2550);
assert.equal(p.grabHeld,false,'Disconnect clears RB hold');
assert.equal(p.boost,false,'Disconnect clears RT push');
const olliesBeforeReconnect=actions.filter(a=>a==='ollie').length;
pad.buttons.forEach(b=>{b.pressed=false;b.value=0});
pad.buttons[0].pressed=true;pad.buttons[0].value=1;pad.connected=true;
assert.equal(poll(2560).connected,true);
poll(2570);
assert.equal(actions.filter(a=>a==='ollie').length,olliesBeforeReconnect,
 'A held while reconnecting must not trigger an ollie');
pad.buttons[0].pressed=false;pad.buttons[0].value=0;poll(2580);
pad.buttons[0].pressed=true;pad.buttons[0].value=1;poll(2590);
assert.equal(actions.filter(a=>a==='ollie').length,olliesBeforeReconnect+1,
 'A must trigger again after a release and re-press following reconnect');
console.log('PASS: disconnect releases simultaneous RT/RB holds; reconnect suppresses held A until re-press');

context.navigator.getGamepads=()=>{throw new Error('SecurityError: gamepad permission denied')};assert.equal(poll(2600).connected,false,'Denied Gamepad API must not crash touch gameplay');

// Modal input suspension must suppress actions and re-arm on release/repress.
context.navigator.getGamepads=()=>[pad];pad.connected=true;
pad.buttons.forEach(b=>b.pressed=false);pad.axes=[.7,-.6,0,-1];
const suspendedActions=actions.length;
context.window.SOLPad.setSuspended(true);
pad.buttons[0].pressed=true;pad.buttons[7].pressed=true;
p=poll(3000);assert.equal(p.x,0);assert.equal(p.y,0);assert.equal(p.boost,false);
assert.equal(actions.length,suspendedActions,'Help must suppress controller tricks');
context.window.SOLPad.setSuspended(false);p=poll(3010);
assert(p.x>0&&p.y<0&&p.boost,'Closing help must restore movement polling');
assert.equal(actions.length,suspendedActions,'Held A/right stick must not fire on resume');
pad.buttons[0].pressed=false;pad.axes[3]=0;poll(3020);
pad.buttons[0].pressed=true;poll(3030);assert.equal(actions.at(-1),'ollie');
console.log('PASS: modal controller suspension, held-button resume and re-arming');
