import {parse,serialize,str} from './knowledge.mjs';
import {literalRanges} from './evidence.mjs';
import {tokens} from './lexicon.mjs';
import {quotedSpans} from './literal-roles.mjs';

const request='w.request.request';
const form=text=>tokens(text).map(([key])=>key).join(' ');
const field=(wire,key)=>str(wire.attrs[key]?.[0]);

export function incidentalModifiers(facts) {
  return new Set(facts('pro.reader.incidental_modifier').flatMap(wire=>(wire.attrs.text ?? []).map(raw=>form(str(raw)))));
}

export function incidentalModifier(text,worlds) {
  const ts=tokens(text), chars=Array.from(text), quotes=quotedSpans(text);
  const spans=ts.flatMap(([key,,start],i)=>key===',' && !quotes.some(q=>q.start<=start && q.end>start) ? [i] : []);
  const matches=[];
  const offset=i=>chars.slice(0,i).join('').length;
  for (const [i,first] of spans.entries()) {
    const last=spans[i+1];
    if (first<1 || last===undefined || last===ts.length-1 || last-first>10 ||
        !worlds.incidentalModifiers.has(ts.slice(first+1,last).map(([term])=>term).join(' '))) continue;
    const start=offset(ts[first][2]), stop=offset(ts[last][2]);
    matches.push({body:text.slice(0,start)+text.slice(stop),prefix:text.slice(0,start).trimEnd(),stop,
      words:text.slice(offset(ts[first+1][2]),stop).trimEnd()});
  }
  return matches.length===1 ? matches[0] : undefined;
}

export function withIncidentalModifier(text,plan,candidate) {
  const wires=parse(candidate.sop);
  const requestWires=wires.filter(w=>w.type===request);
  if (requestWires.length<2) return;
  const owner=requestWires.find(w=>field(w,'words') && plan.prefix.endsWith(field(w,'words')));
  if (!owner || !wires.some(w=>w.type==='w.request.target' && field(w,'request')==='$'+owner.id)) return;
  const location=literalRanges(plan.prefix,field(owner,'words'));
  if (location.length!==1) return;
  owner.attrs.words=[JSON.stringify(text.slice(location[0][0],plan.stop))];
  let id=owner.id+'.modifier';
  while (wires.some(w=>w.id===id)) id+='_';
  wires.push({id,type:'w.request.unread',attrs:{request:['$'+owner.id],text:[JSON.stringify(plan.words)],
    note:['"stated qualifier"']}});
  return {sop:serialize(wires),source:'incidental-modifier',status:'partial'};
}
