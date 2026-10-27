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
      if(x>minX+EPS&&x<maxX-EPS&&z>minZ+EPS&&z<maxZ-EPS){
        // Recover from a footprint overlap (spawn, numerical penetration,
        // or another moving collision). Previously this skipped the box
        // forever, letting the skater remain embedded in a wall.
        const escape=[
          {dist:x-minX,axis:'x',value:minX-EPS,normal:-1},
          {dist:maxX-x,axis:'x',value:maxX+EPS,normal:1},
          {dist:z-minZ,axis:'z',value:minZ-EPS,normal:-1},
          {dist:maxZ-z,axis:'z',value:maxZ+EPS,normal:1}
        ].sort((a,b)=>a.dist-b.dist)[0];
        if(escape.axis==='x'){x=escape.value;normalX=escape.normal;dx=0}
        else{z=escape.value;normalZ=escape.normal;dz=0}
        hit=true;
        continue;
      }
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
  let x=nx,z=nz,hit=false,normalX=0,normalZ=0;
  for(const r of ramps){
    // Raised halfpipe decks are solid from all sides: don't teleport a skater
    // standing on the ground through a 2.1m rear deck wall.
    if(r.curve==='halfpipe-deck'&&y<r.h-.13&&px>=r.x-r.w/2-radius&&px<=r.x+r.w/2+radius){
      const near=r.z-r.d/2-radius,far=r.z+r.d/2+radius;
      if(pz<=near&&z>near){z=near;hit=true;normalZ=-1}
      else if(pz>=far&&z<far){z=far;hit=true;normalZ=1}
    }
    const midZ=(pz+z)/2;
    if(midZ<r.z-r.d/2||midZ>r.z+r.d/2)continue;
    const t=(midZ-(r.z-r.d/2))/r.d;
    const height=root.SOLTerrain?root.SOLTerrain.profile(r,t).height:r.curve==='quarter'?r.h*t*t:r.h*t;
    if(y>=height-.13)continue;
    const left=r.x-r.w/2-radius,right=r.x+r.w/2+radius;
    if(px<=left&&x>left){x=left;hit=true;normalX=-1}
    else if(px>=right&&x<right){x=right;hit=true;normalX=1}
  }
  return {x,z,hit,normalX,normalZ};
}
root.SOLObstacles={surface,sweep,rampSide};
})(typeof window!=='undefined'?window:globalThis);
