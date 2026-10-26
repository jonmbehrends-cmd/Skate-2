// Run with: node tests/landing.cjs
const assert = require('node:assert/strict');
require('../landing.js');
const {step,canLand,reset,TAU}=globalThis.SOLLanding;
function advance(s,f,y,seconds,dt=1/60){for(let i=0;i<Math.ceil(seconds/dt);i++)step(s,f,y,dt);return s}
let s={};
assert.equal(canLand(s,1,0),false,'Unrotated kickflip must fail');
advance(s,1,0,.12);assert.equal(canLand(s,1,0),false,'Early touchdown must fail');
advance(s,1,0,.65);assert.equal(canLand(s,1,0),true,'Completed kickflip must land');
assert(Math.abs(s.rollAngle-TAU)<.32);
reset(s);assert.equal(canLand(s,0,0),true,'Clean ollie can land');
advance(s,-1,1,.8);assert.equal(canLand(s,-1,1),true,'Heel plus shove can land');
advance(s,-2,1,.08);assert.equal(canLand(s,-2,1),false,'Late second flip should not be auto-completed');
advance(s,-2,1,.7);assert.equal(canLand(s,-2,1),true,'Sufficient additional airtime completes rotation');
reset(s);assert.equal(canLand(s,1,0),false,'Restart clears rotations');
step(s,1,0,NaN);assert(Number.isFinite(s.rollAngle),'Nonfinite delta ignored');
console.log('SOL SKATE airborne rotation / landing checks passed');
