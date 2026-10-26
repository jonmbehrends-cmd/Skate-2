/* SOL SKATE — skater stance and push-cycle pose; angles in radians. */
(function(root){'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function pose(state,boost,now,steer){
 const grounded=!!state.grounded&&!state.grinding;
 const pushing=grounded&&!!boost&&!state.onRamp&&state.speed<16;
 const phase=Number.isFinite(state.pushPhase)?state.pushPhase:0;
 const contact=pushing?Math.max(0,Math.sin(phase)):0;
 const recovery=pushing?Math.max(0,-Math.sin(phase)):0;
 const carve=clamp(steer||0,-1,1);
 const crouch=!grounded?.17+Math.min(.12,Math.abs(state.vy||0)*.012):Math.min(.23,Math.abs(carve)*.07+Math.max(0,state.speed||0)*.004+(state.onRamp?Math.max(0,state.pumpIntensity||0)*.14:0));
 return {pushing,contact,recovery,crouch,
   // Body turns 90 degrees from forward-facing to a skateboard stance.
   torsoYaw:Math.PI/2,
   torsoLean:grounded?-.07-contact*.13:-.19,
   frontHip:grounded?.02+crouch*.12:-.06,
   backHip:pushing?-.18-contact*.20+recovery*.12:grounded?.02+crouch*.12:-.06,
   frontKnee:grounded?.10+crouch*.12:.14,
   backKnee:pushing?.12-contact*.12+recovery*.18:grounded?.10+crouch*.12:.14,
   backOffset:pushing?contact*.08:0,
   armSwing:pushing?contact*.42-recovery*.22:Math.sin(now*.008)*.1
 };
}
root.SOLSkater={pose};
})(typeof window!=='undefined'?window:globalThis);
