/* Claude's board scale proposal. Opt-in with ?board=realistic until visual
 * acceptance covers the hoodie and V2 fallback. Units are game units; the
 * reference rider stature is an art-direction assumption, not a measurement.
 * V maps positions about the existing wheel-bottom plane. Scale lengths with
 * vs instead: V is affine and must never be used to scale a length. */
(function(root){'use strict';
const LEGACY=Object.freeze({deckL:1.65,deckW:.55,truckZ:.52,wheelX:.27,wheelY:.06,wheelD:.19,wheelW:.13,
 gripTopY:.33,rideHeight:.045,standY:.45,footX:.015,footZ:.36,pushDX:.245,pushDrop:.28,pushExt:.14,
 grip:Object.freeze([.18,.34,-.31]),boardslideDrop:.10,grindDrop:0});
const REF=Object.freeze({stature:1.78,deckL:.80,deckW:.203,wheelbase:.362,wheelD:.052,wheelW:.032});
function make({rider=2.05,stature=REF.stature,gripTopY=LEGACY.gripTopY,footGap=.02}={}){
 for(const [name,value]of Object.entries({rider,stature,gripTopY,footGap}))if(!Number.isFinite(value))throw new RangeError('Nonfinite '+name);
 if(rider<=0||stature<=0||gripTopY<=-LEGACY.rideHeight||footGap<0)throw new RangeError('Invalid board dimensions');
 const k=rider/stature,deckL=REF.deckL*k,deckW=REF.deckW*k,truckZ=REF.wheelbase*k/2,wheelD=REF.wheelD*k,wheelW=REF.wheelW*k;
 const wheelX=deckW/2-wheelW/2,G=LEGACY.wheelY-LEGACY.wheelD/2;
 const sx=deckW/LEGACY.deckW,sz=deckL/LEGACY.deckL,vs=wheelD/LEGACY.wheelD,zr=truckZ/LEGACY.truckZ;
 const V=y=>G+(y-G)*vs,riderShiftY=V(gripTopY)-gripTopY;
 const ps=(V(gripTopY)+LEGACY.rideHeight)/(gripTopY+LEGACY.rideHeight);
 return Object.freeze({name:'realistic',k,deckL,deckW,truckZ,wheelX,wheelD,wheelW,axleL:2*(wheelX+wheelW/2),
  G,sx,sz,vs,zr,V,mapX:x=>x*sx,mapY:V,mapZ:z=>z*sz,gripTopY:V(gripTopY),riderShiftY,pushScale:ps,
  rideHeight:LEGACY.rideHeight,boardslideDrop:V(LEGACY.boardslideDrop),grindDrop:V(LEGACY.grindDrop),
  standY:LEGACY.standY+riderShiftY,footX:LEGACY.footX,footZ:LEGACY.footZ*zr,
  pushDrop:LEGACY.pushDrop*ps,pushExt:LEGACY.pushExt*zr,
  pushDX:toeReach=>{if(!Number.isFinite(toeReach)||toeReach<0)throw new RangeError('Invalid toe reach');return LEGACY.footX+deckW/2+footGap+toeReach;},
  grip:Object.freeze([LEGACY.grip[0]*sx,V(LEGACY.grip[1]),LEGACY.grip[2]*sz])});
}
const enabled=typeof location!=='undefined'&&new URLSearchParams(location.search).get('board')==='realistic';
const api={LEGACY,REF,make,current:null,
 fit(gripTopY){api.current=enabled?make({gripTopY:Number.isFinite(gripTopY)?gripTopY:LEGACY.gripTopY}):null;return api.current;}};
root.SOLBoardDimensions=api;
})(typeof window!=='undefined'?window:globalThis);
