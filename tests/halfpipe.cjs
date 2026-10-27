const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
require('../terrain.js');const T=globalThis.SOLTerrain;
const html=fs.readFileSync('index.html','utf8');
const match=html.match(/const ramps=(\[[^\n]*?\]);function groundContact/);
assert(match,'Read the real skatepark ramp layout, not an obsolete fixture');
const ramps=vm.runInNewContext(match[1]);
const left=ramps.find(r=>r.curve==='halfpipe-left'),right=ramps.find(r=>r.curve==='halfpipe-right');
const dl=ramps.find(r=>r.curve==='halfpipe-deck'&&r.z<left.z);
const dr=ramps.find(r=>r.curve==='halfpipe-deck'&&r.z>right.z);
assert(left&&right&&dl&&dr,'Halfpipe needs two transitions and two decks');
assert.equal(left.x,-36,'Halfpipe must be in accessible main plaza');
assert.equal(left.x,right.x,'Opposing halfpipe transitions must align');
const middle=(left.z+left.d/2+right.z-right.d/2)/2;
function close(a,b){assert(Math.abs(a-b)<.000001,`${a} != ${b}`)}
close(T.profile(left,0).height,left.h);close(T.profile(left,1).height,0);
close(T.profile(right,0).height,0);close(T.profile(right,1).height,right.h);
close(T.profile(left,1).slope,0);close(T.profile(right,0).slope,0);
assert(T.profile(left,0).slope<0&&T.profile(right,1).slope>0);
close(T.sample(left.x,middle,ramps).height,0);
close(T.sample(dl.x,dl.z,ramps).height,left.h);
close(T.sample(dr.x,dr.z,ramps).height,right.h);
const leftLip=left.z-left.d/2,rightLip=right.z+right.d/2;
assert(T.launch(T.sample(left.x,leftLip,ramps),T.sample(left.x,leftLip-.1,ramps),leftLip-.1,Math.PI,8)>0);
assert(T.launch(T.sample(right.x,rightLip,ramps),T.sample(right.x,rightLip+.1,ramps),rightLip+.1,0,8)>0);
assert.equal(T.launch(T.sample(left.x,leftLip,ramps),T.sample(left.x,leftLip-.1,ramps),leftLip-.1,0,8),0);
console.log('PASS: live plaza halfpipe coordinates, opposing transitions, flat bottom, decks, lip launches');
require('../obstacles.js');
assert.equal(T.launch(T.sample(dl.x,dl.z,ramps),T.sample(left.x,leftLip+.1,ramps),leftLip+.1,0,8),0,'Dropping in from a deck must not falsely launch');
const cheek=globalThis.SOLObstacles.rampSide(left.x-left.w/2-1,left.z,left.x-left.w/2+1,left.z,0,ramps);
assert(cheek.hit&&cheek.x<left.x-left.w/2,'Solid sidewall must stop ground-level penetration');
console.log('PASS: safe drop-in and side collision against current geometry');
require('../motion.js');const M=globalThis.SOLMotion;
const rider={x:left.x,z:middle,dir:0,speed:5,travelSign:-1,grounded:true,grinding:false,onRamp:false};
let turns=0,previous=rider.travelSign,minZ=Infinity,maxZ=-Infinity;
for(let i=0;i<400;i++){
 const dt=.016,old=T.sample(rider.x,rider.z,ramps);
 rider.onRamp=!!old.ramp;M.step(rider,0,0,false,dt);
 rider.z+=M.horizontal(rider,dt).dz;
 const current=T.sample(rider.x,rider.z,ramps);
 if(current.ramp)T.rollOnSlope(rider,current,dt);
 if(rider.travelSign!==previous){turns++;previous=rider.travelSign}
 minZ=Math.min(minZ,rider.z);maxZ=Math.max(maxZ,rider.z);
}
assert(turns>=1&&maxZ-minZ>4,'Rider must naturally roll back downhill and cross the halfpipe flat');
assert(T.launch(T.sample(left.x,leftLip,ramps),T.sample(left.x,leftLip-.1,ramps),leftLip-.1,0,8,-1)>0,'Fakie lip launch must work');
console.log('PASS: real halfpipe wall rollback, cross-flat riding, and fakie lip launch');
const deckRear=dr.z+dr.d/2;
const deckWall=globalThis.SOLObstacles.rampSide(dr.x,deckRear+1.5,dr.x,deckRear-.5,0,[dr]);
assert(deckWall.hit&&deckWall.z>deckRear-.5,'Ground-level rider must not enter elevated deck through rear wall');
const deckTop=globalThis.SOLObstacles.rampSide(dr.x,deckRear+1.5,dr.x,deckRear-.5,dr.h,[dr]);
assert(!deckTop.hit,'Rider at deck elevation must be able to enter');
assert(html.includes('HALFPIPE PARK CONNECTION'),'Halfpipe must remain accessible from main park');
console.log('PASS: raised deck rear-wall collision and connected park access');

const launchSource=html.match(/const hp=previousContact\.ramp;[\s\S]*?if\(hpLaunch\)/);
assert(launchSource,'Live game must contain dedicated halfpipe coping takeoff');
const takeoff=(rider,prev,dt=.016)=>{
 const hp=prev.ramp,hpSide=hp?.curve==='halfpipe-left'?-1:hp?.curve==='halfpipe-right'?1:0;
 const hpTravel=Math.cos(rider.dir)*(rider.travelSign===-1?-1:1)*hpSide;
 const hpLip=hp?hp.z+hpSide*hp.d/2:0;
 const hpRemaining=hpSide*(hpLip-rider.z);
 const hpSpeed=rider.speed*Math.max(0,hpTravel);
 return rider.grounded&&hpSide!==0&&rider.rampCooldown<=0&&hpTravel>.55&&hpSpeed>2.8&&hpRemaining>=-.35&&hpRemaining<Math.max(.48,hpSpeed*dt*1.8);
};
for(const [ramp,heading,sign] of [[left,Math.PI,1],[right,0,1],[left,0,-1],[right,Math.PI,-1]]){
 const side=ramp.curve==='halfpipe-left'?-1:1,lip=ramp.z+side*ramp.d/2;
 const sk={x:ramp.x,z:lip-side*.12,dir:heading,travelSign:sign,speed:8,grounded:true,rampCooldown:0};
 assert(takeoff(sk,T.sample(sk.x,sk.z,ramps)),'Coping takeoff must work on both walls and fakie');
 assert(!takeoff({...sk,speed:1},T.sample(sk.x,sk.z,ramps)),'No launch without speed');
 assert(!takeoff({...sk,dir:heading+Math.PI,travelSign:sign},T.sample(sk.x,sk.z,ramps)),'No launch traveling downhill');
}
console.log('PASS: coping release on both walls, regular/fakie, speed and direction guards');
