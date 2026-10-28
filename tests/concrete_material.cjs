const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const helper=html.match(/function cloneConcrete\(name\)\{[\s\S]*?\n\}/)?.[0];
assert(helper,'Production concrete clone helper must exist');
function fixture(shared=false){
 let disposed=0;
 const sourceTexture={dispose(){throw Error('Shared source texture must never be disposed');}},
  duplicate={dispose(){disposed++;}},concrete={diffuseTexture:sourceTexture,
   clone(name){return {name,diffuseTexture:shared?sourceTexture:duplicate};}};
 const scope={concrete};vm.runInNewContext(helper+';this.clone=cloneConcrete;',scope);
 return {scope,sourceTexture,get disposed(){return disposed;}};
}
for(const shared of [false,true]){
 const f=fixture(shared),copy=f.scope.clone('test concrete');
 assert.equal(copy.diffuseTexture,f.sourceTexture);
 assert.equal(f.scope.concrete.diffuseTexture,f.sourceTexture);
 assert.equal(f.disposed,shared?0:1);
}
assert.equal((html.match(/cloneConcrete\(/g)||[]).length,5,'All four concrete clone call sites must use the helper');
assert.equal((html.match(/concrete\.clone\(/g)||[]).length,1,'Only the ownership-aware helper may clone concrete');
assert(html.includes("plazaConcrete.diffuseTexture=plazaGrain"),'Poured concrete should use its own joint texture');
assert(html.includes("plazaConcrete.useAlphaFromDiffuseTexture=false"),'Plaza must not become transparent');
assert(html.includes("plazaConcrete.forceDepthWrite=true"),'Plaza must write depth');
assert(html.includes("mesh.material=rampSurface;"),'All rideable ramp skins, including halfpipe, must use opaque concrete');
assert(html.includes("box('HALFPIPE FLAT BOTTOM',38,.18,7.04,-36,-.085,-18.1,halfpipeConcrete)"),
 'Halfpipe flat bottom must match the concrete transitions');
assert(!html.includes("mesh.material=(r.curve||'').startsWith('halfpipe')?woodSurface:rampSurface"),
 'Plywood must not override the concrete halfpipe material');
assert(html.includes("halfpipeConcrete.forceDepthWrite=true")&&
 html.includes("halfpipeConcrete.transparencyMode=B.Material.MATERIAL_OPAQUE"),
 'Halfpipe floor must remain opaque and depth-writing');
console.log('PASS concrete clones share the source texture and dispose only replaced duplicates');
