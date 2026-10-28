const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const meshes=[],materials=[];
class Material{constructor(name){this.name=name;materials.push(this)}}
class Texture{
 getContext(){const noop=()=>{};return {fillRect:noop,save:noop,restore:noop,translate:noop,rotate:noop,beginPath:noop,moveTo:noop,lineTo:noop,stroke:noop,fillText:noop}}
 update(){}
}
function mesh(name){const m={name,position:{set(x,y,z){this.x=x;this.y=y;this.z=z}},rotation:{},scaling:{x:1,y:1,z:1},dispose(){this.disposed=true}};meshes.push(m);return m}
class Color3{constructor(r,g,b){this.r=r;this.g=g;this.b=b}static FromHexString(hex){return hex}}
const B={PBRMaterial:Material,StandardMaterial:Material,DynamicTexture:Texture,
 Color3,Material:{MATERIAL_OPAQUE:0},
 MeshBuilder:{CreateBox:mesh,CreatePlane:mesh}};
const sandbox={};vm.runInNewContext(fs.readFileSync('park_architecture.js','utf8'),sandbox);
const park=sandbox.SOLParkArchitecture.build(B,{},[]);
function named(name){return meshes.filter(m=>m.name===name)}
for(const name of ['perimeter concrete pilaster','wall-washer steel housing','warm wall-washer lens']){
 const items=named(name);assert.equal(items.length,22,name+' must repeat along both retaining walls');
 assert(items.every(m=>Math.abs(m.position.x)>118),'Fixtures must stay outside the skating lanes');
 assert(items.every(m=>m.isPickable===false&&m.checkCollisions===false),'Visual details must never affect physics');
}
assert(named('park perimeter painted mural').every(m=>m.scaling.x===-1),
 'Interior-facing mural lettering must not be mirrored');
const flow=named('plaza painted flow guide');
assert.equal(flow.length,12,'Two six-segment ground-level flow corridors');
assert(flow.every(m=>Math.abs(m.position.x)<112&&Math.abs(m.position.z)<120),
 'Painted routes must remain inside the retaining walls');
assert(flow.every(m=>m.position.y<0&&Number.isFinite(m.rotation.y)),
 'Flow stripes must sit on the flat plaza with finite orientation');
assert(flow.every(m=>m.isPickable===false&&m.checkCollisions===false),
 'Paint must never affect raycasts, wheels, or skating physics');
for(const name of ['flow guide inlaid teal','flow guide inlaid ochre']){
 const mat=materials.find(m=>m.name===name);
 assert(mat&&mat.alpha===1&&mat.forceDepthWrite===true&&
  mat.transparencyMode===B.Material.MATERIAL_OPAQUE,
  'Flow paint must remain opaque and depth-writing: '+name);
}
const lens=materials.find(m=>m.name==='warm wall-washer lens');
assert(lens&&lens.alpha===1&&lens.transparencyMode===B.Material.MATERIAL_OPAQUE&&lens.forceDepthWrite===true,
 'Wall lights must be fully opaque and depth writing');
assert(meshes.every(m=>m.isPickable===false&&m.checkCollisions===false),
 'All architecture remains visual-only');
assert.equal(park.meshes.length,meshes.length);
park.dispose();assert(meshes.every(m=>m.disposed),'Architecture must clean up its meshes');
console.log('PASS 22 industrial wall lights, 22 pilasters, opaque lenses, outside-lane visual-only meshes');
