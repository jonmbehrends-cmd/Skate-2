/* SOL SKATE — sculpted continuous concave deck with kicked nose and tail.
 * Visual-only; board transform, wheel contacts and physics are unchanged.
 */
(function(root){'use strict';
function build(){
 const length=1.65,halfLength=length/2,halfWidth=.275;
 const along=64,across=10,positions=[],indices=[],uvs=[],gripPositions=[],gripIndices=[],gripUvs=[];
 function sample(i,j){
  const z=-halfLength+length*i/along,az=Math.abs(z);
  const round=Math.max(0,Math.min(1,(az-.615)/.21));
  const width=halfWidth*Math.sqrt(Math.max(.0003,1-round*round));
  const side=2*j/across-1,x=side*width;
  const kick=Math.max(0,Math.min(1,(az-.575)/.25));
  const raised=.105*kick*kick*(3-2*kick);
  // Cross-sectional skateboard concave: rails higher than center.
  const concave=.033*Math.pow(Math.abs(side),2.2)*(1-.40*kick);
  return {x,z,y:.235+raised+concave,side};
 }
 function quad(dst,a,b,c,d){dst.push(a,c,b,b,c,d)}
 const row=across+1;
 for(let i=0;i<=along;i++)for(let j=0;j<=across;j++){
  const p=sample(i,j),u=j/across,v=i/along;
  positions.push(p.x,p.y,p.z);
  uvs.push(u,v);
  gripPositions.push(p.x*.975,p.y+.009,p.z);
  gripUvs.push(u,v);
 }
 for(let i=0;i<along;i++)for(let j=0;j<across;j++){
  const a=i*row+j,b=a+1,c=a+row,d=c+1;
  quad(indices,a,b,c,d);
  quad(gripIndices,a,b,c,d);
 }
 const base=positions.length/3;
 for(let i=0;i<=along;i++)for(let j=0;j<=across;j++){
  const p=sample(i,j);
  positions.push(p.x,p.y-.105,p.z);
  uvs.push(j/across,i/along);
 }
 for(let i=0;i<along;i++)for(let j=0;j<across;j++){
  const a=base+i*row+j,b=a+1,c=a+row,d=c+1;
  quad(indices,b,a,d,c);
 }
 // Close long rails and rounded nose/tail for a watertight 3D deck.
 for(let i=0;i<along;i++)for(const j of [0,across]){
  const a=i*row+j,c=(i+1)*row+j;
  if(j===0)quad(indices,a,base+a,c,base+c);
  else quad(indices,base+a,a,base+c,c);
 }
 for(const i of [0,along])for(let j=0;j<across;j++){
  const a=i*row+j,b=a+1;
  if(i===0)quad(indices,base+a,a,base+b,b);
  else quad(indices,a,base+a,b,base+b);
 }
 return {deck:{positions,indices,uvs},grip:{positions:gripPositions,indices:gripIndices,uvs:gripUvs}};
}
root.SOLBoardGeometry={build};
})(typeof window!=='undefined'?window:globalThis);
