/* Presentation only: all meshes follow the existing animation hierarchy.
 * No collision shapes, contact samples, input or simulation state are changed.
 */
(function(root){'use strict';
function enhance(B,scene){
 const material=(name,color,shine=.05)=>{
  const m=new B.StandardMaterial(name,scene);
  m.diffuseColor=B.Color3.FromHexString(color);
  m.specularColor=new B.Color3(shine,shine,shine);
  m.alpha=1;m.transparencyMode=B.Material.MATERIAL_OPAQUE;
  return m;
 };
 const sun=scene.getLightByName('sun');
 sun.direction.set(-.18,-1,.22).normalize();
 sun.position.set(12,65,-16);
 const grain=new B.DynamicTexture('opaque mineral aggregate',256,scene,false);
 const ctx=grain.getContext();ctx.fillStyle='#c4c4b9';ctx.fillRect(0,0,256,256);
 let seed=41;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<5000;i++){const v=100+Math.floor(rand()*95);ctx.fillStyle=`rgba(${v},${v},${v},.16)`;ctx.fillRect(rand()*256,rand()*256,1,1);}
 grain.hasAlpha=false;grain.update();
 // StandardMaterial.clone clones DynamicTexture into a fresh, unuploaded
 // canvas in this Babylon version. A pickable mesh with that unready texture
 // is skipped by the renderer, even though its alpha is 1. Share the uploaded
 // source texture explicitly instead of accepting the cloned texture.
 const sourceConcrete=scene.getMaterialByName('concrete');
 for(const name of ['warm plaza poured concrete','halfpipe continuous opaque textured riding concrete']){
  const m=scene.getMaterialByName(name);if(m)m.diffuseTexture=sourceConcrete.diffuseTexture;
 }
 for(const mesh of scene.meshes.filter(m=>m.name==='solid skatable concrete ramp'||m.name==='SOLID RAMP SIDE WALL')){
  // Geometry uses conventional outward cross products. Explicitly select
  // that convention for normals; the sealed topology stays unchanged.
  const normals=[];
  B.VertexData.ComputeNormals(mesh.getVerticesData(B.VertexBuffer.PositionKind),mesh.getIndices(),normals,{useRightHandedSystem:true});
  mesh.setVerticesData(B.VertexBuffer.NormalKind,normals);
  const wooden=mesh.material.name.includes('birch')||mesh.material.diffuseColor.r>mesh.material.diffuseColor.b*1.2;
  if(!wooden){
   mesh.material.diffuseTexture=grain;
   mesh.material.diffuseColor=B.Color3.FromHexString('#b6b8af');
   mesh.material.specularColor=new B.Color3(.05,.05,.05);
   mesh.material.useAlphaFromDiffuseTexture=false;
  }
  mesh.material.twoSidedLighting=false;
  if(mesh.material.diffuseTexture)mesh.material.diffuseTexture.hasAlpha=false;
 }
 const deck=scene.getMeshByName('deck'),pivot=deck.parent;
 const maple=material('seven ply maple edge','#c69b60',.09);
 const grip=material('matte abrasive grip','#252b2b',.015);
 const urethane=material('warm ivory urethane','#ddd4ba',.1);
 const aluminum=material('brushed truck alloy','#9ba4a9',.65);
 // Retain the shaped deck and apparel already integrated on main.
 deck.material=maple;scene.getMeshByName('grip tape').material=grip;
 for(const mesh of [deck,scene.getMeshByName('grip tape')]){
  const normals=[];
  B.VertexData.ComputeNormals(mesh.getVerticesData(B.VertexBuffer.PositionKind),mesh.getIndices(),normals,{useRightHandedSystem:true});
  mesh.setVerticesData(B.VertexBuffer.NormalKind,normals);mesh.material.backFaceCulling=false;
 }
 for(const w of scene.meshes.filter(m=>m.name==='wheel'))w.material=urethane;
 for(const m of scene.meshes.filter(m=>m.name.startsWith('truck ')))m.material=aluminum;
 const bolt=material('black steel deck hardware','#333b3d',.35);
 for(const z of [-.57,-.47,.47,.57])for(const x of [-.15,.15]){
  const m=B.MeshBuilder.CreateSphere('recessed deck bolt',{diameter:.027,segments:6},scene);
  const nz=z/.825,t=Math.max(0,(Math.abs(nz)-.45)/.55);
  const y=window.SOLBoardV2 ? .235+.022*(x/.275)**2+.065*t**1.8*(nz>0?1.1:1)+.003 : .247;
  m.parent=pivot;m.position.set(x,y,z);m.scaling.y=.25;m.material=bolt;m.isPickable=false;m.checkCollisions=false;
 }
 for(const name of ['jacket fabric','denim','skin','shoe rubber','hair']){
  const m=scene.getMaterialByName(name);if(m)m.specularColor=new B.Color3(.025,.025,.025);
 }
 const fabric=scene.getMaterialByName('jacket fabric');
 const fabricTex=new B.DynamicTexture('woven jacket cloth',128,scene,false),fc=fabricTex.getContext();
 fc.fillStyle='#b95f40';fc.fillRect(0,0,128,128);
 fc.strokeStyle='#a25238';fc.lineWidth=1;
 for(let i=0;i<128;i+=4){fc.beginPath();fc.moveTo(i,0);fc.lineTo(i,128);fc.stroke();fc.beginPath();fc.moveTo(0,i);fc.lineTo(128,i);fc.stroke();}
 fabricTex.hasAlpha=false;fabricTex.update();fabric.diffuseTexture=fabricTex;fabric.diffuseColor=B.Color3.White();
 return {version:1,simulationChanged:false};
}
root.SOLVisuals={enhance};
})(typeof window!=='undefined'?window:globalThis);
