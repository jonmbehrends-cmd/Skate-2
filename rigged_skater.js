/* CesiumMan © 2017 Cesium, CC BY 4.0. See assets/cesium-man/SOURCE.md.
 * Gameplay-driven skeletal IK; the source walking clip is deliberately stopped.
 * This module reads gameplay state and never writes physics or input state.
 */
(function(root){'use strict';
const DEFAULT_URL='assets/cesium-man/CesiumMan.glb';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
async function attach(B,scene,parent,legacyMeshes,options={}){
 if(!B.SceneLoader?.IsPluginForExtensionAvailable('.glb'))throw Error('Babylon glTF plugin is not registered');
 const url=options.url||DEFAULT_URL,cut=url.startsWith('data:')?-1:url.lastIndexOf('/');
 const container=await B.SceneLoader.LoadAssetContainerAsync(url.slice(0,cut+1),url.slice(cut+1),scene,null,'.glb');
 let rig;
 try{
  const meshes=container.meshes.filter(m=>m.getTotalVertices()>0);
  if(!container.skeletons.length||!meshes.some(m=>m.skeleton))throw Error('Character has no skin/skeleton');
  container.addAllToScene();
  for(const a of container.animationGroups)a.stop();
  rig=new B.TransformNode('rigged skater',scene);
  for(const n of [...container.meshes,...container.transformNodes])if(!n.parent)n.parent=rig;
  const nodes=new Map(container.transformNodes.map(n=>[n.name,n]));
  function joint(name){const n=nodes.get(name);if(!n)throw Error('Missing skater joint: '+name);return n}
  const pelvis=joint('Skeleton_torso_joint_1'),spine=joint('Skeleton_torso_joint_2');
  const legs=[['L','leg_joint_L_1','leg_joint_L_2','leg_joint_L_3'],['R','leg_joint_R_1','leg_joint_R_2','leg_joint_R_3']].map(([side,...names])=>({side,n:names.map(joint)}));
  const arms=[['L','Skeleton_arm_joint_L__4_','Skeleton_arm_joint_L__3_','Skeleton_arm_joint_L__2_'],['R','Skeleton_arm_joint_R','Skeleton_arm_joint_R__2_','Skeleton_arm_joint_R__3_']].map(([side,...names])=>({side,n:names.map(joint)}));
  // Bounds must be computed with the imported Z_UP and glTF handedness transforms,
  // before attaching to a moving/tilted parent. Never overwrite the base offset.
  for(const n of container.transformNodes)n.computeWorldMatrix(true);
  for(const m of meshes){m.computeWorldMatrix(true);m.refreshBoundingInfo(true)}
  const lo=Math.min(...meshes.map(m=>m.getBoundingInfo().boundingBox.minimumWorld.y));
  const hi=Math.max(...meshes.map(m=>m.getBoundingInfo().boundingBox.maximumWorld.y));
  if(!Number.isFinite(hi-lo)||hi-lo<.1)throw Error('Invalid character bounds');
  const scale=2.18/(hi-lo);
  rig.scaling.setAll(scale);rig.position.y=.33-lo*scale;rig.rotation.y=Math.PI/2;
  rig.parent=parent;
  const rest=new Map(container.transformNodes.map(n=>[n,{p:n.position.clone(),q:n.rotationQuaternion?.clone()||B.Quaternion.FromEulerVector(n.rotation)}]));
  const v=(x,y,z)=>new B.Vector3(x,y,z);
  const localPosition=n=>{n.computeWorldMatrix(true);return B.Vector3.TransformCoordinates(n.getAbsolutePosition(),B.Matrix.Invert(parent.computeWorldMatrix(true)))};
  // Targets are in the terrain stance's space, so feet remain on the board while
  // the board/character moves through the world, including fakie and vert airs.
  const world=p=>B.Vector3.TransformCoordinates(p,parent.computeWorldMatrix(true));
  function aim(node,child,target){
   node.computeWorldMatrix(true);child.computeWorldMatrix(true);
   const inv=B.Matrix.Invert(node.parent.computeWorldMatrix(true));
   const from=B.Vector3.TransformCoordinates(child.getAbsolutePosition(),inv).subtract(node.position).normalize();
   const to=B.Vector3.TransformCoordinates(world(target),inv).subtract(node.position).normalize();
   const delta=B.Quaternion.Identity();B.Quaternion.FromUnitVectorsToRef(from,to,delta);
   node.rotationQuaternion=delta.multiply(node.rotationQuaternion);node.computeWorldMatrix(true);
  }
  function solve(chain,target,pole){
   const [a,b,c]=chain,origin=localPosition(a),mid=localPosition(b),end=localPosition(c);
   const l1=B.Vector3.Distance(origin,mid),l2=B.Vector3.Distance(mid,end);
   const axis=target.subtract(origin),d=clamp(axis.length(),.001,l1+l2-.0001);axis.normalize();
   const bend=pole.subtract(origin);bend.subtractInPlace(axis.scale(B.Vector3.Dot(bend,axis))).normalize();
   const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along));
   const knee=origin.add(axis.scale(along)).add(bend.scale(height));
   aim(a,b,knee);aim(b,c,origin.add(axis.scale(d)));
  }
  // Preserve ankle orientation in the stance frame after solving each leg.
  function stanceRotation(node){const q=B.Quaternion.Identity();node.computeWorldMatrix(true).decompose(undefined,q);const pq=B.Quaternion.Identity();parent.computeWorldMatrix(true).decompose(undefined,pq);return pq.conjugate().multiply(q)}
  const footRotations=legs.map(l=>stanceRotation(l.n[2]));
  function orient(node,q){const pq=B.Quaternion.Identity(),parentQ=B.Quaternion.Identity();node.parent.computeWorldMatrix(true).decompose(undefined,pq);parent.computeWorldMatrix(true).decompose(undefined,parentQ);node.rotationQuaternion=pq.conjugate().multiply(parentQ.multiply(q));node.computeWorldMatrix(true)}
  const status={ready:true,mode:'idle',height:2.18,bones:container.skeletons[0].bones.length,source:DEFAULT_URL,feet:[],hands:[]};
  let wasGrounded=true,landing=0,takeoff=0;
  function update(state,pose,actions={}){
   const dt=clamp(actions.dt||1/60,0,.05);
   if(state.grounded&&!wasGrounded)landing=1;else landing=Math.max(0,landing-dt*5);
   if(!state.grounded&&wasGrounded)takeoff=1;else takeoff=Math.max(0,takeoff-dt*5);
   wasGrounded=!!state.grounded;
   const air=!state.grounded&&!actions.grinding,flip=air&&Math.abs(state.flip||0)>0;
   const mode=actions.grinding?'grind':actions.grabbing?'grab':flip?'flip':air&&takeoff>.05?'ollie':air?'air':landing>.05?'landing':pose.pushing?'push':(pose.crouch||0)>.1?'crouch':Math.abs(state.speed)>1?'ride':'idle';
   status.mode=mode;
   for(const [n,r] of rest){n.position.copyFrom(r.p);n.rotationQuaternion=r.q.clone()}
   const crouch=clamp((pose.crouch||0)*.48+landing*.15+takeoff*.26+(actions.grabbing?.75:0),0,.92);
   rig.position.y=.33-lo*scale-.13-crouch-(pose.pushing?.32:0);
   rig.rotation.x=0;rig.rotation.z=0;
   // Torso lean rotates the upper skeleton only; it cannot lift the planted feet.
   spine.rotationQuaternion=rest.get(spine).q.multiply(B.Quaternion.RotationAxis(B.Axis.Y,(actions.grabbing?.35:.07)+(pose.contact||0)*.07));
   const travel=state.travelSign===-1?-1:1;
   const lift=air&&!actions.grabbing?(flip?.20:.12+takeoff*.18):0;
   for(let i=0;i<legs.length;i++){
    const back=i===1,side=back?-1:1;
    const pushing=back&&pose.pushing;
    const foot=v(pushing?-.23:.015,.45+lift,side*.43);
    if(pushing){foot.y=.17+(pose.recovery||0)*.29;foot.z=-.32-travel*(.18*(pose.contact||0)-.20*(pose.recovery||0))}
    solve(legs[i].n,foot,v(.8,.8,side*.50));orient(legs[i].n[2],footRotations[i]);
   }
   const balance=actions.grinding?.78:air?.60:.39;
   const swing=pose.pushing?(pose.contact||0)*.23-(pose.recovery||0)*.15:0;
   const targets=[v(.12+swing,1.25-crouch,balance),v(.08-swing,1.25-crouch,-balance)];
   if(actions.grabbing){
    // Grip is attached to the actual moving deck, including a simultaneous flip.
    targets[1]=options.board?B.Vector3.TransformCoordinates(B.Vector3.TransformCoordinates(v(.23,.30,-.15),options.board.computeWorldMatrix(true)),B.Matrix.Invert(parent.computeWorldMatrix(true))):v(.23,.30,-.15);
   }
   for(let i=0;i<arms.length;i++)solve(arms[i].n,targets[i],v(.65,1.0-crouch,i===0?.6:-.6));
   status.feet=legs.map(l=>localPosition(l.n[2]).asArray());status.hands=arms.map(l=>localPosition(l.n[2]).asArray());
   status.grip=actions.grabbing?targets[1].asArray():null;
  }
  update({grounded:true,speed:0},{crouch:0});
  for(const mesh of meshes){mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;options.shadow?.addShadowCaster(mesh)}
  // Visibility, not setEnabled: legacy animation still toggles arm nodes.
  const oldVisibility=legacyMeshes.map(m=>m.isVisible);
  for(const mesh of legacyMeshes)mesh.isVisible=false;
  return {root:rig,update,status,meshes,skeletons:container.skeletons,animationNames:['idle','ride','push','crouch','ollie','air','flip','grab','grind','landing'],dispose(){legacyMeshes.forEach((m,i)=>m.isVisible=oldVisibility[i]);container.dispose();rig.dispose()}};
 }catch(error){container.dispose();rig?.dispose();throw error}
}
root.SOLRiggedSkater={attach,DEFAULT_URL};
})(typeof window!=='undefined'?window:globalThis);
