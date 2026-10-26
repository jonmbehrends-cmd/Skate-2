// Execute the production physics block, rather than a second copy of its rules.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
for(const file of ['bowl','motion','terrain','landing','wheels','obstacles','grind'])require('../'+file+'.js');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('let targetSteer='),html.indexOf("if(now>state.messageUntil)msg.textContent='';"));
assert(source.includes('SOLBowl.land(state,landingContact)'));
const state={x:0,z:-106,y:-7.62,groundY:-7.62,dir:0,speed:17,travelSign:1,vy:0,grounded:true,grinding:false,rampCooldown:0,grindCooldown:0,flip:0,spin:0,combo:0,count:0,score:0,airTime:0};
const ctx={state,SOLBowl,SOLMotion,SOLTerrain,SOLLanding,SOLWheels,SOLObstacles,SOLGrind,joy:{x:0,y:-1},gpX:0,gpY:0,boost:false,pushHeld:false,solids:[],ramps:[],rails:[],pads:[],msg:{textContent:''},now:0};
ctx.groundContact=(x,z)=>SOLBowl.sample(x,z)||{height:0,slope:0,ramp:null};
const tick=vm.runInNewContext('(function(dt){'+source+'})',ctx);
for(const heading of [0,Math.PI/2,.73])for(const dt of [1/120,1/60,.025]){
 Object.assign(state,{x:0,z:-106,y:-7.62,groundY:-7.62,dir:heading,speed:17,travelSign:1,vy:0,grounded:true,grinding:false,rampCooldown:0,grindCooldown:0,flip:0,spin:0,combo:0,count:0,score:0,airTime:0,bowlAir:null,bowlStats:{launches:0,landings:0,recoveries:0}});
 SOLMotion.clearAir(state);SOLLanding.reset(state);
 let maxY=-Infinity,lastLaunch=0,previousY=state.y,largestJump=0;
 for(let time=0;time<180&&state.bowlStats.landings<10;time+=dt){
  ctx.now=time*1000;tick(dt);
  assert(Number.isFinite(state.x+state.z+state.y+state.speed));
  const r=Math.hypot(state.x,state.z+106);
  assert(r<=SOLBowl.bowl.radius+1e-7,'Escaped onto deck');
  assert(state.y>=SOLBowl.height(state.x,state.z)-.021,'Penetrated bowl');
  assert(!ctx.msg.textContent.includes('BAIL'),'Reentry bailed: '+ctx.msg.textContent);
  if(state.bowlStats.launches>lastLaunch){assert(previousY>-.8,'Launched below coping transition');lastLaunch=state.bowlStats.launches;}
  maxY=Math.max(maxY,state.y);largestJump=Math.max(largestJump,Math.abs(state.y-previousY));previousY=state.y;
 }
 assert.equal(state.bowlStats.landings,10,'Ten consecutive airs in 180 simulated seconds');
 assert.equal(state.bowlStats.recoveries,0,'Safety snap must not hide collision failures');
 assert(maxY>.5,'Must rise above coping');assert(largestJump<35*dt,'No teleport at takeoff/landing');
 console.log(JSON.stringify({heading,dt,...state.bowlStats,maxY,largestJump}));
}
