/* Kenney Mini Skate v1.2 (CC0) - authentic skater mesh and authored skate clips.
 * See assets/kenney-mini-skate/License.txt. Visual only: never mutates physics.
 * Falls back to the existing human V2 skater if GLB/texture loading fails.
 */
(function(root){'use strict';
const DEFAULT_URL='assets/kenney-mini-skate/character-skate-boy.glb';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
async function attach(B,scene,parent,legacyMeshes,options={}){
 if(!B.SceneLoader?.IsPluginForExtensionAvailable('.glb'))throw Error('Babylon glTF loader missing');
 const url=options.url||DEFAULT_URL,cut=url.startsWith('data:')?-1:url.lastIndexOf('/');
 const container=await B.SceneLoader.LoadAssetContainerAsync(url.slice(0,cut+1),url.slice(cut+1),scene,null,'.glb');
 let rig=null;
 try{
  const meshes=container.meshes.filter(m=>m.getTotalVertices()>0&&m.skeleton);
  if(meshes.length<2||container.skeletons.length<2)throw Error('Kenney skater missing body/head skin');
  const clips=new Map(container.animationGroups.map(g=>[g.name.toLowerCase(),g]));
  for(const name of ['skate','skate-stand','skate-air','skate-grab','crouch'])
   if(!clips.has(name))throw Error('Kenney skate animation missing: '+name);
  container.addAllToScene();
  for(const group of container.animationGroups){group.stop();group.enableBlending=true;group.blendingSpeed=.12}
  rig=new B.TransformNode('Kenney licensed skeletal skater',scene);
  for(const n of [...container.meshes,...container.transformNodes])if(!n.parent)n.parent=rig;
  for(const n of container.transformNodes)n.computeWorldMatrix(true);
  for(const m of meshes){m.computeWorldMatrix(true);m.refreshBoundingInfo(true)}
  const lo=Math.min(...meshes.map(m=>m.getBoundingInfo().boundingBox.minimumWorld.y));
  const hi=Math.max(...meshes.map(m=>m.getBoundingInfo().boundingBox.maximumWorld.y));
  if(!Number.isFinite(hi-lo)||hi-lo<.25)throw Error('Kenney skater has invalid bounds');
  const scale=2.03/(hi-lo);
  rig.scaling.set(scale*.82,scale,scale*.82);
  rig.position.y=.22-lo*scale;
  rig.rotation.y=Math.PI/2;
  rig.parent=parent;
  const status={ready:true,mode:'idle',clip:'skate-stand',height:2.03,bones:container.skeletons.reduce((n,s)=>n+s.bones.length,0),source:DEFAULT_URL,meshes:meshes.length};
  let previousGrounded=true,landing=0,takeoff=0,active=null;
  function select(name,speed){
   const next=clips.get(name);
   if(active!==next){active?.stop();active=next;next.start(true,1)}
   next.speedRatio=clamp(speed,.65,2.1);
   status.clip=name;
  }
  function update(state,pose={},actions={}){
   const dt=clamp(actions.dt||1/60,0,.05);
   if(state.grounded&&!previousGrounded)landing=1;else landing=Math.max(0,landing-dt*5);
   if(!state.grounded&&previousGrounded)takeoff=1;else takeoff=Math.max(0,takeoff-dt*5);
   previousGrounded=!!state.grounded;
   const air=!state.grounded&&!actions.grinding,flip=air&&Math.abs(state.flip||0)>0;
   const mode=actions.grinding?'grind':actions.grabbing?'grab':flip?'flip':air&&takeoff>.05?'ollie':air?'air':landing>.05?'landing':pose.pushing?'push':(pose.crouch||0)>.1?'crouch':Math.abs(state.speed||0)>1?'ride':'idle';
   const clip=mode==='push'?'skate':mode==='grab'?'skate-grab':['ollie','air','flip'].includes(mode)?'skate-air':['crouch','landing'].includes(mode)?'crouch':'skate-stand';
   select(clip,mode==='push'?1.25:mode==='ride'?Math.max(1,Math.abs(state.speed||0)/5):1);
   status.mode=mode;
   // The source clips already pose all seven skater joints. The game controls
   // board tilt, flip, yaw, air position, and collision independently.
   rig.rotation.z=mode==='grind'?Math.sin((state.grindTime||0)*6)*.07:0;
   rig.rotation.x=mode==='landing'?.09:0;
  }
  update({grounded:true,speed:0},{});
  for(const mesh of meshes){mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;options.shadow?.addShadowCaster(mesh)}
  const oldVisibility=legacyMeshes.map(m=>m.isVisible);
  for(const mesh of legacyMeshes)mesh.isVisible=false;
  return {root:rig,update,status,meshes,skeletons:container.skeletons,animationNames:[...clips.keys()],dispose(){active?.stop();legacyMeshes.forEach((m,i)=>m.isVisible=oldVisibility[i]);container.dispose();rig.dispose()}};
 }catch(error){container.dispose();rig?.dispose();throw error}
}
root.SOLKenneySkater={attach,DEFAULT_URL};
})(typeof window!=='undefined'?window:globalThis);
