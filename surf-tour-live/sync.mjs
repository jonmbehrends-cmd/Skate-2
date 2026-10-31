import fs from 'node:fs/promises';
const file = new URL('./api/scoreboard.json', import.meta.url);
const key = process.env.ALTSPORTS_API_KEY;
const now = new Date().toISOString();
const output = {status:'unavailable',source:'ALT Sports Data',updatedAt:now,events:[],message:''};
if (!key) {
  output.status='not_configured';
  output.message='ALTSPORTS_API_KEY secret not configured. No scores are being reported.';
} else {
  try {
    const base='https://api.altsportsdata.com/api/v1/public';
    const request=async path=>{
      const response=await fetch(base+path,{headers:{'X-API-KEY':key,'Accept':'application/json'},signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error('Provider HTTP '+response.status);
      return response.json();
    };
    const events=await request('/events?startDate=2026-10-30&endDate=2026-11-11&sportType=surfing');
    if(!Array.isArray(events))throw Error('Unexpected events response');
    const selected=events.filter(e=>/philippines pro/i.test(e.name||'') && /world surf league/i.test(e.tourName||'')).slice(0,3);
    for(const e of selected){
      const detail=await request('/events/'+encodeURIComponent(e.id));
      const heats=[];
      for(const round of (detail.rounds||[])){
        for(const h of (round.heats||[])){
          if(!h.id)continue;
          try{
            const score=await request('/events/'+encodeURIComponent(e.id)+'/heats/'+encodeURIComponent(h.id));
            heats.push({id:h.id,round:round.roundName||'',status:h.heatStatus||h.status||'',score});
          }catch(err){heats.push({id:h.id,error:String(err.message)})}
        }
      }
      output.events.push({id:e.id,name:e.name,status:e.eventStatus,heats});
    }
    output.status='ok';
    output.message=selected.length?'Provider event data received':'No matching Philippines Pro event returned by provider';
  }catch(err){output.status='error';output.message=String(err.message)}
}
await fs.mkdir(new URL('./api/',import.meta.url),{recursive:true});
await fs.writeFile(file,JSON.stringify(output,null,2)+'\n');
console.log(output.status,output.message);
