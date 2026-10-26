const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script><\/body>/);
assert(inline,'Inline game script');new vm.Script(inline[1]);
assert(html.includes('src="ramp_geometry.js'),'Ramp geometry must load');
assert(inline[1].includes('SOLRampGeometry.build(r,SOLTerrain.profile,N)'),'Renderer must use sealed geometry');
require('../ramp_geometry.js');
require('../terrain.js');
const {build}=globalThis.SOLRampGeometry,profile=globalThis.SOLTerrain.profile;
const EPS=1e-6;
function test(r){
 const g=build(r,profile,40),counts=new Map(),faces={top:0,bottom:0,left:0,right:0,front:0,back:0};
 assert.equal(g.indices.length/3,4*40*2+4,'Expected top, base, sidewalls and end caps');
 for(let k=0;k<g.indices.length;k+=3){
  const p=g.indices.slice(k,k+3).map(i=>g.positions.slice(i*3,i*3+3));
  const [a,b,c]=p,u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const ctr=a.map((_,i)=>(a[i]+b[i]+c[i])/3);
  const near=(x,y)=>Math.abs(x-y)<EPS;
  let face,sign;
  if(near(ctr[1],-.045)){face='bottom';sign=-n[1]}
  else if(near(ctr[0],r.x-r.w/2)){face='left';sign=-n[0]}
  else if(near(ctr[0],r.x+r.w/2)){face='right';sign=n[0]}
  else if(near(ctr[2],r.z-r.d/2)){face='front';sign=-n[2]}
  else if(near(ctr[2],r.z+r.d/2)){face='back';sign=n[2]}
  else{face='top';sign=n[1]}
  assert(sign>0,'Incorrect outward normal on '+face);
  faces[face]++;
  for(let i=0;i<3;i++){
   const key=[p[i],p[(i+1)%3]].map(v=>v.map(n=>n.toFixed(6)).join(',')).sort().join('|');
   counts.set(key,(counts.get(key)||0)+1);
  }
 }
 for(const [edge,count] of counts)assert.equal(count,2,'Non-manifold boundary '+edge);
 for(const [face,n] of Object.entries(faces))assert(n>0,'Missing '+face);
 return {triangles:g.indices.length/3,edges:counts.size};
}
const bank=test({x:1,z:2,w:8,d:10,h:1.5});
const quarter=test({x:-12,z:15,w:10,d:8,h:2.4,curve:'quarter'});
console.log('PASS: sealed outward-facing bank and quarterpipe; manifold edges',bank,quarter);

assert(html.includes("rampSurface.alpha=1"),'Ramp must be fully opaque');
assert(html.includes('rampSurface.backFaceCulling=false'),'Ramp must be visible from both sides');
assert(html.includes('MATERIAL_OPAQUE'),'Ramp must use opaque material rendering mode');

assert(html.includes("solid ramp concrete infill"),'Ramps must have opaque concrete beneath riding skin');

assert(html.includes('SOLRampGeometry.sideWall'),'Renderer must show closed concrete cheeks');
assert(html.includes('Mesh.MergeMeshes(infill'),'Ramp infill should merge into one mesh for mobile rendering');
for(const side of [-1,1]){
 const r={x:46,z:-52,w:16,d:4.8,h:2.1,curve:'halfpipe-left'};
 const wall=globalThis.SOLRampGeometry.sideWall(r,profile,side,40);
 assert.equal(wall.indices.length,240,'Forty solid cheek quads');
 for(let i=0;i<wall.indices.length;i+=3){
  const [a,b,c]=wall.indices.slice(i,i+3).map(n=>wall.positions.slice(n*3,n*3+3));
  const nx=(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]);
  assert(nx*side>0,'Cheek surface normals must face outwards');
 }
}
console.log('PASS: opaque exterior cheeks with outward normals and merged infill');
