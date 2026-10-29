'use strict';
/* Geometry-driven shallow-lip acceptance: use the actual production surface
 * sampler and vert-launch entry point, not a hand-drawn parabola or mock bowl.
 * The full running Chromium/WebGL loop is covered by Newberg acceptance. */
const assert=require('node:assert/strict');
require('../newberg_park.js');
const park=SOLNewberg;

function makeState(x,z,dir,speed=14){
 return {x,z,dir,speed,travelSign:1,grounded:true,grinding:false,
  rampCooldown:0,grindCooldown:0,combo:0,count:0,airTime:0,vy:0};
}
const results=[];
for(const name of ['west kidney and snake run','shallow capsule','beginner pocket']){
 const bowl=park.basins.find(b=>b.name===name);
 assert(bowl,'Missing shallow bowl: '+name);
 // The original 1.2 gate was unreachable for these lips: their maximum
 // analytic rim grades are 2.4 * depth/run, all strictly below 1.2.
 assert(2.4*bowl.depth/bowl.run<1.2,'Candidate is not actually shallow: '+name);
 let trials=0,launched=0,bestGrade=0,sample;
 for(let i=0;i<bowl.rim.length;i+=2){
  const n=bowl.rim.length,p=bowl.rim[i],a=bowl.rim[(i+n-1)%n],c=bowl.rim[(i+1)%n];
  const dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz);
  if(len<.0001)continue;
  // All source rings are counterclockwise; (-dz,dx) points into the bowl.
  const ix=-dz/len,iz=dx/len,x=p[0]+ix*.35,z=p[1]+iz*.35;
  const previous=park.sample(x+ix*.22,z+iz*.22),contact=park.sample(x,z);
  if(!previous||!contact||previous.height>-.08||contact.height<-.85)continue;
  const dir=Math.atan2(-ix,-iz),grade=-(previous.slopeX*ix+previous.slope*iz);
  bestGrade=Math.max(bestGrade,grade);
  const state=makeState(x,z,dir);
  trials++;
  if(park.vertLaunch(state,previous,contact)){
   launched++;
   assert(!state.grounded&&state.vy>0&&state.bowlAir?.newberg,
    'Shallow launch must enter a real airborne state: '+name);
   assert(state.bowlAir.shallow===true&&Math.abs(state.bowlAir.launchPitch-Math.atan(grade))<1e-10,
    'Shallow air should retain the real lip pitch for visuals: '+name);
   assert(state.vy<=12&&Number.isFinite(state.airVX)&&Number.isFinite(state.airVZ),
    'Shallow launch must preserve bounded finite momentum: '+name);
   sample={x,z,grade,vy:state.vy};
   if(launched>=3)break;
  }
 }
 assert(trials>=3,'Not enough actual shallow-rim sample points: '+name);
 assert(launched>=3,'Shallow bowl auto-launch never triggers: '+JSON.stringify({name,trials,bestGrade}));
 results.push({name,trials,launched,bestGrade,sample});
}
// No downgrade of deep vert, no false positive on a promenade, and no pop
// while grinding, airborne, cooling down, slow, or traveling downhill.
const candidate={newberg:true,height:-.4,slope:1.0,slopeX:0};
const contact={newberg:true,height:-.2};
assert.equal(park.vertLaunch(makeState(17,18,0),candidate,contact),false,
 'Deep bowl must retain the original >=1.2 uphill-grade requirement');
const deep=makeState(17,18,0);
assert.equal(park.vertLaunch(deep,{...candidate,slope:1.3},contact),true,
 'Original deep-bowl vert threshold must still accept steep approaches');
assert(!deep.bowlAir.shallow&&deep.bowlAir.launchPitch===undefined,
 'Deep-bowl visual/physics state must not inherit shallow-only changes');
assert.equal(park.vertLaunch(makeState(0,-60,0),candidate,contact),false,
 'Flat street routes must not inherit shallow-bowl air thresholds');
const shallow=results.find(r=>r.name==='shallow capsule').sample;
const p=park.sample(shallow.x,shallow.z),g=park.gradient(shallow.x,shallow.z);
const direction=Math.atan2(g.x,g.z),prior=park.sample(shallow.x-g.x/g.radial*.22,shallow.z-g.z/g.radial*.22);
for(const scenario of [
 {label:'too slow',state:{speed:3}},
 {label:'airborne',state:{grounded:false}},
 {label:'grinding',state:{grinding:true}},
 {label:'cooldown',state:{rampCooldown:.2}},
 {label:'downhill',state:{dir:direction+Math.PI}}
]){
 const s={...makeState(shallow.x,shallow.z,direction),...scenario.state};
 assert.equal(park.vertLaunch(s,prior,p),false,'Unexpected shallow auto-launch: '+scenario.label);
}
console.log('PASS selective real-surface shallow lip launches with deep vert and state guards',JSON.stringify(results));
