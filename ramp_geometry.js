/* SOL SKATE — sealed, outward-facing ramp concrete volume.
 * Coordinates: X width, Y elevation, Z uphill. Every boundary is represented
 * by triangles so Babylon's back-face culling and lighting behave correctly.
 */
(function(root){'use strict';
function build(r,profile,segments=40){
  if(!r||!Number.isFinite(r.w)||!Number.isFinite(r.d)||r.w<=0||r.d<=0)throw Error('Invalid ramp dimensions');
  const N=Math.max(2,Math.min(160,Math.floor(segments)||40));
  const x=r.x,z=r.z,w=r.w,d=r.d,l=x-w/2,rr=x+w/2,floor=-.045;
  const positions=[],indices=[],uvs=[];
  function quad(a,b,c,e){
    const n=positions.length/3;
    for(const p of [a,b,c,e]){positions.push(...p);uvs.push(p[0]/3,p[2]/3)}
    indices.push(n,n+1,n+2,n,n+2,n+3);
  }
  for(let i=0;i<N;i++){
    const za=z-d/2+d*i/N,zb=z-d/2+d*(i+1)/N;
    const ya=profile(r,i/N).height+.012,yb=profile(r,(i+1)/N).height+.012;
    // Upward top, outward left (-X), outward right (+X), downward base.
    quad([l,ya,za],[l,yb,zb],[rr,yb,zb],[rr,ya,za]);
    quad([l,ya,za],[l,floor,za],[l,floor,zb],[l,yb,zb]);
    quad([rr,floor,za],[rr,ya,za],[rr,yb,zb],[rr,floor,zb]);
    quad([l,floor,za],[rr,floor,za],[rr,floor,zb],[l,floor,zb]);
  }
  const front=z-d/2,back=z+d/2;
  const low=profile(r,0).height+.012,high=profile(r,1).height+.012;
  // End caps: -Z and +Z.
  quad([l,floor,front],[l,low,front],[rr,low,front],[rr,floor,front]);
  quad([rr,floor,back],[rr,high,back],[l,high,back],[l,floor,back]);
  return {positions,indices,uvs,segments:N};
}
// Independent exterior cast-concrete cheeks. These follow the exact same
// sampled profile as wheel contact and visually close the ramp from either side.
function sideWall(r,profile,side,segments=40){
  if(side!==-1&&side!==1)throw Error('Side must be -1 or 1');
  const N=Math.max(2,Math.min(160,Math.floor(segments)||40));
  const x=r.x+side*(r.w/2+.016),floor=-.046;
  const positions=[],indices=[],uvs=[];
  for(let i=0;i<N;i++){
    const za=r.z-r.d/2+r.d*i/N,zb=r.z-r.d/2+r.d*(i+1)/N;
    const ya=profile(r,i/N).height+.014,yb=profile(r,(i+1)/N).height+.014;
    const base=positions.length/3;
    positions.push(x,floor,za,x,ya,za,x,yb,zb,x,floor,zb);
    uvs.push(za/3,floor/3,za/3,ya/3,zb/3,yb/3,zb/3,floor/3);
    if(side>0)indices.push(base,base+1,base+2,base,base+2,base+3);
    else indices.push(base+2,base+1,base,base+3,base+2,base);
  }
  return {positions,indices,uvs,segments:N};
}
root.SOLRampGeometry={build,sideWall};
})(typeof window!=='undefined'?window:globalThis);
