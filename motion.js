/* SOL SKATE — deterministic momentum and surface-dependent analog controls.
 * Ground acceleration and pushing are disabled while airborne; rail traversal
 * is handled by SOLGrind. Units are metres, seconds, and radians.
 */
(function(root){'use strict';
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
function step(state,steer,throttle,boost,dt){
  const h=clamp(Number.isFinite(dt)?dt:0,0,.05);
  if(!h)return state;
  const turn=clamp(Number.isFinite(steer)?steer:0,-1,1);
  const pedal=clamp(Number.isFinite(throttle)?throttle:0,-1,1);
  const speed=clamp(Number.isFinite(state.speed)?state.speed:0,0,17);
  // Air steering changes facing only gently; aerial propulsion is unavailable.
  const steerRate=state.grinding?.11:state.grounded?.65+Math.min(1,speed/12):.18;
  state.dir+=turn*h*steerRate;
  if(state.grinding){
    // Rail friction and speed reduction belong to SOLGrind.advance.
    state.speed=speed;
  }else if(state.grounded){
    const thrust=(-pedal*8)+(boost?9:0);
    const rollingDrag=.16*speed;
    const carveDrag=.22*Math.abs(turn)*speed*Math.min(1,speed/12);
    state.speed=clamp(speed+(thrust-rollingDrag-carveDrag)*h,0,17);
  }else{
    // RT and joystick cannot create forward momentum while airborne.
    state.speed=clamp(speed-speed*.018*h,0,17);
  }
  return state;
}
root.SOLMotion={step};
})(typeof window!=='undefined'?window:globalThis);
