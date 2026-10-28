const median=a=>{const v=[...a].sort((a,b)=>a-b),m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2;};
function bootstrap(values){
 if(values.length<4)return null;
 let seed=9137;const resamples=[];
 for(let n=0;n<10000;n++){
  const sample=[];for(let i=0;i<values.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;sample.push(values[seed%values.length]);}
  resamples.push(median(sample));
 }
 resamples.sort((a,b)=>a-b);return [resamples[250],resamples[9750]];
}
function summarize(report){
 const blocks=report.blocks,views=report.viewNames.map(name=>[name]);
 const summary={};
 for(const size of ['desktop','mobile']){
  const group=report.runs.filter(r=>r.size===size),canaryMedian=median(group.filter(r=>r.block>0).flatMap(r=>r.canaries));
  for(const run of group){run.discardWarmupBlock=run.block===0;run.rejectCanary=run.canaries.some(v=>Math.abs(v/canaryMedian-1)>.10);}
  for(const view of views.map(v=>v[0]))for(const resolution of ['submission64','rasterFull']){
   const key=`${size}-${view}-${resolution}`,pairs=[],aa=[],draws=[];
   for(let block=1;block<blocks;block++){
    const runs=group.filter(r=>r.block===block);if(runs.length!==6||runs.some(r=>r.rejectCanary))continue;
    const test=runs.filter(r=>r.role==='test'),control=runs.filter(r=>r.role==='control');
    const get=(r,metric)=>median(r.cases[`${view}-${resolution}`].rows.map(s=>s[metric]));
    const a=test.filter(r=>r.variant==='before'),b=test.filter(r=>r.variant==='after');
    const record={},controlNoise={};
    for(const metric of ['renderMs','evaluationMs','submissionMs','synchronizedMs']){
     const before=median(a.map(r=>get(r,metric))),after=median(b.map(r=>get(r,metric)));
     record[metric]=before>0?100*(after/before-1):null;
     const c0=get(control[0],metric),c1=get(control[1],metric);
     controlNoise[metric]=c0>0?Math.abs(100*(c1/c0-1)):null;
    }
    pairs.push(record);
    aa.push(controlNoise);
    draws.push({before:a[0].cases[`${view}-${resolution}`].drawCalls,after:b[0].cases[`${view}-${resolution}`].drawCalls});
   }
   const metrics={};for(const metric of ['renderMs','evaluationMs','submissionMs','synchronizedMs']){
    const values=pairs.map(p=>p[metric]).filter(Number.isFinite);
    const noise=aa.map(a=>a[metric]);
    metrics[metric]={medianPercentChange:values.length?median(values):null,bootstrap95:bootstrap(values),
     aaMaxAbsolutePercent:noise.length&&noise.every(Number.isFinite)?Math.max(...noise):null};
   }
   const noise=metrics.synchronizedMs.aaMaxAbsolutePercent,ci=metrics.synchronizedMs.bootstrap95,
    render=metrics.renderMs,renderCI=render.bootstrap95;
   summary[key]={acceptedBlocks:pairs.length,availableBlocks:blocks-1,aaMaxAbsolutePercent:noise,metrics,draws,
    submissionSignal:resolution==='submission64'&&draws.length>0&&draws.every(d=>d.after<d.before)&&
     !!ci&&ci[1]<0&&noise!==null&&-metrics.synchronizedMs.medianPercentChange>noise&&
     !!renderCI&&renderCI[1]<0&&render.aaMaxAbsolutePercent!==null&&-render.medianPercentChange>render.aaMaxAbsolutePercent,
    withinFivePercentEquivalence:resolution==='rasterFull'&&!!ci&&ci[0]>=-5&&ci[1]<=5&&noise<=5};
  }
 }
 return summary;
}

module.exports={median,bootstrap,summarize};
