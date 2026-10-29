'use strict';
const assert=require('node:assert/strict');require('../newberg_park.js');const p=SOLNewberg;
assert.equal(p.height(17,10),-3.9);assert.equal(p.height(-19,-11),-.95);assert.equal(p.height(-.7,-12),1.45);assert.equal(p.height(-22,-19),0);
// The deep return and shallow snake are continuous riding areas, not two
// overlapping primitive floors with an artificial internal wall/lip.
for(const [path,ceiling]of [[[[17,10],[3,17]],-3.3],[[[-18,6],[-13,8.5],[-7,8.7],[2,7.5]],-1.25]]){
 for(let j=1;j<path.length;j++)for(let i=0;i<=100;i++){const a=path[j-1],b=path[j],t=i/100;assert(p.height(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t)<ceiling,'Connected channel rose into an internal ridge');}
}
assert.equal(p.basins.length,4);
// A positive hump overlapping a recessed channel must fade into that floor,
// rather than falling from deck height at the edge of its support radius.
assert(Math.abs(p.height(-7.8,4.4)-p.height(-7.8,4.6))<.2,'Roll-over edge became a vertical step into the snake run');
// Reproduced from the independent corner review: an overly tight rim made
// a 36-degree normal snap across this interior valley at 8 m/s, 25 ms/step.
let previousNormal=null;
for(let i=0;i<15;i++){
 const s=p.surface(10.88+.630*.2*i,2.34-.776*.2*i),normal=[-s.x,1,-s.z],length=Math.hypot(...normal);
 for(let k=0;k<3;k++)normal[k]/=length;
 if(previousNormal){const dot=normal.reduce((sum,v,k)=>sum+v*previousNormal[k],0);assert(Math.acos(Math.max(-1,Math.min(1,dot)))<Math.PI/12,'Deep corner changed surface normal by more than 15 degrees in one riding step');}
 previousNormal=normal;
}
for(const basin of p.basins){
 const rim=basin.rim,area=rim.reduce((sum,a,i)=>{const b=rim[(i+1)%rim.length];return sum+a[0]*b[1]-a[1]*b[0]},0)/2;
 assert(area>0,'Coping offset requires counterclockwise rims');
 // A self-crossing contour makes odd/even classification and contact
 // ambiguous; check non-adjacent segments rather than only sample heights.
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 for(let i=0;i<rim.length;i++)for(let j=i+2;j<rim.length;j++){
  if(i===0&&j===rim.length-1)continue;
  const a=rim[i],b=rim[(i+1)%rim.length],c=rim[j],d=rim[(j+1)%rim.length];
  assert(!(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0),'Bowl rim crosses itself: '+basin.name);
 }
}
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
