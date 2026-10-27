const assert=require('node:assert/strict');
require('../board_geometry.js');
const {deck,grip}=globalThis.SOLBoardGeometry.build();
const along=64,across=10,row=across+1;
assert.equal(deck.positions.length,2*(along+1)*row*3);
assert.equal(grip.positions.length,(along+1)*row*3);
assert.equal(deck.indices.length,along*across*12+along*12+across*12);
assert.equal(grip.indices.length,along*across*6);
for(const mesh of [deck,grip]){
 assert.equal(mesh.uvs.length,mesh.positions.length/3*2);
 assert(mesh.positions.every(Number.isFinite));
 assert(mesh.indices.every(n=>Number.isInteger(n)&&n>=0&&n<mesh.positions.length/3));
}
const p=(i,j)=>deck.positions.slice((i*row+j)*3,(i*row+j)*3+3);
const center=p(along/2,across/2),nose=p(0,across/2),tail=p(along,across/2);
assert(Math.abs(nose[2]+.825)<1e-9);
assert(Math.abs(tail[2]-.825)<1e-9);
assert(nose[1]>center[1]+.075,'Kicked nose must rise');
assert(tail[1]>center[1]+.075,'Kicked tail must rise');
assert(Math.abs(p(0,0)[0])<Math.abs(p(along/2,0)[0])*.05,'Nose must taper');
assert(Math.abs(p(along,0)[0])<Math.abs(p(along/2,0)[0])*.05,'Tail must taper');
assert(p(along/2,0)[1]>center[1]+.025,'Concave rails should rise above center');
assert(grip.positions[1]>p(0,0)[1],'Grip should lie above deck');
function normalY(ids){const q=ids.map(i=>deck.positions.slice(i*3,i*3+3));const a=q[0],b=q[1],c=q[2];return (b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);}
assert(normalY(deck.indices.slice(0,3))>0,'Top winding must face upward');
assert(normalY(deck.indices.slice(along*across*6,along*across*6+3))<0,'Underside winding must face downward');
console.log('PASS: watertight concave deck with raised kicks, closed rails and flush grip');
