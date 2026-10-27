/* Halfpipe pumping: deterministic unit regressions run before Chromium QA. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','motion.js'),'utf8'),sandbox,{filename:'motion.js'});
const pump=sandbox.window.SOLMotion.pump;
const state=(extra={})=>({grounded:true,grinding:false,dir:0,travelSign:1,speed:8,pumpIntensity:0,...extra});
const contact=slope=>({slope,ramp:{}});
const EPS=1e-8;
{
 const s=state(),dt=1/60;
 const gained=pump(s,contact(0),contact(10000),dt,true);
 assert(gained>0&&gained<=3.2*dt+EPS,'Vertical coping cannot add more than 3.2 m/s per second');
 assert(Math.abs(s.speed-(8+gained))<EPS,'Pumping must change actual ground speed');
 assert(s.pumpIntensity>=0&&s.pumpIntensity<=1,'Pump animation intensity must remain bounded');
}
{
 const s=state();
 assert.equal(pump(s,contact(4),contact(0),1/60,true),0,'Moving toward lower uphill curvature cannot inject energy');
 assert.equal(s.speed,8);
}
{
 const s=state({dir:Math.PI});
 assert(pump(s,contact(-2),contact(-20),1/60,true)>0,'Mirrored halfpipe pumping must work');
}
{
 const s=state({dir:0,travelSign:-1});
 assert(pump(s,contact(2),contact(-2),1/60,true)>0,'Fakie pumping must use actual travel direction');
}
for(const overrides of [{grounded:false},{grinding:true}]){
 const s=state(overrides);
 assert.equal(pump(s,contact(0),contact(10),1/60,true),0,'No pumping while airborne or grinding');
}
{
 const s=state();
 assert.equal(pump(s,contact(0),contact(10),1/60,false),0,'No pumping without active input');
 assert.equal(pump(s,contact(0),{slope:10,ramp:null},1/60,true),0,'No pumping on flat ground');
}
{
 const s=state({speed:16.99});
 pump(s,contact(0),contact(100),1/60,true);
 assert(s.speed<=17,'Pumping must respect top speed');
}
function simulate(fps){
 const s=state();
 for(let i=0;i<fps;i++)pump(s,contact(i*4/fps),contact((i+1)*4/fps),1/fps,true);
 return s.speed;
}
const at60=simulate(60),at30=simulate(30);
assert(at60>8&&at30>8,'Pumping through a transition must provide useful acceleration');
assert(at60<=11.2+EPS&&at30<=11.2+EPS,'One second of pumping cannot create more than the time-based budget');
assert(Math.abs(at60-at30)<.35,'Pump energy must be reasonably frame-rate independent: '+JSON.stringify({at60,at30}));
console.log('PASS pump curvature, vert cap, fakie, gating, top speed, 30/60 FPS',JSON.stringify({at60,at30}));
