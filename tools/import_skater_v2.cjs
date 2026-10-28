/* Reproduce the runtime skinned asset from the reviewed Gemini Blender GLB.
 * node tools/import_skater_v2.cjs path/to/skater_v2.glb
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const source=fs.readFileSync(process.argv[2]);
assert.equal(source.toString('ascii',0,4),'glTF');assert.equal(source.readUInt32LE(4),2);
const length=source.readUInt32LE(12),g=JSON.parse(source.toString('utf8',20,20+length)),bin=source.subarray(28+length);
function read(index){
 const a=g.accessors[index],v=g.bufferViews[a.bufferView],n={SCALAR:1,VEC3:3,VEC4:4,MAT4:16}[a.type];
 const [method,size]=({5121:['readUInt8',1],5123:['readUInt16LE',2],5125:['readUInt32LE',4],5126:['readFloatLE',4]})[a.componentType]||[];
 assert(n&&method&&!a.sparse&&!a.normalized,'Unsupported accessor');
 return Array.from({length:a.count*n},(_,i)=>{const x=bin[method]((v.byteOffset||0)+(a.byteOffset||0)+Math.floor(i/n)*(v.byteStride||n*size)+(i%n)*size);assert(Number.isFinite(x));return x;});
}
assert.equal(g.skins.length,1);const skin=g.skins[0],inverse=read(skin.inverseBindMatrices);
const data={sourceHash:crypto.createHash('sha256').update(source).digest('hex'),
 bones:skin.joints.map((n,i)=>({name:g.nodes[n].name,inverseBind:inverse.slice(i*16,i*16+16)})),
 materials:g.materials.map(m=>({name:m.name,...m.pbrMetallicRoughness})),
 primitives:g.meshes[0].primitives.map(p=>{assert(p.mode===undefined||p.mode===4);return {material:p.material,positions:read(p.attributes.POSITION),normals:read(p.attributes.NORMAL),joints:read(p.attributes.JOINTS_0),weights:read(p.attributes.WEIGHTS_0),indices:read(p.indices)};})};
for(const p of data.primitives){assert.equal(p.joints.length,p.positions.length/3*4);for(let i=0;i<p.weights.length;i+=4)assert(Math.abs(p.weights.slice(i,i+4).reduce((a,b)=>a+b,0)-1)<1e-5);}
fs.writeFileSync(path.resolve(__dirname,'..','skater_v2_data.js'),'/* Generated from reviewed Gemini skater_v2.glb; rebuild with tools/import_skater_v2.cjs. */\n(function(root){root.SOLSkaterV2Data='+JSON.stringify(data)+';})(typeof window!==\'undefined\'?window:globalThis);\n');
console.log('Imported',data.bones.length,'bones;',data.primitives.length,'materials;',data.sourceHash);
