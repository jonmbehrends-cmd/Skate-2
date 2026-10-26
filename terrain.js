/* SOL SKATE — shared analytical surface for visual mesh and wheel contact. */
(function(root){'use strict';
function profile(ramp,t){const u=Math.max(0,Math.min(1,t));return ramp.curve==='quarter'?{height:ramp.h*u*u,slope:2*ramp.h*u/ramp.d}:{height:ramp.h*u,slope:ramp.h/ramp.d}}
function sample(x,z,ramps){for(const ramp of ramps){if(Math.abs(x-ramp.x)>ramp.w/2||z<ramp.z-ramp.d/2||z>ramp.z+ramp.d/2)continue;const p=profile(ramp,(z-(ramp.z-ramp.d/2))/ramp.d);return {height:p.height,slope:p.slope,ramp}}return {height:0,slope:0,ramp:null}}
function launch(previous,current,z,heading,speed){if(!previous.ramp||current.ramp===previous.ramp||speed<3||Math.cos(heading)<.35)return 0;const lip=previous.ramp.z+previous.ramp.d/2;if(z<lip||Math.abs(z-lip)>Math.max(.8,speed*.05))return 0;return Math.max(2.5,speed*Math.cos(heading)*previous.slope+1.3)}
root.SOLTerrain={profile,sample,launch};
})(typeof window!=='undefined'?window:globalThis);
