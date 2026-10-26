/* SOL SKATE — deterministic rail contact and constrained grind traversal.
 * All distances are world metres. Caller owns horizontal movement and gravity.
 */
(function(root){'use strict';
const GRAVITY=19;
function find(state,rails,dt,stable){
  if(!stable||state.grinding||state.grounded||state.speed<2.5||state.vy>=0||state.grindCooldown>0)return null;
  const h=Math.max(0,Math.min(.04,Number.isFinite(dt)?dt:0));
  if(!h)return null;
  const nextY=state.y+(state.vy-GRAVITY*h)*h;
  for(const rail of rails){
    const top=Number.isFinite(rail.y)?rail.y:1.1;
    // The trucks must cross the rail, not teleport onto it from far above.
    if(state.y<top-.02||nextY>top+.035)continue;
    if(Math.abs(state.x-rail.x)>.38)continue;
    if(Math.abs(state.z-rail.z)>rail.len/2-.22)continue;
    if(Math.abs(Math.cos(state.dir))<.72)continue;
    return {rail,top,direction:Math.cos(state.dir)>=0?1:-1};
  }
  return null;
}
function attach(state,contact){
  if(!contact)return false;
  state.grinding=true;state.grounded=false;state.grindRail=contact.rail;
  state.grindTime=0;state.y=contact.top;state.vy=0;
  state.x=contact.rail.x;state.dir=contact.direction>0?0:Math.PI;
  state.speed*=.97;
  return true;
}
function advance(state,dt){
  if(!state.grinding||!state.grindRail)return false;
  const rail=state.grindRail;
  const h=Math.max(0,Math.min(.04,Number.isFinite(dt)?dt:0));
  state.grindTime+=h;
  state.x=rail.x;
  state.y=Number.isFinite(rail.y)?rail.y:1.1;
  state.vy=0;
  state.speed=Math.max(0,state.speed-1.35*h);
  state.combo+=110*h;
  const ended=Math.abs(state.z-rail.z)>=rail.len/2-.12||state.speed<1.5||state.grindTime>4;
  if(ended){
    state.grinding=false;state.grindRail=null;state.grounded=false;
    state.grindCooldown=.5;state.rampCooldown=Math.max(state.rampCooldown||0,.4);
    state.y+=.01;state.vy=0;
  }
  return ended;
}
root.SOLGrind={find,attach,advance};
})(typeof window!=='undefined'?window:globalThis);
