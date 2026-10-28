/* SOL SKATE — vibrant Saturday-morning-cartoon art direction.
 * Materials and outlines only; gameplay collision meshes remain untouched.
 */
(function(root){'use strict';
function apply(B,scene){
 const palette={
  'concrete':'#aab8c4','paint':'#f5f2d8','steel':'#45687a',
  'deck':'#ffbd3c','shirt':'#f46b32','pants':'#31568d',
  'skin':'#f1b27c','wheels':'#28303d','grass':'#5aab75',
  'asphalt':'#526777','highlight':'#ffe36c','brick':'#d66d5c',
  'white':'#fff4d8','leaf':'#389c6c','jacket fabric':'#f04e40',
  'jacket trim':'#fff2c6','denim':'#3867a2',
  'shoe rubber':'#fff2dc','hair':'#383143'
 };
 for(const mat of scene.materials){
  if(!mat.diffuseColor)continue;
  if(palette[mat.name])mat.diffuseColor=B.Color3.FromHexString(palette[mat.name]);
  // A readable matte finish instead of glossy toy-like surfaces.
  if(mat.specularColor)mat.specularColor=new B.Color3(.075,.075,.075);
  if(typeof mat.specularPower==='number')mat.specularPower=22;
 }
 const outlined=new Set(['head','torso','helmet','shoulders','shoe','thigh','shin','upper arm','forearm','deck','grip tape']);
 let count=0;
 for(const mesh of scene.meshes){
  if(!outlined.has(mesh.name)||!mesh.isEnabled())continue;
  mesh.renderOutline=true;
  mesh.outlineColor=new B.Color3(.11,.16,.22);
  mesh.outlineWidth=.025;
  count++;
 }
 scene.clearColor=new B.Color4(.62,.82,.96,1);
 return {outlined:count};
}
root.SOLToonArt={apply};
})(typeof window!=='undefined'?window:globalThis);
