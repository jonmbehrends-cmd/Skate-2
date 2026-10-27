/* SOL SKATE — four-wheel terrain pose and relative touchdown speed.
 * This is a contact-aware board pose, not a full rigid-body suspension.
 * Coordinates: forward = (sin(dir),cos(dir)); right = (cos(dir),-sin(dir)).
 */
(function(root){'use strict';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const WB=.52,TRACK=.27;
function sample(x,z,dir,y,surface){
  const fX=Math.sin(dir),fZ=Math.cos(dir),rX=Math.cos(dir),rZ=-Math.sin(dir);
  const points=[];
  for(const forward of [-WB,WB])for(const side of [-TRACK,TRACK]){
    const wx=x+fX*forward+rX*side,wz=z+fZ*forward+rZ*side;
    const contact=surface(wx,wz,y);
    const h=Number.isFinite(contact&&contact.height)?contact.height:0;
    points.push({forward,side,height:h,x:wx,z:wz});
  }
  const back=(points[0].height+points[1].height)/2;
  const front=(points[2].height+points[3].height)/2;
  const left=(points[0].height+points[2].height)/2;
  const right=(points[1].height+points[3].height)/2;
  const forwardSlope=clamp((front-back)/(2*WB),-1.2,1.2);
  const sideSlope=clamp((right-left)/(2*TRACK),-1.2,1.2);
  // Raise the rigid deck to the highest required support: no wheel samples
  // should penetrate a raised surface even at a ledge or ramp edge.
  // A rigid skateboard cannot instantaneously tip 50+ degrees because one
  // wheel briefly overlaps a ledge. Cap bank/tilt and raise support instead.
  const supportedForward=clamp(forwardSlope,-.85,.85);
  const supportedSide=clamp(sideSlope,-.35,.35);
  const height=Math.max(...points.map(p=>p.height-supportedForward*p.forward-supportedSide*p.side));
  return {height,pitch:-Math.atan(supportedForward),roll:Math.atan(supportedSide),
    forwardSlope:supportedForward,sideSlope:supportedSide,points};
}
function relativeImpact(state,slopeX=0,slopeZ=0){
  const vx=Number.isFinite(state.airVX)?state.airVX:Math.sin(state.dir)*state.speed;
  const vz=Number.isFinite(state.airVZ)?state.airVZ:Math.cos(state.dir)*state.speed;
  // Contact severity is the velocity along the UNIT surface normal.
  // The unnormalised dot product exaggerated steep halfpipe impacts and
  // incorrectly marked clean vert returns as bails, destroying momentum.
  const sx=Number.isFinite(slopeX)?slopeX:0,sz=Number.isFinite(slopeZ)?slopeZ:0;
  return (state.vy-vx*sx-vz*sz)/Math.hypot(1,sx,sz);
}
root.SOLWheels={sample,relativeImpact};
})(typeof window!=='undefined'?window:globalThis);
