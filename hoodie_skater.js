/* Quaternius Hoodie Character (CC0). See assets/quaternius-hoodie/SOURCE.md.
 * Gameplay-driven skeletal IK; the source walking clip is deliberately stopped.
 * This module reads gameplay state and never writes physics or input state.
 */
(function(root){'use strict';
const DEFAULT_URL='assets/quaternius-hoodie/hoodie-character.glb';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
async function attach(B,scene,parent,legacyMeshes,options={}){
 if(!B.SceneLoader?.IsPluginForExtensionAvailable('.glb'))throw Error('Babylon glTF plugin is not registered');
 const url=options.url||DEFAULT_URL,cut=url.startsWith('data:')?-1:url.lastIndexOf('/');
 const container=await B.SceneLoader.LoadAssetContainerAsync(url.slice(0,cut+1),url.slice(cut+1),scene,null,'.glb');
 let rig;
 try{
  const meshes=container.meshes.filter(m=>m.getTotalVertices()>0);
  if(!container.skeletons.length||meshes.filter(m=>m.skeleton).length<4)throw Error('Hoodie character missing skinned apparel meshes');
  container.addAllToScene();
  for(const a of container.animationGroups)a.stop();
  rig=new B.TransformNode('rigged skater',scene);
  for(const n of [...container.meshes,...container.transformNodes])if(!n.parent)n.parent=rig;
  const nodes=new Map(container.transformNodes.map(n=>[n.name,n]));
  function joint(name){const n=nodes.get(name);if(!n)throw Error('Missing skater joint: '+name);return n}
  const pelvis=joint('Hips'),spine=joint('Chest');
  const legs=[['L','UpperLeg.L','LowerLeg.L','LowerLeg.L_end'],['R','UpperLeg.R','LowerLeg.R','LowerLeg.R_end']].map(([side,...names])=>({side,n:names.map(joint)}));
  const detachedFeet=[joint('Foot.L'),joint('Foot.R')];
  const arms=[['L','UpperArm.L','LowerArm.L','Wrist.L'],['R','UpperArm.R','LowerArm.R','Wrist.R']].map(([side,...names])=>({side,n:names.map(joint)}));
  // Bounds must be computed with the imported Z_UP and glTF handedness transforms,
  // before attaching to a moving/tilted parent. Never overwrite the base offset.
  for(const n of container.transformNodes)n.computeWorldMatrix(true);
  for(const m of meshes){m.computeWorldMatrix(true);m.refreshBoundingInfo(true)}
  const lo=Math.min(...meshes.map(m=>m.getBoundingInfo().boundingBox.minimumWorld.y));
  const hi=Math.max(...meshes.map(m=>m.getBoundingInfo().boundingBox.maximumWorld.y));
  if(!Number.isFinite(hi-lo)||hi-lo<.1)throw Error('Invalid character bounds');
  const scale=2.05/(hi-lo);
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
  const footRotations=detachedFeet.map(stanceRotation);
  
  function placeDetached(node,target){const inv=B.Matrix.Invert(node.parent.computeWorldMatrix(true));node.position.copyFrom(B.Vector3.TransformCoordinates(world(target),inv));node.computeWorldMatrix(true)}
  function orient(node,q){const pq=B.Quaternion.Identity(),parentQ=B.Quaternion.Identity();node.parent.computeWorldMatrix(true).decompose(undefined,pq);parent.computeWorldMatrix(true).decompose(undefined,parentQ);node.rotationQuaternion=pq.conjugate().multiply(parentQ.multiply(q));node.computeWorldMatrix(true)}
  const status={ready:true,mode:'idle',height:2.05,bones:container.skeletons[0].bones.length,source:DEFAULT_URL,feet:[],hands:[],meshes:meshes.length};
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
   // Keep the grab athletic instead of dropping the entire rider too low;
   // hip/chest lean and arm IK still bring the hand onto the moving deck.
   const crouch=clamp((pose.crouch||0)*.20+landing*.08+takeoff*.06+(actions.grabbing?.27:0),0,.46);
   rig.position.y=.33-lo*scale-.10-crouch-(pose.pushing?.18:0);
   rig.rotation.x=0;rig.rotation.z=0;
   // Bend from the hips during a grab so the shoulder can physically reach
   // the moving deck; leg IK below re-plants both feet after this rotation.
   pelvis.rotationQuaternion=rest.get(pelvis).q.multiply(B.Quaternion.RotationAxis(B.Axis.X,actions.grabbing?-.25:0));
   spine.rotationQuaternion=rest.get(spine).q.multiply(B.Quaternion.RotationAxis(B.Axis.X,actions.grabbing?-.30:0)).multiply(B.Quaternion.RotationAxis(B.Axis.Y,(actions.grabbing?.18:.07)+(pose.contact||0)*.07));
   const travel=state.travelSign===-1?-1:1;
   const lift=air?(flip?.22:actions.grabbing?.10:.15+takeoff*.12):0;
   for(let i=0;i<legs.length;i++){
    const back=i===1,side=back?-1:1;
    const pushing=back&&pose.pushing;
    const foot=v(pushing?-.23:.015,.45+lift,side*.43);
    if(pushing){foot.y=.17+(pose.recovery||0)*.29;foot.z=-.32-travel*(.18*(pose.contact||0)-.20*(pose.recovery||0))}
    solve(legs[i].n,foot,v(.8,.8,side*.50));placeDetached(detachedFeet[i],localPosition(legs[i].n[2]));orient(detachedFeet[i],footRotations[i]);
   }
   // Keep the shoulders active throughout a trick. A skater raises both
   // arms during the pop, counter-swings while pushing, and spreads/drops
   // them to absorb a landing; this is visual-only (no forces or input edits).
   const balance=actions.grinding?.78:air?.60:landing>.05?.64:pose.pushing?.49:.39;
   const swing=pose.pushing?(pose.contact||0)*.25-(pose.recovery||0)*.17:0;
   const armLift=air&&!actions.grabbing?takeoff*.18+(flip?.06:0):0;
   const armDrop=landing*.13;
   const pushCounter=pose.pushing?.10:0;
   const targets=[v(.12+swing,1.25-crouch+armLift-armDrop+pushCounter,balance),
                  v(.08-swing,1.25-crouch+armLift-armDrop-pushCounter,-balance)];
   status.armPose={spread:balance,lift:armLift,drop:armDrop,counter:pushCounter};
   if(actions.grabbing){
    // Grip is attached to the actual moving deck, including a simultaneous flip.
    targets[1]=options.board?B.Vector3.TransformCoordinates(B.Vector3.TransformCoordinates(v(.23,.30,-.15),options.board.computeWorldMatrix(true)),B.Matrix.Invert(parent.computeWorldMatrix(true))):v(.23,.30,-.15);
   }
   if(actions.grabbing){
    // Two-bone IK cannot reach a deck below the shoulder if the torso stays
    // upright. Bring the chest toward the board only by the missing reach,
    // preserving both upper-arm and forearm lengths (no telescoping limbs).
    const chain=arms[1].n,shoulder=localPosition(chain[0]);
    const reach=B.Vector3.Distance(shoulder,localPosition(chain[1]))+
      B.Vector3.Distance(localPosition(chain[1]),localPosition(chain[2]));
    const delta=targets[1].subtract(shoulder),distance=delta.length();
    const shortfall=Math.max(0,distance-reach+.055);
    if(shortfall>0&&distance>.0001){
     const shiftWorld=B.Vector3.TransformNormal(delta.scale(shortfall/distance),parent.computeWorldMatrix(true));
     const shiftLocal=B.Vector3.TransformNormal(shiftWorld,B.Matrix.Invert(spine.parent.computeWorldMatrix(true)));
     spine.position.addInPlace(shiftLocal);spine.computeWorldMatrix(true);
    }
   }
   for(let i=0;i<arms.length;i++)solve(arms[i].n,targets[i],v(.65,1.0-crouch,i===0?.6:-.6));
   status.feet=legs.map(l=>localPosition(l.n[2]).asArray());status.hands=arms.map(l=>localPosition(l.n[2]).asArray());
   status.legGeometry=legs.map(l=>{const p=l.n.map(localPosition);return {hip:p[0].asArray(),knee:p[1].asArray(),foot:p[2].asArray(),upper:B.Vector3.Distance(p[0],p[1]),lower:B.Vector3.Distance(p[1],p[2])}});
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
root.SOLHoodieSkater={attach,DEFAULT_URL};
})(typeof window!=='undefined'?window:globalThis);
