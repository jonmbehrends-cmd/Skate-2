/* SOL SKATE — rounded, kicked skateboard deck and flush griptape geometry.
 * Visual-only: wheel contact, trucks, physics, and board pivot stay unchanged.
 */
(function(root){'use strict';
function build(){
 const length=1.65,halfLength=length/2,halfWidth=.275,rounding=.205;
 const count=40,positions=[],indices=[],uvs=[],gripPositions=[],gripIndices=[],gripUvs=[];
 function point(i){
  const z=-halfLength+length*i/count,az=Math.abs(z);
  const t=Math.max(0,Math.min(1,(az-(halfLength-rounding))/rounding));
  const width=halfWidth*Math.sqrt(Math.max(0,1-t*t))+.003;
  const kick=Math.max(0,Math.min(1,(az-.58)/(halfLength-.58)));
  const top=.235+.08*kick*kick*(3-2*kick);
  return {z,width,top,bottom:top-.11};
 }
 for(let i=0;i<=count;i++){
  const p=point(i),v=i/count;
  positions.push(-p.width,p.top,p.z,p.width,p.top,p.z,-p.width,p.bottom,p.z,p.width,p.bottom,p.z);
  uvs.push(0,v,1,v,0,v,1,v);
  const gripWidth=p.width*.92;
  gripPositions.push(-gripWidth,p.top+.009,p.z,gripWidth,p.top+.009,p.z);
  gripUvs.push(0,v,1,v);
  if(i===count)continue;
  const a=i*4,b=(i+1)*4;
  // Top, bottom, left and right walls with outward winding.
  indices.push(a,b,a+1,b,b+1,a+1);
  indices.push(a+2,a+3,b+2,b+2,a+3,b+3);
  indices.push(a,a+2,b,b,a+2,b+2);
  indices.push(a+1,b+1,a+3,a+3,b+1,b+3);
  const g=i*2,h=(i+1)*2;
  gripIndices.push(g,h,g+1,h,h+1,g+1);
 }
 // Rounded tips have thin but closed end caps, rather than exposed geometry.
 const end=count*4;
 indices.push(0,1,2,2,1,3,end,end+2,end+1,end+2,end+3,end+1);
 return {deck:{positions,indices,uvs},grip:{positions:gripPositions,indices:gripIndices,uvs:gripUvs}};
}
root.SOLBoardGeometry={build};
})(typeof window!=='undefined'?window:globalThis);
