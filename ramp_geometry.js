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
// Opaque, genuinely three-dimensional cast-concrete cheeks. The previous
// single zero-thickness triangle was correctly pickable but read as a black
// hole from the player's starting camera. Extrude both sides of each cheek,
// including its top, bottom, and front/back end caps.
function sideWall(r,profile,side,segments=40){
  if(side!==-1&&side!==1)throw Error('Side must be -1 or 1');
  const N=Math.max(2,Math.min(160,Math.floor(segments)||40));
  const inner=r.x+side*(r.w/2-.035),outer=r.x+side*(r.w/2+.22);
  const floor=-.32,positions=[],indices=[],uvs=[];
  function quad(a,b,c,d,mode){
    const n=positions.length/3;
    for(const p of [a,b,c,d]){
      positions.push(...p);
      uvs.push(mode==='end'?p[0]/3:p[2]/3,mode==='end'?p[1]/3:p[1]/3);
    }
    indices.push(n,n+1,n+2,n,n+2,n+3);
  }
  for(let i=0;i<N;i++){
    const za=r.z-r.d/2+r.d*i/N,zb=r.z-r.d/2+r.d*(i+1)/N;
    const ya=profile(r,i/N).height+.02,yb=profile(r,(i+1)/N).height+.02;
    quad([outer,floor,za],[outer,ya,za],[outer,yb,zb],[outer,floor,zb]);
    quad([inner,floor,zb],[inner,yb,zb],[inner,ya,za],[inner,floor,za]);
    quad([inner,ya,za],[inner,yb,zb],[outer,yb,zb],[outer,ya,za]);
    quad([inner,floor,za],[outer,floor,za],[outer,floor,zb],[inner,floor,zb]);
  }
  const front=r.z-r.d/2,back=r.z+r.d/2;
  const low=profile(r,0).height+.02,high=profile(r,1).height+.02;
  quad([inner,floor,front],[inner,low,front],[outer,low,front],[outer,floor,front],'end');
  quad([outer,floor,back],[outer,high,back],[inner,high,back],[inner,floor,back],'end');
  return {positions,indices,uvs,segments:N};
}
root.SOLRampGeometry={build,sideWall};
})(typeof window!=='undefined'?window:globalThis);
