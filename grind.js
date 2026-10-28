/* SOL SKATE — deterministic rail contact and constrained grind traversal.
 * All distances are world metres. Caller owns horizontal movement and gravity.
 */
(function(root){'use strict';
const GRAVITY=19;
// Movement uses (sin(heading), cos(heading)); the circle uses (cos(a), sin(a)).
// Its tangent is (-sin(a), cos(a)), so heading is -a, not a + PI/2.
function copingHeading(angle,direction){return -angle+(direction<0?Math.PI:0);}
function find(state,rails,dt,stable,assist=false){
 if(!stable||state.grinding||state.speed<1.3||state.grindCooldown>0||(!assist&&state.grounded)||state.vy>0&&!assist)return null;
 const h=Math.max(0,Math.min(.04,Number.isFinite(dt)?dt:0));
 const nextY=state.y+(state.vy-GRAVITY*h)*h;
 let best=null,bestDist=Infinity;
 for(const rail of rails){
  // Only bowl coping permits rising capture: standard rail/ledge catches
  // remain descending-only, preserving the existing ollie/boardslide physics.
  if(state.vy>0&&rail.kind!=='bowl-coping'&&!assist)continue;
  if(rail.kind==='bowl-coping'){
   const dx=state.x-rail.x,dz=state.z-rail.z,r=Math.hypot(dx,dz),radialError=Math.abs(r-rail.radius);
   if(radialError>(assist?2.0:.42)||state.y<rail.y-(assist?1.8:.3)||nextY>rail.y+(assist?2.5:.65)||r<.01)continue;
   const tangentX=-dz/r,tangentZ=dx/r,travel=state.travelSign===-1?-1:1;
   const tangentHeading=(Math.sin(state.dir)*tangentX+Math.cos(state.dir)*tangentZ)*travel;
   // The rider often approaches the lip radially; allow an assisted
   // stall/grind entry and choose a consistent tangent direction.
   if(Math.abs(tangentHeading)<(assist?0:.25))continue;
   const distance=radialError+Math.abs(state.y-rail.y)*.3;
   if(distance<bestDist){best={rail,top:rail.y,direction:tangentHeading>=0?1:-1};bestDist=distance}
   continue;
  }
  const top=Number.isFinite(rail.y)?rail.y:1.1;
  if(state.y<top-(assist?1.25:.28)||nextY>top+(assist?2.2:.65))continue;
  const axis=rail.axis==='x'?'x':'z',cross=axis==='z'?'x':'z';
  const crossDist=Math.abs(state[cross]-rail[cross]);
  const alongDist=Math.abs(state[axis]-rail[axis]);
  if(crossDist>(assist?1.15:.35)||alongDist>rail.len/2+(assist?.35:-.001))continue;
  const heading=axis==='z'?Math.cos(state.dir):Math.sin(state.dir);
  if(Math.abs(heading)<(assist?0:.3))continue;
  const distance=crossDist+Math.abs(state.y-top)*.3;
  if(distance<bestDist){best={rail,top,direction:heading*(state.travelSign===-1?-1:1)>=0?1:-1};bestDist=distance}
 }
 return best;
}
function attach(state,contact){
 if(!contact)return false;
 const rail=contact.rail,axis=rail.axis==='x'?'x':'z',cross=axis==='z'?'x':'z';
 state.grinding=true;state.grounded=false;state.grindRail=rail;state.grindTime=0;state.grindDirection=contact.direction;state.grindType=state.grindRequestType==='boardslide'?'boardslide':'50-50';
 // Boardslides rotate the actual rider/board across the rail, not the
 // movement heading. Store the approach side so the stance stays consistent.
 state.grindSide=state[cross]>=rail[cross]?1:-1;
 state.grindEntryY=rail.kind==='bowl-coping'?state.y:null;
 state.y=rail.kind==='bowl-coping'?state.grindEntryY:contact.top;state.vy=0;if(rail.kind==='bowl-coping'){const a=Math.atan2(state.z-rail.z,state.x-rail.x);state.grindAngle=a;state.x=rail.x+rail.radius*Math.cos(a);state.z=rail.z+rail.radius*Math.sin(a);state.dir=copingHeading(a,contact.direction);}else state[cross]=rail[cross];
 if(rail.kind!=='bowl-coping')state.dir=axis==='z'?(contact.direction>0?0:Math.PI):(contact.direction>0?Math.PI/2:-Math.PI/2);
 state.travelSign=1;state.speed*=.97;state.grindRequestType=null;return true;
}
function advance(state,dt){
 if(!state.grinding||!state.grindRail)return false;
 const rail=state.grindRail,axis=rail.axis==='x'?'x':'z',cross=axis==='z'?'x':'z';
 const h=Math.max(0,Math.min(.04,Number.isFinite(dt)?dt:0));
 state.grindTime+=h;if(rail.kind==='bowl-coping'){const direction=state.grindDirection||1;state.grindAngle+=direction*state.speed*h/rail.radius;state.x=rail.x+rail.radius*Math.cos(state.grindAngle);state.z=rail.z+rail.radius*Math.sin(state.grindAngle);state.dir=copingHeading(state.grindAngle,direction);}else state[cross]=rail[cross];const top=Number.isFinite(rail.y)?rail.y:1.1;
 // Follow the coping while easing the board up from a steep wall. Instant
 // vertical snapping at entry looked like teleporting through concrete.
 const entry=Number.isFinite(state.grindEntryY)?state.grindEntryY:top;
 const blend=rail.kind==='bowl-coping'?Math.max(0,1-state.grindTime/.22):0;
 state.y=top+(entry-top)*blend;
 state.vy=0;state.speed=Math.max(0,state.speed-(rail.kind==='bowl-coping'?.75:1.35)*h);state.combo+=(state.grindType==='boardslide'?170:110)*h;
 const ended=(rail.kind!=='bowl-coping'&&Math.abs(state[axis]-rail[axis])>=rail.len/2-.12)||state.speed<1.5||state.grindTime>(rail.kind==='bowl-coping'?12:4);
 if(ended){state.grinding=false;state.grindRail=null;state.grindType=null;state.grindSide=null;state.grindEntryY=null;state.grounded=false;state.grindCooldown=.5;state.rampCooldown=Math.max(state.rampCooldown||0,.4);state.y+=.01;state.vy=0}
 return ended;
}
function visualYaw(state){return state.grinding&&state.grindType==='boardslide'?(state.grindSide===-1?-1:1)*Math.PI/2:0;}
root.SOLGrind={find,attach,advance,visualYaw};
})(typeof window!=='undefined'?window:globalThis);
