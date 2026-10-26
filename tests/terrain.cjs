const assert=require('node:assert/strict');
require('../terrain.js');
const {sample,launch}=globalThis.SOLTerrain;
const ramps=[{x:0,z:10,w:8,d:10,h:1.5}];
const ground=sample(0,0,ramps);
assert.equal(ground.height,0);assert.equal(ground.ramp,null);
const entry=sample(0,5,ramps);assert.equal(entry.height,0);
const middle=sample(0,10,ramps);assert(Math.abs(middle.height-.75)<1e-9);
const top=sample(0,15,ramps);assert.equal(top.height,1.5);
assert.equal(sample(4.1,10,ramps).height,0);
assert.equal(sample(0,15.01,ramps).height,0);
assert(launch(top,sample(0,15.2,ramps),15.2,0,10)>2.5);
assert.equal(launch(top,ground,4,0,10),0,'No launch on reverse entry');
assert.equal(launch(top,sample(0,15.2,ramps),15.2,Math.PI,10),0,'No launch backward');
assert.equal(launch(top,sample(0,15.2,ramps),15.2,0,1),0,'No launch at low speed');
assert.equal(launch(entry,middle,10,0,10),0,'No launch while on same ramp');
console.log('SOL SKATE continuous terrain / lip tests passed');

const quarter={x:12,z:20,w:10,d:10,h:3,curve:'quarter'};
const q0=sample(12,15,[quarter]),qm=sample(12,20,[quarter]),q1=sample(12,25,[quarter]);
assert.equal(q0.height,0);assert.equal(q0.slope,0);
assert.equal(qm.height,.75);assert.equal(qm.slope,.3);
assert.equal(q1.height,3);assert.equal(q1.slope,.6);
for(let i=0;i<=24;i++){const t=i/24,p=globalThis.SOLTerrain.profile(quarter,t),c=sample(12,15+10*t,[quarter]);assert(Math.abs(p.height-c.height)<1e-9,'Render and contact profile must match');}
assert(launch(q1,sample(12,25.1,[quarter]),25.1,0,12)>0);
console.log('SOL SKATE curved quarterpipe tests passed');
