'use strict';
const assert=require('node:assert/strict');require('../newberg_park.js');const p=SOLNewberg;
assert.equal(p.height(17,10),-3.9);assert.equal(p.height(-19,-11),-.95);assert.equal(p.height(-.7,-12),1.45);assert.equal(p.height(-22,-19),0);
for(let i=0;i<5000;i++){
 const x=-34+(i*11.317%68),z=-26+(i*7.619%52),s=p.surface(x,z),g=p.gradient(x,z);
 assert([s.height,g.x,g.z].every(Number.isFinite));assert(s.height>=-3.9&&s.height<=1.45);
 if(Math.abs(x)>31||Math.abs(z)>23)assert.equal(p.sample(x,z),null);
 else assert.equal(p.sample(x,z).height,s.height);
}
for(const [x,z,dir]of [[17,18,0],[25,10,Math.PI/2]]){
 const s={x,z,dir,speed:0,travelSign:1};p.roll(s,.025);assert.equal(s.travelSign,-1);assert(s.speed>0&&s.speed<=9.81*.025,'Gravity projects onto both terrain axes');
 const travel=p.groundTravel(s,.025);assert(Math.hypot(travel.dx,travel.dz)<=s.speed*.025,'3D surface speed cannot accelerate horizontal movement');
}
const r=p.railPath([[0,0,0],[3,4,0],[3,4,4]]);assert.deepEqual(r.lengths,[0,5,9]);assert.deepEqual(p.pointAt(r,2.5).p,[1.5,2,0]);assert.deepEqual(p.pointAt(r,7).p,[3,4,2]);assert.deepEqual(p.pointAt(r,100).p,[3,4,4]);
console.log('PASS Newberg shared surface, finite 3D gradients, two-axis gravity, metric travel and curved rail interpolation');
