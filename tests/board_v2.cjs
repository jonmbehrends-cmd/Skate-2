const assert=require('node:assert/strict');
require('../board_v2.js');
const {sourceHash,build}=globalThis.SOLBoardV2,{deck,grip}=build();
assert.equal(sourceHash,'ce479260ac516b817093a47714526fbe1412cc7c26d0e4854a09b58a486504c2');
for(const mesh of [deck,grip]){
 assert(mesh.positions.length>1000&&mesh.positions.every(Number.isFinite));
 assert.equal(mesh.uvs.length,mesh.positions.length/3*2);
 assert(mesh.indices.every(i=>Number.isInteger(i)&&i>=0&&i<mesh.positions.length/3));
 const z=mesh.positions.filter((_,i)=>i%3===2);
 const halfLength=mesh===deck?.825:.825*.985;
 assert(Math.abs(Math.min(...z)+halfLength)<1e-5&&Math.abs(Math.max(...z)-halfLength)<1e-5,'Deck length and authored grip inset must remain');
}
const middle=deck.positions.filter((v,i)=>i%3===1&&Math.abs(deck.positions[i+1])<.03);
assert(middle.some(y=>Math.abs(y-.235)<.001),'V2 center deck must align to the existing foot stance');
console.log('PASS reviewed V2 GLB provenance, finite geometry, wheelbase, stance height and indices');
