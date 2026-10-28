const assert=require('node:assert/strict'),fs=require('fs'),B=require('babylonjs');require('babylonjs-loaders');require('../rigged_skater.js');
(async()=>{
 const engine=new B.NullEngine(),scene=new B.Scene(engine),parent=new B.TransformNode('stance',scene);
 const legacy=B.MeshBuilder.CreateBox('fallback',{},scene);legacy.parent=parent;
 const url='data:;base64,'+fs.readFileSync('assets/cesium-man/CesiumMan.glb').toString('base64');
 const rig=await SOLRiggedSkater.attach(B,scene,parent,[legacy],{url});
 assert.equal(legacy.isVisible,false);assert.equal(rig.status.bones,19);
 const state={grounded:true,speed:4,travelSign:1},pose={crouch:.02};
 rig.update(state,pose);assert.equal(rig.status.mode,'ride');
 const checkFeet=()=>rig.status.feet.forEach((f,i)=>{assert(Math.abs(f[1]-.45)<.025,JSON.stringify(f));assert(Math.abs(f[2]-(i?-.43:.43))<.025)});
 checkFeet();
 // Repeat with translated, yawed and banked world-space parents: IK targets must
 // remain local to the board, not to the park origin.
 parent.position.set(21,7,-65);parent.rotation.set(.8,2.3,-.2);rig.update(state,pose);checkFeet();
 const original=JSON.stringify(state);
 rig.update(state,{...pose,pushing:true,contact:1});assert.equal(rig.status.mode,'push');assert(rig.status.feet[1][1]<.25,'Pushing foot must reach pavement');
 rig.update({...state,travelSign:-1},{...pose,pushing:true,contact:1});assert(rig.status.feet[1][2]>-.43,'Fakie push reverses sweep');
 rig.update({...state,grounded:false},pose);assert.equal(rig.status.mode,'ollie','Takeoff must drive a distinct ollie pose');assert(rig.status.feet.every(f=>f[1]>.65),'Ollie feet should tuck above planted stance');
 rig.update({...state,grounded:false,flip:1},pose);assert.equal(rig.status.mode,'flip');assert(rig.status.feet.every(f=>f[1]>.6));
 rig.update({...state,grounded:false}, {...pose,crouch:.2},{grabbing:true});assert.equal(rig.status.mode,'grab');assert(B.Vector3.Distance(B.Vector3.FromArray(rig.status.hands[1]),B.Vector3.FromArray(rig.status.grip))<.08,'Grab hand must touch the deck');
 rig.update({...state,grounded:false},pose,{grinding:true});assert.equal(rig.status.mode,'grind');checkFeet();
 rig.update(state,pose);assert.equal(rig.status.mode,'landing');for(let i=0;i<30;i++)rig.update(state,pose);assert.equal(rig.status.mode,'ride');
 assert.equal(JSON.stringify(state),original,'Visual animation must not mutate physics');
 assert(scene.animationGroups.every(g=>!g.isPlaying),'Walking animation must remain stopped');
 for(const bone of rig.skeletons[0].bones)assert(bone.getTransformNode(),'Skin joints must link to posed nodes');
 rig.dispose();assert.equal(legacy.isVisible,true);engine.dispose();console.log('PASS skeletal GLB, proportions, planted feet, transformed stance, push/fakie, ollie, flip, deck grab, grind, landing, cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
