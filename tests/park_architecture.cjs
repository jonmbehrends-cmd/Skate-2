const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const meshes=[],materials=[];
class Material{constructor(name){this.name=name;materials.push(this)}}
class Texture{
 getContext(){const noop=()=>{};return {fillRect:noop,save:noop,restore:noop,translate:noop,rotate:noop,beginPath:noop,moveTo:noop,lineTo:noop,stroke:noop,fillText:noop}}
 update(){}
}
function mesh(name){const m={name,position:{set(x,y,z){this.x=x;this.y=y;this.z=z}},rotation:{},dispose(){this.disposed=true}};meshes.push(m);return m}
const B={PBRMaterial:Material,StandardMaterial:Material,DynamicTexture:Texture,
 Color3:{FromHexString:hex=>hex},Material:{MATERIAL_OPAQUE:0},
 MeshBuilder:{CreateBox:mesh,CreatePlane:mesh}};
const sandbox={};vm.runInNewContext(fs.readFileSync('park_architecture.js','utf8'),sandbox);
const park=sandbox.SOLParkArchitecture.build(B,{},[]);
function named(name){return meshes.filter(m=>m.name===name)}
for(const name of ['perimeter concrete pilaster','wall-washer steel housing','warm wall-washer lens']){
 const items=named(name);assert.equal(items.length,22,name+' must repeat along both retaining walls');
 assert(items.every(m=>Math.abs(m.position.x)>118),'Fixtures must stay outside the skating lanes');
 assert(items.every(m=>m.isPickable===false&&m.checkCollisions===false),'Visual details must never affect physics');
}
const lens=materials.find(m=>m.name==='warm wall-washer lens');
assert(lens&&lens.alpha===1&&lens.transparencyMode===B.Material.MATERIAL_OPAQUE&&lens.forceDepthWrite===true,
 'Wall lights must be fully opaque and depth writing');
assert(meshes.every(m=>m.isPickable===false&&m.checkCollisions===false),
 'All architecture remains visual-only');
assert.equal(park.meshes.length,meshes.length);
park.dispose();assert(meshes.every(m=>m.disposed),'Architecture must clean up its meshes');
console.log('PASS 22 industrial wall lights, 22 pilasters, opaque lenses, outside-lane visual-only meshes');
