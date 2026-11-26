import { literalRanges } from './evidence.mjs';

// Remove only the span that has just acquired a typed meaning. Repeated
// unread snippets have no unique position and keep their original evidence.
export function consumeUnread(wires,text,from,to,owns=()=>true) {
  const ids=new Set(wires.map(w=>w.id));
  return wires.flatMap(w=>{
    if (w.type!=='w.request.unread' || !owns(w)) return [w];
    const raw=w.attrs.text?.[0];
    const value=raw?.startsWith('"') ? JSON.parse(raw) : raw;
    if (!value) return [w];
    const spans=literalRanges(text,value);
    if (spans.length!==1) return [w];
    const [[a,b]]=spans;
    if (a>=to || b<=from) return [w];
    const parts=[text.slice(a,Math.max(a,from)),text.slice(Math.min(to,b),b)].map(x=>x.trim()).filter(x=>/[\p{L}\p{N}]/u.test(x));
    return parts.map((part,i)=>{
      let id=w.id;
      if (i) {
        for (let n=2;ids.has(id);n++) id=w.id+'.'+n;
        ids.add(id);
      }
      return {...w,id,attrs:{...w.attrs,text:[JSON.stringify(part)]}};
    });
  });
}
