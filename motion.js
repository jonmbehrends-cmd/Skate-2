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
  // In the air, the same left/right stick drives fast body-and-board yaw spins.
  // World-space travel velocity remains independent of facing direction.
  const steerRate=state.grinding?.11:state.grounded?.65+Math.min(1,speed/12):12.0;
  // Chase camera follows travel heading; a second fakie steering inversion
  // reverses the stick relative to the screen. Keep yaw input consistent.
  state.dir+=turn*h*steerRate;
  if(state.grinding){
    // Rail friction and speed reduction belong to SOLGrind.advance.
    clearAir(state);
    state.speed=speed;
  }else if(state.grounded){
    clearAir(state);
    // RT delivers impulse only during the planted-foot half of each push.
    // Phase advances in simulation time, so physics and animation stay synchronized.
    state.pushPhase=Number.isFinite(state.pushPhase)?state.pushPhase:0;
    const pushing=!!boost&&!state.onRamp&&speed<16;
    if(pushing)state.pushPhase=(state.pushPhase+h*6.5)%(Math.PI*2);
    else state.pushPhase=0;
    const contact=pushing?Math.max(0,Math.sin(state.pushPhase)):0;
    const thrust=(-pedal*8)+(pushing?18*contact:0);
    const rollingDrag=.16*speed;
    const carveDrag=.22*Math.abs(turn)*speed*Math.min(1,speed/12);
    state.speed=clamp(speed+(thrust-rollingDrag-carveDrag)*h,0,17);
  }else{
    state.pushPhase=0;
    // RT and joystick cannot create forward momentum while airborne.
    if(Number.isFinite(state.airVX)&&Number.isFinite(state.airVZ)){
      const damping=Math.exp(-.018*h);
      state.airVX*=damping;state.airVZ*=damping;
      state.speed=clamp(Math.hypot(state.airVX,state.airVZ),0,17);
    }else state.speed=clamp(speed-speed*.018*h,0,17);
  }
  return state;
}
// Ramp pumping converts a timed crouch/extension into tangential acceleration.
// Never creates speed on flat ground, across disconnected ramp boundaries,
// or while airborne/grinding.
function pump(state,previous,current,dt,active=false){
 const h=clamp(Number.isFinite(dt)?dt:0,0,.05);
 if(!h||!state.grounded||state.grinding||!current||!current.ramp||!previous||previous.ramp!==current.ramp||!active){state.pumpIntensity=Math.max(0,(state.pumpIntensity||0)-h*3);return 0;}
 const slope=Number.isFinite(current.slope)?current.slope:0;
 const before=previous&&Number.isFinite(previous.slope)?previous.slope:slope;
 const forward=Math.cos(state.dir||0)*(state.travelSign===-1?-1:1);
 const speed=Number.isFinite(state.speed)?state.speed:0;
 // Pump only through a positive change in surface TANGENT ANGLE.
 // Raw slope approaches infinity at vert coping and previously awarded up to
 // 1.1 m/s *per frame*, causing extreme FPS-dependent speed injection.
 // The angular change stays finite at vert, and the gain is time-bounded.
 const angularChange=(Math.atan(slope)-Math.atan(before))*forward;
 const impulse=clamp(Math.max(0,angularChange)*Math.max(0,speed)*.75,0,3.2*h);
 if(impulse>.0001){state.speed=clamp(speed+impulse,0,17);state.pumpIntensity=clamp(impulse/Math.max(.001,3.2*h),0,1)}
 else state.pumpIntensity=Math.max(0,(state.pumpIntensity||0)-h*3);
 return impulse;
}
// Capture travel velocity at takeoff. Airborne facing can change without
// redirecting the centre of mass; there is no lateral jetpack steering.
function beginAir(state){
  const speed=clamp(Number.isFinite(state.speed)?state.speed:0,0,17);
  const sign=state.travelSign===-1?-1:1;
  state.airVX=Math.sin(state.dir)*speed*sign;
  state.airVZ=Math.cos(state.dir)*speed*sign;
  return state;
}
function clearAir(state){state.airVX=null;state.airVZ=null;return state}
function horizontal(state,dt){
  const h=clamp(Number.isFinite(dt)?dt:0,0,.05);
  const airborne=!state.grounded&&!state.grinding&&Number.isFinite(state.airVX)&&Number.isFinite(state.airVZ);
  const sign=state.travelSign===-1?-1:1;
  return {dx:(airborne?state.airVX:Math.sin(state.dir)*state.speed*sign)*h,
          dz:(airborne?state.airVZ:Math.cos(state.dir)*state.speed*sign)*h};
}
// A 180-degree spin can land rolling fakie instead of automatically bailing.
function landingTravelSign(state){
  if(!Number.isFinite(state.airVX)||!Number.isFinite(state.airVZ))return state.travelSign===-1?-1:1;
  return Math.sin(state.dir)*state.airVX+Math.cos(state.dir)*state.airVZ<0?-1:1;
}
function landingAlignment(state){
  if(!Number.isFinite(state.airVX)||!Number.isFinite(state.airVZ))return 1;
  const speed=Math.hypot(state.airVX,state.airVZ);
  if(speed<.25)return 1;
  return clamp(Math.abs(Math.sin(state.dir)*state.airVX+Math.cos(state.dir)*state.airVZ)/speed,0,1);
}
// Resolve world-space airborne velocity against solid collision normals.
// Inward momentum is removed; tangential momentum is damped but preserved.
function collide(state,contacts){
  const hits=contacts.filter(c=>c&&c.hit);
  if(!hits.length)return false;
  if(state.grounded||state.grinding||!Number.isFinite(state.airVX)||!Number.isFinite(state.airVZ)){
    // Project ground travel onto the wall tangent rather than halving speed
    // on every frame of contact. Repeated glancing hits otherwise pin the
    // skater against rails, ledges and ramp cheeks.
    const sign=state.travelSign===-1?-1:1;
    const speed=clamp(Number.isFinite(state.speed)?state.speed:0,0,17);
    let vx=Math.sin(state.dir||0)*speed*sign;
    let vz=Math.cos(state.dir||0)*speed*sign;
    for(const c of hits){
      const nx=c.normalX||0,nz=c.normalZ||0,mag=Math.hypot(nx,nz);
      if(mag<.5)continue;
      const ux=nx/mag,uz=nz/mag,closing=vx*ux+vz*uz;
      if(closing<0){vx-=closing*ux;vz-=closing*uz}
    }
    const remaining=Math.hypot(vx,vz);
    if(remaining>.12){
      // Align heading with the safe tangent, retaining the existing fakie
      // direction; the next physics step can continue around the obstacle.
      state.dir=Math.atan2(vx*sign,vz*sign);
      state.speed=clamp(remaining*.97,0,17);
    }else state.speed=0;
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
root.SOLMotion={step,beginAir,clearAir,horizontal,landingAlignment,landingTravelSign,collide,pump};
})(typeof window!=='undefined'?window:globalThis);
