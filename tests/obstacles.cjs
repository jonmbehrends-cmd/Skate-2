const assert=require('node:assert/strict');
require('../obstacles.js');
const {surface,sweep,rampSide}=globalThis.SOLObstacles;
const boxes=[{x:0,z:0,w:4,d:4,h:.7}];
assert.equal(surface(0,0,0,0,boxes),0,'Ground rider cannot teleport to raised pad');
assert.equal(surface(0,0,.7,0,boxes),.7,'Board above pad gets elevated contact');
assert.equal(surface(3,0,1,0,boxes),0,'Outside pad returns ground');
const frontal=sweep(0,-4,0,4,0,boxes);
assert(frontal.hit,'Swept contact must catch high-speed tunneling');
assert(frontal.z < -2.26&&frontal.z > -2.29,'Must stop before pad front face');
const slide=sweep(-4,-1,1,2,0,boxes);
assert(slide.hit&&slide.x<-2.26,'Diagonal side impact must block horizontal penetration');
assert(slide.z>-.9,'Diagonal side impact must preserve tangential motion');
const over=sweep(0,-4,0,4,.8,boxes);
assert(!over.hit&&over.z===4,'Airborne board above obstacle should pass');
const parallel=sweep(-4,0,-3,0,0,boxes);
assert(!parallel.hit,'Parallel movement outside obstacle must be clear');
const ramp=[{x:0,z:10,w:8,d:10,h:3,curve:'quarter'}];
assert(rampSide(-6,12,-2,12,0,ramp).hit,'Ramp wall blocks low board entering from side');
assert(!rampSide(-6,12,-2,12,2,ramp).hit,'Airborne board clears side wall');
assert(!rampSide(-6,5,-2,5,0,ramp).hit,'Flat ramp entrance has no side wall');
console.log('PASS: obstacle sweep, sliding, elevated surfaces, ramp side contact');

assert.equal(rampSide(-6,12,-2,12,0,ramp).normalX,-1,'Left ramp wall must report outward normal');
assert.equal(rampSide(6,12,2,12,0,ramp).normalX,1,'Right ramp wall must report outward normal');

 // Regression: if a board spawns or lands just inside an expanded solid
 // footprint, sweep must recover to a safe edge instead of leaving it stuck.
const overlap=sweep(0,0,0,1,0,boxes);
assert(overlap.hit,'Starting inside a wall must report a collision');
assert(Math.abs(overlap.x)>=2.27||Math.abs(overlap.z)>=2.27,'Overlapping board must be pushed outside expanded solid');
const highOverlap=sweep(0,0,1,1,1,boxes);
assert(!highOverlap.hit&&highOverlap.x===1&&highOverlap.z===1,'Above-height travel must remain unrestricted');

// End-to-end regression: repeated grounded contact should slide along a
// ledge, retain usable speed, and leave the wall instead of becoming pinned.
require('../motion.js');
const motion=globalThis.SOLMotion;
const rider={x:-4,z:-1,dir:Math.PI/4,speed:10,grounded:true,grinding:false,travelSign:1};
let wallContacts=0;
for(let i=0;i<14;i++){
  const move=motion.horizontal(rider,.1);
  const hit=sweep(rider.x,rider.z,rider.x+move.dx,rider.z+move.dz,0,boxes);
  rider.x=hit.x;rider.z=hit.z;
  if(hit.hit){wallContacts++;motion.collide(rider,[hit])}
  if(rider.z>=-2.27&&rider.z<=2.27)
    assert(rider.x<=-2.269,'Rider must not penetrate ledge during repeated wall slides');
}
assert(wallContacts>=1,'Repeated-slide scenario must actually contact wall');
assert(rider.z>2.27,'Rider should escape the end of the ledge');
assert(rider.speed>5,'Wall-parallel momentum must survive repeated contacts');
console.log('PASS: overlap recovery, elevated clearance, repeated ground wall-slide escape');
