const assert=require('node:assert/strict'),fs=require('node:fs'),B=require('babylonjs');
require('babylonjs-loaders');require('../hoodie_skater.js');
(async()=>{
 const engine=new B.NullEngine(),scene=new B.Scene(engine),parent=new B.TransformNode('stance',scene);
 const fallback=B.MeshBuilder.CreateBox('V2 fallback',{},scene);fallback.parent=parent;
 const url='data:;base64,'+fs.readFileSync('assets/quaternius-hoodie/hoodie-character.glb').toString('base64');
 const rig=await SOLHoodieSkater.attach(B,scene,parent,[fallback],{url});
 assert.equal(rig.status.bones,62);assert(rig.meshes.length>=4);assert.equal(fallback.isVisible,false);
 const state={grounded:true,speed:4,travelSign:1},pose={crouch:0};
 rig.update(state,pose);assert.equal(rig.status.mode,'ride');
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
 };
 checkStance();
 const original=JSON.stringify(state);
 parent.position.set(12,4,-18);parent.rotation.set(.4,1.3,-.2);
 rig.update(state,pose);checkStance();
 rig.update(state,{...pose,pushing:true,contact:1});assert.equal(rig.status.mode,'push');assert(rig.status.armPose.counter>.05&&rig.status.armPose.spread>.45,'Pushing needs visible counterbalance');
 assert(rig.status.feet[1][1]<.3,'Push foot must reach ground: '+JSON.stringify({feet:rig.status.feet,legs:rig.status.legGeometry}));
 assert(rig.status.pushLean>.07&&rig.status.pushLean<.09,'Push contact should hinge hips and chest subtly');
 rig.update(state,{...pose,pushing:true,contact:0,recovery:1});
 assert(rig.status.pushLean>.02&&rig.status.pushLean<.03,'Push recovery must relax the upper body');
 rig.update(state,pose);
 assert.equal(rig.status.pushLean,0,'Ordinary riding must not inherit the push hinge');
 rig.update({...state,grounded:false},pose);assert.equal(rig.status.mode,'ollie');assert(rig.status.armPose.lift>.12,'Ollie takeoff must lift arms');
 assert(rig.status.footPose.rearPop>.09&&rig.status.footPose.frontLevel<.01,'Rear foot must initiate ollie pop');
 for(let i=0;i<22;i++)rig.update({...state,grounded:false},pose);
 assert(rig.status.footPose.frontLevel>.04&&rig.status.footPose.rearPop<.01,'Front foot must level after rear pop');
 rig.update({...state,grounded:false,flip:1},pose);assert.equal(rig.status.mode,'flip');
 assert(rig.status.footPose.frontFlick>.08,'Kickflip needs a leading-foot flick');
 rig.update({...state,grounded:false},pose,{grabbing:true});assert.equal(rig.status.mode,'grab');
 const gripDistance=B.Vector3.Distance(B.Vector3.FromArray(rig.status.hands[1]),B.Vector3.FromArray(rig.status.grip));assert(gripDistance<.1,'Hand must reach board: '+JSON.stringify({gripDistance,hands:rig.status.hands,grip:rig.status.grip,feet:rig.status.feet,legGeometry:rig.status.legGeometry}));
 assert(Math.abs(rig.status.grip[2]+.31)<.01,'Grab should reach the near-side deck rail, not across the deck');
 assert(rig.status.feet[0][0]-rig.status.feet[1][0]>.08,
  'Grab should stagger the leading and trailing shoes rather than make a symmetric seated pose');
 assert(rig.status.feet.every(f=>f[1]>.50),
  'Grab should tuck both knees above their neutral riding position');
 assert(Number.isFinite(rig.status.grabReachShift)&&rig.status.grabReachShift<.45,
  'Grab should not translate the chest excessively: '+rig.status.grabReachShift);
 rig.update({...state,grounded:false},pose,{grinding:true});assert.equal(rig.status.mode,'grind');
 rig.update(state,pose);assert.equal(rig.status.mode,'landing');assert(rig.status.armPose.drop>.1&&rig.status.armPose.spread>.6,'Landing needs widened, lowered arms');
 for(let i=0;i<30;i++)rig.update(state,pose);assert.equal(rig.status.mode,'ride');
 assert.equal(JSON.stringify(state),original,'Visuals must not mutate physics');
 assert(scene.animationGroups.every(g=>!g.isPlaying),'Source locomotion clips must stay stopped');
 rig.dispose();assert.equal(fallback.isVisible,true);engine.dispose();
 console.log('PASS adult 62-joint hoodie IK: push, ollie, flip, grab, grind, landing, transformed stance, V2 fallback');
})().catch(e=>{console.error(e);process.exitCode=1});
