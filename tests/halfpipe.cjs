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
