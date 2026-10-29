'use strict';
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');require('../park_surface_art.js');
const art=SOLParkSurfaceArt,a=art.build(),b=art.build(),digest=x=>createHash('sha256').update(x).digest('hex');
assert.equal(digest(a.diffuse),digest(b.diffuse));assert.equal(digest(a.normal),digest(b.normal));
let min=255,max=0,normalError=0,sum=0;
for(let i=0;i<a.diffuse.length;i+=4){const v=a.diffuse[i];min=Math.min(min,v);max=Math.max(max,v);sum+=v;assert.equal(a.diffuse[i+3],255);assert.equal(a.normal[i+3],255);const n=[0,1,2].map(k=>a.normal[i+k]/255*2-1);normalError=Math.max(normalError,Math.abs(Math.hypot(...n)-1));}
assert(min>=190&&max<=255&&max-min>25);assert(sum/(a.size*a.size)>225);assert(normalError<.012);
assert.throws(()=>art.build(0),RangeError);
const colors=art.districts.map(d=>art.tint(d.x,d.z));assert.equal(colors.length,6);
assert(new Set(colors.map(c=>c.map(v=>v.toFixed(3)).join(','))).size===6);
for(const c of colors)assert(c.every(v=>v>.89&&v<1.06),'Concrete tint must remain restrained');
console.log('PASS deterministic concrete textures, opaque albedo, bounded unit normals and six restrained district tints',{min,max,normalError});
