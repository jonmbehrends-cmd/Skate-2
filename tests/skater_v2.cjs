const assert=require('node:assert/strict'),B=require('babylonjs');
require('../skater_v2_data.js');require('../skater_v2.js');
const data=globalThis.SOLSkaterV2Data;
assert.equal(data.sourceHash,'e58e6009bca16a39a79a0d275445d9470f704e6aa5467a224eca4611bb8b638c');
const engine=new B.NullEngine(),scene=new B.Scene(engine),skater=new B.TransformNode('skater',scene),stanceRig=new B.TransformNode('stance',scene),body=new B.TransformNode('body',scene),boardPivot=new B.TransformNode('board',scene);
stanceRig.parent=skater;body.parent=stanceRig;boardPivot.parent=skater;body.rotation.y=Math.PI/2;
const elbows=[-1,1].map(side=>{const e=new B.TransformNode('elbow',scene);e.parent=body;e.position.set(side*.42,1.39,0);return e;});
const rider=SOLSkaterV2.attach(B,scene,{skater,body,stanceRig,boardPivot,elbows,grabMeshes:[]});
const state={grounded:true,speed:4,travelSign:1},pose={pushing:false,contact:0,recovery:0};
const before=JSON.stringify(state);rider.update(Object.freeze(state),pose,false,1/60);assert.equal(JSON.stringify(state),before);
const palette=rider.skeleton.getTransformMatrices(rider.meshes[0]);
// Check actual skinned sole vertices, not merely the target ankle metadata.
const sole=data.primitives.find(p=>data.materials[p.material].name==='Mat_VulcanizedRubber');
let bottom=Infinity;
for(let i=0;i<sole.positions.length/3;i++){
 const p=B.Vector3.FromArray(sole.positions,i*3),sum=B.Vector3.Zero();
 for(let k=0;k<4;k++){const w=sole.weights[i*4+k];if(w)sum.addInPlace(B.Vector3.TransformCoordinates(p,B.Matrix.FromArray(palette,sole.joints[i*4+k]*16)).scale(w));}
 bottom=Math.min(bottom,sum.y);assert(Math.abs(sum.z)<.6,'Shoes must remain within deck length');assert(Math.abs(sum.x)<.3,'Shoes must stay within deck width');
}
assert(Math.abs(bottom-.2355)<.003,'Authored soles must rest on the deck: '+bottom);
const baseline=Array.from(rider.skeleton.getTransformMatrices(rider.meshes[0]));
// A real push extends the rear shoe outside the deck and down to the pavement.
rider.update(state,{pushing:true,contact:1,recovery:0},false,1/60);
assert.equal(rider.diagnostics.mode,'push');
assert(rider.diagnostics.feet[0][0]>.3&&rider.diagnostics.feet[0][1]<.25,
 'Rear push foot must leave the board and approach the ground');
// During an ollie the board rises with the rider; neither shoe should float
// above the deck. The pelvis tucks while the planted foot targets stay fixed.
rider.update({grounded:false,airTime:.27,flip:0,spin:0},pose,false,1/60);
assert.equal(rider.diagnostics.mode,'ollie');
for(const foot of rider.diagnostics.feet)assert(Math.abs(foot[1]-.385)<.001,'Ollie shoes must stay on deck');
assert.notDeepEqual(Array.from(rider.skeleton.getTransformMatrices(rider.meshes[0])),baseline,
 'Ollie tuck must visibly deform the skinned skeleton');

// Check real skin changes, bounded matrices, and landing recovery at two rates.
for(const hz of [30,60]){
 const s={grounded:false,flip:1,airTime:.25},p={...pose};rider.update(s,p,false,1/hz);
 assert.equal(rider.diagnostics.mode,'flip');assert(Array.from(rider.skeleton.getTransformMatrices(rider.meshes[0])).every(Number.isFinite));
 s.grounded=true;rider.update(s,p,false,1/hz);assert(rider.diagnostics.landing>.6);
 for(let n=0;n<hz;n++)rider.update(s,p,false,1/hz);assert(rider.diagnostics.landing<.001);
}
engine.dispose();console.log('PASS V2 source, weighted sole/deck contact, immutable physics state, skin matrices and 30/60 FPS landing recovery');
