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
pad.buttons[5].pressed=true;assert.equal(poll(2530).grabHeld,true);pad.buttons[5].pressed=false;assert.equal(poll(2540).grabHeld,false,'RB release ends hold');
pad.connected=false;assert.equal(poll(2550).grabHeld,false,'Disconnect clears grab hold');
console.log('PASS: Xbox LB grind, RB hold/release and disconnect');

context.navigator.getGamepads=()=>{throw new Error('SecurityError: gamepad permission denied')};assert.equal(poll(2600).connected,false,'Denied Gamepad API must not crash touch gameplay');
