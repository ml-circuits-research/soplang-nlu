import {literalRanges} from './evidence.mjs';
import {tokens} from './lexicon.mjs';
import {maskQuoted,quotedSpans} from './literal-roles.mjs';
import {scalarNumber} from './structured-arguments.mjs';
import {parse,serialize,str} from './knowledge.mjs';

const matches=(ts,start,words)=>words.every((word,i)=>ts[start+i]?.[0]===word);
const fields=(wire,key)=>(wire.attrs[key] ?? []).map(raw=>raw.startsWith('"') ? JSON.parse(raw) : raw);
const valueOf=(wire,key)=>str(wire.attrs[key]?.[0]);
const point=(text,offset)=>Array.from(text.slice(0,offset)).length;

export function compileCountOperandConflicts(facts,formats) {
  return Map.groupBy(facts('pro.reader.count_operand_conflict').flatMap(wire=>{
    const family=valueOf(wire,'family'), key=valueOf(wire,'key'), note=valueOf(wire,'note');
    if (formats.get(JSON.stringify([family,key]))!=='positive_count' || !note) return [];
    return ['before','after'].flatMap(edge=>fields(wire,edge).map(text=>(
      {family,key,note,edge,marker:tokens(text).map(([word])=>word)}
    )).filter(rule=>rule.marker.length));
  }),rule=>rule.key);
}

function conflictingOperand(text,wire,rules,worlds) {
  const value=Number(valueOf(wire,'value'));
  if (!Number.isFinite(value) || wire.attrs.value.length!==1) return;
  const source=Array.from(text);
  const quotes=quotedSpans(text);
  const ts=tokens(maskQuoted(text,quotes));
  if (!rules.some(rule=>ts.some((_,at)=>matches(ts,at,rule.marker)))) return;
  const written=fields(wire,'words');
  const ranges=written.flatMap(words=>literalRanges(text,words).map(([a,b])=>[point(text,a),point(text,b)]));
  const operands=[];
  for (let first=0;first<ts.length;first++) for (let end=Math.min(first+8,ts.length);end>first;end--) {
    if (operands.some(([a,b])=>a<=first && end<=b)) continue;
    const startAt=ts[first][2], endAt=ts[end-1][3];
    if (written.length && !ranges.some(([a,b])=>a<=startAt && endAt<=b)) continue;
    if (quotes.some(({start,end})=>start<endAt && end>startAt)) continue;
    const operand=source.slice(startAt,endAt).join('');
    if (Number(scalarNumber(operand,worlds,rules[0].family,rules[0].key))!==value) continue;
    operands.push([first,end]);
  }
  const wrong=[];
  for (const [first,end] of operands) {
    const rule=rules.find(rule=>matches(ts,rule.edge==='before' ? first-rule.marker.length : end,rule.marker));
    if (!rule) return;
    const firstWord=rule.edge==='before' ? first-rule.marker.length : first;
    let lastWord=rule.edge==='after' ? end+rule.marker.length-1 : end-1;
    if (rule.edge==='before') {
      for (let stop=end+1;stop<=Math.min(ts.length,end+5);stop++) {
        const unit=ts.slice(end,stop).map(([word])=>word).join(' ');
        if (worlds.ownerPropertyUnitNames?.has(unit)) lastWord=stop-1;
      }
    }
    const original=ranges.find(([a,b])=>a<=ts[firstWord][2] && ts[lastWord][3]<=b);
    wrong.push({text:source.slice(original?.[0] ?? ts[firstWord][2],original?.[1] ?? ts[lastWord][3]).join(''),note:rule.note});
  }
  if (wrong.length && wrong.every(item=>item.text===wrong[0].text && item.note===wrong[0].note)) return wrong[0];
}

export function countOperandConflicts(text,wires,worlds) {
  const bank=worlds.countOperandConflicts;
  if (!bank?.size) return [];
  if (!wires.some(w=>w.type==='w.request.constraint' && bank.has(valueOf(w,'attribute')))) return [];
  const requests=new Map(wires.filter(w=>w.type==='w.request.request').map(w=>['$'+w.id,w]));
  const families=Map.groupBy(wires.filter(w=>w.type==='w.request.target'),w=>w.attrs.request?.[0]);
  return wires.flatMap(wire=>{
    if (wire.type!=='w.request.constraint') return [];
    const request=wire.attrs.request?.[0], owner=requests.get(request);
    const targets=families.get(request) ?? [];
    const rules=bank.get(valueOf(wire,'attribute'))?.filter(rule=>
      !targets.length || targets.some(target=>valueOf(target,'family')===rule.family));
    if (!rules?.length || !owner) return [];
    const scope=valueOf(owner,'words') ?? (requests.size===1 ? text : undefined);
    if (!scope) return [];
    const conflict=conflictingOperand(scope,wire,rules,worlds);
    return conflict ? [{wire,...conflict}] : [];
  });
}

export function keepConflictingCountsUnread(text,answer,worlds) {
  if (!answer.sop || ![...worlds.countOperandConflicts?.keys() ?? []].some(key=>answer.sop.includes(key))) return answer;
  const wires=parse(answer.sop);
  const conflicts=countOperandConflicts(text,wires,worlds);
  if (!conflicts.length) return answer;
  for (const {wire,text,note} of conflicts) {
    if (wires.some(other=>Object.values(other.attrs).some(values=>values.includes('$'+wire.id)))) return answer;
    wire.type='w.request.unread';
    wire.attrs={request:wire.attrs.request,text:[JSON.stringify(text)],note:[JSON.stringify(note)]};
  }
  return {...answer,sop:serialize(wires),status:'partial'};
}
