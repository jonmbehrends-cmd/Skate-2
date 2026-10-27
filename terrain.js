/* SOL SKATE — shared analytical surface for visual mesh and wheel contact. */
(function(root){'use strict';
function profile(ramp,t){const u=Math.max(0,Math.min(1,t));if(ramp.curve==='halfpipe-deck')return {height:ramp.h,slope:0};if(ramp.curve==='halfpipe-left'||ramp.curve==='halfpipe-right'){const v=ramp.curve==='halfpipe-left'?1-u:u;const R=(ramp.d*ramp.d+ramp.h*ramp.h)/(2*ramp.h);const q=Math.sqrt(Math.max(.0001,R*R-ramp.d*ramp.d*v*v));return {height:R-q,slope:(ramp.curve==='halfpipe-left'?-1:1)*ramp.d*v/q}}return ramp.curve==='quarter'?{height:ramp.h*u*u,slope:2*ramp.h*u/ramp.d}:{height:ramp.h*u,slope:ramp.h/ramp.d}}
function sample(x,z,ramps){for(const ramp of ramps){if(Math.abs(x-ramp.x)>ramp.w/2||z<ramp.z-ramp.d/2||z>ramp.z+ramp.d/2)continue;const p=profile(ramp,(z-(ramp.z-ramp.d/2))/ramp.d);return {height:p.height,slope:p.slope,ramp}}return {height:0,slope:0,ramp:null}}
function launch(previous,current,z,heading,speed,travelSign=1){if(!previous.ramp||previous.ramp.curve==='halfpipe-deck'||current.ramp===previous.ramp||speed<3||Math.cos(heading)*(travelSign===-1?-1:1)*(previous.ramp.curve==='halfpipe-left'?-1:1)<.35)return 0;const left=previous.ramp.curve==='halfpipe-left';const lip=previous.ramp.z+(left?-1:1)*previous.ramp.d/2;if((left?z>lip:z<lip)||Math.abs(z-lip)>Math.max(.8,speed*.05))return 0;const direction=Math.cos(heading)*(travelSign===-1?-1:1)*(left?-1:1);if(direction<.35)return 0;return Math.max(2.5,speed*direction*Math.abs(previous.slope)+1.3)}
// Signed gravity allows natural halfpipe rollbacks: a skater who runs out of
// uphill momentum starts rolling fakie downhill without a fake 180-degree snap.
function rollOnSlope(state,contact,dt){
 if(!contact||!Number.isFinite(contact.slope)||!Number.isFinite(dt)||dt<=0)return state;
 const sign=state.travelSign===-1?-1:1;
 const speed=Number.isFinite(state.speed)?Math.max(0,state.speed):0;
 // Gravity projected along the riding surface. The raw slope is a rise/run
 // ratio, not a force multiplier; using it directly could exceed gravity
 // on steep halfpipe transitions and reverse the skater in one frame.
 const grade=Number.isFinite(contact.slope)?contact.slope:0;
 const along=grade/Math.hypot(1,grade);
 const velocity=sign*speed-9.81*along*Math.cos(state.dir||0)*Math.min(.05,dt);
 state.travelSign=velocity<0?-1:1;
 state.speed=Math.min(17,Math.abs(velocity));
 return state;
}
root.SOLTerrain={profile,sample,launch,rollOnSlope};
})(typeof window!=='undefined'?window:globalThis);
