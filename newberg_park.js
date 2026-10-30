/* Chehalem / Newberg reconstruction. See qa/newberg/REFERENCES.md.
 * Photo-derived dimensions are estimates. One triangulated heightfield owns
 * both rendered concrete and wheel contact; there are no decorative fake bowls. */
(function(root){'use strict';
const enabled=typeof location!=='undefined'&&new URLSearchParams(location.search).get('park')!=='classic';
// Preserve the original park at its exact contact resolution. Eight adjoining
// tiles use half that density and independent bounds for render frustum culling.
const W=186,D=138;
const xs=Array.from({length:401},(_,i)=>i<=100?-93+i*.62:i<=300?-31+(i-100)*.31:31+(i-300)*.62);
const zs=Array.from({length:301},(_,j)=>j<=75?-69+j*(46/75):j<=225?-23+(j-75)*(46/150):23+(j-225)*(46/75));
const NX=xs.length-1,NZ=zs.length-1;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Hand-shaped from the builder's oblique aerial, NOT a measured plan. Each
// connected area has one rim: overlapping primitive bowls made artificial
// ridges and internal coping across the deep return and shallow flow channel.
const basins=[
 {name:'deep end',depth:3.9,run:6.5,knots:[[28,10],[28,16],[26,19.5],[20,20],[12,21],[3,21],[-1,18],[-1,14],[3,11],[9,10],[10,5],[10,1],[12,-2],[16,-3],[21,-2],[26,1],[28,5]]},
 {name:'west kidney and snake run',depth:1.5,run:4.4,knots:[[-27,5],[-25,-.5],[-21,-3],[-16,-2],[-13,1],[-10,5.2],[-4,5.2],[2,4],[5,7],[3,10],[-3,11],[-9,12],[-14,14],[-20,15],[-25,12]]},
 {name:'shallow capsule',depth:1.5,run:4.2,knots:[[4,-12],[5,-16],[10,-18],[20,-18],[25,-16],[26,-12],[25,-8],[20,-6],[10,-6],[5,-8]]},
 {name:'beginner pocket',depth:.95,run:3.6,knots:[[-27,-11],[-26,-15],[-22,-17.5],[-17,-17.5],[-12,-15],[-10.5,-11],[-12,-7],[-17,-5],[-22,-5],[-26,-7]]},
 // Original expansion, not a claim about the real Chehalem site. Every area
 // has one continuous rim and ample flat connections around both ends.
 {name:'west river flow',depth:4.2,run:5.4,knots:[[-39,-10],[-39,8],[-47,21],[-59,27],[-75,24],[-84,13],[-84,-5],[-77,-21],[-65,-27],[-53,-23],[-47,-14]]},
 {name:'east competition bowl',depth:6.1,run:7.2,knots:[[84,-12],[85,10],[81,30],[70,38],[53,36],[42,26],[39,11],[42,-4],[40,-19],[49,-30],[65,-32],[78,-26]]},
 {name:'north long snake',depth:3.2,run:4.2,knots:[[-73,-43],[-65,-54],[-48,-58],[-27,-54],[-9,-48],[9,-52],[28,-58],[49,-56],[67,-48],[72,-39],[61,-35],[47,-41],[29,-45],[12,-39],[-7,-35],[-25,-40],[-46,-47],[-61,-42]]},
 {name:'south surf basin',depth:4.6,run:5.6,knots:[[-42,41],[-24,34],[-5,36],[12,33],[29,38],[37,47],[31,57],[15,61],[-5,57],[-26,61],[-43,56],[-50,48]]}
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
 const offset=b.bounds.minX< -31||b.bounds.maxX>31||b.bounds.minZ< -23||b.bounds.maxZ>23?.94:.48;
 return [p[0]+dz/length*offset,.045,p[1]-dx/length*offset];
}
function rawHeight(x,z){
 let y=0;
 // A finite, steep lip slope prevents square-root cusp cliffs and jagged
 // triangular rim artifacts on mobile's coarser outer terrain tiles.
 for(const b of basins){const distance=rimDistance(b,x,z);if(distance>=0){const t=clamp(distance/b.run,0,1);y=Math.min(y,-b.depth*(1-Math.pow(1-t,2.4)));}}
 // The entrance volcano and paired roll-over humps are continuous concrete.
 const volcano=Math.hypot((x+.7)/3.05,(z+12)/3.05);
 if(volcano<1)y=Math.max(y,1.45*Math.pow(1-clamp((volcano-.21)/.79,0,1),1.55));
 // Blend the roll-over into its actual local floor. max(floor,hump) would
 // create a vertical step back to a recessed bowl at the hump's radius.
 for(const cz of [-1.8,2.1]){const r=Math.hypot((x+7.8)/3.2,(z-cz)/2.4);if(r<1){const w=Math.pow(1-r*r,2);y=y*(1-w)+.8*w;}}
 // Broad pump islands blend into each local basin, without vertical edges.
 for(const [cx,cz,rx,rz,h] of [[-65,0,5,8,-.3],[61,8,6,9,-2.4],[-8,46,5,7,-.8]]){
  const r=Math.hypot((x-cx)/rx,(z-cz)/rz);if(r<1){const w=(1-r*r)**2;y=y*(1-w)+h*w;}
 }
 // A pair of long mellow banks makes the east/west promenades rideable lines.
 for(const [cx,cz]of [[-62,-34],[55,46]]){const r=Math.hypot((x-cx)/10,(z-cz)/4);if(r<1)y=Math.max(y,1.1*(1-r*r)**2);}
 // Southwest street island: mellow bank approaches, broad flat top and
 // chamfered corners. The render mesh and wheel solver use these same samples.
 const bank=Math.max(Math.abs(x+69)/13,Math.abs(z-45)/12);
 if(bank<1){const t=clamp((1-bank)/.42,0,1);y=Math.max(y,1.15*t*t*(3-2*t));}
 return y;
}
const heights=new Float64Array((NX+1)*(NZ+1));
for(let j=0;j<=NZ;j++)for(let i=0;i<=NX;i++)heights[j*(NX+1)+i]=rawHeight(xs[i],zs[j]);
function cell(axis,value){let a=0,b=axis.length-1;while(b-a>1){const m=(a+b)>>1;if(axis[m]<=value)a=m;else b=m;}return Math.min(axis.length-2,a);}
function surface(x,z){
 const i=cell(xs,x),j=cell(zs,z),DX=xs[i+1]-xs[i],DZ=zs[j+1]-zs[j],u=clamp((x-xs[i])/DX,0,1),v=clamp((z-zs[j])/DZ,0,1),k=j*(NX+1)+i;
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
 // Deep/competition bowls keep the original 1.2 gradient gate. The three
 // shallow bowls have gentler *physical* lips (0.63-0.86 maximum grade), so
 // 1.2 makes an automatic shallow launch mathematically unreachable. Relax
 // only near the inside edge of those specific bowls and only when climbing.
 // This cannot trigger on unrelated street banks, volcanoes, or flat ground.
 let requiredGrade=1.2;
 if(grade>0&&grade<requiredGrade){
  for(const b of basins){
   if(b.depth>1.5)continue;
   const edge=rimDistance(b,s.x,s.z);
   if(edge>=0&&edge<=Math.max(.5,Math.min(.9,s.speed*.05))){
    requiredGrade=Math.min(requiredGrade,Math.max(.42,.70*2.4*b.depth/b.run));
   }
  }
 }
 if(grade<requiredGrade)return false;
 const g=Math.hypot(gx,gz);s.grounded=false;s.vy=Math.min(12,s.speed*grade/Math.hypot(1,grade));
 s.airVX=-gx/g*.55;s.airVZ=-gz/g*.55;s.airTime=0;s.rampCooldown=.5;s.grindCooldown=Math.max(s.grindCooldown||0,.6);
 s.name='NEWBERG VERT AIR';s.combo=(s.combo||0)+200;s.count=(s.count||0)+1;
 s.bowlAir={newberg:true,elapsed:0,duration:2*s.vy/19,turned:0};
 // The shallow launch's actual ground-tangent pitch is presentation metadata:
 // it allows the rider to remain upright rather than following the nearly
 // vertical vy/very-small-inward-vx vector. Deep bowl state is unchanged.
 if(requiredGrade<1.2){s.bowlAir.shallow=true;s.bowlAir.launchPitch=Math.atan(grade);}s.bowlStats=s.bowlStats||{launches:0,landings:0,recoveries:0};s.bowlStats.launches++;return true;
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
 const {skater,grabMeshes,ramps,solids,rails,pads,shadow,camera,cameraAnchor,overview,state,restart}=c;
 for(const m of [...scene.meshes])if(!m.isDescendantOf(skater)&&!grabMeshes.includes(m))m.dispose();
 ramps.length=solids.length=rails.length=0;
 pads.length=0;pads.push({x:-69,z:45,w:14,d:12,h:1.15});
 const mats=[],objects=[];
 function material(name,color){const m=new B.StandardMaterial(name,scene);m.diffuseColor=B.Color3.FromHexString(color);m.specularColor=new B.Color3(.04,.04,.04);m.alpha=1;m.transparencyMode=B.Material.MATERIAL_OPAQUE;mats.push(m);return m;}
 const concrete=material('Newberg weathered pale concrete','#d5d0c5'),coping=material('Newberg worn iron coping','#707974'),grass=material('Ewing Young grass','#647754'),trunk=material('Oregon tree bark','#655245'),leaf=material('Oregon deciduous canopy','#899157'),pine=material('Oregon evergreen canopy','#3d5f4a'),steel=material('Newberg black entrance rails','#424744'),roof=material('Newberg shelter roof','#7e8279');
 coping.specularColor=new B.Color3(.45,.46,.43);coping.specularPower=48;
 // Three shared textures, including mipmaps, total approximately 3 MiB.
 // Terrain topology and the shared wheel-contact heightfield are unchanged.
 const surfaceArt=root.SOLParkSurfaceArt?.install(B,scene,concrete,grass,W,D);
 const hash=(x,z)=>{let n=Math.imul(x,374761393)^Math.imul(z,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
 let seed=1301;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 function box(name,x,y,z,w,h,d,mat){const m=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);m.material=mat;m.receiveShadows=true;objects.push(m);return m;}
 const terrainMeshes=[];
 for(const [j0,j1]of [[0,75],[75,225],[225,300]])for(const [i0,i1]of [[0,100],[100,300],[300,400]]){
 const positions=[],indices=[],uvs=[],colors=[],stride=i1-i0+1;
 for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
  const y=heights[j*(NX+1)+i];positions.push(xs[i],y,zs[j]);uvs.push((xs[i]+W/2)/W,(zs[j]+D/2)/D);
  // Baked ambient occlusion makes recessed floors legible under the open sky.
  // This shades the same solid concrete, rather than adding floating overlays.
  const weather=.975+.025*Math.sin(xs[i]*.23+Math.sin(zs[j]*.17))*Math.cos(zs[j]*.19),occlusion=(.82+.18*clamp((y+5.2)/5.2,0,1))*weather,tint=root.SOLParkSurfaceArt?.tint(xs[i],zs[j])||[1,1,1];colors.push(...tint.map(v=>v*occlusion),1);
 }
 for(let j=j0;j<j1;j++)for(let i=i0;i<i1;i++){const k=(j-j0)*stride+i-i0;indices.push(k,k+1,k+stride,k+1,k+stride+1,k+stride);}
 const core=i0===100&&j0===75,m=new B.Mesh(core?'NEWBERG SHARED CONCRETE SURFACE':'EXPANSION SHARED CONCRETE '+i0+','+j0,scene),vd=new B.VertexData();vd.positions=positions;vd.indices=indices;vd.uvs=uvs;vd.colors=colors;vd.normals=[];B.VertexData.ComputeNormals(positions,indices,vd.normals);if(vd.normals[1]<0){for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];B.VertexData.ComputeNormals(positions,indices,vd.normals);}vd.applyToMesh(m);m.material=concrete;m.receiveShadows=true;objects.push(m);terrainMeshes.push(m);
 }
 const terrain=terrainMeshes[4];
 // Keep lawn outside the concrete footprint; a single ground plane would
 // cover every recessed bowl with grass at deck height.
 const lawns=[];
 for(const [x,z,w,d] of [[-171.5,0,157,500],[171.5,0,157,500],[0,-159.5,W,181],[0,159.5,W,181]]){
  const m=B.MeshBuilder.CreateGround('Ewing Young surrounding lawn',{width:w,height:d,subdivisions:24},scene),p=m.getVerticesData(B.VertexBuffer.PositionKind);
  for(let i=0;i<p.length;i+=3){
   const wx=p[i]+x,wz=p[i+2]+z,fade=clamp(Math.max((Math.abs(wx)-140)/50,(Math.abs(wz)-110)/45),0,1);
   const hills=7*Math.exp(-(((wx+190)/78)**2+((wz+90)/100)**2))+5*Math.exp(-(((wx-200)/95)**2+((wz-50)/140)**2))+6*Math.exp(-(((wx+60)/130)**2+((wz-195)/75)**2));
   p[i+1]=-.06+fade*fade*(3-2*fade)*hills;
  }
  m.setVerticesData(B.VertexBuffer.PositionKind,p);const n=[];B.VertexData.ComputeNormals(p,m.getIndices(),n);m.setVerticesData(B.VertexBuffer.NormalKind,n);m.position.set(x,0,z);m.material=grass;m.receiveShadows=true;lawns.push(m);
 }
 const lawnBatch=B.Mesh.MergeMeshes(lawns,true,true,undefined,false,false);if(lawnBatch){lawnBatch.name='Ewing Young surrounding lawn';objects.push(lawnBatch);}
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
 box('entrance walkway',-102,-.018,-48,12,.06,20,concrete);
 for(const x of [-107,-97])for(const z of [-48,-54])box('picnic shelter post',x,1.5,z,.18,3,.18,steel);
 const shelter=box('covered picnic shelter',-102,3.2,-51,12,.18,8,roof);shelter.rotation.z=.08;
 for(const z of [-49,-53]){box('picnic table',-102,.8,z,3,.09,.9,roof);for(const x of [-103,-101])box('picnic bench',x,.45,z,.36,.08,2,roof);}
 for(let j=0;j<4;j++){box('east side bleacher seat',98,.5+j*.4,10+j*.7,1,.08,9,roof);box('bleacher support',98,.22+j*.2,10+j*.7,.1,.45+j*.4,8,steel);}
 // Long grind lines stay to the side of the clear circulation corridors.
 for(const [name,x,z,length,axis]of [['north promenade flatbar',0,-64.5,42,'x'],['west plaza flatbar',-35,0,22,'z'],['south plaza flatbar',3,27.5,26,'x'],['east plaza flatbar',89,0,28,'z']]){
  const path=[axis==='x'?[x-length/2,.48,z]:[x,.48,z-length/2],axis==='x'?[x+length/2,.48,z]:[x,.48,z+length/2]];
  const m=B.MeshBuilder.CreateTube(name,{path:path.map(p=>new B.Vector3(...p)),radius:.045,tessellation:8},scene);m.material=steel;objects.push(m);const rail=railPath(path);rail.raised=true;rails.push(rail);
  for(let i=0;i<=Math.floor(length/6);i++){const t=i/Math.floor(length/6),px=path[0][0]+(path[1][0]-path[0][0])*t,pz=path[0][2]+(path[1][2]-path[0][2])*t;box(name+' post',px,.22,pz,.08,.44,.08,steel);solids.push({x:px,z:pz,w:.08,d:.08,h:.44});}
 }
 const stone=material('expansion retaining wall','#727c77'),ochre=material('zone warm accent','#c88b57'),teal=material('zone cool accent','#467c7b');
 // Saw-cut slab joints only where an entire segment is flat concrete. Their
 // geometry sits on the deck; it never bridges or caps a recessed transition.
 const joints=[];
 for(let x=-90;x<=90;x+=6)for(let z=-66;z<66;z+=1){if([height(x,z),height(x,z+.5),height(x,z+1)].every(h=>Math.abs(h)<.0001))joints.push([new B.Vector3(x,.004,z),new B.Vector3(x,.004,z+1)]);}
 for(let z=-66;z<=66;z+=6)for(let x=-90;x<90;x+=1){if([height(x,z),height(x+.5,z),height(x+1,z)].every(h=>Math.abs(h)<.0001))joints.push([new B.Vector3(x,.004,z),new B.Vector3(x+1,.004,z)]);}
 const jointMesh=B.MeshBuilder.CreateLineSystem('concrete saw-cut slab joints',{lines:joints,useVertexAlpha:true},scene);jointMesh.color=new B.Color3(.42,.43,.40);jointMesh.alpha=.22;jointMesh.isPickable=false;objects.push(jointMesh);
 // Painted navigation, built into the flat promenades. Shared atlas and one
 // merged mesh keep markings inexpensive; clipping avoids any raised ground.
 const routeTex=new B.DynamicTexture('SOL route stencil atlas',{width:1024,height:256},scene,true),paint=routeTex.getContext();paint.translate(1024,256);paint.rotate(Math.PI);paint.clearRect(0,0,1024,256);paint.fillStyle='#457a78';paint.font='900 88px sans-serif';paint.textAlign='center';paint.fillText('SOL  /  KEEP FLOWING  >',512,159);routeTex.update();
 const routeMat=material('worn promenade stencil','#ffffff');routeMat.diffuseTexture=routeTex;routeMat.diffuseTexture.hasAlpha=true;routeMat.useAlphaFromDiffuseTexture=true;routeMat.transparencyMode=B.Material.MATERIAL_ALPHABLEND;routeMat.backFaceCulling=false;routeMat.zOffset=-1;
 const stencils=[];for(const [x,z,w,d,turn]of [[0,-62,15,3,0],[86,-35,15,3,-Math.PI/2],[0,65,15,3,Math.PI],[-89,0,15,3,Math.PI/2]]){const m=B.MeshBuilder.CreateGround('promenade wayfinding',{width:w,height:d},scene);m.position.set(x,.009,z);m.rotation.y=turn;m.material=routeMat;m.isPickable=false;stencils.push(m);}
 const stencilBatch=B.Mesh.MergeMeshes(stencils,true,true,undefined,false,false);if(stencilBatch){stencilBatch.name='SOL promenade painted wayfinding';stencilBatch.isPickable=false;objects.push(stencilBatch);}
 const streetPath=[[-75,1.19,45],[-63,1.19,45]],streetTube=B.MeshBuilder.CreateTube('street island top grind edge',{path:streetPath.map(p=>new B.Vector3(...p)),radius:.045,tessellation:8},scene);streetTube.material=coping;objects.push(streetTube);const streetRail=railPath(streetPath);streetRail.raised=true;rails.push(streetRail);
 // Visible perimeter and physical board bounds share the same inner edge.
 for(const [x,z,w,d]of [[-93.4,0,.8,D],[93.4,0,.8,D],[0,-69.4,W,.8],[0,69.4,W,.8]]){const wall=box('expansion perimeter seat wall',x,.3,z,w,.6,d,stone);c.cameraObstacles.add(wall.name);}
 function wallArt(name,x,z,w,turn,label,accent){
  const t=new B.DynamicTexture(name+' mural',{width:1024,height:256},scene,true),g=t.getContext();
  // Babylon's interior-facing box UVs rotate the atlas 180 degrees. Counter-
  // rotate the paint once so lettering reads upright from the skating surface.
  g.translate(1024,256);g.rotate(Math.PI);g.fillStyle='#263c3a';g.fillRect(0,0,1024,256);
  // Original river/contour graphics, painted onto the existing wall panels.
  // Subdued pigments and uneven coverage replace repeated hazard stripes.
  g.strokeStyle=accent;g.lineWidth=27;g.globalAlpha=.72;
  for(let j=0;j<3;j++){g.beginPath();for(let i=0;i<=80;i++){const x=i*1024/80,y=80+j*57+Math.sin(i*.12+j*.8)*37;if(i)g.lineTo(x,y);else g.moveTo(x,y);}g.stroke();}
  g.globalAlpha=.95;g.fillStyle='#203534';g.fillRect(175,66,674,124);g.fillStyle='#eee5ce';g.textAlign='center';g.font='700 65px sans-serif';g.fillText(label,512,149);
  g.font='18px sans-serif';g.fillText('S O L   /   O R I G I N A L   E X P A N S I O N',512,179);
  // Each district has its own original, restrained spray-painted silhouette.
  // Draw directly into the existing mural atlas: no extra mesh, billboard,
  // collider, transparency layer, external asset or additional draw call.
  // Keep the readable center lettering unobstructed on both wall faces.
  const district=name.startsWith('north')?'snake':name.startsWith('south')?'surf':name.startsWith('west')?'river':'competition';
  for(const mirrored of [false,true]){
   g.save();g.translate(mirrored?1024:0,0);if(mirrored)g.scale(-1,1);
   g.strokeStyle=accent;g.lineWidth=12;g.lineCap='round';g.lineJoin='round';g.globalAlpha=.83;
   g.beginPath();
   if(district==='snake'){
    g.moveTo(46,208);g.bezierCurveTo(160,201,37,156,149,141);
    g.bezierCurveTo(193,130,51,87,156,51);
   }else if(district==='surf'){
    g.moveTo(38,184);g.bezierCurveTo(62,91,130,79,162,149);
    g.bezierCurveTo(138,131,118,151,117,177);
    g.bezierCurveTo(101,203,67,214,38,184);
   }else if(district==='river'){
    g.moveTo(58,34);g.bezierCurveTo(156,75,42,122,146,165);
    g.bezierCurveTo(179,183,117,212,79,224);
   }else{
    g.moveTo(100,32);g.lineTo(100,73);g.moveTo(49,61);g.lineTo(76,88);
    g.moveTo(151,61);g.lineTo(124,88);g.moveTo(40,129);g.lineTo(75,129);
    g.moveTo(160,129);g.lineTo(125,129);g.moveTo(100,95);
    g.lineTo(125,129);g.lineTo(100,164);g.lineTo(75,129);g.closePath();
   }
   g.stroke();
   g.globalAlpha=.32;g.lineWidth=3;g.strokeStyle='#e5e4d4';
   g.stroke();g.restore();
  }
  g.globalAlpha=1;
  for(let i=0;i<3100;i++){const x=hash(i,19)*1024,y=hash(i,43)*256;g.globalAlpha=.04+hash(i,71)*.13;g.fillStyle=hash(i,91)>.5?'#e7e0d0':'#263c3a';g.fillRect(x,y,1+hash(i,3)*4,1+hash(i,7)*2);}
  g.globalAlpha=1;t.update();
  const m=material(name+' ink','#ffffff');m.diffuseTexture=t;m.emissiveColor=new B.Color3(.08,.08,.08);const panel=box(name,x,1.3,z,w,2.1,.18,m);panel.rotation.y=turn;
 }
 wallArt('north snake mural',0,-70.1,24,0,'LONG WAY HOME','#d3915d');
 wallArt('south surf mural',0,70.1,24,Math.PI,'SOL / SURF','#4c9993');
 wallArt('west flow mural',-94.1,0,20,Math.PI/2,'RIVER FLOW','#d3915d');
 wallArt('east competition mural',94.1,12,24,-Math.PI/2,'GO BIG','#4c9993');
 // Small route markers occupy the outer wall, never a bowl or riding lane.
 for(const [x,z]of [[-88,-69],[-88,69],[88,-69],[88,69]]){box('promenade accent',x,.65,z,5,.1,.5,(x*z>0?ochre:teal));}
 for(let i=0;i<18;i++){
  const a=i/18*Math.PI*2,r=1/Math.max(Math.abs(Math.cos(a))/98,Math.abs(Math.sin(a))/74),x=Math.cos(a)*r,z=Math.sin(a)*r;
  box('perimeter light mast',x,3.3,z,.12,6.6,.12,steel);box('perimeter light head',x,6.6,z,1.4,.12,.5,roof);
 }
 const trees=[],treeShadows=[];
 const shadeTex=new B.DynamicTexture('woodland soft contact shade',{width:64,height:64},scene,true),shadeCtx=shadeTex.getContext(),shade=shadeCtx.createRadialGradient(32,32,2,32,32,31);
 shade.addColorStop(0,'rgba(18,27,16,.24)');shade.addColorStop(.5,'rgba(18,27,16,.13)');shade.addColorStop(1,'rgba(18,27,16,0)');shadeCtx.fillStyle=shade;shadeCtx.fillRect(0,0,64,64);shadeTex.update();shadeTex.hasAlpha=true;
 const shadeMat=material('woodland ground contact shade','#000000');shadeMat.diffuseTexture=shadeTex;shadeMat.useAlphaFromDiffuseTexture=true;shadeMat.transparencyMode=B.Material.MATERIAL_ALPHABLEND;shadeMat.disableLighting=true;shadeMat.emissiveColor=B.Color3.Black();
 function crown(name,x,y,z,diameter,squash,key,mat){
  const m=B.MeshBuilder.CreateSphere(name,{diameter,segments:8},scene),vertices=m.getVerticesData(B.VertexBuffer.PositionKind);
  // A spatial function gives coincident seam vertices the same displacement.
  // This avoids both UV seam cracks and identical perfect ball silhouettes.
  for(let k=0;k<vertices.length;k+=3){const a=vertices[k],b=vertices[k+1],c=vertices[k+2],n=1+.09*Math.sin(a*2.7+b*1.3+key)*Math.cos(c*2.1-key);vertices[k]*=n;vertices[k+1]*=n;vertices[k+2]*=n;}
  m.setVerticesData(B.VertexBuffer.PositionKind,vertices);const normals=[];B.VertexData.ComputeNormals(vertices,m.getIndices(),normals);m.setVerticesData(B.VertexBuffer.NormalKind,normals);m.position.set(x,y,z);m.scaling.y=squash;m.material=mat;trees.push(m);
 }
 for(let i=0;i<54;i++){
  const angle=i/54*Math.PI*2,r=(1+rnd()*.12)/Math.max(Math.abs(Math.cos(angle))/108,Math.abs(Math.sin(angle))/84),x=Math.cos(angle)*r,z=Math.sin(angle)*r,h=8+rnd()*10;
  const t=B.MeshBuilder.CreateCylinder('Newberg perimeter tree trunk',{height:h*.65,diameterTop:.18,diameterBottom:.58,tessellation:6},scene);t.position.set(x,h*.325,z);t.material=trunk;trees.push(t);
  if(i%3===0){for(let j=0;j<5;j++){
   const m=B.MeshBuilder.CreateCylinder('Newberg fir canopy',{height:h*(.29-j*.016),diameterTop:.04,diameterBottom:4.8-j*.86,tessellation:12},scene),p=m.getVerticesData(B.VertexBuffer.PositionKind);
   for(let k=0;k<p.length;k+=3){const a=Math.atan2(p[k+2],p[k]),r=1+.14*Math.sin(a*5+i+j)+.07*Math.cos(a*7-j);p[k]*=r;p[k+2]*=r;if(p[k+1]<0)p[k+1]+=.16*Math.sin(a*4+i);}
   m.setVerticesData(B.VertexBuffer.PositionKind,p);const normals=[];B.VertexData.ComputeNormals(p,m.getIndices(),normals);m.setVerticesData(B.VertexBuffer.NormalKind,normals);m.position.set(x+Math.sin(i+j)*.15,h*(.47+j*.105),z+Math.cos(i+j)*.15);m.material=pine;trees.push(m);
  }}
  else{for(let j=0;j<4;j++){const a=j*2.4+i;crown('Newberg broadleaf canopy',x+Math.cos(a)*1.5,h*.64+Math.sin(j)*1.6,z+Math.sin(a)*1.5,4.1+hash(i,j)*1.7,.8+hash(j,i)*.45,i*7+j,leaf);}}
  const contact=B.MeshBuilder.CreateGround('woodland contact shade',{width:7,height:8},scene);contact.position.set(x,-.054,z);contact.rotation.y=i*.73;contact.material=shadeMat;contact.isPickable=false;treeShadows.push(contact);
 }
 for(const mat of [trunk,leaf,pine]){const members=trees.filter(m=>m.material===mat);const batch=B.Mesh.MergeMeshes(members,true,true,undefined,false,false);if(batch){batch.name='Ewing Young woodland '+mat.name;batch.isPickable=false;objects.push(batch);}}
 const shadeBatch=B.Mesh.MergeMeshes(treeShadows,true,true,undefined,false,false);if(shadeBatch){shadeBatch.name='Ewing Young woodland contact shade';shadeBatch.isPickable=false;objects.push(shadeBatch);}
 const signTex=new B.DynamicTexture('Chehalem entrance sign',{width:1024,height:256},scene,false),ink=signTex.getContext();ink.fillStyle='#354d42';ink.fillRect(0,0,1024,256);ink.fillStyle='#f1e9d3';ink.textAlign='center';ink.font='bold 100px sans-serif';ink.fillText('SOL SKATE',512,115);ink.font='36px sans-serif';ink.fillText('CHEHALEM CORE / ORIGINAL EXPANSION',512,193);signTex.update();const signMat=material('Chehalem park sign','#ffffff');signMat.diffuseTexture=signTex;signMat.emissiveColor=new B.Color3(.12,.12,.12);box('Chehalem entrance sign',-99,1.35,-40,6,1.5,.1,signMat);
 scene.clearColor=new B.Color4(.73,.82,.86,1);scene.fogColor=new B.Color3(.73,.82,.86);scene.fogDensity=.0018;
 // Copilot daylight proposal: lift shaded concrete midtones while retaining
 // the warm directional key, texture detail and the existing light count.
 scene.imageProcessingConfiguration.vignetteWeight=.18;scene.imageProcessingConfiguration.contrast=1.05;scene.imageProcessingConfiguration.exposure=1.12;
 const sky=scene.getLightByName('sky'),sun=scene.getLightByName('sun');if(sky){sky.intensity=.82;sky.diffuse=new B.Color3(.87,.94,1);}if(sun){sun.direction=new B.Vector3(-.32,-1,.26);sun.diffuse=new B.Color3(1,.94,.83);sun.intensity=1.28;}
 camera.radius=9;camera.heightOffset=3.6;camera.rotationOffset=165;
 overview.setTarget(new B.Vector3(0,-.7,0));overview.alpha=-1.08;overview.beta=.83;overview.fov=.95;
 const fitOverview=()=>{overview.radius=205*Math.max(1,1/scene.getEngine().getAspectRatio(overview));};fitOverview();root.addEventListener('resize',fitOverview);
 const place=()=>{Object.assign(state,{x:-22,z:-19,dir:.3,y:height(-22,-19),groundY:height(-22,-19),airCameraHeading:.3});skater.position.set(state.x,state.y+.045,state.z);};place();
 document.querySelector('#restart').addEventListener('click',place);
 const view=document.querySelector('#halfpipe');view.textContent='PARK VIEW';view.setAttribute('aria-label','View Newberg skatepark');view.addEventListener('click',()=>{place();state.halfpipePreviewUntil=Infinity;scene.activeCamera=overview;document.querySelector('#msg').textContent='CHEHALEM — PUSH TO RIDE';});
 // The expanded park has distinct districts. These flat, unobstructed
 // spawn cells aim toward each area while keeping the follow-camera BEHIND
 // the player inside park bounds; never start the camera behind perimeter walls.
 // Always reset
 // physics and held input before repositioning the skater.
 const spots=[
  {id:'core',label:'CHEHALEM / ORIGINAL',x:-22,z:-19,dir:.3},
  {id:'river',label:'WEST / RIVER FLOW',x:-74,z:33,dir:Math.PI},
  {id:'competition',label:'EAST / COMPETITION',x:70,z:45,dir:Math.PI},
  {id:'snake',label:'NORTH / SNAKE RUN',x:-80,z:-49,dir:Math.PI/2},
  {id:'surf',label:'SOUTH / SURF BASIN',x:-55,z:48,dir:Math.PI/2},
  {id:'street',label:'STREET / GRIND ISLAND',x:-79,z:58,dir:Math.PI/2+.4}
 ];
 const spotsToggle=document.createElement('button');spotsToggle.type='button';
 spotsToggle.id='spotsToggle';spotsToggle.textContent='SPOTS';
 spotsToggle.setAttribute('aria-label','Choose a skatepark district');
 spotsToggle.setAttribute('aria-controls','spotsPanel');
 spotsToggle.setAttribute('aria-expanded','false');
 const spotsPanel=document.createElement('div');spotsPanel.id='spotsPanel';spotsPanel.hidden=true;
 spotsPanel.setAttribute('role','group');spotsPanel.setAttribute('aria-label','Skatepark district selection');
 const heading=document.createElement('div');heading.className='spotsHeading';heading.textContent='CHOOSE YOUR LINE';
 spotsPanel.appendChild(heading);
 const closeSpots=()=>{spotsPanel.hidden=true;spotsToggle.setAttribute('aria-expanded','false');};
 spotsToggle.addEventListener('click',()=>{
  const opened=spotsPanel.hidden;spotsPanel.hidden=!opened;spotsToggle.setAttribute('aria-expanded',String(opened));
 });
 for(const spot of spots){
  const button=document.createElement('button');button.type='button';button.className='spotsChoice';
  button.dataset.spot=spot.id;button.textContent=spot.label;
  button.addEventListener('click',()=>{
   const earned=state.score;
   // The same reset as RESTART clears touch pointers, stick and gamepad input,
   // tricks, grind states, and airborne momentum before travel.
   restart();
   const ground=height(spot.x,spot.z);
   Object.assign(state,{x:spot.x,z:spot.z,dir:spot.dir,y:ground,groundY:ground,
    speed:0,vy:0,travelSign:1,score:earned,grounded:true,grinding:false,
    rampCooldown:.5,airCameraHeading:spot.dir,halfpipePreviewUntil:0});
   skater.position.set(spot.x,ground+.045,spot.z);
   // FollowCamera normally catches up at at most 16 m/s. A district jump
   // can span 150 m, leaving the skater entirely off-screen for seconds.
   // Snap the *existing* camera and its independent heading anchor once,
   // then return all regular camera smoothing and obstacle handling to the
   // unchanged game loop.
   cameraAnchor.position.copyFrom(skater.position);
   cameraAnchor.rotation.y=spot.dir;
   const followYaw=spot.dir+camera.rotationOffset*Math.PI/180;
   camera.position.set(spot.x+Math.sin(followYaw)*camera.radius,
    ground+camera.heightOffset,spot.z+Math.cos(followYaw)*camera.radius);
   camera.setTarget(new B.Vector3(spot.x,ground+1.15,spot.z));
   scene.activeCamera=camera;
   const message=document.querySelector('#msg');
   message.textContent=spot.label+' — PUSH TO RIDE';
   state.messageUntil=performance.now()+2200;
   closeSpots();
  });
  spotsPanel.appendChild(button);
 }
 document.body.append(spotsToggle,spotsPanel);
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!spotsPanel.hidden){closeSpots();spotsToggle.focus();}});
 root.addEventListener('keydown',e=>{if(e.code==='KeyR'&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey)place();});
 document.querySelector('#hud span').textContent='CHEHALEM + SOL EXPANSION';
 root.SOLBowl={bowl:{x:0,z:0,radius:0,depth:3.9},height,gradient,sample,groundTravel,roll,vertLaunch,guideAir,land,mesh:()=>terrain};
 installGrinds();
 // Batch repeated static box fixtures by material; rider/skinned meshes,
 // culled terrain tiles, coping and named light/trunk diagnostics are isolated.
 // This controls CPU submissions as the park grows without adding per-frame work.
 const fixtureBatches=[];
 for(const mat of mats){const group=objects.filter(m=>m.material===mat&&m.getTotalVertices()===24&&m.name!=='perimeter light mast');if(group.length<2)continue;
  const blocksCamera=group.some(m=>c.cameraObstacles.has(m.name)),batch=B.Mesh.MergeMeshes(group,true,true,undefined,false,false);
  if(batch){batch.name='SOL static fixtures '+mat.name;batch.receiveShadows=true;if(blocksCamera)c.cameraObstacles.add(batch.name);for(const m of group){const i=objects.indexOf(m);if(i>=0)objects.splice(i,1);}objects.push(batch);fixtureBatches.push({material:mat.name,before:group.length,after:1});}
 }
 root.__SOL_DIAGNOSTICS__.park={name:'Newberg / Chehalem',replica:'Photo-derived core; original SOL expansion',terrain,terrainMeshes,basins,rails,objects,shadow,fixtureBatches,surfaceArt,width:W,depth:D,spawn:{x:-22,z:-19},spots:spots.map(({id,label,x,z,dir})=>({id,label,x,z,dir}))};
 for(const m of terrainMeshes){c.cameraObstacles.add(m.name);m.freezeWorldMatrix();}for(const m of objects)if(!m.isWorldMatrixFrozen)m.freezeWorldMatrix();
 return {terrain,objects};
}
// Expose the same launch predicate used by SOLBowl after install so pure
// geometry regressions can execute it before initializing WebGL.
root.SOLNewberg={enabled,install,height,gradient,sample,groundTravel,roll,vertLaunch,surface,basins,railPath,pointAt,width:W,depth:D};
})(typeof window!=='undefined'?window:globalThis);
