/* SOL SKATE — deterministic rail contact and constrained grind traversal.
 * All distances are world metres. Caller owns horizontal movement and gravity.
 */
(function(root){'use strict';
const GRAVITY=19;
function find(state,rails,dt,stable,assist=false){
 if(!stable||state.grinding||state.speed<1.3||state.grindCooldown>0||(!assist&&state.grounded)||state.vy>2)return null;
 const h=Math.max(0,Math.min(.04,Number.isFinite(dt)?dt:0));
 const nextY=state.y+(state.vy-GRAVITY*h)*h;
 let best=null,bestDist=Infinity;
 for(const rail of rails){
  const top=Number.isFinite(rail.y)?rail.y:1.1;
  if(state.y<top-(assist?.8:.28)||nextY>top+(assist?1.8:.65))continue;
  const axis=rail.axis==='x'?'x':'z',cross=axis==='z'?'x':'z';
  const crossDist=Math.abs(state[cross]-rail[cross]);
  const alongDist=Math.abs(state[axis]-rail[axis]);
  if(crossDist>(assist?1.7:1.05)||alongDist>rail.len/2+.35)continue;
  const heading=axis==='z'?Math.cos(state.dir):Math.sin(state.dir);
  if(Math.abs(heading)<(assist?.05:.3))continue;
  const distance=crossDist+Math.abs(state.y-top)*.3;
  if(distance<bestDist){best={rail,top,direction:heading*(state.travelSign===-1?-1:1)>=0?1:-1};bestDist=distance}
 }
 return best;
}
function attach(state,contact){
 if(!contact)return false;
 const rail=contact.rail,axis=rail.axis==='x'?'x':'z',cross=axis==='z'?'x':'z';
 state.grinding=true;state.grounded=false;state.grindRail=rail;state.grindTime=0;
 state.y=contact.top;state.vy=0;state[cross]=rail[cross];
 state.dir=axis==='z'?(contact.direction>0?0:Math.PI):(contact.direction>0?Math.PI/2:-Math.PI/2);
 state.travelSign=1;state.speed*=.97;return true;
}
function advance(state,dt){
 if(!state.grinding||!state.grindRail)return false;
 const rail=state.grindRail,axis=rail.axis==='x'?'x':'z',cross=axis==='z'?'x':'z';
 const h=Math.max(0,Math.min(.04,Number.isFinite(dt)?dt:0));
 state.grindTime+=h;state[cross]=rail[cross];state.y=Number.isFinite(rail.y)?rail.y:1.1;
 state.vy=0;state.speed=Math.max(0,state.speed-1.35*h);state.combo+=110*h;
 const ended=Math.abs(state[axis]-rail[axis])>=rail.len/2-.12||state.speed<1.5||state.grindTime>4;
 if(ended){state.grinding=false;state.grindRail=null;state.grounded=false;state.grindCooldown=.5;state.rampCooldown=Math.max(state.rampCooldown||0,.4);state.y+=.01;state.vy=0}
 return ended;
}
root.SOLGrind={find,attach,advance};
})(typeof window!=='undefined'?window:globalThis);
