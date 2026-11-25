export type AudioExcerpt={start:number;duration:number};
export type AudioExcerptEdge='start'|'end';
const finite=(value:number,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

/** Source time is independent from the composition's placement and offset. */
export function normalizeAudioExcerpt(total:number,selection:AudioExcerpt,maximum:number):AudioExcerpt{
 total=Math.max(0,finite(total));
 const limit=Math.min(total,Math.max(0,finite(maximum)));
 if(!limit)return{start:0,duration:0};
 const minimum=Math.min(.05,limit),start=clamp(finite(selection.start),0,total-minimum);
 return{start,duration:clamp(finite(selection.duration,limit),minimum,Math.min(limit,total-start))};
}

/** Each handle can advance the window, keeping its opposite edge when possible. */
export function moveAudioExcerptHandle(total:number,selection:AudioExcerpt,edge:AudioExcerptEdge,value:number,maximum:number):AudioExcerpt{
 const current=normalizeAudioExcerpt(total,selection,maximum);
 if(!current.duration)return current;
 const limit=Math.min(total,maximum),minimum=Math.min(.05,limit);
 if(edge==='start'){
  const start=clamp(finite(value,current.start),0,total-minimum);
  const end=clamp(current.start+current.duration,start+minimum,Math.min(total,start+limit));
  return{start,duration:end-start};
 }
 const end=clamp(finite(value,current.start+current.duration),minimum,total);
 const start=clamp(current.start,Math.max(0,end-limit),end-minimum);
 return{start,duration:end-start};
}

/** Dragging the selected region preserves its length, including at source ends. */
export function moveAudioExcerpt(total:number,selection:AudioExcerpt,start:number,maximum:number):AudioExcerpt{
 const current=normalizeAudioExcerpt(total,selection,maximum);
 return current.duration?{start:clamp(finite(start,current.start),0,total-current.duration),duration:current.duration}:current;
}
