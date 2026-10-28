const assert=require('node:assert/strict');
require('../motion.js');
const {step}=globalThis.SOLMotion;
const s=(o={})=>({dir:0,speed:0,grounded:true,grinding:false,...o});
let a=s();step(a,0,0,true,.025);assert(a.speed>0,'Grounded RT should accelerate');
let b=s({grounded:false,speed:9});step(b,0,-1,true,.025);assert(b.speed<=9,'RT and throttle must not accelerate in air');
let c=s({grounded:false,speed:9});step(c,0,1,false,.025);assert(c.speed>8.9,'Braking in air should not instantly slow rider');
let d=s({speed:10});step(d,1,0,false,.025);let e=s({speed:10,grounded:false});step(e,1,0,false,.025);assert(e.dir>d.dir*2,'Air stick must rotate rider much faster than grounded steering');
let f=s({speed:10});step(f,0,0,false,.025);let g=s({speed:10});step(g,1,0,false,.025);assert(g.speed<f.speed,'Carving should consume speed');
let rail=s({grinding:true,speed:7});step(rail,1,-1,true,.025);assert.equal(rail.speed,7,'Grind module must own rail speed');
let bounded=s({speed:16});for(let i=0;i<200;i++)step(bounded,1,-1,true,.025);assert(bounded.speed<=17,'Speed cap');
let invalid=s({speed:10});step(invalid,NaN,NaN,true,NaN);assert.equal(invalid.speed,10,'Invalid dt ignored');
console.log('PASS: ground RT, no airborne acceleration, carving drag, air steering, grind speed, caps');

let air=s({speed:10,dir:0,grounded:false});
step(air,0,-1,true,.025); // Legacy air state still gets no propulsion.
beginAirTest();
function beginAirTest(){
  const p=s({speed:10,dir:0,grounded:true});
  const m=globalThis.SOLMotion;
  m.beginAir(p);p.grounded=false;
  p.dir=Math.PI/2;
  const d=m.horizontal(p,.05);
  assert(Math.abs(d.dx)<1e-8&&d.dz>.49,'Air steering must not redirect travel');
  step(p,1,-1,true,.025);
  assert(p.speed<=10,'RT cannot accelerate an airborne skater');
  assert(m.landingAlignment(p)<.5,'Sideways landing should be unsafe');
  p.dir=0;assert(m.landingAlignment(p)>.99,'Forward landing should align');
  m.clearAir(p);assert.equal(p.airVX,null,'Air velocity cleared on landing');
  assert(m.horizontal(p,.05).dz>0,'Ground fallback retains forward travel');
  const reverse=s({speed:8,dir:Math.PI});m.beginAir(reverse);
  assert(m.horizontal({...reverse,grounded:false},.05).dz<0,'Reverse takeoff preserves travel direction');
}
console.log('PASS: airborne velocity is independent of facing and landing alignment is validated');

const impact=globalThis.SOLMotion.collide;
const wall=s({grounded:false,speed:13,airVX:12,airVZ:5});
assert(impact(wall,[{hit:true,normalX:-1,normalZ:0}]),'Wall collision must register');
assert(Math.abs(wall.airVX)<1e-9,'Airborne wall impact must remove penetrating X velocity');
assert(wall.airVZ>4&&wall.airVZ<5,'Airborne wall impact must preserve tangential sliding');
assert(Math.abs(wall.speed-Math.hypot(wall.airVX,wall.airVZ))<1e-9,'Air speed must match actual travel');
const away=s({grounded:false,speed:5,airVX:-3,airVZ:4});
impact(away,[{hit:true,normalX:-1,normalZ:0}]);
assert.equal(away.airVX,-3,'Separating collision must not remove outward velocity');
assert.equal(away.airVZ,4,'Separating collision must not bleed wall-parallel momentum');
assert.equal(away.speed,5,'Separating collision must preserve total airborne speed');
const tangent=s({grounded:false,speed:5,airVX:0,airVZ:5});
for(let i=0;i<12;i++)impact(tangent,[{hit:true,normalX:-1,normalZ:0}]);
assert.equal(tangent.speed,5,'Repeated glancing contacts must not pin a skater to a wall');
assert.equal(tangent.airVZ,5,'Repeated glancing contacts must preserve tangent velocity');
const repeated=s({grounded:false,speed:13,airVX:12,airVZ:5});
impact(repeated,[{hit:true,normalX:-1,normalZ:0}]);
const afterImpact=repeated.speed;
impact(repeated,[{hit:true,normalX:-1,normalZ:0}]);
assert.equal(repeated.speed,afterImpact,'Collision recovery must damp a real impact only once');
const corner=s({grounded:false,speed:12,airVX:8,airVZ:9});
impact(corner,[{hit:true,normalX:-1,normalZ:0},{hit:true,normalX:0,normalZ:-1}]);
assert(Math.hypot(corner.airVX,corner.airVZ)<1e-9,'Corner collision must remove both penetrating components');
const noHit=s({grounded:false,speed:10,airVX:6,airVZ:8});
assert(!impact(noHit,[{hit:false}])&&noHit.airVX===6,'Clear path must preserve airborne velocity');
const groundGlance=s({grounded:true,speed:10,dir:Math.PI/4});
impact(groundGlance,[{hit:true,normalX:-1,normalZ:0}]);
assert(groundGlance.speed>6.7&&groundGlance.speed<7.1,'Ground glancing contact must preserve wall-parallel speed');
assert(Math.abs(Math.sin(groundGlance.dir))<1e-8,'Ground glancing contact must align travel with wall tangent');
const groundHeadOn=s({grounded:true,speed:10,dir:Math.PI/2});
impact(groundHeadOn,[{hit:true,normalX:-1,normalZ:0}]);
assert.equal(groundHeadOn.speed,0,'Head-on wall collision must stop grounded travel');
const groundFakie=s({grounded:true,speed:10,dir:Math.PI/4,travelSign:-1});
impact(groundFakie,[{hit:true,normalX:1,normalZ:0}]);
assert(groundFakie.speed>6.7&&groundFakie.speed<7.1,'Fakie glancing wall slide retains tangent');
assert(Math.abs(Math.sin(groundFakie.dir))<1e-8,'Fakie slide keeps heading consistent with travel sign');
console.log('PASS: airborne wall projection, ground glancing slide, head-on stop, corners, fakie');

