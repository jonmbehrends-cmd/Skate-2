/* SOL SKATE — skatepark architectural mesh pass.
 * Visual-only dressing around existing authoritative rideable surfaces.
 * Avoid placing non-colliding objects in travel lanes.
 */
(function(root){'use strict';
function build(B,scene,ramps){
 const objects=[];
 function material(name,hex,rough){
  const m=new B.PBRMaterial(name,scene);
  m.albedoColor=B.Color3.FromHexString(hex);
  m.metallic=rough?0:.72;m.roughness=rough?.88:.28;
  return m;
 }
 const cement=material('architectural exposed concrete','#a8a49b',true);
 const dark=material('recessed concrete','#474c50',true);
 const metal=material('galvanized park coping','#9aa8b0',false);
 const yellow=material('park edge markings','#d7aa50',true);
 // Warm, solid wall-mounted industrial fixtures: emissive appearance without
 // expensive dynamic lights or any changes to the skating collision world.
 const fixture=material('recessed wall light housing','#323b3f',false);
 const lamp=new B.StandardMaterial('warm wall-washer lens',scene);
 lamp.diffuseColor=B.Color3.FromHexString('#e7d7b7');
 lamp.emissiveColor=B.Color3.FromHexString('#8c7858');
 lamp.alpha=1;lamp.transparencyMode=B.Material.MATERIAL_OPAQUE;
 lamp.forceDepthWrite=true;
 // Shared, opaque, hand-painted concrete stencil. One 1024px atlas is reused
 // across the deck fascia and perimeter walls; no extra network assets.
 const muralTexture=new B.DynamicTexture('park concrete stencil atlas',{width:1024,height:256},scene,false);
 const ink=muralTexture.getContext();
 ink.fillStyle='#374047';ink.fillRect(0,0,1024,256);
 // Layered, weathered street-art paint on the existing wall/deck mural atlas.
 // This adds no meshes, collisions, transparent skins or mobile texture fetches.
 for(const [x,y,w,h,color,angle] of [
  [90,48,320,92,'#245e66',-.14],[575,75,340,82,'#865044',.12],
  [350,165,290,35,'#ab8856',-.08]]){
  ink.save();ink.translate(x,y);ink.rotate(angle);ink.fillStyle=color;
  ink.fillRect(0,0,w,h);ink.restore();
 }
 for(let i=0;i<170;i++){
  const x=(i*137+43)%1024,y=(i*71+19)%256;
  ink.fillStyle=i%4===0?'#a2a39a':i%3===0?'#26383d':'#495157';
  ink.fillRect(x,y,2+(i%9)*3,1+(i%3));
 }
 // The stencil remains readable above the paint and the scratches.
 for(let i=0;i<45;i++){
  const x=(i*181+9)%1024,y=(i*53+23)%256;
  ink.strokeStyle=i%2?'#a4b2ac':'#27363b';ink.lineWidth=1;
  ink.beginPath();ink.moveTo(x,y);ink.lineTo(x+13+(i%5)*6,y-2);ink.stroke();
 }
 ink.fillStyle='#d3c9ad';ink.fillRect(22,24,980,6);ink.fillRect(22,222,980,5);
 for(const x of [28,958]){ink.fillStyle='#c18a48';for(let i=0;i<5;i++){ink.save();ink.translate(x+i*8,185);ink.rotate(-.45);ink.fillRect(0,0,7,42);ink.restore();}}
 ink.font='bold 112px sans-serif';ink.textAlign='center';ink.fillStyle='#e9e0c9';ink.fillText('SOL SKATE',512,147);
 ink.font='bold 28px sans-serif';ink.fillStyle='#c69c64';ink.fillText('CONCRETE  /  COPING  /  FLOW',512,198);
 muralTexture.update();
 const muralMat=new B.StandardMaterial('architectural skatepark mural',scene);
 muralMat.diffuseTexture=muralTexture;muralMat.emissiveColor=new B.Color3(.10,.10,.10);
 muralMat.specularColor=new B.Color3(.025,.025,.025);muralMat.alpha=1;
 muralMat.transparencyMode=B.Material.MATERIAL_OPAQUE;muralMat.forceDepthWrite=true;
 muralMat.backFaceCulling=false;
 function cube(name,x,y,z,w,h,d,mat){
  const q=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);
  q.position.set(x,y,z);q.material=mat;q.isPickable=false;
  q.checkCollisions=false;q.receiveShadows=true;objects.push(q);return q;
 }
 // Elevated decks have readable retaining faces and visible support columns.
 // Support pieces are kept BELOW existing deck surfaces.
 for(const r of ramps){
  if(r.curve!=='halfpipe-deck')continue;
  const base=r.h/2;
  for(const sx of [-1,1]){
   cube('halfpipe deck support',r.x+sx*(r.w/2-.55),base,r.z,.7,r.h-.20,r.d-.55,cement);
  }
  cube('halfpipe deck front fascia',r.x,r.h-.31,r.z+r.d/2-.13,r.w-.8,.44,.20,muralMat);
  cube('halfpipe deck back fascia',r.x,r.h-.31,r.z-r.d/2+.13,r.w-.8,.44,.20,muralMat);
  for(const sx of [-1,1])cube('deck corner steel cap',r.x+sx*(r.w/2-.15),r.h+.018,r.z,.14,.036,r.d,metal);
 }
 // The outer deck retaining face sits 3.1m beyond each transition end.
 // Place the murals 5cm beyond that solid exterior face, not behind it.
 for(const r of ramps){
  if(r.curve!=='halfpipe-left'&&r.curve!=='halfpipe-right')continue;
  const left=r.curve==='halfpipe-left';
  const art=B.MeshBuilder.CreatePlane('halfpipe exterior painted mural',{width:r.w-5,height:2.35},scene);
  art.position.set(r.x,2.15,left?r.z-r.d/2-3.15:r.z+r.d/2+3.15);
  // Face the public outside of each halfpipe wall: the opposite orientation
  // displays the stencil from its back and reverses all lettering.
  art.rotation.y=left?0:Math.PI;art.material=muralMat;
  art.isPickable=false;art.checkCollisions=false;objects.push(art);
 }
 // Color-inlaid seams at the perimeter, outside the central skating area.
 for(const x of [-112,112]){
  for(let z=-116;z<126;z+=12)cube('perimeter safety line',x,.12,z,.18,.016,9,yellow);
 }
 // Subtle poured-in wayfinding strips connect the existing obstacle zones in
 // the wide overhead view. These are paint, NOT new ramps or collision paths:
 // keep them just above the flat plaza slab, beneath any raised skate surface.
 const flowTeal=material('flow guide inlaid teal','#477a80',true);
 const flowOchre=material('flow guide inlaid ochre','#b28d59',true);
 for(const m of [flowTeal,flowOchre]){
  m.alpha=1;m.transparencyMode=B.Material.MATERIAL_OPAQUE;
  m.forceDepthWrite=true;
 }
 function paintedRoute(points,paint){
  for(let i=1;i<points.length;i++){
   const [ax,az]=points[i-1],[bx,bz]=points[i];
   const dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz);
   const stripe=cube('plaza painted flow guide',(ax+bx)/2,-.035,(az+bz)/2,.16,.012,length,paint);
   stripe.rotation.y=Math.atan2(dx,dz);
  }
 }
 // The two through-park corridors pass the halfpipe, banks and far quarters;
 // ramps themselves remain higher and occlude these ground-level paint lines.
 paintedRoute([[-94,-99],[-94,-55],[-65,-32],[-16,0],[17,46],[52,74],[94,103]],flowTeal);
 paintedRoute([[94,-100],[90,-63],[47,-23],[25,8],[-6,48],[-43,84],[-94,109]],flowOchre);
 // Architectural walls and acoustic panels, outside the active skateable park.
 for(const x of [-119,119]){
  for(let z=-100;z<=100;z+=20){
   cube('park perimeter retaining wall',x,1.1,z,1.1,2.2,19.8,cement);
   cube('recessed architectural wall panel',x+(x<0?.57:-.57),1.2,z,.035,1.65,17.5,dark);
   for(const dz of [-7,7])cube('wall expansion joint',x+(x<0?.60:-.60),1.2,z+dz,.042,1.8,.065,metal);
   // All details sit on the inside face of the OUTER retaining wall
   // (x=±119), well outside the skating lanes. No collision/pickable mesh.
   const face=x+(x<0?.68:-.68);
   cube('perimeter concrete pilaster',face,1.12,z+9.65,.16,2.13,.28,cement);
   cube('wall-washer steel housing',face,2.04,z,.18,.18,3.7,fixture);
   cube('warm wall-washer lens',face+(x<0?.11:-.11),2.025,z,.045,.055,3.35,lamp);
   // Large stencilled murals are mounted flush on the non-skateable outer
   // retaining wall. They cannot snag wheels or affect collision physics.
   if(z===-60||z===0||z===60){
    const art=B.MeshBuilder.CreatePlane('park perimeter painted mural',{width:12,height:1.5},scene);
    art.position.set(x+(x<0?.605:-.605),1.2,z);
    art.rotation.y=x<0?Math.PI/2:-Math.PI/2;
    // From the skating side these inward-facing walls otherwise display
    // the shared stencil mirrored; flip only this plane, not the atlas used
    // by the correctly oriented halfpipe murals.
    art.scaling.x=-1;art.material=muralMat;
    art.isPickable=false;art.checkCollisions=false;objects.push(art);
   }
  }
 }
 return {meshes:objects,dispose(){for(const mesh of objects)mesh.dispose();}};
}
root.SOLParkArchitecture={build};
})(typeof window!=='undefined'?window:globalThis);
