(function(root){'use strict';
const bowl={x:0,z:-106,radius:15.24,depth:7.62};
function height(x,z){const d=Math.hypot(x-bowl.x,z-bowl.z);if(d>=bowl.radius)return 0;const t=Math.max(0,(d/bowl.radius-.18)/.82);return -bowl.depth*(1-Math.pow(t,2.25))}
function sample(x,z){const dx=x-bowl.x,dz=z-bowl.z,d=Math.hypot(dx,dz);if(d>=bowl.radius)return null;const h=height(x,z),slope=(height(x,z+.1)-height(x,z-.1))/.2;return {height:h,slope,ramp:{curve:'bowl'},bowl:true}}
function roll(state,dt){const dx=state.x-bowl.x,dz=state.z-bowl.z,d=Math.hypot(dx,dz);if(d>=bowl.radius||d<.001)return;const gradient=(height(bowl.x+d+.06,bowl.z)-height(bowl.x+Math.max(0,d-.06),bowl.z))/.12;const dir=(Math.sin(state.dir)*dx+Math.cos(state.dir)*dz)/d;const sign=state.travelSign===-1?-1:1;const v=sign*state.speed-9.81*gradient*dir*Math.min(.05,dt);state.travelSign=v<0?-1:1;state.speed=Math.min(17,Math.abs(v))}
function mesh(B,scene,concrete,metal){const N=96,R=32,positions=[],indices=[],uvs=[];for(let j=0;j<=R;j++){const rad=bowl.radius*j/R;for(let i=0;i<=N;i++){const a=i*2*Math.PI/N,x=bowl.x+rad*Math.cos(a),z=bowl.z+rad*Math.sin(a);positions.push(x,height(x,z)+.015,z);uvs.push(x/4,z/4)}}for(let j=0;j<R;j++)for(let i=0;i<N;i++){const a=j*(N+1)+i,b=a+N+1;indices.push(a,a+1,b,b,a+1,b+1)}const m=new B.Mesh('100 foot wide 25 foot deep sculpted concrete bowl',scene),v=new B.VertexData();v.positions=positions;v.indices=indices;v.uvs=uvs;v.normals=[];B.VertexData.ComputeNormals(positions,indices,v.normals);v.applyToMesh(m);m.material=concrete;m.material.backFaceCulling=false;m.receiveShadows=true;const path=[];for(let i=0;i<=N;i++){const a=i*2*Math.PI/N;path.push(new B.Vector3(bowl.x+bowl.radius*Math.cos(a),.09,bowl.z+bowl.radius*Math.sin(a)))}const apronPositions=[],apronIndices=[],apronUvs=[];for(let i=0;i<=N;i++){const a=i*2*Math.PI/N,ca=Math.cos(a),sa=Math.sin(a),outer=16/Math.max(Math.abs(ca),Math.abs(sa));for(const rad of [bowl.radius,outer]){const x=bowl.x+rad*ca,z=bowl.z+rad*sa;apronPositions.push(x,.008,z);apronUvs.push(x/4,z/4)}}for(let i=0;i<N;i++){const k=i*2;apronIndices.push(k,k+1,k+2,k+1,k+3,k+2)}const apron=new B.Mesh('flush concrete bowl rim apron',scene),av=new B.VertexData();av.positions=apronPositions;av.indices=apronIndices;av.uvs=apronUvs;av.normals=[];B.VertexData.ComputeNormals(av.positions,av.indices,av.normals);av.applyToMesh(apron);apron.material=concrete;apron.receiveShadows=true;// Architectural bowl finish: inset colored tile bands and radial cast-concrete joints.
const bandMat=new B.StandardMaterial('bowl blue tile inlay',scene);
bandMat.diffuseColor=new B.Color3(.10,.37,.44);
bandMat.specularColor=new B.Color3(.16,.22,.23);
const seamMat=new B.StandardMaterial('bowl fine expansion joints',scene);
seamMat.diffuseColor=new B.Color3(.33,.37,.38);
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
const coping=B.MeshBuilder.CreateTube('bowl continuous steel coping',{path,radius:.09,tessellation:10},scene);coping.material=metal;return m}
root.SOLBowl={bowl,height,sample,roll,mesh};
})(typeof window!=='undefined'?window:globalThis);
