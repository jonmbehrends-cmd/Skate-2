/* Chehalem / Newberg reconstruction. See qa/newberg/REFERENCES.md.
 * Photo-derived dimensions are estimates. One triangulated heightfield owns
 * both rendered concrete and wheel contact; there are no decorative fake bowls. */
(function(root){'use strict';
const enabled=typeof location!=='undefined'&&new URLSearchParams(location.search).get('park')!=='classic';
const W=62,D=46,NX=200,NZ=150,DX=W/NX,DZ=D/NZ;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Hand-shaped from the builder's oblique aerial, NOT a measured plan. Each
// connected area has one rim: overlapping primitive bowls made artificial
// ridges and internal coping across the deep return and shallow flow channel.
const basins=[
 {name:'deep end',depth:3.9,run:6.5,knots:[[28,10],[28,16],[26,19.5],[20,20],[12,21],[3,21],[-1,18],[-1,14],[3,11],[9,10],[10,5],[10,1],[12,-2],[16,-3],[21,-2],[26,1],[28,5]]},
 {name:'west kidney and snake run',depth:1.5,run:4.4,knots:[[-27,5],[-25,-.5],[-21,-3],[-16,-2],[-13,1],[-10,5.2],[-4,5.2],[2,4],[5,7],[3,10],[-3,11],[-9,12],[-14,14],[-20,15],[-25,12]]},
 {name:'shallow capsule',depth:1.5,run:4.2,knots:[[4,-12],[5,-16],[10,-18],[20,-18],[25,-16],[26,-12],[25,-8],[20,-6],[10,-6],[5,-8]]},
 {name:'beginner pocket',depth:.95,run:3.6,knots:[[-27,-11],[-26,-15],[-22,-17.5],[-17,-17.5],[-12,-15],[-10.5,-11],[-12,-7],[-17,-5],[-22,-5],[-26,-7]]}
];
function rimPoint(knots,t){
 const n=knots.length,u=((t%1)+1)%1*n,i=Math.floor(u),f=u-i;
 const a=knots[(i+n-1)%n],b=knots[i],c=knots[(i+1)%n],d=knots[(i+2)%n];
 return b.map((v,k)=>.5*(2*v+(-a[k]+c[k])*f+(2*a[k]-5*v+4*c[k]-d[k])*f*f+(-a[k]+3*v-3*c[k]+d[k])*f*f*f));
}
for(const b of basins){
 b.rim=Array.from({length:192},(_,i)=>rimPoint(b.knots,i/192));
 b.bounds={minX:Math.min(...b.rim.map(p=>p[0])),maxX:Math.max(...b.rim.map(p=>p[0])),minZ:Math.min(...b.rim.map(p=>p[1])),maxZ:Math.max(...b.rim.map(p=>p[1]))};
}
function rimDistance(b,x,z){
 if(x<b.bounds.minX||x>b.bounds.maxX||z<b.bounds.minZ||z>b.bounds.maxZ)return -1;
 let inside=false,distance=Infinity;
 for(let i=0,j=b.rim.length-1;i<b.rim.length;j=i++){
  const a=b.rim[j],c=b.rim[i],dx=c[0]-a[0],dz=c[1]-a[1];
  if((a[1]>z)!==(c[1]>z)&&x<(c[0]-a[0])*(z-a[1])/(c[1]-a[1])+a[0])inside=!inside;
  const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/Math.max(1e-12,dx*dx+dz*dz),0,1),ex=x-a[0]-t*dx,ez=z-a[1]-t*dz;
  distance=Math.min(distance,ex*ex+ez*ez);
 }return inside?Math.sqrt(distance):-1;
}
function copingPoint(b,i){
 const n=b.rim.length,p=b.rim[i%n],a=b.rim[(i+n-1)%n],c=b.rim[(i+1)%n],dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);
 // All rims wind counterclockwise in X/Z. Offset outward in the local
 // normal, rather than stretching from a center across a concave neck.
 // Clear a complete terrain cell diagonal so the triangulated lip cannot
 // poke through the tube between samples and split a continuous grind.
 return [p[0]+dz/length*.48,.045,p[1]-dx/length*.48];
}
function rawHeight(x,z){
 let y=0;
 for(const b of basins){const distance=rimDistance(b,x,z);if(distance>=0){const u=1-clamp(distance/b.run,0,1);y=Math.min(y,-b.depth*Math.sqrt(Math.max(0,1-u*u)));}}
 // The entrance volcano and paired roll-over humps are continuous concrete.
 const volcano=Math.hypot((x+.7)/3.05,(z+12)/3.05);
 if(volcano<1)y=Math.max(y,1.45*Math.pow(1-clamp((volcano-.21)/.79,0,1),1.55));
 // Blend the roll-over into its actual local floor. max(floor,hump) would
 // create a vertical step back to a recessed bowl at the hump's radius.
 for(const cz of [-1.8,2.1]){const r=Math.hypot((x+7.8)/3.2,(z-cz)/2.4);if(r<1){const w=Math.pow(1-r*r,2);y=y*(1-w)+.8*w;}}
 return y;
}
const heights=new Float64Array((NX+1)*(NZ+1));
for(let j=0;j<=NZ;j++)for(let i=0;i<=NX;i++)heights[j*(NX+1)+i]=rawHeight(-W/2+i*DX,-D/2+j*DZ);
function surface(x,z){
 const fx=clamp((x+W/2)/DX,0,NX-.0000001),fz=clamp((z+D/2)/DZ,0,NZ-.0000001);
 const i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j,k=j*(NX+1)+i;
 const a=heights[k],b=heights[k+1],c=heights[k+NX+1],d=heights[k+NX+2];
 if(Math.abs(x)>W/2||Math.abs(z)>D/2)return {height:0,x:0,z:0};
 return u+v<=1?{height:a+u*(b-a)+v*(c-a),x:(b-a)/DX,z:(c-a)/DZ}:
  {height:d+(1-u)*(c-d)+(1-v)*(b-d),x:(d-c)/DX,z:(d-b)/DZ};
}
const height=(x,z)=>surface(x,z).height;
const gradient=(x,z)=>{const s=surface(x,z);return {x:s.x,z:s.z,radial:Math.hypot(s.x,s.z),r:Math.hypot(x,z)}};
const ramp={curve:'newberg-flow'};
function sample(x,z){if(Math.abs(x)>W/2||Math.abs(z)>D/2)return null;const s=surface(x,z);return {height:s.height,slope:s.z,slopeX:s.x,bowl:true,newberg:true,ramp:Math.hypot(s.x,s.z)>.09?ramp:null};}
function groundTravel(s,dt){const g=gradient(s.x,s.z),sign=s.travelSign===-1?-1:1,x=Math.sin(s.dir)*sign,z=Math.cos(s.dir)*sign,metric=Math.hypot(1,g.x*x+g.z*z);return {dx:x*s.speed*dt/metric,dz:z*s.speed*dt/metric};}
function roll(s,dt){const g=gradient(s.x,s.z),grade=g.x*Math.sin(s.dir)+g.z*Math.cos(s.dir),v=(s.travelSign===-1?-1:1)*s.speed-9.81*grade/Math.hypot(1,grade)*dt;s.travelSign=v<0?-1:1;s.speed=Math.min(17,Math.abs(v));}
function vertLaunch(s,previous,contact){
 if(!previous.newberg||!contact.newberg||!s.grounded||s.grinding||s.rampCooldown>0||s.speed<4||contact.height<-.85||previous.height>-.08)return false;
 const sign=s.travelSign===-1?-1:1,gx=previous.slopeX||0,gz=previous.slope||0,grade=(gx*Math.sin(s.dir)+gz*Math.cos(s.dir))*sign;
 if(grade<1.2)return false;
 const g=Math.hypot(gx,gz);s.grounded=false;s.vy=Math.min(12,s.speed*grade/Math.hypot(1,grade));
 s.airVX=-gx/g*.55;s.airVZ=-gz/g*.55;s.airTime=0;s.rampCooldown=.5;s.grindCooldown=Math.max(s.grindCooldown||0,.6);
 s.name='NEWBERG VERT AIR';s.combo=(s.combo||0)+200;s.count=(s.count||0)+1;
 s.bowlAir={newberg:true,elapsed:0,duration:2*s.vy/19,turned:0};s.bowlStats=s.bowlStats||{launches:0,landings:0,recoveries:0};s.bowlStats.launches++;return true;
}
function guideAir(s,dt){const a=s.bowlAir;if(!a?.newberg||s.grounded||s.grinding)return;a.elapsed+=dt;const t=Math.min(1,a.elapsed/a.duration),turn=Math.PI*t*t*(3-2*t);s.dir+=turn-a.turned;a.turned=turn;}
function land(s,c){
 if(!s.bowlAir?.newberg||!c.newberg||s.vy>=0||s.y>c.height)return false;
 const g=gradient(s.x,s.z),vx=s.airVX||0,vz=s.airVZ||0,dot=(s.vy-g.x*vx-g.z*vz)/(1+g.x*g.x+g.z*g.z),tx=vx+dot*g.x,tz=vz+dot*g.z,ty=s.vy-dot;
 s.speed=Math.min(17,Math.hypot(tx,ty,tz));s.travelSign=tx*Math.sin(s.dir)+tz*Math.cos(s.dir)<0?-1:1;s.y=s.groundY=c.height;s.vy=0;s.grounded=true;s.bowlAir=null;s.name='NEWBERG REENTRY';s.bowlStats.landings++;return true;
}
function railPath(points,closed=false){const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+Math.hypot(...points[i].map((v,k)=>v-points[i-1][k])));return {kind:'bowl-coping',path:points,lengths,total:lengths.at(-1),closed};}
function pointAt(r,d){let t=r.closed?((d%r.total)+r.total)%r.total:clamp(d,0,r.total);let i=1;while(i<r.lengths.length-1&&r.lengths[i]<t)i++;const a=r.path[i-1],b=r.path[i],f=(t-r.lengths[i-1])/(r.lengths[i]-r.lengths[i-1]);return {p:a.map((v,k)=>v+(b[k]-v)*f),dx:b[0]-a[0],dz:b[2]-a[2]};}
function installGrinds(){
 const original=root.SOLGrind;
 root.SOLGrind={...original,find(s,rails,dt,stable,assist=false){
  const ordinary=original.find(s,rails.filter(r=>!r.path),dt,stable,assist);
  if(!stable||s.grinding||s.speed<1.3||s.grindCooldown>0||s.grounded&&!assist||s.vy>0&&!assist)return ordinary;
  let best=ordinary,bestDistance=Infinity;
  for(const rail of rails.filter(r=>r.path&&!(s.grounded&&r.raised)))for(let i=1;i<rail.path.length;i++){
   const a=rail.path[i-1],b=rail.path[i],dx=b[0]-a[0],dz=b[2]-a[2],l=dx*dx+dz*dz;
   const t=clamp(((s.x-a[0])*dx+(s.z-a[2])*dz)/Math.max(.0001,l),0,1),x=a[0]+dx*t,z=a[2]+dz*t,y=a[1]+(b[1]-a[1])*t;
   const distance=Math.hypot(s.x-x,s.z-z),along=(Math.sin(s.dir)*dx+Math.cos(s.dir)*dz)*(s.travelSign===-1?-1:1);
   if(distance>.42||Math.abs(s.y-y)>.34||Math.abs(along)<.15||distance>=bestDistance)continue;
   bestDistance=distance;best={rail,top:y,direction:along>=0?1:-1,arc:rail.lengths[i-1]+t*(rail.lengths[i]-rail.lengths[i-1])};
  }return best;
 },attach(s,c){if(!c?.rail.path)return original.attach(s,c);const q=pointAt(c.rail,c.arc),side=(s.x-q.p[0])*q.dz-(s.z-q.p[2])*q.dx;Object.assign(s,{grinding:true,grounded:false,grindRail:c.rail,grindArc:c.arc,grindTime:0,grindDirection:c.direction,grindType:s.grindRequestType==='boardslide'?'boardslide':'50-50',grindSide:side>=0?1:-1,x:q.p[0],y:q.p[1],z:q.p[2],vy:0,dir:Math.atan2(q.dx*c.direction,q.dz*c.direction),travelSign:1,grindRequestType:null});return true;
 },advance(s,dt){if(!s.grindRail?.path)return original.advance(s,dt);const r=s.grindRail,h=clamp(dt,0,.04);s.grindTime+=h;s.grindArc+=s.grindDirection*s.speed*h;const q=pointAt(r,s.grindArc);s.x=q.p[0];s.y=q.p[1];s.z=q.p[2];s.dir=Math.atan2(q.dx*s.grindDirection,q.dz*s.grindDirection);s.vy=0;s.speed=Math.max(0,s.speed-.75*h);s.combo+=(s.grindType==='boardslide'?170:110)*h;
  const ended=s.speed<1.5||s.grindTime>12||!r.closed&&(s.grindArc<0||s.grindArc>r.total);
  if(ended){s.grinding=false;s.grindRail=null;s.grindType=null;s.grindSide=null;s.grindCooldown=.5;s.grounded=false;s.y+=.01;s.vy=0;}return ended;
 }};
}
function install(B,scene,c){
 const {skater,grabMeshes,ramps,solids,rails,shadow,camera,overview,state}=c;
 for(const m of [...scene.meshes])if(!m.isDescendantOf(skater)&&!grabMeshes.includes(m))m.dispose();
 ramps.length=solids.length=rails.length=0;
 const mats=[],objects=[];
 function material(name,color){const m=new B.StandardMaterial(name,scene);m.diffuseColor=B.Color3.FromHexString(color);m.specularColor=new B.Color3(.04,.04,.04);m.alpha=1;m.transparencyMode=B.Material.MATERIAL_OPAQUE;mats.push(m);return m;}
 const concrete=material('Newberg weathered pale concrete','#c9c4b7'),coping=material('Newberg worn iron coping','#986f50'),grass=material('Ewing Young grass','#647754'),trunk=material('Oregon tree bark','#655245'),leaf=material('Oregon deciduous canopy','#899157'),pine=material('Oregon evergreen canopy','#3d5f4a'),steel=material('Newberg black entrance rails','#424744'),roof=material('Newberg shelter roof','#7e8279');
 const tex=new B.DynamicTexture('Newberg concrete aggregate',{width:512,height:512},scene,false),ctx=tex.getContext();ctx.fillStyle='#c9c4b7';ctx.fillRect(0,0,512,512);
 let seed=1301;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 for(let i=0;i<16000;i++){ctx.fillStyle=i%3?'rgba(73,68,58,.055)':'rgba(255,255,244,.11)';ctx.fillRect(rnd()*512,rnd()*512,1+rnd()*2,1+rnd()*2);}tex.update();tex.uScale=12;tex.vScale=9;concrete.diffuseTexture=tex;
 function box(name,x,y,z,w,h,d,mat){const m=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);m.material=mat;m.receiveShadows=true;objects.push(m);return m;}
 const positions=[],indices=[],uvs=[],colors=[];
 for(let j=0;j<=NZ;j++)for(let i=0;i<=NX;i++){
  const y=heights[j*(NX+1)+i];positions.push(-W/2+i*DX,y,-D/2+j*DZ);uvs.push(i/NX,j/NZ);
  // Baked ambient occlusion makes recessed floors legible under the open sky.
  // This shades the same solid concrete, rather than adding floating overlays.
  const occlusion=.66+.34*clamp((y+4)/4,0,1);colors.push(occlusion,occlusion,occlusion,1);
 }
 for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){const k=j*(NX+1)+i;indices.push(k,k+1,k+NX+1,k+1,k+NX+2,k+NX+1);}
 const terrain=new B.Mesh('NEWBERG SHARED CONCRETE SURFACE',scene),vd=new B.VertexData();vd.positions=positions;vd.indices=indices;vd.uvs=uvs;vd.colors=colors;vd.normals=[];B.VertexData.ComputeNormals(positions,indices,vd.normals);if(vd.normals[1]<0){for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];B.VertexData.ComputeNormals(positions,indices,vd.normals);}vd.applyToMesh(terrain);terrain.material=concrete;terrain.receiveShadows=true;objects.push(terrain);
 // Keep lawn outside the concrete footprint; a single ground plane would
 // cover every recessed bowl with grass at deck height.
 for(const [x,z,w,d] of [[-140.5,0,219,500],[140.5,0,219,500],[0,-136.5,W,227],[0,136.5,W,227]])box('Ewing Young surrounding lawn',x,-.12,z,w,.12,d,grass);
 // Coping follows the actual visible lip; omit internal overlapping-bowl seams.
 for(const b of basins){let run=[];const flush=()=>{if(run.length>2){const m=B.MeshBuilder.CreateTube('Newberg connected bowl coping',{path:run.map(p=>new B.Vector3(...p)),radius:.045,tessellation:7},scene);m.material=coping;objects.push(m);rails.push(railPath(run,run.length===b.rim.length+1));}run=[];};
  for(let i=0;i<=b.rim.length;i++){const p=copingPoint(b,i);if(height(p[0],p[2])<-.025){flush();continue;}run.push(p);}flush();
 }
 for(const side of [-1,1]){
  const points=[];for(let i=0;i<=40;i++){const z=-5+i*.24,x=-7.8+side*.26;points.push([x,height(x,z)+.58,z]);}
  const m=B.MeshBuilder.CreateTube('Newberg double barrel dragon rail',{path:points.map(p=>new B.Vector3(...p)),radius:.065,tessellation:9},scene);m.material=steel;objects.push(m);const rail=railPath(points);rail.raised=true;rails.push(rail);
 }
 const top=B.MeshBuilder.CreateCylinder('Newberg orange volcano cap',{diameter:1.23,height:.09,tessellation:32},scene);top.position.set(-.7,height(-.7,-12)+.045,-12);top.material=material('volcano orange','#b66b3f');objects.push(top);
 // A low open shelter and bleachers replace the invented downtown skyline.
 box('entrance walkway',-22,-.018,-28,9,.06,13,concrete);
 for(const x of [-27,-17])for(const z of [-28,-34])box('picnic shelter post',x,1.5,z,.18,3,.18,steel);
 const shelter=box('covered picnic shelter',-22,3.2,-31,12,.18,8,roof);shelter.rotation.z=.08;
 for(const z of [-29,-33]){box('picnic table',-22,.8,z,3,.09,.9,roof);for(const x of [-23,-21])box('picnic bench',x,.45,z,.36,.08,2,roof);}
 for(let j=0;j<4;j++){box('east side bleacher seat',34,.5+j*.4,10+j*.7,1,.08,9,roof);box('bleacher support',34,.22+j*.2,10+j*.7,.1,.45+j*.4,8,steel);}
 const trees=[];
 for(let i=0;i<54;i++){
  const angle=i/54*Math.PI*2,x=Math.cos(angle)*(38+rnd()*15),z=Math.sin(angle)*(30+rnd()*17),h=8+rnd()*10;
  const t=B.MeshBuilder.CreateCylinder('Newberg perimeter tree trunk',{height:h*.65,diameterTop:.18,diameterBottom:.58,tessellation:6},scene);t.position.set(x,h*.325,z);t.material=trunk;trees.push(t);
  if(i%3===0){for(let j=0;j<3;j++){const m=B.MeshBuilder.CreateCylinder('Newberg fir canopy',{height:h*.52,diameterTop:0,diameterBottom:4.2-j*.6,tessellation:8},scene);m.position.set(x,h*(.53+j*.14),z);m.material=pine;trees.push(m);}}
  else{for(let j=0;j<2;j++){const m=B.MeshBuilder.CreateSphere('Newberg broadleaf canopy',{diameter:5+j,segments:6},scene);m.position.set(x+(j-.5)*1.6,h*.65+j,z);m.scaling.y=1.3;m.material=leaf;trees.push(m);}}
 }
 for(const mat of [trunk,leaf,pine]){const members=trees.filter(m=>m.material===mat);const batch=B.Mesh.MergeMeshes(members,true,true,undefined,false,false);if(batch){batch.name='Ewing Young woodland '+mat.name;batch.isPickable=false;objects.push(batch);}}
 const signTex=new B.DynamicTexture('Chehalem entrance sign',{width:1024,height:256},scene,false),ink=signTex.getContext();ink.fillStyle='#354d42';ink.fillRect(0,0,1024,256);ink.fillStyle='#f1e9d3';ink.textAlign='center';ink.font='bold 100px sans-serif';ink.fillText('CHEHALEM',512,115);ink.font='36px sans-serif';ink.fillText('SKATEPARK   /   NEWBERG, OREGON',512,193);signTex.update();const signMat=material('Chehalem park sign','#ffffff');signMat.diffuseTexture=signTex;signMat.emissiveColor=new B.Color3(.12,.12,.12);box('Chehalem entrance sign',-16,1.35,-24.5,4.8,1.2,.1,signMat);
 scene.clearColor=new B.Color4(.76,.81,.82,1);scene.fogColor=new B.Color3(.76,.81,.82);scene.fogDensity=.003;
 scene.imageProcessingConfiguration.vignetteWeight=.35;scene.imageProcessingConfiguration.contrast=1.12;
 const sky=scene.getLightByName('sky'),sun=scene.getLightByName('sun');if(sky)sky.intensity=.53;if(sun){sun.direction=new B.Vector3(-.55,-1,.42);sun.intensity=1.25;}
 camera.radius=9;camera.heightOffset=3.6;camera.rotationOffset=165;
 overview.setTarget(new B.Vector3(0,-.7,0));overview.alpha=-1.08;overview.beta=.83;overview.fov=.95;
 const fitOverview=()=>{overview.radius=69*Math.max(1,1/scene.getEngine().getAspectRatio(overview));};fitOverview();root.addEventListener('resize',fitOverview);
 const place=()=>{Object.assign(state,{x:-22,z:-19,dir:.3,y:height(-22,-19),groundY:height(-22,-19),airCameraHeading:.3});skater.position.set(state.x,state.y+.045,state.z);};place();
 document.querySelector('#restart').addEventListener('click',place);
 const view=document.querySelector('#halfpipe');view.textContent='PARK VIEW';view.setAttribute('aria-label','View Newberg skatepark');view.addEventListener('click',()=>{place();state.halfpipePreviewUntil=Infinity;scene.activeCamera=overview;document.querySelector('#msg').textContent='CHEHALEM — PUSH TO RIDE';});
 root.addEventListener('keydown',e=>{if(e.code==='KeyR'&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey)place();});
 document.querySelector('#hud span').textContent='NEWBERG · CHEHALEM';
 root.SOLBowl={bowl:{x:0,z:0,radius:0,depth:3.9},height,gradient,sample,groundTravel,roll,vertLaunch,guideAir,land,mesh:()=>terrain};
 installGrinds();
 root.__SOL_DIAGNOSTICS__.park={name:'Newberg / Chehalem',replica:'photo-derived; dimensions estimated',terrain,basins,rails,objects,shadow,spawn:{x:-22,z:-19}};
 c.cameraObstacles.add(terrain.name);
 return {terrain,objects};
}
root.SOLNewberg={enabled,install,height,gradient,sample,groundTravel,roll,surface,basins,railPath,pointAt,width:W,depth:D};
})(typeof window!=='undefined'?window:globalThis);
