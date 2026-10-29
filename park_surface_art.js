/* Surface presentation only. No geometry, terrain contact or input state.
 * Gemini proposed aggregate/pitting and wrapped gradient normals. Integration
 * uses spatial hashes rather than its short-period sequential RNG, a shared
 * height signal, and the existing lit StandardMaterial instead of new PBR. */
(function(root){'use strict';
function hash(x,z){let n=Math.imul(x,374761393)^Math.imul(z,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
const smooth=t=>t*t*(3-2*t),mix=(a,b,t)=>a+(b-a)*t;
function noise(x,z,period){const i=Math.floor(x),j=Math.floor(z),u=smooth(x-i),v=smooth(z-j),h=(a,b)=>hash((a%period+period)%period,(b%period+period)%period);return mix(mix(h(i,j),h(i+1,j),u),mix(h(i,j+1),h(i+1,j+1),u),v);}
function build(size=512){
 if(!Number.isInteger(size)||size<32||size>1024)throw new RangeError('Invalid surface texture size');
 const diffuse=new Uint8ClampedArray(size*size*4),normal=new Uint8ClampedArray(size*size*4),heights=new Float32Array(size*size);
 for(let z=0;z<size;z++)for(let x=0;x<size;x++){
  const i=z*size+x,k=i*4,n=hash(x,z),pore=n<.014?hash(x+71,z+29)*20:0;
  // Broad, low-amplitude curing clouds plus independently hashed fine sand.
  // No trigonometric stripes, per-row PRNG correlation or high-contrast veins.
  const v=240+(noise(x/size*8,z/size*8,8)-.5)*20+(noise(x/size*32,z/size*32,32)-.5)*9+(n-.5)*11-pore;
  diffuse[k]=v;diffuse[k+1]=v;diffuse[k+2]=v;diffuse[k+3]=255;
  heights[i]=n*.20+(pore?-.09:0);
 }
 for(let z=0;z<size;z++)for(let x=0;x<size;x++){
  const get=(a,b)=>heights[((b+size)%size)*size+(a+size)%size],dx=(get(x-1,z)-get(x+1,z))*.45,dz=(get(x,z-1)-get(x,z+1))*.45,len=Math.hypot(dx,dz,1),k=(z*size+x)*4;
  normal[k]=(dx/len*.5+.5)*255;normal[k+1]=(dz/len*.5+.5)*255;normal[k+2]=(1/len*.5+.5)*255;normal[k+3]=255;
 }
 return {diffuse,normal,size};
}
const districts=[
 {id:'core',x:0,z:0,rx:34,rz:25,color:[1.015,1.005,.985]},
 {id:'river',x:-64,z:0,rx:31,rz:32,color:[.955,.985,1.005]},
 {id:'competition',x:62,z:6,rx:32,rz:40,color:[1.025,1.02,1.005]},
 {id:'snake',x:0,z:-47,rx:86,rz:17,color:[1.015,.995,.955]},
 {id:'surf',x:-2,z:48,rx:54,rz:19,color:[.96,1,.975]},
 {id:'street',x:-69,z:45,rx:22,rz:21,color:[1.03,.985,.94]}
];
function tint(x,z){
 const color=[1,1,1];
 for(const d of districts){const r=((x-d.x)/d.rx)**2+((z-d.z)/d.rz)**2,w=smooth(Math.max(0,1-r));for(let k=0;k<3;k++)color[k]+=(d.color[k]-1)*w;}
 const pour=.975+.025*hash(Math.floor((x+93)/12),Math.floor((z+69)/12));
 return color.map(v=>v*pour);
}
function install(B,scene,concrete,grass,W,D){
 const data=build(),textures=[];
 function texture(name,bytes,size,repeatX,repeatZ){const t=new B.DynamicTexture(name,{width:size,height:size},scene,true,B.Texture.TRILINEAR_SAMPLINGMODE),c=t.getContext(),p=c.createImageData(size,size);p.data.set(bytes);c.putImageData(p,0,0);t.update();t.uScale=repeatX;t.vScale=repeatZ;t.anisotropicFilteringLevel=8;textures.push(t);return t;}
 concrete.diffuseTexture=texture('cured concrete aggregate',data.diffuse,data.size,W/12,D/12);
 concrete.bumpTexture=texture('subtle concrete micro-pitting',data.normal,data.size,W/12,D/12);concrete.bumpTexture.gammaSpace=false;concrete.bumpTexture.level=.18;
 concrete.specularColor=new B.Color3(.085,.085,.08);concrete.specularPower=24;
 const size=256,pixels=new Uint8ClampedArray(size*size*4);
 for(let z=0;z<size;z++)for(let x=0;x<size;x++){const k=(z*size+x)*4,v=224+noise(x/size*8,z/size*8,8)*23+hash(x,z)*8;pixels[k]=v;pixels[k+1]=v;pixels[k+2]=v;pixels[k+3]=255;}
 grass.diffuseTexture=texture('woodland lawn variation',pixels,size,32,32);
 return {textures,textureBytes:(data.diffuse.byteLength+data.normal.byteLength+pixels.byteLength)*4/3,districts:districts.map(d=>d.id)};
}
root.SOLParkSurfaceArt={build,tint,install,districts};
})(typeof window!=='undefined'?window:globalThis);