// Ramp pumping must respond to slope changes without creating flat-ground or air thrust.
const pump=globalThis.SOLMotion.pump;
const slopeState=s({speed:8,grounded:true,dir:0});
const sharedPumpRamp={};
const slopeRamp={ramp:sharedPumpRamp,slope:.35};
const gained=pump(slopeState,{ramp:sharedPumpRamp,slope:.1},slopeRamp,.025,true);
assert(gained>0&&slopeState.speed>8&&slopeState.pumpIntensity>0,'Rising ramp should yield timed pump impulse');
const flat=s({speed:8});assert.equal(pump(flat,{slope:0},{ramp:null,slope:0},.025),0);assert.equal(flat.speed,8);
const airborne=s({speed:8,grounded:false});assert.equal(pump(airborne,{ramp:sharedPumpRamp,slope:.1},slopeRamp,.025),0);assert.equal(airborne.speed,8);
const reverse=s({speed:8,dir:Math.PI});assert.equal(pump(reverse,{ramp:sharedPumpRamp,slope:.1},slopeRamp,.025,true),0,'Opposing slope direction should not pump');
console.log('PASS: ramp pump impulse, flat/air guards, direction');

const idleRamp=s({speed:8});assert.equal(pump(idleRamp,{ramp:sharedPumpRamp,slope:.1},slopeRamp,.025,false),0,'Ramp must not accelerate without pumping input');
const pushRamp=s({speed:4,onRamp:true,pushPhase:0});step(pushRamp,0,0,true,.025);assert.equal(pushRamp.speed<4.1,true,'RT on ramp must not behave as a ground push');
console.log('PASS: ramp input gating and foot-push suppression');

const spin=s({grounded:false,speed:9,dir:0,airVX:0,airVZ:9});
for(let i=0;i<20;i++)step(spin,1,0,false,.025);
assert(spin.dir>5.9&&spin.dir<6.1,'Half-second full stick should rotate around 344 degrees');
assert(Math.abs(spin.airVX)<1e-8&&spin.airVZ>8.9,'Aerial spin must preserve original travel direction');
const spinBack=s({grounded:false,speed:9,dir:0});step(spinBack,-1,0,false,.025);assert(spinBack.dir<-.29,'Left stick must spin in opposite direction');
console.log('PASS: fast right/left aerial spins and independent airborne momentum');

const fakie=s({speed:7,dir:0,travelSign:-1});
const motion=globalThis.SOLMotion;motion.beginAir(fakie);
assert(fakie.airVZ<0,'Fakie takeoff must preserve backward momentum');
fakie.grounded=false;fakie.dir=Math.PI;
assert(motion.landingAlignment(fakie)>.99,'180 landing should align while rolling switch');
assert.equal(motion.landingTravelSign(fakie),1,'180 landing changes rolling stance to forward');
const backwards=s({speed:4,travelSign:-1});
assert(motion.horizontal(backwards,.05).dz<0,'Grounded fakie must move backwards without snapping heading');
step(backwards,1,0,false,.025);assert(backwards.dir>0,'Fakie stick yaw stays camera-consistent');
assert(motion.horizontal(backwards,.05).dx<0,'Fakie travel curves relative to the reversed chase camera');
console.log('PASS: backward rolling, switch landings and camera-consistent fakie steering');

// Experimental pump acceptance cases removed with the rolled-back pump implementation.
