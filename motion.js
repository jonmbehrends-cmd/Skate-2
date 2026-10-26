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
    clearAir(state);
    state.speed=speed;
  }else if(state.grounded){
    clearAir(state);
    const thrust=(-pedal*8)+(boost?9:0);
    const rollingDrag=.16*speed;
    const carveDrag=.22*Math.abs(turn)*speed*Math.min(1,speed/12);
    state.speed=clamp(speed+(thrust-rollingDrag-carveDrag)*h,0,17);
  }else{
    // RT and joystick cannot create forward momentum while airborne.
    if(Number.isFinite(state.airVX)&&Number.isFinite(state.airVZ)){
      const damping=Math.exp(-.018*h);
      state.airVX*=damping;state.airVZ*=damping;
      state.speed=clamp(Math.hypot(state.airVX,state.airVZ),0,17);
    }else state.speed=clamp(speed-speed*.018*h,0,17);
  }
  return state;
}
// Capture travel velocity at takeoff. Airborne facing can change without
// redirecting the centre of mass; there is no lateral jetpack steering.
function beginAir(state){
  const speed=clamp(Number.isFinite(state.speed)?state.speed:0,0,17);
  state.airVX=Math.sin(state.dir)*speed;
  state.airVZ=Math.cos(state.dir)*speed;
  return state;
}
function clearAir(state){state.airVX=null;state.airVZ=null;return state}
function horizontal(state,dt){
  const h=clamp(Number.isFinite(dt)?dt:0,0,.05);
  const airborne=!state.grounded&&!state.grinding&&Number.isFinite(state.airVX)&&Number.isFinite(state.airVZ);
  return {dx:(airborne?state.airVX:Math.sin(state.dir)*state.speed)*h,
          dz:(airborne?state.airVZ:Math.cos(state.dir)*state.speed)*h};
}
function landingAlignment(state){
  if(!Number.isFinite(state.airVX)||!Number.isFinite(state.airVZ))return 1;
  const speed=Math.hypot(state.airVX,state.airVZ);
  if(speed<.25)return 1;
  return clamp((Math.sin(state.dir)*state.airVX+Math.cos(state.dir)*state.airVZ)/speed,-1,1);
}
// Resolve world-space airborne velocity against solid collision normals.
// Inward momentum is removed; tangential momentum is damped but preserved.
function collide(state,contacts){
  const hits=contacts.filter(c=>c&&c.hit);
  if(!hits.length)return false;
  if(state.grounded||state.grinding||!Number.isFinite(state.airVX)||!Number.isFinite(state.airVZ)){
    state.speed=clamp((Number.isFinite(state.speed)?state.speed:0)*.55,0,17);
    return true;
  }
  let vx=state.airVX,vz=state.airVZ;
  for(const c of hits){
    const nx=c.normalX||0,nz=c.normalZ||0,mag=Math.hypot(nx,nz);
    if(mag>0){
      const ux=nx/mag,uz=nz/mag,closing=vx*ux+vz*uz;
      if(closing<0){vx-=closing*ux;vz-=closing*uz}
    }else{vx*=.55;vz*=.55}
  }
  state.airVX=vx*.82;state.airVZ=vz*.82;
  state.speed=clamp(Math.hypot(state.airVX,state.airVZ),0,17);
  return true;
}
root.SOLMotion={step,beginAir,clearAir,horizontal,landingAlignment,collide};
})(typeof window!=='undefined'?window:globalThis);
