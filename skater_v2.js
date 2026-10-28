/* Visual-only retargeting of the authored V2 skin. The existing game supplies
 * movement/terrain/board transforms; this module never writes simulation state.
 * Bind matrices and vertex weights remain those exported by Blender. Each bone
 * is an independent palette entry: explicit world targets avoid inherited scale
 * and let the feet stay on the deck while the torso compresses on landing.
 */
(function(root){'use strict';
function attach(B,scene,rig){
 const data=root.SOLSkaterV2Data;if(!data)return null;
 const V=B.Vector3,M=B.Matrix,Q=B.Quaternion,SCALE=1.15;
 const skeleton=new B.Skeleton('Gemini V2 retargeted rider','sol-v2',scene);
 const bind={},bones={},meshes=[];
 for(const b of data.bones){const matrix=M.FromArray(b.inverseBind).invert();bind[b.name]=matrix;bones[b.name]=new B.Bone(b.name,skeleton,null,matrix.clone());}
 const materials=data.materials.map(m=>{const p=new B.PBRMaterial('V2 '+m.name,scene);p.albedoColor=B.Color3.FromArray(m.baseColorFactor);p.metallic=m.metallicFactor;p.roughness=m.roughnessFactor;p.backFaceCulling=false;p.transparencyMode=B.Material.MATERIAL_OPAQUE;return p;});
 for(const p of data.primitives){const mesh=new B.Mesh('V2 '+data.materials[p.material].name,scene),vd=new B.VertexData();
  vd.positions=p.positions;vd.normals=p.normals;vd.indices=p.indices;vd.matricesIndices=p.joints;vd.matricesWeights=p.weights;vd.applyToMesh(mesh);
  mesh.parent=rig.skater;mesh.material=materials[p.material];mesh.skeleton=skeleton;mesh.numBoneInfluencers=4;mesh.isPickable=false;mesh.checkCollisions=false;
  // Static conservative local bounds cover crouch, balance arms and board grabs.
  mesh.setBoundingInfo(new B.BoundingInfo(new V(-2,-.5,-2),new V(2,3,2)));meshes.push(mesh);
 }
 const joints={};
 for(const side of ['L','R'])for(const [name,diameter,material] of [['knee',.22,5],['elbow',.18,0]]){
  const mesh=B.MeshBuilder.CreateSphere('V2 '+name+'.'+side,{diameter,segments:10},scene);mesh.parent=rig.skater;mesh.material=materials[material];mesh.isPickable=false;mesh.checkCollisions=false;joints[name+'.'+side]=mesh;meshes.push(mesh);
 }
 // Keep legacy nodes as pose drivers/fallback, hide only their renderable parts.
 const legacy=rig.body.getChildMeshes();for(const m of legacy)m.isVisible=false;
 const own={grounded:true,landing:0,mode:'ride',feet:[],grabError:null,frames:0};
 function point(x,y,z,m){return V.TransformCoordinates(new V(x,y,z),m);}
 function set(name,m){bones[name].getLocalMatrix().copyFrom(m);bones[name].markAsDirty();}
 function ik(a,b,l1,l2,bend){
  const delta=b.subtract(a),distance=Math.max(.0001,delta.length()),dir=delta.scale(1/distance),d=Math.min(distance,l1+l2-.0001);
  let pole=bend.subtract(dir.scale(V.Dot(bend,dir)));if(pole.lengthSquared()<1e-6)pole=V.Cross(dir,V.Right());pole.normalize();
  const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along));
  return a.add(dir.scale(along)).add(pole.scale(height));
 }
 function align(name,a,b,base){
  const m=bind[name].multiply(base),old=V.TransformNormal(V.Up(),m).normalize(),to=b.subtract(a).normalize();
  const q=Q.Identity();Q.FromUnitVectorsToRef(old,to,q);
  m.setTranslation(V.Zero());const posed=m.multiply(M.Compose(V.One(),q,V.Zero()));posed.setTranslation(a);set(name,posed);
 }
 function update(state,pose,grabbing,dt){
  if(state.grounded&&!own.grounded)own.landing=1;
  own.grounded=!!state.grounded;own.landing*=Math.exp(-Math.max(0,dt)*10);
  own.mode=grabbing?'grab':state.grinding?(state.grindType==='boardslide'?'boardslide':'grind'):!state.grounded?(state.flip?'flip':state.spin?'shove':'air'):own.landing>.08?'landing':pose.pushing?'push':'ride';
  own.frames++;
  rig.skater.computeWorldMatrix(true);rig.body.computeWorldMatrix(true);rig.stanceRig.computeWorldMatrix(true);rig.boardPivot.computeWorldMatrix(true);
  const inverse=rig.skater.getWorldMatrix().clone().invert(),body=rig.body.getWorldMatrix().multiply(inverse),stance=rig.stanceRig.getWorldMatrix().multiply(inverse);
  const base=M.Scaling(SCALE,SCALE,SCALE).multiply(M.Translation(0,.0975,0)).multiply(body);
  // Rotate around the pelvis, not the ground origin: leaning must not drag
  // the entire rider sideways or cross the legs over the deck.
  const pelvis=bind.pelvis.multiply(base).getTranslation();
  const anchor=point(0,1.19+rig.body.position.y-own.landing*.10-(grabbing?.35:0),0,stance);
  base.setTranslation(base.getTranslation().add(anchor.subtract(pelvis)));
  for(const name of Object.keys(bones))set(name,bind[name].multiply(base));
  const bend=V.TransformNormal(new V(0,0,1),body).normalize(),feet=[];
  for(const [i,side] of ['L','R'].entries()){
   const back=i===0,sign=back?1:-1,air=!state.grounded&&!state.grinding;
   const flick=air&&state.flip?Math.sin(Math.min(1,(state.airTime||0)*3)*Math.PI):0;
   let foot=point((back?1:-1)*flick*.09,.385+(air&&!grabbing?.14:0),sign*.43,stance);
   if(back&&pose.pushing){foot.x+=pose.contact*.36;foot.y-=pose.contact*.22;foot.z-=(state.travelSign===-1?-1:1)*pose.contact*.45;foot.y+=pose.recovery*.20;}
   const hip=bind['thigh.'+side].multiply(base).getTranslation();
   const knee=ik(hip,foot,.430581*SCALE,(side==='L'?.37054:.374833)*SCALE,bend);
   joints['knee.'+side].position.copyFrom(knee);align('thigh.'+side,hip,knee,base);align('shin.'+side,knee,foot,base);
   const footBase=M.Scaling(SCALE,SCALE,SCALE).multiply(M.RotationY(Math.PI/2)).multiply(stance);
   const fm=bind['foot.'+side].multiply(footBase);fm.setTranslation(foot);set('foot.'+side,fm);feet.push(foot.asArray());
   const shoulder=bind['upper_arm.'+side].multiply(base).getTranslation();
   rig.elbows[i].computeWorldMatrix(true);
   let wrist=point(sign*.04,-.30,.025,rig.elbows[i].getWorldMatrix().multiply(inverse));
   let elbow;
   if(grabbing&&i===1){
    const deck=rig.boardPivot.getWorldMatrix().multiply(inverse),grip=point(.23,.27,-.15,deck);
    // Hand extends from wrist to palm; put the palm on the deck edge.
    wrist=grip.add(new V(0,.10,0));elbow=ik(shoulder,wrist,.322645*SCALE,.302159*SCALE,new V(.7,0,-1));
    own.grabError=0;own.grip=grip.asArray();
   }else{const reach=wrist.subtract(shoulder);if(reach.length()>.6247*SCALE)wrist=shoulder.add(reach.normalize().scale(.6247*SCALE));elbow=ik(shoulder,wrist,.322645*SCALE,.302159*SCALE,bend.add(new V(sign*.4,0,0)));}
   joints['elbow.'+side].position.copyFrom(elbow);align('upper_arm.'+side,shoulder,elbow,base);align('forearm.'+side,elbow,wrist,base);
   const hand=bind['hand.'+side].multiply(base);hand.setTranslation(wrist);set('hand.'+side,hand);
   if(grabbing&&i===1){
    // Orient the authored wrist-to-palm vector toward the actual board contact.
    const hp=bind['hand.'+side].getTranslation(),palm=new V(.44,.88,.09),dir=palm.subtract(hp);
    const old=V.TransformNormal(dir,base).normalize(),target=V.FromArray(own.grip).subtract(wrist).normalize(),q=Q.Identity();Q.FromUnitVectorsToRef(old,target,q);
    hand.setTranslation(V.Zero());const hm=hand.multiply(M.Compose(V.One(),q,V.Zero()));hm.setTranslation(wrist);set('hand.'+side,hm);
    const palmLocal=V.TransformCoordinates(palm,bind['hand.'+side].clone().invert());
    own.grabError=V.Distance(V.TransformCoordinates(palmLocal,hm),V.FromArray(own.grip));
   }
  }
  own.feet=feet;if(!grabbing)own.grabError=null;
  // Legacy grab segments are unparented world-space helpers; V2 skin replaces them.
  for(const m of rig.grabMeshes)m.isVisible=false;
  skeleton.prepare();
 }
 return {meshes,skeleton,update,diagnostics:own,sourceHash:data.sourceHash};
}
root.SOLSkaterV2={attach};
})(typeof window!=='undefined'?window:globalThis);
