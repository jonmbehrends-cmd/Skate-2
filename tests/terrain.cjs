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

 // Elevated deck is solid above the skater, not a teleporting ground surface.
const deck={x:-36,z:-31.55,w:38,d:3.1,h:4.5,curve:'halfpipe-deck'};
const transition={x:-36,z:-25.8,w:38,d:8.4,h:4.5,curve:'halfpipe-left'};
const deckGround=sample(-36,-31.55,[deck],0);
assert.equal(deckGround.height,0,'Ground-level skater below halfpipe deck must remain on ground');
assert.equal(deckGround.ramp,null,'Ground-level skater must not be classified as riding raised deck');
assert.equal(sample(-36,-31.55,[deck],4.0).height,0,'Jump below deck cannot teleport onto its surface');
assert.equal(sample(-36,-31.55,[deck],4.5).height,4.5,'Board at deck height must be able to land on top');
assert.equal(sample(-36,-31.55,[deck],5.5).height,4.5,'Airborne rider above deck can land on it');
assert.equal(sample(-36,-29.76,[transition],3.05).ramp,transition,'Halfpipe curved transition remains rideable');
console.log('PASS: elevated halfpipe deck height gating and transition continuity');

// The takeoff impulse must clear the lip without changing the rider's Y
// position instantaneously. Check energy across the steep wall and ensure
// a reasonable speed cap for malformed/very low launch positions.
const vert=globalThis.SOLTerrain.vertTakeoffVelocity;
const startY=globalThis.SOLTerrain.profile(transition,( -29.76-(transition.z-transition.d/2))/transition.d).height;
const impulse=vert(startY,transition.h,8);
assert(impulse>8&&impulse<12,'Steep-wall takeoff requires enough vertical energy to reach coping');
assert(startY+impulse*impulse/(2*19)>=transition.h+.34,'Takeoff arc must clear coping by at least 0.34m');
assert(vert(4.5,4.5,8)<8,'At-coping launch should preserve moderate vertical speed');
assert(vert(-100,4.5,8)<=12,'Malformed takeoff cannot create unbounded velocity');
console.log('PASS: continuous halfpipe vert takeoff energy and speed bound');
