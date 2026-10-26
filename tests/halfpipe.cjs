const assert=require('node:assert/strict');require('../terrain.js');const T=globalThis.SOLTerrain;
const left={x:46,z:-52,w:16,d:4.8,h:2.1,curve:'halfpipe-left'},right={x:46,z:-40.2,w:16,d:4.8,h:2.1,curve:'halfpipe-right'};
const dl={x:46,z:-55.95,w:16,d:3.1,h:2.1,curve:'halfpipe-deck'},dr={x:46,z:-36.25,w:16,d:3.1,h:2.1,curve:'halfpipe-deck'};
const ramps=[left,right,dl,dr];
function close(a,b){assert(Math.abs(a-b)<.000001,`${a} != ${b}`)}
close(T.profile(left,0).height,2.1);close(T.profile(left,1).height,0);
close(T.profile(right,0).height,0);close(T.profile(right,1).height,2.1);
close(T.profile(left,1).slope,0);close(T.profile(right,0).slope,0);
assert(T.profile(left,0).slope<0);assert(T.profile(right,1).slope>0);
close(T.sample(46,-46.1,ramps).height,0);close(T.sample(46,-55.95,ramps).height,2.1);close(T.sample(46,-36.25,ramps).height,2.1);
assert(T.launch(T.sample(46,-54.4,ramps),T.sample(46,-54.5,ramps),-54.5,Math.PI,8)>0);
assert(T.launch(T.sample(46,-37.8,ramps),T.sample(46,-37.7,ramps),-37.7,0,8)>0);
assert.equal(T.launch(T.sample(46,-54.4,ramps),T.sample(46,-54.5,ramps),-54.5,0,8),0);
console.log('PASS: two circular transitions, flat bottom, decks, bidirectional lip launch');

require('../obstacles.js');
const deckToRamp=globalThis.SOLTerrain.launch(T.sample(46,-55.9,ramps),T.sample(46,-54.3,ramps),-54.3,0,8);
assert.equal(deckToRamp,0,'Drop-in from a deck must not launch rider upward');
const cheek=globalThis.SOLObstacles.rampSide(37,-54.2,39,-54.2,0,ramps);
assert(cheek.hit&&cheek.x<38,'Raised halfpipe cheek must stop side penetration');
console.log('PASS: safe deck drop-in and full-profile halfpipe side collision');

require('../motion.js');
const M=globalThis.SOLMotion;
const rider={x:46,z:-46.1,dir:0,speed:5,travelSign:-1,grounded:true,grinding:false,onRamp:false};
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
assert(turns>=1&&maxZ-minZ>4,'Skater must naturally roll backwards down transition and across flat');
assert(T.launch(T.sample(46,-54.4,ramps),T.sample(46,-54.5,ramps),-54.5,0,8,-1)>0,'Fakie lip launch must work');
console.log('PASS: wall rollback, cross-flat travel, and fakie lip launch');

const deckWall=globalThis.SOLObstacles.rampSide(46,-33,46,-35,0,[dr]);
assert(deckWall.hit&&deckWall.z>-35,'Ground-level skater must not pass through deck rear wall');
const deckTop=globalThis.SOLObstacles.rampSide(46,-33,46,-35,2.1,[dr]);
assert(!deckTop.hit&&deckTop.z===-35,'Skater at deck height may enter normally');
console.log('PASS: elevated halfpipe deck rear-wall collision and valid top entry');
