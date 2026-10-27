/* SOL SKATE — skeletal GLB skater loader.
 * Optional asset path: assets/skater.glb. Falls back to the existing
 * animated skater when no licensed production asset is installed.
 */
(function(root){'use strict';
async function load(B,scene,url,options={}){
 if(!B||!scene||!url)throw Error('GLB loader requires Babylon scene and asset URL');
 if(!B.SceneLoader||!B.SceneLoader.ImportMeshAsync)throw Error('Babylon SceneLoader unavailable');
 const split=url.lastIndexOf('/');
 const rootUrl=split<0?'./':url.slice(0,split+1);
 const file=split<0?url:url.slice(split+1);
 const result=await B.SceneLoader.ImportMeshAsync('',rootUrl,file,scene);
 const container=new B.TransformNode('production skater asset root',scene);
 for(const mesh of result.meshes){
  if(mesh===container||mesh.parent)continue;
  mesh.parent=container;
 }
 container.setEnabled(false);
 container.scaling.setAll(Number.isFinite(options.scale)?options.scale:1);
 const groups=result.animationGroups||[];
 const animationNames=groups.map(g=>g.name);
 function play(name,loop=true){
  const group=groups.find(g=>g.name.toLowerCase()===String(name).toLowerCase());
  if(!group)return false;
  for(const other of groups)if(other!==group)other.stop();
  group.start(loop);
  return true;
 }
 function dispose(){
  for(const g of groups)g.dispose();
  container.dispose(false,true);
 }
 return {root:container,skeletons:result.skeletons||[],animationNames,play,dispose};
}
root.SOLProductionSkater={load};
})(typeof window!=='undefined'?window:globalThis);
