const assert=require('node:assert/strict');
require('../motion.js');
const {step}=globalThis.SOLMotion;
const s=(o={})=>({dir:0,speed:0,grounded:true,grinding:false,...o});
let a=s();step(a,0,0,true,.025);assert(a.speed>0,'Grounded RT should accelerate');
let b=s({grounded:false,speed:9});step(b,0,-1,true,.025);assert(b.speed<=9,'RT and throttle must not accelerate in air');
let c=s({grounded:false,speed:9});step(c,0,1,false,.025);assert(c.speed>8.9,'Braking in air should not instantly slow rider');
let d=s({speed:10});step(d,1,0,false,.025);let e=s({speed:10,grounded:false});step(e,1,0,false,.025);assert(e.dir>0&&e.dir<d.dir*.5,'Air steering should be weaker');
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
  assert(m.landingAlignment(p)<.1,'Sideways landing should be unsafe');
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
assert(away.airVX<0,'Impact must not remove velocity moving away from wall');
const corner=s({grounded:false,speed:12,airVX:8,airVZ:9});
impact(corner,[{hit:true,normalX:-1,normalZ:0},{hit:true,normalX:0,normalZ:-1}]);
assert(Math.hypot(corner.airVX,corner.airVZ)<1e-9,'Corner collision must remove both penetrating components');
const noHit=s({grounded:false,speed:10,airVX:6,airVZ:8});
assert(!impact(noHit,[{hit:false}])&&noHit.airVX===6,'Clear path must preserve airborne velocity');
const groundImpact=s({grounded:true,speed:10});
impact(groundImpact,[{hit:true,normalX:-1,normalZ:0}]);
assert.equal(groundImpact.speed,5.5,'Ground impact retains collision drag');
console.log('PASS: airborne wall projection, glancing slide, corners, boundary normals, ground drag');
