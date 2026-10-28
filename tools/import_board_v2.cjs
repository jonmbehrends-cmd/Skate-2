/* Convert the reviewed Blender GLB deck into dependency-free Babylon data.
 * Usage: node tools/import_board_v2.cjs <path/to/skateboard_v2.glb>
 * Only static, untransformed TRIANGLES primitives are accepted.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const source=fs.readFileSync(process.argv[2]);
assert.equal(source.toString('ascii',0,4),'glTF');assert.equal(source.readUInt32LE(4),2);
const jsonLength=source.readUInt32LE(12),gltf=JSON.parse(source.toString('utf8',20,20+jsonLength));
const binary=source.subarray(28+jsonLength);
function accessor(index){
 const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView];
 assert(!a.sparse&&!a.normalized,'Sparse/normalized attributes require explicit conversion');
 const count={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
 const reader={5126:['readFloatLE',4],5125:['readUInt32LE',4],5123:['readUInt16LE',2]}[a.componentType];
 assert(count&&reader,'Unsupported accessor');
 const [method,size]=reader,out=[];
 for(let i=0;i<a.count;i++)for(let c=0;c<count;c++){
  const value=binary[method]((v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||count*size)+c*size);
  assert(Number.isFinite(value));out.push(a.componentType===5126?Math.round(value*1e6)/1e6:value);
 }
 return out;
}
function geometry(name){
 const node=gltf.nodes.find(n=>n.name===name);assert(node,'Missing '+name);
 assert(!node.matrix&&!node.translation&&!node.rotation&&!node.scale&&!node.skin,'Deck geometry must be baked into game coordinates');
 const mesh=gltf.meshes[node.mesh];assert.equal(mesh.primitives.length,1);
 const p=mesh.primitives[0];assert(p.mode===undefined||p.mode===4);
 const positions=accessor(p.attributes.POSITION);
 // Align the authored .192 m center deck with the existing .235 m stance.
 for(let i=1;i<positions.length;i+=3)positions[i]=Math.round((positions[i]+.043)*1e6)/1e6;
 const indices=accessor(p.indices),uvs=[];
 for(let i=0;i<positions.length;i+=3)uvs.push(positions[i]/.55+.5,positions[i+2]/1.65+.5);
 return {positions,indices,uvs};
}
const shapes={deck:geometry('Deck_MapleCore'),grip:geometry('Deck_GripTape')};
const hash=crypto.createHash('sha256').update(source).digest('hex');
const output='/* Generated from reviewed Gemini Blender skateboard_v2.glb.\n * Source SHA-256: '+hash+'\n * Rebuild with tools/import_board_v2.cjs. Visual geometry only.\n */\n(function(root){\'use strict\';const data='+JSON.stringify(shapes)+';\nroot.SOLBoardV2={sourceHash:'+JSON.stringify(hash)+',build:()=>data};\n})(typeof window!==\'undefined\'?window:globalThis);\n';
fs.writeFileSync(path.resolve(__dirname,'..','board_v2.js'),output);
console.log('Imported V2 deck and grip',hash,output.length+' bytes');
