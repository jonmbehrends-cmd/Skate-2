const assert=require('node:assert/strict');
const {median,bootstrap,summarize}=require('../tools/render_budget_statistics.cjs');
assert.equal(median([1,2,9,10]),5.5);
assert.deepEqual(bootstrap([-20,-20,-20,-20]),[-20,-20]);
function fixture(changes){
 const runs=[];
 for(const size of ['desktop','mobile'])for(let block=0;block<8;block++)for(let i=0;i<6;i++){
  const variant=[0,3,4,5].includes(i)?'before':'after',role=i<4?'test':'control',change=changes[block%changes.length];
  const time=variant==='after'?10*(1+change/100):10;
  const rows=value=>Array.from({length:3},()=>({renderMs:value,evaluationMs:value,submissionMs:value,synchronizedMs:value}));
  runs.push({size,block,variant,role,canaries:[5,5],cases:{
   'park-submission64':{rows:rows(time),drawCalls:variant==='before'?100:70},
   'park-rasterFull':{rows:rows(10),drawCalls:variant==='before'?100:70}
  }});
 }
 return {blocks:8,viewNames:['park'],runs};
}
const clear=fixture([-20]),result=summarize(clear);
assert.equal(result['desktop-park-submission64'].acceptedBlocks,7,'Discard the entire first block');
assert.equal(result['desktop-park-submission64'].submissionSignal,true,'Clear paired decrease exceeds zero A/A noise');
assert.equal(result['desktop-park-rasterFull'].withinFivePercentEquivalence,true);
const mixed=summarize(fixture([-15,15]));
assert.equal(mixed['desktop-park-submission64'].submissionSignal,false,'A CI spanning zero is not a win');
const drift=fixture([-20]);
for(const r of drift.runs)if(r.block===3)r.canaries=[5,6];
assert.equal(summarize(drift)['mobile-park-submission64'].acceptedBlocks,6,'Reject a whole block containing drift');
const noisy=fixture([-5]);
for(const r of noisy.runs)if(r.role==='control'&&r===noisy.runs.find(x=>x.size===r.size&&x.block===r.block&&x.role==='control'))
 r.cases['park-submission64'].rows.forEach(row=>{row.synchronizedMs=8;});
assert.equal(summarize(noisy)['desktop-park-submission64'].submissionSignal,false,'A/A noise larger than the effect prevents a win');
const noControlTime=fixture([-20]);
for(const r of noControlTime.runs)if(r.role==='control')r.cases['park-rasterFull'].rows.forEach(row=>{row.synchronizedMs=0;});
assert.equal(summarize(noControlTime)['desktop-park-rasterFull'].withinFivePercentEquivalence,false,
 'Unavailable A/A noise is not zero noise and cannot establish equivalence');
console.log('PASS paired statistics: warm-up discard, drift rejection, bootstrap sign, equivalence and A/A noise');
