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
  const toeEnds=[joint('Foot.L_end'),joint('Foot.R_end')];
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
  // The source GLB has different bind-pose shoe yaw on left and right.
  // Correct yaw only in board/stance space: a full 3D toe alignment also
  // tilts the sole, which makes one shoe appear to float above the grip.
  // The board runs along Z; both toes should point across it (+X).
  const deckFootRotations=detachedFeet.map((foot,i)=>{
   const toe=localPosition(toeEnds[i]).subtract(localPosition(foot));
   // Babylon's imported foot bind orientation reverses the apparent toe axis
   // when reparented into the stance frame; rotate by a half turn so the
   // *rendered* toe joints point toward +X rather than -X.
   const yaw=Math.atan2(toe.z,toe.x)+Math.PI;
   return B.Quaternion.RotationAxis(B.Axis.Y,yaw).multiply(footRotations[i]);
  });
  
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
   // A PUSH input may overlap takeoff for one frame. Never pin the trailing
   // shoe to pavement or keep push counterbalance once the board is airborne.
   const pushingNow=!!pose.pushing&&!!state.grounded&&!actions.grinding;
   const mode=actions.grinding?'grind':actions.grabbing?'grab':flip?'flip':air&&takeoff>.05?'ollie':air?'air':landing>.05?'landing':pushingNow?'push':(pose.crouch||0)>.1?'crouch':Math.abs(state.speed)>1?'ride':'idle';
   status.mode=mode;
   for(const [n,r] of rest){n.position.copyFrom(r.p);n.rotationQuaternion=r.q.clone()}
   // Airborne grabs need clearance under the hips and visibly tucked knees.
   // Do not lower the pelvis all the way to the deck: that made the hoodie
   // appear seated even though the wrist was precisely on its IK target.
   // Absorb impact through both knees rather than landing stiff-legged. The
   // landing pulse is visual-only and decays to neutral riding in ~0.2s.
   const landingCompression=landing*.15;
   status.landingCompression=landingCompression;
   // A rider at cruising speed keeps soft knees rather than locking upright.
   // This small, bounded skin-only compression never affects deck contact,
   // pushing, tricks, grinds or the landing recovery animation.
   const athleticCompression=state.grounded&&!actions.grinding&&!pushingNow&&landing<=.05?
    clamp(Math.abs(state.speed||0)/7,0,1)*.045:0;
   status.athleticCompression=athleticCompression;
   const crouch=clamp((pose.crouch||0)*.20+landingCompression+athleticCompression+takeoff*.06+(actions.grabbing?.38:0)+(actions.grinding?.12:0),0,.78);
   // Settle the pelvis into an athletic, knee-flexed stance instead of a
   // locked-knee upright pose. Feet remain IK-planted on the deck.
   // The ground-reaching push shoe sits below the deck. Compress the hips
   // during contact so the fixed-length leg can actually reach pavement;
   // recover gradually as the shoe swings back, without stretching bones.
   // A deep pelvis drop makes the planted knee rise into a high-step pose.
    // Reduce only the visual push compression while preserving the rear
    // pavement target, stroke timing, fixed limb lengths and board physics.
    const pushCompression=pushingNow?.15+.22*clamp(pose.contact||0,0,1)+.09*clamp(pose.recovery||0,0,1):0;
   status.pushCompression=pushCompression;
   rig.position.y=.33-lo*scale-.16-crouch-pushCompression;
   // Babylon may cache ancestor matrices between consecutive gameplay poses.
   // Refresh the scaled rig root before solving world-space IK targets.
   rig.computeWorldMatrix(true);
   rig.rotation.x=0;rig.rotation.z=0;
   // Bend from the hips during a grab so the shoulder can physically reach
   // the moving deck; leg IK below re-plants both feet after this rotation.
   // A grounded push needs a small forward hip hinge and chest counterbalance.
   // Drive both from the actual contact/recovery phase, not the board's speed:
   // this keeps riding, ollies and landings neutral without touching physics.
   const pushLean=pushingNow?
    clamp((pose.contact||0)*.075+(pose.recovery||0)*.025,0,.085):0;
   status.pushLean=pushLean;
   status.pushingNow=pushingNow;
   const landingHinge=landing*.085;
   status.landingHinge=landingHinge;
   const travel=state.travelSign===-1?-1:1;
   // A 50-50 grind is not a rigid, upright statue: weight shifts across the
   // trucks while the upper body counterbalances. Rotate the actual GLB
   // pelvis/chest in the board's lateral plane, without moving either shoe,
   // changing the board transform, or applying forces to the simulation.
   // Reverse the balance for fakie; return to neutral immediately on exit.
   const grindLean=actions.grinding?travel*.085:0;
   status.grindLean=grindLean;
   pelvis.rotationQuaternion=rest.get(pelvis).q
    .multiply(B.Quaternion.RotationAxis(B.Axis.X,actions.grabbing?-.38:actions.grinding?.07:landingHinge-pushLean*.5))
    .multiply(B.Quaternion.RotationAxis(B.Axis.Z,grindLean));
   spine.rotationQuaternion=rest.get(spine).q
    .multiply(B.Quaternion.RotationAxis(B.Axis.X,actions.grabbing?-.18:actions.grinding?-.05:-landingHinge*.4-pushLean))
    .multiply(B.Quaternion.RotationAxis(B.Axis.Y,(actions.grabbing?.18:.07)+(pushingNow?(pose.contact||0)*.07:0)))
    .multiply(B.Quaternion.RotationAxis(B.Axis.Z,-grindLean*.4));
   // Unlike an ollie, a shallow transition vert air carries the whole board
   // with both soles. Avoid the ordinary 12-27cm ollie-foot separation that
   // makes the skater visibly float above the board immediately at takeoff.
   // Deep vert, grabs, flips, grinds, pushing and all physics are unchanged.
   const shallowVertAir=air&&!!state.bowlAir?.shallow;
   const lift=air?(shallowVertAir?.02:flip?.22:actions.grabbing?.12:.15+takeoff*.12):0;
   // Ollie pop starts at the tail: the rear knee tucks first, then the front
   // knee levels the board. A kickflip briefly flicks the leading shoe out.
   // These are skin-only targets and never change deck rotation or collision.
   const rearPop=air&&!shallowVertAir&&!actions.grabbing&&!flip?takeoff*.11:0;
   const frontLevel=air&&!shallowVertAir&&!actions.grabbing&&!flip?(1-takeoff)*.05:0;
   const frontFlick=flip&&!actions.grabbing?.085:0;
   status.footPose={rearPop,frontLevel,frontFlick};
   for(let i=0;i<legs.length;i++){
    const back=i===1,side=back?-1:1;
    const pushing=back&&pushingNow;
    // The existing physics push phase also drives the shoe's visual stroke:
    // step down, push on pavement, then lift and replant on the deck. The
    // last quarter stays planted so the phase wrap cannot pop the shoe back
    // down. Legacy callers without a phase retain contact/recovery fallback.
    const phase=pushing&&Number.isFinite(pose.pushPhase)?
     ((pose.pushPhase%(2*Math.PI))+2*Math.PI)%(2*Math.PI):null;
    // Ease the planting and lift-off velocity to zero at the stroke edges.
    // Linear ramps used to snap the shoe into a pavement hold and back onto
    // the grip; smoothstep preserves the same contact window and foot limits.
    const smoothStep=t=>{const u=clamp(t,0,1);return u*u*(3-2*u)};
    const groundStroke=!pushing?0:phase===null?
     1-clamp(pose.recovery||0,0,1):phase<=Math.PI?
     smoothStep(phase/(Math.PI/3)):
     1-smoothStep((phase-Math.PI)/(Math.PI*.5));
    const foot=v(pushing?.015-.245*groundStroke:.015,
      .45+lift+(back?rearPop:frontLevel),side*.36+(back?0:frontFlick));
    if(pushing){
     foot.y=.45-.28*groundStroke;
     foot.z=-.36-travel*.14*clamp(pose.contact||0,0,1)*groundStroke;
    }
    // During the airborne return stroke, lift the pushing shoe's toes
    // briefly before planting the sole flat on the grip again. The roll
    // eases to zero at both ends of recovery, and never affects contact,
    // cruising, fakie stance, ollies or the board's physics transform.
    const recoveryProgress=phase===null?0:(phase-Math.PI)*2;
    const recoverySin=pushing&&phase>Math.PI&&phase<Math.PI*1.5?
     Math.sin(recoveryProgress):0;
    const footRoll=.14*recoverySin*recoverySin;
    if(back)status.pushFootRoll=footRoll;
    // The imported GLB toe axis is reversed under its bind-pose parent,
    // so a negative stance-space Z rotation raises the rendered toes.
    // A kickflip rolls the leading ankle off the deck early in the flight;
    // a heelflip rolls it the other way. Ease both back to a flat sole before
    // landing. The trailing shoe and every grounded stance stay unchanged.
    // This is a skinned-ankle motion only, not a board rotation or physics edit.
    const flipFootPitch=flip&&!actions.grabbing&&!back?
     Math.sign(state.flip)*.16*Math.sin(Math.PI*clamp((state.airTime||0)/.42,0,1)):0;
    if(!back)status.flipFootPitch=flipFootPitch;
    const shoeRotation=footRoll||flipFootPitch?
     B.Quaternion.RotationAxis(B.Axis.Z,flipFootPitch-footRoll).multiply(deckFootRotations[i]):
     deckFootRotations[i];
    // During pavement contact the rear knee should track behind the hip,
    // rather than jut forward across the nose of the skateboard. Change only
    // the visual IK bend plane: ankle targets, fixed limb lengths, physics,
    // board transform and ordinary ride/air/grind poles stay untouched.
    // Fade the bend plane back to the ordinary deck stance during recovery;
    // otherwise releasing PUSH would snap the knee even though the ankle is
    // already replanted. groundStroke is eased and continuous at phase wrap.
    // On an airborne grab bend both knees inward toward the deck rather than
    // lifting them above the chest or splaying into a wide seated squat.
    // The two-bone solver still preserves imported limb lengths.
    const kneePole=pushing?
     B.Vector3.Lerp(v(.8,.65,side*.50),v(.36,.65,-.82),groundStroke):
     actions.grabbing?v(.34,.76,side*.26):v(.8,.65,side*.50);
    solve(legs[i].n,foot,kneePole);
    placeDetached(detachedFeet[i],localPosition(legs[i].n[2]));
    orient(detachedFeet[i],shoeRotation);
   }
   // Keep the shoulders active throughout a trick. A skater raises both
   // arms during the pop, counter-swings while pushing, and spreads/drops
   // them to absorb a landing; this is visual-only (no forces or input edits).
   const balance=actions.grinding?.78:air?.60:landing>.05?.64:pushingNow?.49:.39;
   const swing=pushingNow?(pose.contact||0)*.25-(pose.recovery||0)*.17:0;
   const armLift=air&&!actions.grabbing?takeoff*.18+(flip?.06:0):0;
   const armDrop=landing*.20;
   const pushCounter=pushingNow?.10:0;
   // Counter-rotate the arms across the rail during a 50-50 grind. This is
   // skeletal balance only: the board's grind collision and forces are unchanged.
   const grindCounter=actions.grinding?travel*.09:0;
   const targets=[v(.12+swing,1.25-crouch+armLift-armDrop+pushCounter+grindCounter,balance),
                  v(.08-swing,1.25-crouch+armLift-armDrop-pushCounter-grindCounter,-balance)];
   status.armPose={spread:balance,lift:armLift,drop:armDrop,counter:pushCounter,grindCounter};
   if(actions.grabbing){
    // Grip the near-side deck rail, rather than reaching across the middle;
    // the hand tracks the moving board even during a simultaneous flip.
    // The grab wrist stays 10 cm above the deck-top rail so fingers can touch without wrist penetration.
    // This improves clearance and shortens reach without
    // stretching arms or moving the board/physics body.
    targets[1]=options.board?B.Vector3.TransformCoordinates(B.Vector3.TransformCoordinates(v(.24,.55,-.31),options.board.computeWorldMatrix(true)),B.Matrix.Invert(parent.computeWorldMatrix(true))):v(.24,.55,-.31);
   }
   let grabReachShift=0;
   if(actions.grabbing){
    // Two-bone IK cannot reach a deck below the shoulder if the torso stays
    // upright. Bring the chest toward the board only by the missing reach,
    // preserving both upper-arm and forearm lengths (no telescoping limbs).
    const chain=arms[1].n,shoulder=localPosition(chain[0]);
    const reach=B.Vector3.Distance(shoulder,localPosition(chain[1]))+
      B.Vector3.Distance(localPosition(chain[1]),localPosition(chain[2]));
    const delta=targets[1].subtract(shoulder),distance=delta.length();
    const shortfall=Math.max(0,distance-reach+.055);
    grabReachShift=shortfall;
    if(shortfall>0&&distance>.0001){
     const shiftWorld=B.Vector3.TransformNormal(delta.scale(shortfall/distance),parent.computeWorldMatrix(true));
     const shiftLocal=B.Vector3.TransformNormal(shiftWorld,B.Matrix.Invert(spine.parent.computeWorldMatrix(true)));
     spine.position.addInPlace(shiftLocal);spine.computeWorldMatrix(true);
    }
   }
   for(let i=0;i<arms.length;i++)solve(arms[i].n,targets[i],v(.65,1.0-crouch,i===0?.6:-.6));
   status.feet=legs.map(l=>localPosition(l.n[2]).asArray());status.hands=arms.map(l=>localPosition(l.n[2]).asArray());
   status.toeDirections=detachedFeet.map((foot,i)=>localPosition(toeEnds[i]).subtract(localPosition(foot)).normalize().asArray());
   status.legGeometry=legs.map(l=>{const p=l.n.map(localPosition);return {hip:p[0].asArray(),knee:p[1].asArray(),foot:p[2].asArray(),upper:B.Vector3.Distance(p[0],p[1]),lower:B.Vector3.Distance(p[1],p[2])}});
   status.grip=actions.grabbing?targets[1].asArray():null;
   status.grabReachShift=grabReachShift;
   status.grabAnatomy=actions.grabbing?{
    hipClearance:Math.min(...status.legGeometry.map(g=>g.hip[1]-g.foot[1])),
    kneeLift:Math.min(...status.legGeometry.map(g=>g.knee[1]-g.hip[1])),
    chestAboveHip:localPosition(spine).y-localPosition(pelvis).y,
    reachShift:grabReachShift
   }:null;
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
