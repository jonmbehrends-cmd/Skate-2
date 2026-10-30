const assert=require('node:assert/strict'),fs=require('node:fs'),B=require('babylonjs');
require('babylonjs-loaders');require('../hoodie_skater.js');
(async()=>{
 const engine=new B.NullEngine(),scene=new B.Scene(engine),parent=new B.TransformNode('stance',scene);
 const fallback=B.MeshBuilder.CreateBox('V2 fallback',{},scene);fallback.parent=parent;
 // Production passes a live board pivot. Exercise that path, not only the
 // static fallback grip target, so board pitch/yaw cannot detach the hand.
 const board=new B.TransformNode('live board pivot',scene);board.parent=parent;
 const url='data:;base64,'+fs.readFileSync('assets/quaternius-hoodie/hoodie-character.glb').toString('base64');
 const rig=await SOLHoodieSkater.attach(B,scene,parent,[fallback],{url,board});
 assert.equal(rig.status.bones,62);assert(rig.meshes.length>=4);assert.equal(fallback.isVisible,false);
 const state={grounded:true,speed:4,travelSign:1},pose={crouch:0};
 rig.update(state,pose);assert.equal(rig.status.mode,'ride');
 assert(rig.status.athleticCompression>.02&&rig.status.athleticCompression<.045,
  'Cruising stance should soften the knees without excessive crouch');
 rig.update({...state,speed:0},pose);
 assert.equal(rig.status.athleticCompression,0,'Idle stance must not inherit cruising compression');
 rig.update(state,pose);
 // Both shoes should sit within the deck, with knees flexed instead of a
 // wide, straight-legged split. Check board-local coordinates before and
 // after the parent is moved and banked.
 const checkStance=()=>{
  const feet=rig.status.feet;
  assert(feet.every(f=>Math.abs(f[1]-.45)<.035),'Ride shoes must stay on deck');
  assert(Math.abs(feet[0][2]-.36)<.035&&Math.abs(feet[1][2]+.36)<.035,
   'Ride stance must stay centered and narrower than the old .86m split');
  assert(rig.status.legGeometry.every(g=>Number.isFinite(g.upper)&&Number.isFinite(g.lower)),
   'Leg IK must retain finite anatomical segment lengths');
  // Check the actual GLB toe joints, not just ankle IK: a correctly planted
  // ankle can still leave a shoe rotated lengthwise off the board.
  assert(rig.status.toeDirections?.length===2&&rig.status.toeDirections.every(t=>t[0]>.95&&Math.abs(t[1])<.1&&Math.abs(t[2])<.18),
   'Both shoe toes must point across the deck with level soles: '+JSON.stringify(rig.status.toeDirections));
 };
 checkStance();
 const original=JSON.stringify(state);
 parent.position.set(12,4,-18);parent.rotation.set(.4,1.3,-.2);
 rig.update(state,pose);checkStance();
 rig.update(state,{...pose,pushing:true,contact:1});assert.equal(rig.status.mode,'push');assert(rig.status.armPose.counter>.05&&rig.status.armPose.spread>.45,'Pushing needs visible counterbalance');
 assert(rig.status.feet[1][1]<.3,'Push foot must reach ground: '+JSON.stringify({feet:rig.status.feet,legs:rig.status.legGeometry}));
  assert(rig.status.pushCompression<=.38&&rig.status.pushCompression>=.36,
   'Supporting knee should avoid the previous excessive .43m pelvis drop during PUSH');
 // A realistic push extends the trailing knee aft rather than folding it
 // across the board nose. Inspect the actual imported GLB knee joint in
 // stance-local coordinates, not merely the ankle's pavement target.
 const pushRear=rig.status.legGeometry[1];
 assert(pushRear.knee[0]-pushRear.hip[0]<.12&&pushRear.knee[2]-pushRear.hip[2]<-.34,
  'Grounded PUSH knee must track aft without jutting across the nose: '+JSON.stringify(pushRear));

 assert(rig.status.pushLean>.07&&rig.status.pushLean<.09,'Push contact should hinge hips and chest subtly');
 rig.update(state,{...pose,pushing:true,contact:0,recovery:1});
 assert(rig.status.pushLean>.02&&rig.status.pushLean<.03,'Push recovery must relax the upper body');
 const recovered=rig.status.feet[1];
 assert(Math.abs(recovered[0]-.015)<.035&&Math.abs(recovered[1]-.45)<.035&&Math.abs(recovered[2]+.36)<.035,
  'Recovery shoe must replant on its normal deck position before PUSH releases: '+JSON.stringify(recovered));
 rig.update(state,pose);
 const released=rig.status.feet[1];
 assert(B.Vector3.Distance(B.Vector3.FromArray(recovered),B.Vector3.FromArray(released))<.04,
  'Releasing PUSH after recovery must not snap the trailing foot across the deck');
 const phaseFoot=phase=>{
  rig.update(state,{...pose,pushing:true,pushPhase:phase,
   contact:Math.max(0,Math.sin(phase)),recovery:Math.max(0,-Math.sin(phase))});
  return B.Vector3.FromArray(rig.status.feet[1]);
 };
 const phaseStart=phaseFoot(0),phaseContact=phaseFoot(Math.PI/2);
 assert.equal(rig.status.pushFootRoll,0,'Pavement-contact shoe must stay flat');
 const phaseRecovery=phaseFoot(Math.PI*1.25);
 assert(phaseRecovery.y>.26&&phaseRecovery.y<.4,'Toe roll should occur while the shoe is lifting off pavement');
 assert(rig.status.pushFootRoll>.12&&rig.status.pushFootRoll<.15,
  'Return stroke must briefly roll the pushing shoe upward');
 assert(rig.status.toeDirections[1][1]>.1&&rig.status.toeDirections[1][0]>.9,
  'Actual GLB toe joints must lift in the recovery stroke without twisting sideways: '+JSON.stringify(rig.status.toeDirections));
 const phaseEnd=phaseFoot(2*Math.PI-.001);
 assert.equal(rig.status.pushFootRoll,0,'Push recovery must replant a flat sole before the phase wraps');
 assert(Math.abs(rig.status.toeDirections[1][1])<.1,'Replanted shoe must be level with the grip');
 // The trailing shoe must enter/leave pavement contact without the sharp
 // velocity corner of the former piecewise-linear stroke.
 const early=phaseFoot(.01);
 assert(B.Vector3.Distance(phaseStart,early)<.001,
  'Push shoe must ease out of its planted deck position');
 for(const seam of [Math.PI/3,Math.PI,Math.PI*1.5]){
  const before=phaseFoot(seam-.001),after=phaseFoot(seam+.001);
  assert(B.Vector3.Distance(before,after)<.005,
   'Push contact/recovery must remain continuous at phase '+seam);
 }
 assert(B.Vector3.Distance(phaseFoot(2*Math.PI-.001),phaseFoot(0))<.005,
  'Push phase wrap must not introduce an ankle jump');
 assert(phaseContact.y<.25,'Contact half-cycle must lower trailing shoe to pavement');
 assert(Math.abs(phaseStart.y-.45)<.035&&Math.abs(phaseEnd.y-.45)<.035,
  'Both sides of push-cycle wrap must have planted deck foot');
 assert(B.Vector3.Distance(phaseStart,phaseEnd)<.04,
  'Push-cycle phase wrap must not snap the shoe off the deck');
 // The knee bend plane must ease back to normal before the planted foot
 // completes recovery. A visually better contact pose is not acceptable if
 // the knee snaps at the next stroke or when the PUSH animation loops.
 const phaseKnee=phase=>{
  phaseFoot(phase);
  return B.Vector3.FromArray(rig.status.legGeometry[1].knee);
 };
 assert(B.Vector3.Distance(phaseKnee(2*Math.PI-.001),phaseKnee(0))<.008,
  'Push knee must remain continuous when the stroke wraps');
 for(const seam of [Math.PI/3,Math.PI,Math.PI*1.5]){
  assert(B.Vector3.Distance(phaseKnee(seam-.001),phaseKnee(seam+.001))<.008,
   'Push knee must not snap at contact/recovery seam '+seam);
 }
 rig.update(state,pose);
 assert.equal(rig.status.pushLean,0,'Ordinary riding must not inherit the push hinge');
 // A still-held PUSH input during takeoff must not leave the back foot on
 // the ground, or carry the push crouch/lean into the airborne trick.
 rig.update({...state,grounded:false},{...pose,pushing:true,contact:1});
 assert.equal(rig.status.mode,'ollie');
 assert.equal(rig.status.pushingNow,false);
 assert.equal(rig.status.pushCompression,0);
 assert.equal(rig.status.pushLean,0);
 assert.equal(rig.status.armPose.counter,0);
 assert(rig.status.feet[1][1]>.45,'Airborne trailing shoe must leave pavement even when PUSH remains held');
 rig.update({...state,grounded:false},pose);assert.equal(rig.status.mode,'ollie');assert(rig.status.armPose.lift>.12,'Ollie takeoff must lift arms');
 assert(rig.status.footPose.rearPop>.09&&rig.status.footPose.frontLevel<.01,'Rear foot must initiate ollie pop');
 for(let i=0;i<22;i++)rig.update({...state,grounded:false},pose);
 assert(rig.status.footPose.frontLevel>.04&&rig.status.footPose.rearPop<.01,'Front foot must level after rear pop');

// A shallow transition launch is not an ollie: both feet must stay within
// 4 cm of the actual deck stance while the board rises with the skater.
// This is visual-only; preserve standard ollie pop and grind behavior.
 rig.update({...state,grounded:false,bowlAir:{newberg:true,shallow:true}},pose);
 assert(rig.status.feet.every(f=>Math.abs(f[1]-.47)<.04),
  'Shallow vert shoes must stay with the deck: '+JSON.stringify(rig.status.feet));
 assert.equal(rig.status.footPose.rearPop,0,'Shallow vert should not play ollie tail-foot lift');
 assert.equal(rig.status.footPose.frontLevel,0,'Shallow vert should not play ollie front-foot flick');

 rig.update({...state,grounded:false,flip:1,airTime:0},pose);
 assert.equal(rig.status.flipFootPitch,0,'Flip ankle starts neutral at takeoff');
 rig.update({...state,grounded:false,flip:1,airTime:.21},pose);assert.equal(rig.status.mode,'flip');
 assert(rig.status.footPose.frontFlick>.08,'Kickflip needs a leading-foot flick');
 assert(rig.status.flipFootPitch>.15&&rig.status.flipFootPitch<.17,
  'Kickflip must roll the leading ankle during the early airborne flick');
 assert(rig.status.toeDirections[0][1]<-.08,
  'Actual GLB leading toes must flick down on kickflip: '+JSON.stringify(rig.status.toeDirections));
 assert(Math.abs(rig.status.toeDirections[1][1])<.1,
  'Trailing shoe must remain level during a kickflip');
 rig.update({...state,grounded:false,flip:-1,airTime:.21},pose);
 assert(rig.status.flipFootPitch<-.15&&rig.status.toeDirections[0][1]>.08,
  'Heelflip must roll the real leading ankle in the opposite direction');
 rig.update({...state,grounded:false,flip:1,airTime:.42},pose);
 assert(Math.abs(rig.status.flipFootPitch)<.001&&Math.abs(rig.status.toeDirections[0][1])<.1,
  'Flip ankle must settle flat before landing');
 rig.update({...state,grounded:false},pose,{grabbing:true});assert.equal(rig.status.mode,'grab');
 const gripDistance=B.Vector3.Distance(B.Vector3.FromArray(rig.status.hands[1]),B.Vector3.FromArray(rig.status.grip));assert(gripDistance<.1,'Hand must reach board: '+JSON.stringify({gripDistance,hands:rig.status.hands,grip:rig.status.grip,feet:rig.status.feet,legGeometry:rig.status.legGeometry}));
 assert(Math.abs(rig.status.grip[2]+.31)<.01&&Math.abs(rig.status.grip[0]-.24)<.01&&Math.abs(rig.status.grip[1]-.55)<.01,
  'Grab wrist must hover above deck-top side rail for finger contact without deck penetration');
 const grabAnatomy=rig.status.grabAnatomy;
 assert(grabAnatomy&&Object.values(grabAnatomy).every(Number.isFinite),
  'Grab must expose actual imported joint measurements');
 assert(grabAnatomy.hipClearance>.20,
  'Airborne grab hips must clear both planted shoes instead of sitting on the deck: '+JSON.stringify(grabAnatomy));
 assert(Number.isFinite(rig.status.grabReachShift)&&rig.status.grabReachShift<.45,
  'Grab should not translate the chest excessively: '+rig.status.grabReachShift);
 // Rotate and offset the actual board relative to the skater's stance while
 // the whole stance is banked in world space. The grip must follow the deck
 // through the real board-pivot transform and the hand IK must still reach.
 board.position.set(.08,.04,-.03);
 board.rotationQuaternion=B.Quaternion.FromEulerAngles(.16,.12,-.11);
 const boardPoseBefore=JSON.stringify({p:board.position.asArray(),q:board.rotationQuaternion.asArray()});
 rig.update({...state,grounded:false,travelSign:-1},pose,{grabbing:true});
 const expectedGrip=B.Vector3.TransformCoordinates(
  B.Vector3.TransformCoordinates(new B.Vector3(.24,.55,-.31),board.computeWorldMatrix(true)),
  B.Matrix.Invert(parent.computeWorldMatrix(true)));
 assert(B.Vector3.Distance(B.Vector3.FromArray(rig.status.grip),expectedGrip)<.002,
  'Grab target must track the pitched, yawed, offset board pivot in stance space');
 assert(B.Vector3.Distance(B.Vector3.FromArray(rig.status.hands[1]),expectedGrip)<.1,
  'Actual hoodie wrist must follow the tilted deck rail during fakie grab');
 assert.equal(JSON.stringify({p:board.position.asArray(),q:board.rotationQuaternion.asArray()}),boardPoseBefore,
  'Skin-only grab solver must not write board transforms');
 board.position.set(0,0,0);board.rotationQuaternion=B.Quaternion.Identity();
 rig.update({...state,grounded:false},pose,{grinding:true});assert.equal(rig.status.mode,'grind');
 assert(rig.status.armPose.grindCounter>.08,'Forward 50-50 grind needs asymmetric arm balance');
 assert(rig.status.armPose.spread>.75,'Grind arms should spread for lateral stability');
 assert(rig.status.grindLean>.08&&rig.status.grindLean<.09,
  'Forward grind should lean hips across the trucks without excessive tilt');
 assert(rig.status.feet.every(f=>Math.abs(f[1]-.45)<.035),'Grind shoes must remain planted on deck');
 assert.equal(rig.status.pushLean,0,'Grind must not inherit the grounded push hinge');
 rig.update({...state,grounded:false,travelSign:-1},pose,{grinding:true});
 assert(rig.status.armPose.grindCounter<-.08,'Fakie grind must reverse arm counterbalance');
 assert(rig.status.grindLean<-.08&&rig.status.grindLean>-.09,
  'Fakie grind must reverse the hip lean, not invert the controls');
 assert(rig.status.feet.every(f=>Math.abs(f[1]-.45)<.035),'Fakie grind must keep both shoes planted');
 rig.update(state,pose);assert.equal(rig.status.mode,'landing');
 assert.equal(rig.status.grindLean,0,'Grind balance must reset immediately on landing');
 assert(rig.status.landingCompression>.14&&rig.status.landingHinge>.08,
  'Landing should visibly absorb impact through knees and hips');
 assert(rig.status.armPose.drop>.19&&rig.status.armPose.spread>.6,
  'Landing needs widened, lowered arms to recover balance');
 assert(rig.status.feet.every(f=>Math.abs(f[1]-.45)<.035),
  'Landing must keep both shoes on the deck');
 for(let i=0;i<30;i++)rig.update(state,pose);assert.equal(rig.status.mode,'ride');
 assert.equal(rig.status.landingCompression,0,'Landing knee compression must fully recover');
 assert.equal(rig.status.landingHinge,0,'Landing hip hinge must fully recover');
 assert.equal(JSON.stringify(state),original,'Visuals must not mutate physics');
 assert(scene.animationGroups.every(g=>!g.isPlaying),'Source locomotion clips must stay stopped');
 rig.dispose();assert.equal(fallback.isVisible,true);engine.dispose();
 console.log('PASS adult 62-joint hoodie IK: push, ollie, flip, grab, grind, landing, transformed stance, V2 fallback');
})().catch(e=>{console.error(e);process.exitCode=1});
