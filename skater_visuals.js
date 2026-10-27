/* SOL SKATE — lightweight skater apparel/face detailing.
 * Visual-only attachments; never modify the stance rig, board or collision geometry.
 */
(function(root){'use strict';
function attach(B,scene,body,elbows,knees,materials){
 if(!B||!scene||!body||!Array.isArray(elbows)||elbows.length!==2||
    !Array.isArray(knees)||knees.length!==2)throw Error('Skater visual rig is incomplete');
 const made=[];
 function paint(name,hex,shine){
  const m=new B.StandardMaterial(name,scene);
  m.diffuseColor=B.Color3.FromHexString(hex);
  m.specularColor=new B.Color3(shine,shine,shine);
  m.specularPower=shine>.25?70:24;
  m.alpha=1;m.transparencyMode=B.Material.MATERIAL_OPAQUE;
  return m;
 }
 const lens=paint('skater smoked lens','#1c2932',.38);
 const stitching=paint('skater jacket seam','#e0b98b',.08);
 const helmetVent=paint('skater helmet vent','#242d38',.17);
 const laces=paint('skater white shoelaces','#e5e0d6',.12);
 const toe=paint('skater reinforced toe','#30363a',.1);
 function finish(mesh,parent,material){
  mesh.parent=parent;mesh.material=material;mesh.isPickable=false;
  mesh.checkCollisions=false;mesh.receiveShadows=false;
  made.push(mesh);return mesh;
 }
 function box(name,parent,x,y,z,w,h,d,material){
  const m=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);
  m.position.set(x,y,z);return finish(m,parent,material);
 }
 function ellipsoid(name,parent,x,y,z,sx,sy,sz,material){
  const m=B.MeshBuilder.CreateSphere(name,{diameter:1,segments:12},scene);
  m.position.set(x,y,z);m.scaling.set(sx,sy,sz);
  return finish(m,parent,material);
 }
 // Dark, curved protective eyewear follows the head's animated torso.
 for(const side of [-1,1]){
  ellipsoid('skater smoked glasses lens',body,side*.103,2.183,.206,.165,.087,.046,lens);
  ellipsoid('skater ear',body,side*.189,2.115,.026,.082,.12,.075,materials.skin);
  box('skater helmet vent',body,side*.115,2.494,.112,.057,.014,.095,helmetVent);
  box('skater jacket seam',body,side*.238,1.485,.17,.014,.40,.018,stitching);
 }
 box('skater glasses bridge',body,0,2.183,.223,.068,.019,.022,helmetVent);
 ellipsoid('skater nose',body,0,2.113,.223,.067,.104,.092,materials.skin);
 box('skater jacket zipper',body,.153,1.465,.281,.015,.29,.017,stitching);
 box('skater hoodie pocket',body,0,1.292,.249,.29,.11,.018,materials.jacket);
 for(let i=0;i<2;i++){
  const elbow=elbows[i],knee=knees[i];
  const cuff=B.MeshBuilder.CreateCylinder('skater sleeve cuff',{height:.07,diameter:.205,tessellation:12},scene);
  cuff.position.set(0,-.015,0);finish(cuff,elbow,materials.jacket);
  ellipsoid('skater knee fabric panel',knee,0,-.015,.115,.20,.17,.065,materials.denim);
  box('skater rubber toe cap',knee,0,-.385,.323,.262,.12,.105,toe);
  for(let j=0;j<3;j++){
   box('skater shoe lace',knee,0,-.313,.075+j*.072,.17,.012,.013,laces);
  }
 }
 return {meshes:made,count:made.length};
}
root.SOLSkaterVisuals={attach};
})(typeof window!=='undefined'?window:globalThis);
