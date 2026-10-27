/* SOL SKATE — shared analytical surface for visual mesh and wheel contact. */
(function(root){'use strict';
function profile(ramp,t){
 const u=Math.max(0,Math.min(1,t));
 if(ramp.curve==='halfpipe-deck')return {height:ramp.h,slope:0};
 if(ramp.curve==='halfpipe-left'||ramp.curve==='halfpipe-right'){
  // A real quarter-circle transition has a horizontal tangent at the flat
  // bottom and a vertical tangent at coping. The former large-radius arc
  // reached the lip at only ~56 degrees, preventing convincing vert air.
  // Use radius = height, with any extra run as level roll-in. The mesh and
  // wheel-contact system both sample this same analytical profile.
  const left=ramp.curve==='halfpipe-left';
  const distanceFromLip=(left?u:1-u)*ramp.d;
  const run=Math.min(ramp.h,Math.max(0,distanceFromLip));
  const remaining=ramp.h-run;
  const root=Math.sqrt(Math.max(0,ramp.h*ramp.h-remaining*remaining));
  return {height:ramp.h-root,
   // Cap the mathematical infinite tangent only for numerical stability;
   // gravity is independently projected onto the slope in rollOnSlope.
   slope:(left?-1:1)*remaining/Math.max(.1,root)};
 }
 return ramp.curve==='quarter'?{height:ramp.h*u*u,slope:2*ramp.h*u/ramp.d}:{height:ramp.h*u,slope:ramp.h/ramp.d};
}
function sample(x,z,ramps,y=Infinity){
 for(const ramp of ramps){
  if(Math.abs(x-ramp.x)>ramp.w/2||z<ramp.z-ramp.d/2||z>ramp.z+ramp.d/2)continue;
  // Raised halfpipe decks are overhead solids, not ramps rising from the
  // ground. A ground-level rider must never snap 4.5m upward just because
  // their X/Z enters the deck footprint (e.g. after overlap recovery).
  // Landing from above still uses the deck as a rideable surface.
  if(ramp.curve==='halfpipe-deck'&&y<ramp.h-.16)continue;
  const p=profile(ramp,(z-(ramp.z-ramp.d/2))/ramp.d);
  return {height:p.height,slope:p.slope,ramp};
 }
 return {height:0,slope:0,ramp:null};
}
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
// Preserve vertical position at vert takeoff. The previous game loop snapped
// the rider from the steep transition directly to coping height, producing
// a visible 1m+ teleport. Give the upward arc enough energy to clear the lip
// instead; the frame loop must never directly raise y on takeoff.
function vertTakeoffVelocity(y,lipHeight,travelSpeed){
 const climb=Math.max(.35,lipHeight+.35-(Number.isFinite(y)?y:lipHeight));
 return Math.min(12,Math.max(5.8,Math.max(0,travelSpeed)*.94,Math.sqrt(2*19*climb)));
}
root.SOLTerrain={profile,sample,launch,rollOnSlope,vertTakeoffVelocity};
})(typeof window!=='undefined'?window:globalThis);
