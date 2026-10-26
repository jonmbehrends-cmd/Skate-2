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
function sample(x,z){const dx=x-bowl.x,dz=z-bowl.z,d=Math.hypot(dx,dz);if(d>=bowl.radius)return null;const h=height(x,z),slope=(height(x,z+.1)-height(x,z-.1))/.2;return {height:h,slope,ramp:{curve:'bowl'},bowl:true}}
function roll(state,dt){const dx=state.x-bowl.x,dz=state.z-bowl.z,d=Math.hypot(dx,dz);if(d>=bowl.radius||d<.001)return;const gradient=Math.min(7,(height(bowl.x+Math.min(bowl.radius-.03,d+.06),bowl.z)-height(bowl.x+Math.max(0,d-.06),bowl.z))/.12);const dir=(Math.sin(state.dir)*dx+Math.cos(state.dir)*dz)/d;const sign=state.travelSign===-1?-1:1;const v=sign*state.speed-9.81*gradient*dir*Math.min(.05,dt);state.travelSign=v<0?-1:1;state.speed=Math.min(17,Math.abs(v))}
function vertLaunch(state,previous,contact){
 const dx=state.x-bowl.x,dz=state.z-bowl.z,d=Math.hypot(dx,dz);
 const outward=(Math.sin(state.dir)*dx+Math.cos(state.dir)*dz)/Math.max(.01,d)*(state.travelSign===-1?-1:1);
 if(!previous.bowl||d<bowl.radius*.89||d>bowl.radius+1.25||state.speed<5||outward<.2||state.rampCooldown>0)return false;
 const speed=state.speed;
 const nx=dx/Math.max(.01,d),nz=dz/Math.max(.01,d);
 state.grounded=false;
 state.x=bowl.x+nx*(bowl.radius-.75);
 state.z=bowl.z+nz*(bowl.radius-.75);
 state.y=Math.max(state.y,height(state.x,state.z))+.12;
 state.vy=Math.min(15,8.5+speed*.32);
 state.airTime=0;state.rampCooldown=.7;
 state.name='VERT BOWL AIR';state.combo=(state.combo||0)+200;state.count=(state.count||0)+1;
 // Hold the launch at the lip and then carry the rider inward over the transition.
 state.speed=Math.min(3,Math.max(1.5,speed*.16));
 state.bowlAir={nx,nz,elapsed:0,phase:'rise'};
 return true;
}
function guideAir(state,dt){
 const air=state.bowlAir;
 if(!air||state.grounded||state.grinding)return;
 air.elapsed+=dt;
 const d=Math.hypot(state.x-bowl.x,state.z-bowl.z);
 // Aerial momentum turns inward at the apex instead of continuing over the deck.
 if(state.vy<2||air.elapsed>.48)air.phase='return';
 if(air.phase==='return'){
  const target=bowl.radius-Math.min(5.2,1.1+Math.max(0,-state.vy)*.2);
  const next=d+(target-d)*Math.min(1,dt*3.5);
  state.x=bowl.x+air.nx*Math.max(bowl.radius*.35,next);
  state.z=bowl.z+air.nz*Math.max(bowl.radius*.35,next);
  state.speed=Math.min(state.speed,2.4);
 }else{
  const next=Math.min(d,bowl.radius-.45);
  state.x=bowl.x+air.nx*next;
  state.z=bowl.z+air.nz*next;
 }
 if(state.grounded||air.elapsed>3)state.bowlAir=null;
}
function mesh(B,scene,concrete,metal){const N=128,R=72,positions=[],indices=[],uvs=[];for(let j=0;j<=R;j++){const u=j/R;const rad=bowl.radius*(1-Math.pow(1-u,2.1));for(let i=0;i<=N;i++){const a=i*2*Math.PI/N,x=bowl.x+rad*Math.cos(a),z=bowl.z+rad*Math.sin(a);positions.push(x,height(x,z)+.015,z);uvs.push(x/4,z/4)}}for(let j=0;j<R;j++)for(let i=0;i<N;i++){const a=j*(N+1)+i,b=a+N+1;indices.push(a,a+1,b,b,a+1,b+1)}const m=new B.Mesh('100 foot wide 25 foot deep sculpted concrete bowl',scene),v=new B.VertexData();v.positions=positions;v.indices=indices;v.uvs=uvs;v.normals=[];B.VertexData.ComputeNormals(positions,indices,v.normals);v.applyToMesh(m);const bowlConcrete=new B.StandardMaterial('warm pale skate bowl concrete',scene);
bowlConcrete.diffuseColor=new B.Color3(.58,.63,.63);
bowlConcrete.ambientColor=new B.Color3(.27,.29,.29);
bowlConcrete.specularColor=new B.Color3(.09,.1,.1);
bowlConcrete.specularPower=32;
bowlConcrete.backFaceCulling=false;
m.material=bowlConcrete;m.receiveShadows=true;const path=[];for(let i=0;i<=N;i++){const a=i*2*Math.PI/N;path.push(new B.Vector3(bowl.x+bowl.radius*Math.cos(a),.09,bowl.z+bowl.radius*Math.sin(a)))}const apronPositions=[],apronIndices=[],apronUvs=[];for(let i=0;i<=N;i++){const a=i*2*Math.PI/N,ca=Math.cos(a),sa=Math.sin(a),outer=16/Math.max(Math.abs(ca),Math.abs(sa));for(const rad of [bowl.radius,outer]){const x=bowl.x+rad*ca,z=bowl.z+rad*sa;apronPositions.push(x,.008,z);apronUvs.push(x/4,z/4)}}for(let i=0;i<N;i++){const k=i*2;apronIndices.push(k,k+1,k+2,k+1,k+3,k+2)}const apron=new B.Mesh('flush concrete bowl rim apron',scene),av=new B.VertexData();av.positions=apronPositions;av.indices=apronIndices;av.uvs=apronUvs;av.normals=[];B.VertexData.ComputeNormals(av.positions,av.indices,av.normals);av.applyToMesh(apron);apron.material=concrete;apron.receiveShadows=true;// Architectural bowl finish: inset colored tile bands and radial cast-concrete joints.
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
// Graffiti and stickers are drawn as decals conforming to the bowl's curved 3D surface.
const artTex=new B.DynamicTexture('bowl graffiti and stickers', {width:1024,height:512},scene,true);
const ctx=artTex.getContext();
ctx.clearRect(0,0,1024,512);
const sprays=[['SOL',180,145,'#e65a43',95,-.14],['SKATE',710,175,'#168f9b',83,.12],['VERT!',420,375,'#f3bb32',75,-.08],['RIDE',855,370,'#be65a9',62,.17]];
for(const [word,x,y,color,size,tilt] of sprays){
 ctx.save();ctx.translate(x,y);ctx.rotate(tilt);ctx.font='900 '+size+'px sans-serif';ctx.textAlign='center';ctx.lineWidth=14;ctx.strokeStyle='#263943';ctx.strokeText(word,0,0);ctx.fillStyle=color;ctx.fillText(word,0,0);ctx.restore();
}
for(let k=0;k<24;k++){
 const x=(k*179+75)%1024,y=(k*113+57)%512;
 ctx.save();ctx.translate(x,y);ctx.rotate((k%7-3)*.16);
 ctx.fillStyle=['#f7e9cf','#e2aa41','#8ac4b2','#f19b8d'][k%4];
 ctx.fillRect(-19,-10,38,20);ctx.fillStyle='#253b40';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText(['SOL','RC','AIR','SK8'][k%4],0,4);ctx.restore();
}
artTex.hasAlpha=true;artTex.update();
const artMat=new B.StandardMaterial('bowl wall art material',scene);
artMat.diffuseTexture=artTex;artMat.opacityTexture=artTex;artMat.backFaceCulling=false;
artMat.useAlphaFromDiffuseTexture=true;artMat.disableLighting=true;
const artPositions=[],artIndices=[],artUvs=[];
const arcN=128,radialN=28;
for(let j=0;j<=radialN;j++){
 const rad=bowl.radius*(.43+.53*j/radialN);
 for(let i=0;i<=arcN;i++){
  const a=2*Math.PI*i/arcN,x=bowl.x+rad*Math.cos(a),z=bowl.z+rad*Math.sin(a);
  artPositions.push(x,height(x,z)+.055,z);
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
root.SOLBowl={bowl,height,sample,roll,vertLaunch,guideAir,mesh};
})(typeof window!=='undefined'?window:globalThis);
