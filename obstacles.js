/* SOL SKATE — swept board collision and elevated rideable surfaces. */
(function(root){'use strict';
const EPS=1e-4;
function surface(x,z,y,base,boxes){
  let height=base;
  for(const b of boxes){
    if(x>=b.x-b.w/2&&x<=b.x+b.w/2&&z>=b.z-b.d/2&&z<=b.z+b.d/2&&y>=b.h-.16){height=Math.max(height,b.h)}
  }
  return height;
}
function sweep(px,pz,nx,nz,y,boxes,radius=.27){
  let x=px,z=pz,dx=nx-px,dz=nz-pz,hit=false,normalX=0,normalZ=0;
  for(let iter=0;iter<3;iter++){
    let best=1+EPS,nxHit=0,nzHit=0;
    for(const b of boxes){
      if(y>=b.h-.13)continue;
      const minX=b.x-b.w/2-radius,maxX=b.x+b.w/2+radius;
      const minZ=b.z-b.d/2-radius,maxZ=b.z+b.d/2+radius;
      // If a test starts inside an expanded footprint, do not trap it: allow an exit.
      if(x>minX+EPS&&x<maxX-EPS&&z>minZ+EPS&&z<maxZ-EPS)continue;
      let tx0=-Infinity,tx1=Infinity,tz0=-Infinity,tz1=Infinity;
      if(Math.abs(dx)<1e-10){if(x<minX||x>maxX)continue}
      else{const a=(minX-x)/dx,c=(maxX-x)/dx;tx0=Math.min(a,c);tx1=Math.max(a,c)}
      if(Math.abs(dz)<1e-10){if(z<minZ||z>maxZ)continue}
      else{const a=(minZ-z)/dz,c=(maxZ-z)/dz;tz0=Math.min(a,c);tz1=Math.max(a,c)}
      const entry=Math.max(tx0,tz0),exit=Math.min(tx1,tz1);
      if(entry>=-EPS&&entry<=1&&entry<=exit&&entry<best){
        best=Math.max(0,entry);nxHit=tx0>tz0?(dx>0?-1:1):0;nzHit=tz0>=tx0?(dz>0?-1:1):0;
      }
    }
    if(best>1) {x+=dx;z+=dz;break}
    const travel=Math.max(0,best-EPS);x+=dx*travel;z+=dz*travel;
    hit=true;normalX=nxHit;normalZ=nzHit;
    const remain=1-best;dx*=remain;dz*=remain;
    if(nxHit)dx=0;if(nzHit)dz=0;
    if(Math.abs(dx)+Math.abs(dz)<1e-7)break;
  }
  return {x,z,hit,normalX,normalZ};
}
function rampSide(px,pz,nx,nz,y,ramps,radius=.27){
  let x=nx,hit=false,normalX=0;
  for(const r of ramps){
    const z=(pz+nz)/2;
    if(z<r.z-r.d/2||z>r.z+r.d/2)continue;
    const t=(z-(r.z-r.d/2))/r.d;
    const height=r.curve==='quarter'?r.h*t*t:r.h*t;
    if(y>=height-.13)continue;
    const left=r.x-r.w/2-radius,right=r.x+r.w/2+radius;
    if(px<=left&&x>left){x=left;hit=true;normalX=-1}
    else if(px>=right&&x<right){x=right;hit=true;normalX=1}
  }
  return {x,z:nz,hit,normalX,normalZ:0};
}
root.SOLObstacles={surface,sweep,rampSide};
})(typeof window!=='undefined'?window:globalThis);
