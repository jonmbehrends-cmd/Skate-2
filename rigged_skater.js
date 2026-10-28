/* SOL SKATE — skinned GLB character bridge.
 * CesiumMan is © Cesium, CC BY 4.0, via Khronos glTF Sample Assets.
 * No original character is hidden until a valid skinned mesh has loaded.
 */
(function(root){'use strict';
const DEFAULT_URL='https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CesiumMan/glTF-Binary/CesiumMan.glb';
async function attach(B,scene,parent,legacyMeshes,options={}){
 if(!B.SceneLoader||!B.SceneLoader.ImportMeshAsync)throw Error('glTF loader unavailable');
 const url=options.url||DEFAULT_URL;
 const cut=url.lastIndexOf('/');
 const result=await B.SceneLoader.ImportMeshAsync('',url.slice(0,cut+1),url.slice(cut+1),scene);
 if(!result.skeletons?.length||!result.meshes.some(m=>m.skeleton))throw Error('Asset has no skinned mesh and skeleton');
 const rootNode=new B.TransformNode('rigged skater',scene);
 const top=result.meshes.filter(m=>!m.parent);
 for(const m of top)m.parent=rootNode;
 rootNode.parent=parent;
 // The sample character is roughly human scale. Tune using actual bounds.
 const bounds=result.meshes.filter(m=>m.getBoundingInfo&&m.getTotalVertices&&m.getTotalVertices()>0).map(m=>m.getBoundingInfo().boundingBox);
 if(bounds.length){
  const lo=Math.min(...bounds.map(b=>b.minimumWorld.y)),hi=Math.max(...bounds.map(b=>b.maximumWorld.y));
  const height=Math.max(.1,hi-lo);
  rootNode.scaling.setAll(2.25/height);
  rootNode.position.y=-lo*rootNode.scaling.y;
 }
 if(!top.length)throw Error('Skinned asset missing root nodes');
 const animations=result.animationGroups||[];
 for(const group of animations)group.stop();
 // Drive the rig through its skeletal animation track, if present.
 let current='';
 function update(state,pose,actions={}){
  const mode=actions.grinding?'grind':actions.grabbing?'grab':!state.grounded?'air':pose.pushing?'push':Math.abs(state.speed)>1?'ride':'idle';
  if(mode!==current){
   current=mode;
   for(const group of animations)group.stop();
   const chosen=animations.find(g=>g.name.toLowerCase().includes(mode))||animations[0];
   if(chosen)chosen.start(true);
  }
  rootNode.rotation.y=(pose.torsoYaw||0)*.4;
  rootNode.rotation.z=actions.grinding?Math.sin((state.grindTime||0)*7)*.08:0;
  rootNode.rotation.x=actions.grabbing?.25:!state.grounded?-.10:Math.min(.08,(state.speed||0)*.005);
  rootNode.position.y=(!state.grounded?-.16:0)-Math.min(.10,(pose.crouch||0)*.35);
 }
 // Hide only renderable meshes belonging to the old rider, not board or park.
 for(const mesh of legacyMeshes)if(mesh&&mesh.setEnabled)mesh.setEnabled(false);
 return {root:rootNode,update,animationNames:animations.map(g=>g.name),dispose(){rootNode.dispose(false,true);for(const group of animations)group.dispose();}};
}
root.SOLRiggedSkater={attach,DEFAULT_URL};
})(typeof window!=='undefined'?window:globalThis);
