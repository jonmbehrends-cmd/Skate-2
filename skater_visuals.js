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
  ellipsoid('skater rubber toe cap',knee,0,-.387,.313,.245,.085,.085,toe);
  for(let j=0;j<3;j++){
   box('skater shoe lace',knee,0,-.313,.075+j*.072,.17,.012,.013,laces);
  }
 }

 // Layered garment and anatomy details remain visual-only, parented to the
 // existing animated rig; no physics or collision surfaces are introduced.
 const fold=paint('hoodie fabric folds','#a94d33',.05);
 const trim=paint('hoodie raised stitching','#cf7953',.06);
 const lining=paint('hood lining','#283039',.04);
 const sole=paint('shoe outsole','#d4cab1',.07);
 const hardware=paint('backpack hardware','#667781',.3);
 ellipsoid('hood drape',body,0,1.94,-.16,.42,.36,.26,materials.jacket);
 ellipsoid('hood lining shadow',body,0,2.015,-.035,.32,.22,.20,lining);
 ellipsoid('fabric neck collar',body,0,1.91,.09,.35,.15,.24,fold);
 for(const [x,y,z,sx,sy,sz,m] of [
  [-.20,1.56,.24,.10,.30,.045,fold],
  [.18,1.37,.26,.11,.21,.043,trim],
  [-.08,1.19,.23,.25,.07,.055,fold],
  [.07,1.75,.25,.10,.17,.035,trim],
  [-.21,1.29,.22,.075,.15,.04,fold]
 ])ellipsoid('sculpted hoodie fold',body,x,y,z,sx,sy,sz,m);
 ellipsoid('helmet rim',body,0,2.34,.015,.38,.085,.34,helmetVent);
 ellipsoid('helmet crown',body,0,2.49,-.018,.35,.18,.33,materials.helmet||helmetVent);
 ellipsoid('helmet brim',body,0,2.36,.29,.31,.035,.17,helmetVent);
 ellipsoid('chin contour',body,0,1.997,.169,.17,.11,.13,materials.skin);
 ellipsoid('mouth',body,0,2.045,.273,.10,.012,.014,lining);
 for(const side of [-1,1]){
  ellipsoid('backpack shoulder strap',body,side*.27,1.72,.18,.085,.34,.065,lining);
  ellipsoid('strap buckle',body,side*.27,1.47,.24,.06,.045,.035,hardware);
 }
 for(let i=0;i<2;i++){
  for(let j=0;j<3;j++){
   ellipsoid('sleeve gathered fold',elbows[i],0,.08+j*.062,.075,.145,.025,.14,j===1?trim:fold);
   ellipsoid('denim knee fold',knees[i],0,.12+j*.06,.137,.19,.025,.105,materials.denim);
  }
  ellipsoid('shoe layered outsole',knees[i],0,-.45,.195,.27,.055,.27,sole);
  ellipsoid('shoe heel reinforcement',knees[i],0,-.39,-.035,.22,.13,.12,toe);
 }

 // Extra geometry is silhouette-focused rather than tiny decorative marks.
 // Every attachment follows the existing body/elbow/knee animation hierarchy.
 const fabricDark=paint('deep garment occlusion','#733b30',.035);
 const fabricEdge=paint('cloth edge highlight','#da8960',.055);
 const grip=paint('worn skate shoe upper','#343f45',.08);
 const gum=paint('rubber shoe foxing','#b7ab8f',.06);
 const hair=paint('hair under helmet','#272222',.03);
 // Rounded chest and abdominal volumes soften the rigid jacket outline.
 ellipsoid('hoodie rounded upper chest',body,0,1.67,.085,.46,.37,.31,materials.jacket);
 ellipsoid('hoodie relaxed abdomen',body,0,1.37,.105,.43,.27,.31,materials.jacket);
 ellipsoid('hoodie lower hem ribbing',body,0,1.19,.085,.43,.09,.29,fabricDark);
 ellipsoid('hoodie shoulder left',body,-.36,1.78,.005,.23,.23,.27,materials.jacket);
 ellipsoid('hoodie shoulder right',body,.36,1.78,.005,.23,.23,.27,materials.jacket);
 // Subtle fabric contouring at the outer shoulder.
 for(const side of [-1,1]){
  ellipsoid('shoulder fabric ridge',body,side*.365,1.75,.16,.12,.19,.075,fabricEdge);
  ellipsoid('hood drawstring',body,side*.11,1.77,.345,.022,.24,.025,sole);
  ellipsoid('hair at temple',body,side*.17,2.29,-.01,.09,.06,.12,hair);
  ellipsoid('jaw side contour',body,side*.135,2.035,.15,.10,.15,.105,materials.skin);
 }
 // Trouser silhouettes and layered skate shoes retain the original knee rig.
 for(let i=0;i<2;i++){
  const k=knees[i],e=elbows[i];
  ellipsoid('denim tapered lower leg',k,0,-.17,.01,.205,.29,.18,materials.denim);
  ellipsoid('denim cuff',k,0,-.34,.04,.215,.075,.20,fabricDark);
  ellipsoid('skate shoe upper',k,0,-.397,.19,.245,.115,.30,grip);
  ellipsoid('skate shoe toe bumper',k,0,-.415,.36,.235,.075,.11,gum);
  ellipsoid('skate shoe sidewall',k,0,-.465,.20,.26,.045,.30,sole);
  ellipsoid('hoodie sleeve volume',e,0,.08,0,.19,.30,.18,materials.jacket);
  ellipsoid('hoodie elbow fold',e,0,-.10,.09,.20,.075,.17,fabricDark);
 }
 return {meshes:made,count:made.length};
}
root.SOLSkaterVisuals={attach};
})(typeof window!=='undefined'?window:globalThis);
