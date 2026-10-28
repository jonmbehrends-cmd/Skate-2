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
console.log('PASS concrete clones share the source texture and dispose only replaced duplicates');
