/* Validate the actual licensed Kenney GLB, its external palette and skate clips. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../assets/kenney-mini-skate');
const bytes=fs.readFileSync(path.join(root,'character-skate-boy.glb'));
assert.equal(bytes.toString('utf8',0,4),'glTF','valid binary glTF header');
const length=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.toString('utf8',20,20+length));
assert.equal(gltf.skins.length,2,'both body and head are skinned');
assert(gltf.skins.every(s=>s.joints.length===7),'each skin has a seven-joint human rig');
assert.deepEqual(gltf.meshes.map(m=>m.name),['body-mesh','head-mesh']);
const clips=new Set(gltf.animations.map(a=>a.name));
for(const clip of ['skate','skate-stand','skate-air','skate-grab','crouch','jump','fall'])assert(clips.has(clip),'missing clip '+clip);
for(const image of gltf.images||[]){assert(!image.uri.startsWith('http'),'texture must be bundled');assert(fs.existsSync(path.join(root,image.uri)),'missing texture '+image.uri)}
assert.match(fs.readFileSync(path.join(root,'License.txt'),'utf8'),/Creative Commons Zero, CC0/);
console.log('PASS licensed Kenney skate-boy GLB, 2 skinned meshes, 14 joints, skate/air/grab clips, local palette and CC0 license');
