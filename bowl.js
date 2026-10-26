(function(root){'use strict';
const bowl={x:0,z:-106,radius:15.24,depth:7.62};
// Vert transition: flat-bottomed bowl, smooth circular transition and a short near-vertical lip.
// Same analytic surface is used for render geometry, ground contact and wheel physics.
function height(x,z){
 const d=Math.hypot(x-bowl.x,z-bowl.z);
 if(d>=bowl.radius)return 0;
 const floorRadius=bowl.radius*.27,transition=bowl.radius-floorRadius;
 if(d<=floorRadius)return -bowl.depth;
 const u=(d-floorRadius)/transition;
 // Quarter-circle arc: slope approaches vertical at the coping.
 return -bowl.depth+bowl.depth*(1-Math.sqrt(Math.max(0,1-u*u)));
}
// Analytic radial gradient; finite differences across the rim sample the deck
// and cannot represent the near-vertical transition correctly.
function gradient(x,z){
 const dx=x-bowl.x,dz=z-bowl.z,r=Math.hypot(dx,dz);
 const floor=bowl.radius*.27,width=bowl.radius-floor;
 const u=Math.max(0,Math.min(.999999,(r-floor)/width));
 const g=bowl.depth/width*u/Math.sqrt(1-u*u);
 return {x:r?g*dx/r:0,z:r?g*dz/r:0,radial:g,r};
}
function sample(x,z){
 const g=gradient(x,z);if(g.r>=bowl.radius)return null;
 return {height:height(x,z),slope:g.z,slopeX:g.x,ramp:{curve:'bowl'},bowl:true};
}
// speed is distance along the riding surface, not horizontal speed. Integrate
// the elliptical transition by arc angle so it reaches a truly vertical lip
// without the singular height-field derivative pinning the rider in place.
function groundTravel(state,dt){
 const sign=state.travelSign===-1?-1:1,fx=Math.sin(state.dir)*sign,fz=Math.cos(state.dir)*sign;
 const dx=state.x-bowl.x,dz=state.z-bowl.z,r=Math.hypot(dx,dz);
 const floor=bowl.radius*.27,width=bowl.radius-floor;
 if(r<=floor||r<.001)return {dx:fx*state.speed*dt,dz:fz*state.speed*dt};
 const nx=dx/r,nz=dz/r,out=fx*nx+fz*nz,side=fx*(-nz)+fz*nx;
 const theta=Math.asin(Math.max(0,Math.min(1,(r-floor)/width)));
 const metric=t=>Math.hypot(width*Math.cos(t),bowl.depth*Math.sin(t));
 const g=gradient(state.x,state.z).radial;
 const radialPart=out*Math.hypot(1,g)/Math.hypot(1,g*out);
 const tangentPart=side/Math.hypot(1,g*out);
 const dtheta=state.speed*radialPart*dt/metric(theta);
 const nextTheta=Math.max(0,Math.min(Math.PI/2,theta+dtheta));
 let nr=floor+width*Math.sin(nextTheta);
 if(theta+dtheta<0)nr+=width*(theta+dtheta);
 const angle=Math.atan2(dz,dx)+state.speed*tangentPart*dt/r;
 return {dx:bowl.x+nr*Math.cos(angle)-state.x,dz:bowl.z+nr*Math.sin(angle)-state.z};
}
function roll(state,dt){
 const g=gradient(state.x,state.z),along=g.x*Math.sin(state.dir)+g.z*Math.cos(state.dir);
 const v=(state.travelSign===-1?-1:1)*state.speed-9.81*along/Math.hypot(1,along)*dt;
 state.travelSign=v<0?-1:1;state.speed=Math.min(17,Math.abs(v));
}
function vertLaunch(state,previous,contact){
 const g=gradient(state.x,state.z),r=g.r,sign=state.travelSign===-1?-1:1;
 const nx=(state.x-bowl.x)/Math.max(.01,r),nz=(state.z-bowl.z)/Math.max(.01,r);
 const outward=(Math.sin(state.dir)*nx+Math.cos(state.dir)*nz)*sign;
 // Take off at the coping, never from 79% of the radius. The final millimetres
 // of radial distance cover a vertical part of the surface.
 if(!previous.bowl||r<bowl.radius-.003||state.speed<2||outward<.25||state.rampCooldown>0)return false;
 const speed=state.speed;
 state.grounded=false;state.y=height(state.x,state.z);state.vy=speed*Math.max(.8,outward);
 // A small inward component clears the coping. No position resets during air.
 state.airVX=-nx*.65;state.airVZ=-nz*.65;
 state.airTime=0;state.rampCooldown=.25;
 state.name='VERT BOWL AIR';state.combo=(state.combo||0)+200;state.count=(state.count||0)+1;
 state.bowlAir={nx,nz,elapsed:0,duration:Math.max(.25,2*state.vy/19),turned:0};
 state.bowlStats=state.bowlStats||{launches:0,landings:0,recoveries:0};state.bowlStats.launches++;
 return true;
}
function guideAir(state,dt){
 const air=state.bowlAir;if(!air||state.grounded||state.grinding)return;
 air.elapsed+=dt;
 // Automatic half-turn brings the board back into the transition. Player yaw
 // remains additive; world-space momentum is independent of facing as usual.
 const t=Math.min(1,air.elapsed/air.duration),smooth=t*t*(3-2*t),turn=Math.PI*smooth;
 state.dir+=turn-air.turned;air.turned=turn;
}
function land(state,contact){
 if(!state.bowlAir||!contact.bowl||state.vy>=0||state.y>contact.height)return false;
 const g=gradient(state.x,state.z),vx=state.airVX||0,vz=state.airVZ||0,vy=state.vy;
 // Project the incoming velocity onto the full 3D surface tangent. Raw vertical
 // impact on a steep wall is not a flat-ground bail, and X slopes matter too.
 const nn=1+g.x*g.x+g.z*g.z,dot=(vy-g.x*vx-g.z*vz)/nn;
 const tx=vx+dot*g.x,tz=vz+dot*g.z,ty=vy-dot;
 state.speed=Math.min(17,Math.hypot(tx,ty,tz));
 state.travelSign=tx*Math.sin(state.dir)+tz*Math.cos(state.dir)<0?-1:1;
 state.y=state.groundY=contact.height;state.vy=0;state.grounded=true;state.bowlAir=null;
 state.name='VERT REENTRY';state.bowlStats.landings++;return true;
}
function mesh(B,scene,concrete,metal){const N=128,R=72,positions=[],indices=[],uvs=[];for(let j=0;j<=R;j++){const u=j/R;const rad=bowl.radius*(1-Math.pow(1-u,2.1));for(let i=0;i<=N;i++){const a=i*2*Math.PI/N,x=bowl.x+rad*Math.cos(a),z=bowl.z+rad*Math.sin(a);positions.push(x,height(x,z)+.015,z);uvs.push(x/4,z/4)}}for(let j=0;j<R;j++)for(let i=0;i<N;i++){const a=j*(N+1)+i,b=a+N+1;indices.push(a,a+1,b,b,a+1,b+1)}const m=new B.Mesh('100 foot wide 25 foot deep sculpted concrete bowl',scene),v=new B.VertexData();v.positions=positions;v.indices=indices;v.uvs=uvs;v.normals=[];B.VertexData.ComputeNormals(positions,indices,v.normals);v.applyToMesh(m);const bowlConcrete=concrete.clone('warm pale opaque textured bowl concrete');
// The inherited plaza texture rendered green in actual Chromium bowl captures.
// Use a neutral, dedicated concrete finish instead of sharing that texture.
bowlConcrete.diffuseTexture=null;
bowlConcrete.diffuseColor=new B.Color3(.83,.86,.87);
bowlConcrete.emissiveColor=new B.Color3(.21,.215,.22);
bowlConcrete.specularColor=new B.Color3(.09,.1,.1);
bowlConcrete.specularPower=32;
bowlConcrete.alpha=1;
bowlConcrete.forceDepthWrite=true;
bowlConcrete.transparencyMode=B.Material.MATERIAL_OPAQUE;
bowlConcrete.useAlphaFromDiffuseTexture=false;
bowlConcrete.backFaceCulling=false;
m.material=bowlConcrete;m.receiveShadows=true;const path=[];for(let i=0;i<=N;i++){const a=i*2*Math.PI/N;path.push(new B.Vector3(bowl.x+bowl.radius*Math.cos(a),.09,bowl.z+bowl.radius*Math.sin(a)))}const apronPositions=[],apronIndices=[],apronUvs=[];for(let i=0;i<=N;i++){const a=i*2*Math.PI/N,ca=Math.cos(a),sa=Math.sin(a),outer=16.55/Math.max(Math.abs(ca),Math.abs(sa));for(const rad of [bowl.radius,outer]){const x=bowl.x+rad*ca,z=bowl.z+rad*sa;apronPositions.push(x,.008,z);apronUvs.push(x/4,z/4)}}for(let i=0;i<N;i++){const k=i*2;apronIndices.push(k,k+1,k+2,k+1,k+3,k+2)}const apron=new B.Mesh('flush concrete bowl rim apron',scene),av=new B.VertexData();av.positions=apronPositions;av.indices=apronIndices;av.uvs=apronUvs;av.normals=[];B.VertexData.ComputeNormals(av.positions,av.indices,av.normals);av.applyToMesh(apron);apron.material=concrete;apron.receiveShadows=true;// Architectural bowl finish: inset colored tile bands and radial cast-concrete joints.
const bandMat=new B.StandardMaterial('bowl blue tile inlay',scene);
bandMat.diffuseColor=new B.Color3(.10,.37,.44);
bandMat.specularColor=new B.Color3(.16,.22,.23);
const seamMat=new B.StandardMaterial('bowl fine expansion joints',scene);
seamMat.diffuseColor=new B.Color3(.43,.48,.48);
for(const fraction of [.72,.78,.91]){
 const ring=[];
 for(let i=0;i<=N;i++){
  const a=i*2*Math.PI/N,rad=bowl.radius*fraction;
  const x=bowl.x+rad*Math.cos(a),z=bowl.z+rad*Math.sin(a);
  ring.push(new B.Vector3(x,height(x,z)+.035,z));
 }
 const band=B.MeshBuilder.CreateTube('inset bowl tile ring '+fraction,{path:ring,radius:fraction===.78?.055:.028,tessellation:6},scene);
 band.material=fraction===.78?bandMat:seamMat;
}
for(let k=0;k<16;k++){
 const a=k*2*Math.PI/16,path=[];
 for(let j=0;j<=24;j++){
  const rad=bowl.radius*(.12+.86*j/24),x=bowl.x+rad*Math.cos(a),z=bowl.z+rad*Math.sin(a);
  path.push(new B.Vector3(x,height(x,z)+.024,z));
 }
 const joint=B.MeshBuilder.CreateTube('radial concrete pour joint '+k,{path,radius:.012,tessellation:4},scene);
 joint.material=seamMat;
}
// Graffiti and stickers are drawn as decals conforming to the bowl's curved 3D surface.
const artTex=new B.DynamicTexture('bowl graffiti and stickers', {width:1024,height:512},scene,true);
const ctx=artTex.getContext();
ctx.clearRect(0,0,1024,512);
const sprays=[['SOL',180,145,'#e65a43',58,-.14],['SKATE',710,175,'#168f9b',54,.12],['VERT!',420,375,'#f3bb32',50,-.08],['RIDE',855,370,'#be65a9',48,.17]];
for(const [word,x,y,color,size,tilt] of sprays){
 ctx.save();ctx.translate(x,y);ctx.rotate(tilt);ctx.font='900 '+size+'px sans-serif';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#f4e9d4';ctx.strokeText(word,0,0);ctx.fillStyle=color;ctx.fillText(word,0,0);ctx.restore();
}
for(let k=0;k<24;k++){
 const x=(k*179+75)%1024,y=(k*113+57)%512;
 ctx.save();ctx.translate(x,y);ctx.rotate((k%7-3)*.16);
 ctx.fillStyle=['#f7e9cf','#e2aa41','#8ac4b2','#f19b8d'][k%4];
 ctx.fillRect(-19,-10,38,20);ctx.fillStyle='#253b40';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText(['SOL','RC','AIR','SK8'][k%4],0,4);ctx.restore();
}
artTex.hasAlpha=true;artTex.update();
const artMat=new B.StandardMaterial('bowl wall art material',scene);
artMat.diffuseTexture=artTex;artMat.opacityTexture=null;artMat.backFaceCulling=false;artMat.transparencyMode=B.Material.MATERIAL_ALPHABLEND;
artMat.useAlphaFromDiffuseTexture=true;artMat.disableLighting=true;artMat.zOffset=-3;
const artPositions=[],artIndices=[],artUvs=[];
const arcN=128,radialN=28;
for(let j=0;j<=radialN;j++){
 const rad=bowl.radius*(.43+.53*j/radialN);
 for(let i=0;i<=arcN;i++){
  const a=2*Math.PI*i/arcN,x=bowl.x+rad*Math.cos(a),z=bowl.z+rad*Math.sin(a);
  artPositions.push(x,height(x,z)+.16,z);
  artUvs.push(i/arcN,j/radialN);
 }
}
for(let j=0;j<radialN;j++)for(let i=0;i<arcN;i++){
 const a=j*(arcN+1)+i,b=a+arcN+1;
 artIndices.push(a,a+1,b,b,a+1,b+1);
}
const artMesh=new B.Mesh('curved bowl graffiti and sticker decals',scene);
const artData=new B.VertexData();artData.positions=artPositions;artData.indices=artIndices;artData.uvs=artUvs;artData.normals=[];
B.VertexData.ComputeNormals(artPositions,artIndices,artData.normals);artData.applyToMesh(artMesh);artMesh.material=artMat;
const coping=B.MeshBuilder.CreateTube('bowl continuous steel coping',{path,radius:.09,tessellation:10},scene);coping.material=metal;return m}
root.SOLBowl={bowl,height,gradient,sample,groundTravel,roll,vertLaunch,guideAir,land,mesh};
})(typeof window!=='undefined'?window:globalThis);
