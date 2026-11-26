import { parse, serialize } from './knowledge.mjs';
import { tokens } from './lexicon.mjs';
import { consumeUnread } from './nominal-evidence.mjs';

const field=(wire,k)=>{
  const raw=wire.attrs[k]?.[0];
  return raw?.startsWith('"') ? JSON.parse(raw) : raw;
};

// The same words can name a target and give its catalog type. Retain the
// ordinary target evidence and attach the closed value only on its own noun.
export function nominalClassReading(text,ts,quotes,candidate,worlds) {
  if (!worlds.nominalClasses?.size) return;
  const wires=parse(candidate.sop);
  const requests=wires.filter(w=>w.type==='w.request.request'), targets=wires.filter(w=>w.type==='w.request.target');
  if (requests.length!==1 || targets.length!==1) return;
  const [r]=requests,[t]=targets;
  const forms=worlds.nominalClasses.get(field(t,'family'));
  if (!forms || field(t,'request')!=='$'+r.id || field(r,'act')!=='make' || field(t,'mode')!=='new') return;
  const head=field(t,'sort_words') ?? field(t,'family_words') ?? field(t,'sort');
  if (!head) return;
  const headWords=tokens(head).map(([key])=>key);
  if (!headWords.length) return;
  const loc=ts.flatMap((_,i)=>headWords.every((w,j)=>ts[i+j]?.[0]===w) ? [i] : []);
  if (loc.length!==1) return;
  const chars=Array.from(text), hits=[];
  for (let i=0;i<ts.length;i++) {
    for (const entry of forms.get(ts[i][0]) ?? []) {
      if (!entry.words.every((w,j)=>ts[i+j]?.[0]===w)) continue;
      const a=ts[i][2],b=ts[i+entry.words.length-1][3];
      if (quotes.some(q=>a<q.end && b>q.start)) continue;
      const from=chars.slice(0,a).join('').length,to=chars.slice(0,b).join('').length;
      if (loc[0]<i || loc[0]+headWords.length>i+entry.words.length) continue;
      const scope=field(r,'words');
      if (scope && !scope.includes(text.slice(from,to))) continue;
      hits.push({entry,from,to});
    }
  }
  if (hits.length!==1) return;
  const [{entry,from,to}]=hits;
  if (wires.some(w=>w.type==='w.request.constraint' && field(w,'attribute')===entry.attribute)) return;
  const used=new Set(wires.map(w=>w.id));let id=t.id+'.class';
  for (let i=2;used.has(id);i++) id=t.id+'.class'+i;
  const kept=consumeUnread(wires,text,from,to);
  kept.push({id,type:'w.request.constraint',attrs:{request:['$'+r.id],on:['attribute'],attribute:[entry.attribute],
    value:[/^[a-zA-Z_][a-zA-Z_0-9.-]*$/u.test(entry.value) ? entry.value : JSON.stringify(entry.value)],words:[JSON.stringify(text.slice(from,to))],operator:['eq'],phase:['result']}});
  return {...candidate,source:'nominal-class',sop:serialize(kept)};
}
