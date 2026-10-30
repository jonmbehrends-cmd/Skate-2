const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const meshes=[],materials=[],textures=[];
class Material{constructor(name){this.name=name;materials.push(this)}dispose(){this.disposed=true}}
class Texture{
 constructor(){textures.push(this)}
 dispose(){this.disposed=true}
 getContext(){const noop=()=>{};return {fillRect:noop,save:noop,restore:noop,translate:noop,rotate:noop,beginPath:noop,moveTo:noop,lineTo:noop,stroke:noop,fillText:noop,strokeText:noop,arc:noop,closePath:noop,fill:noop}}
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
for(const [name,count] of [['perimeter guardrail top',22],['perimeter guardrail mid',22],['perimeter guardrail upright',66]]){
 const items=named(name);
 assert.equal(items.length,count,name+' count should match 11 wall segments on each side');
 assert(items.every(m=>Math.abs(m.position.x)===119&&m.position.y>2.2),
  'Guardrails must sit above and outside the concrete wall: '+name);
 assert(items.every(m=>m.isPickable===false&&m.checkCollisions===false),
  'Guardrails must never change skating collision or raycast behavior: '+name);
}
const cement=materials.find(m=>m.name==='architectural exposed concrete');
const aggregate=textures.find(t=>t===cement?.albedoTexture);
assert(cement&&aggregate,
 'Exposed concrete must use the shared deterministic aggregate texture');
assert(cement.alpha===1&&cement.forceDepthWrite===true&&
 cement.transparencyMode===B.Material.MATERIAL_OPAQUE,
 'Textured concrete must remain opaque and depth-writing');
assert.equal(textures.length,2,'Only one concrete texture and one mural atlas per build');
const metal=materials.find(m=>m.name==='galvanized park coping');
assert(metal&&metal.alpha===1&&metal.forceDepthWrite===true&&
 metal.transparencyMode===B.Material.MATERIAL_OPAQUE,
 'Galvanized rails must be fully opaque and depth-writing');
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
assert(materials.every(m=>m.disposed),'Architecture must dispose all owned GPU materials');
assert(textures.every(t=>t.disposed),'Architecture must release its dynamic mural atlas');
park.dispose();assert(materials.every(m=>m.disposed)&&textures.every(t=>t.disposed),
 'Repeated park disposal must be harmless');
// Verify the two real 38m halfpipe decks receive solid, below-deck fascia
// hardware rather than floating/pickable geometry in the transition lanes.
const decks=[
 {curve:'halfpipe-deck',x:-36,z:-31.55,w:38,d:3.1,h:4.5},
 {curve:'halfpipe-deck',x:-36,z:-4.65,w:38,d:3.1,h:4.5}
];
const detailed=sandbox.SOLParkArchitecture.build(B,{},decks);
for(const [name,count] of [
 ['halfpipe deck fascia safety stripe',4],
 ['halfpipe fascia steel anchor plate',20],
 ['halfpipe fascia recessed bolt head',40]
]){
 const parts=named(name);
 assert.equal(parts.length,count,name+' should appear on both sides of both decks');
 assert(parts.every(m=>m.isPickable===false&&m.checkCollisions===false),
  name+' must not change board, wheel or rider physics');
 assert(parts.every(m=>m.position.y>4&&m.position.y<4.5&&Math.abs(m.position.x+36)<18),
  name+' must remain below deck top and inside fascia span');
}
const plates=named('halfpipe fascia steel anchor plate');
assert(plates.every(m=>decks.some(d=>Math.abs(Math.abs(m.position.z-d.z)-d.d/2)<.05)),
 'Anchor plates must mount on existing fascia, not inside the skating area');
const bands=named('halfpipe deck fascia safety stripe');
assert(bands.every(m=>m.material?.name==='park edge markings'&&m.material.alpha===1&&
 m.material.forceDepthWrite===true&&m.material.transparencyMode===B.Material.MATERIAL_OPAQUE),
 'Safety bands must use opaque depth-writing inlaid marking paint');
detailed.dispose();assert(meshes.every(m=>m.disposed),'New fascia details must dispose with the park');
assert(materials.every(m=>m.disposed),'Every park build must dispose its own materials');
assert(textures.every(t=>t.disposed),'Every park build must dispose its own mural texture');
console.log('PASS opaque park hardware and complete Babylon material/texture teardown');
