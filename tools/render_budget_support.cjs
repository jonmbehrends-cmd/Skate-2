/* Browser-side hooks shared by parity and submission benchmarks. */
function installRenderBudgetHooks(){
 const d=window.__SOL_DIAGNOSTICS__,gl=d.engine._gl;
 const realNow=performance.now.bind(performance),pixel=new Uint8Array(4);
 // SceneInstrumentation resets the engine's draw counter before every render.
 // Read current after the render; a delta would incorrectly subtract a frame.
 const instrumentation=new BABYLON.SceneInstrumentation(d.scene);
 const stats={calls:0,byKind:{}},hooks=[];
 for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced','drawRangeElements']){
  if(typeof gl[name]!=='function')continue;
  const original=gl[name];
  const wrapper=function(...args){stats.calls++;stats.byKind[name]=(stats.byKind[name]||0)+1;return original.apply(gl,args);};
  hooks.push({name,original,wrapper});gl[name]=wrapper;
 }
 window.__renderBudget={realNow,stats,instrumentation,reset(){stats.calls=0;stats.byKind={};},
  setCounting(enabled){for(const h of hooks)gl[h.name]=enabled?h.wrapper:h.original;},
  sync(){gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);}};
 // Stable idle pose, including real rider shadows. Do not advance physics
 // during render-only comparisons or tie simulation work to host frame rate.
 const loop=d.engine._activeRenderLoops[0];d.engine.stopRenderLoop();
 const nowDescriptor=Object.getOwnPropertyDescriptor(performance,'now');
 Object.defineProperty(performance,'now',{configurable:true,value:()=>10000});
 try{
  document.querySelector('#restart').click();
  d.riderV2.diagnostics.landing=0;d.riderV2.diagnostics.grounded=true;
  loop();
 }finally{
  if(nowDescriptor)Object.defineProperty(performance,'now',nowDescriptor);
  else delete performance.now;
 }
 document.querySelectorAll('body > :not(canvas)').forEach(el=>{el.style.display='none';});
}
module.exports={installRenderBudgetHooks};
