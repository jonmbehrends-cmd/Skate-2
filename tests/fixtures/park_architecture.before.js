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
  cube('halfpipe deck front fascia',r.x,r.h-.31,r.z+r.d/2-.13,r.w-.8,.44,.20,dark);
  cube('halfpipe deck back fascia',r.x,r.h-.31,r.z-r.d/2+.13,r.w-.8,.44,.20,dark);
  for(const sx of [-1,1])cube('deck corner steel cap',r.x+sx*(r.w/2-.15),r.h+.018,r.z,.14,.036,r.d,metal);
 }
 // Color-inlaid seams at the perimeter, outside the central skating area.
 for(const x of [-112,112]){
  for(let z=-116;z<126;z+=12)cube('perimeter safety line',x,.12,z,.18,.016,9,yellow);
 }
 // Architectural walls and acoustic panels, outside the active skateable park.
 for(const x of [-119,119]){
  for(let z=-100;z<=100;z+=20){
   cube('park perimeter retaining wall',x,1.1,z,1.1,2.2,19.8,cement);
   cube('recessed architectural wall panel',x+(x<0?.57:-.57),1.2,z,.035,1.65,17.5,dark);
   for(const dz of [-7,7])cube('wall expansion joint',x+(x<0?.60:-.60),1.2,z+dz,.042,1.8,.065,metal);
  }
 }
 return {meshes:objects,dispose(){for(const mesh of objects)mesh.dispose();}};
}
root.SOLParkArchitecture={build};
})(typeof window!=='undefined'?window:globalThis);
