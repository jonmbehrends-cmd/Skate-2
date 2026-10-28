/* Compare indexed world-space geometry against the pre-batching art fixture. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const B=require('babylonjs');
const engine=new B.NullEngine();
const ramps=[{curve:'halfpipe-deck',x:-36,z:-31.55,w:38,d:3.1,h:4.5},
 {curve:'halfpipe-deck',x:-36,z:-4.65,w:38,d:3.1,h:4.5}];
function build(file){
 const scope={};vm.runInNewContext(fs.readFileSync(file,'utf8'),scope);
 const scene=new B.Scene(engine),art=scope.SOLParkArchitecture.build(B,scene,ramps);
 return {scene,art};
}
function geometry(meshes){
 const triangles=[];
 for(const mesh of meshes){
  assert.equal(mesh.isPickable,false);assert.equal(mesh.checkCollisions,false);
  assert.equal(mesh.receiveShadows,true);
  const matrix=mesh.computeWorldMatrix(true),p=mesh.getVerticesData('position'),
   n=mesh.getVerticesData('normal'),uv=mesh.getVerticesData('uv'),indices=mesh.getIndices();
  for(let i=0;i<indices.length;i+=3){
   const triangle=[];
   for(const j of indices.slice(i,i+3)){
    const pos=B.Vector3.TransformCoordinates(B.Vector3.FromArray(p,j*3),matrix),
     normal=B.Vector3.TransformNormal(B.Vector3.FromArray(n,j*3),matrix);
    triangle.push([...pos.asArray(),...normal.asArray(),uv[j*2],uv[j*2+1]].map(v=>Math.round(v*1000)));
   }
   const m=mesh.material;
   triangles.push(JSON.stringify([m.name,m.albedoColor.asArray(),m.metallic,m.roughness,triangle]));
  }
 }
 return triangles.sort();
}
try{
 const before=build(path.join(__dirname,'fixtures/park_architecture.before.js')),
  after=build(path.join(__dirname,'../park_architecture.js'));
 assert.equal(before.art.meshes.length,142);
 assert.equal(after.art.meshes.length,55);
 assert.deepEqual(geometry(after.art.meshes),geometry(before.art.meshes),
  'All triangle winding, world positions (1mm), normals, UVs and material properties must survive batching');
 for(const mesh of after.art.meshes){
  assert(mesh.isWorldMatrixFrozen,'Only immutable architectural art is batched');
  const bounds=mesh.getBoundingInfo().boundingBox;
  assert(bounds.maximumWorld.z-bounds.minimumWorld.z<=60,'Keep batches spatially local');
 }
 after.art.dispose();assert.equal(after.scene.meshes.length,0,'Dispose must release all merged meshes');
 before.scene.dispose();after.scene.dispose();
 console.log('PASS architecture: 142 → 55 meshes, identical indexed geometry/materials, local bounds and disposal');
}finally{engine.dispose();}
