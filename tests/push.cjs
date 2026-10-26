// Regression checks for grounded Xbox RT foot-push animation.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(x=>x.trim());
assert.equal(inline.length,1);
new vm.Script(inline[0]);
const pose=inline[0].match(/const pushing=state\.grounded[\s\S]*?const cadence=now\*\.009;/);
assert(pose,'Expected grounded push state and stroke phase');
const calculate=new Function('state','boost','now',pose[0]+'return {pushing,pushStroke};');
assert.equal(calculate({grounded:false,grinding:false,speed:3},true,250).pushing,false);
assert.equal(calculate({grounded:true,grinding:true,speed:3},true,250).pushing,false);
assert.equal(calculate({grounded:true,grinding:false,speed:3},false,250).pushing,false);
assert.equal(calculate({grounded:true,grinding:false,speed:3},true,250).pushing,true);
assert(calculate({grounded:true,grinding:false,speed:3},true,250).pushStroke>0);
assert(inline[0].includes('i===1?-.2+pushStroke*.95:.12'),'Rear leg must swing while front leg stays planted');
assert(inline[0].includes('i===1?.22+pushStroke*.75:.24'),'Rear knee must flex during stroke');
console.log('Push animation: inline parse, grounded gating, stroke and leg pose PASS');
