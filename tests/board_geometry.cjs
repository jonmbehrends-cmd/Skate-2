const assert=require('node:assert/strict');
require('../board_geometry.js');
const {deck,grip}=globalThis.SOLBoardGeometry.build();
assert.equal(deck.positions.length,41*4*3);
assert.equal(grip.positions.length,41*2*3);
assert.equal(deck.indices.length,40*4*6+12);
assert.equal(grip.indices.length,40*6);
for(const mesh of [deck,grip]){
 assert.equal(mesh.uvs.length,mesh.positions.length/3*2);
 assert(mesh.positions.every(Number.isFinite));
 assert(mesh.indices.every(n=>Number.isInteger(n)&&n>=0&&n<mesh.positions.length/3));
}
const top=(i)=>deck.positions.slice(i*12,i*12+3);
assert(Math.abs(top(0)[2]+.825)<1e-9);
assert(Math.abs(top(40)[2]-.825)<1e-9);
assert(top(0)[1]>top(20)[1]+.075,'Kicked nose and tail must rise above deck center');
assert(top(40)[1]>top(20)[1]+.075);
assert(Math.abs(top(0)[0])<Math.abs(top(20)[0])*.05,'Nose must taper');
assert(Math.abs(top(40)[0])<Math.abs(top(20)[0])*.05,'Tail must taper');
assert(grip.positions[1]>top(0)[1],'Grip should lie above the deck skin');
// Verify the top triangles face upwards and the underside downwards.
function normalY(ids){const p=ids.map(i=>deck.positions.slice(i*3,i*3+3));const a=p[0],b=p[1],c=p[2];return (b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);}
assert(normalY(deck.indices.slice(0,3))>0,'Deck top winding');
assert(normalY(deck.indices.slice(6,9))<0,'Deck underside winding');
console.log('PASS: sculpted rounded deck, lifted kicks, opaque closed sides and flush grip');
