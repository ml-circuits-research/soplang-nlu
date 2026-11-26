import {parse,serialize,str} from './knowledge.mjs';
import {literalRanges} from './evidence.mjs';
import {consumeUnread} from './nominal-evidence.mjs';
import {tokens} from './lexicon.mjs';

const integer = /^\d+$/u;
const word = /^[\p{L}\p{M}\p{N}_]+$/u;
const slot = (wire,key) => str(wire.attrs[key]?.[0]);

export function tupleAssignments(ts, start, labels) {
  if (!labels?.length) return;
  const parenthesized = ts[start]?.[0] === '(';
  let at = start + Number(parenthesized);
  const values = new Map();
  for (let index = 0; index < labels.length; index++) {
    const label = ts[at];
    if (!labels.includes(label?.[0]) || values.has(label[0]) || ts[at + 1]?.[0] !== '=') return;
    at += 2;
    const sign = ['+', '-'].includes(ts[at]?.[0]) ? ts[at++] : undefined;
    const whole = ts[at++];
    if (!integer.test(whole?.[0] ?? '') || sign && sign[3] !== whole[2]) return;
    let value = (sign?.[1] ?? '') + whole[1];
    if (ts[at]?.[0] === '.' && ts[at][2] === whole[3] &&
        integer.test(ts[at + 1]?.[0] ?? '') && ts[at + 1][2] === ts[at][3]) {
      value += '.' + ts[at + 1][1];
      at += 2;
    }
    values.set(label[0], [label[1], value]);
    if (index + 1 < labels.length && ts[at++]?.[0] !== ',') return;
  }
  if (parenthesized && ts[at++]?.[0] !== ')') return;
  const end = ts[at - 1][3];
  const next = ts[at]?.[0];
  const nextValue = ['+', '-'].includes(ts[at + 1]?.[0]) ? at + 2 : at + 1;
  if ((next === ',' || next === '.') && integer.test(ts[nextValue]?.[0] ?? '') ||
      next === ',' && ts[at + 2]?.[0] === '=' ||
      ts[at]?.[2] === end && !['.', ',', '!', '?', ';'].includes(next)) return;
  return {assignments: labels.map(label => values.get(label)), end};
}

export function tupleTargetNames(ts, properties, hits, quotes, worlds) {
  const plans = [];
  for (const [offset,, tuple] of properties) {
    if (!tuple.assignments) continue;
    const stop = ts.findIndex(([, ,start])=>start===offset);
    for (let i=Math.max(1,stop-9); i<stop-1; i++) {
      const [cue, marker, from] = ts[i];
      if (!worlds.targetNameWords.has(cue) || !hits.some(([,end,[role,act,family,mode]])=>
        end===ts[i-1][3] && role==='target' && act===tuple.act && family===tuple.family && mode==='existing')) continue;
      const start=ts[i+1][2], end=ts[stop-1][3];
      const quoted=quotes.find(quote=>quote.start===start && quote.end===end);
      const valid=ts.slice(i+1,stop).every(([key,,at],index)=>
        word.test(key) && !worlds.joiners[key] && !worlds.negatives.has(key) &&
          !worlds.scopeGrammar.conditionals.has(key) ||
        ['?','!'].includes(key) && index>0 && i+1+index===stop-1 && ts[stop-2][3]===at);
      if (quoted ? !quoted.value.trim() : !valid) continue;
      plans.push({start,end,from,marker,quoted:quoted?.value,tuple});
    }
  }
  return plans;
}

export function namedTupleReading(text, candidate, plan, worlds) {
  const wires=parse(candidate.sop), requests=wires.filter(wire=>wire.type==='w.request.request');
  if (requests.length!==1 || slot(requests[0],'act')!==plan.tuple.act) return;
  const ref='$'+requests[0].id;
  const targets=wires.filter(wire=>wire.type==='w.request.target' && slot(wire,'request')===ref);
  const [target]=targets;
  if (targets.length!==1 || slot(target,'family')!==plan.tuple.family || slot(target,'mode')!=='existing' ||
      !plan.tuple.keys.every((key,i)=>wires.some(wire=>wire.type==='w.request.constraint' &&
        slot(wire,'request')===ref && slot(wire,'attribute')===key &&
        slot(wire,'value')===plan.tuple.assignments[i][1] && slot(wire,'phase')==='result'))) return;
  const chars=Array.from(text), slice=(a,b)=>chars.slice(a,b).join('');
  const name=plan.quoted ?? slice(plan.start,plan.end);
  if (target.attrs.name && slot(target,'name')!==name) return;
  const competingClaims = wires.filter(wire=>wire.type==='w.request.constraint' &&
    slot(wire,'request')===ref && slot(wire,'phase')==='result' &&
    slot(wire,'key_words')===plan.marker && slot(wire,'value')===name);
  if (competingClaims.length && literalRanges(text,plan.marker).length!==1) return;
  Object.assign(target.attrs,{name:[JSON.stringify(name)],name_words:[JSON.stringify(plan.marker)],fill:['written']});
  const cleaned=consumeUnread(wires.filter(wire=>!competingClaims.includes(wire)),text,
    slice(0,plan.from).length,slice(0,plan.end).length,
    wire=>slot(wire,'request')===ref);
  const lead=cleaned.find(wire=>{
    if (wire.type!=='w.request.unread' || slot(wire,'request')!==ref) return false;
    const written=slot(wire,'text');
    return written && text.trimStart().startsWith(written) &&
      worlds.fillerPhrases.has(tokens(written).map(([word])=>word).join(' '));
  });
  if (lead) {
    lead.type='w.request.filler';
    lead.attrs={text:lead.attrs.text};
  }
  return {sop:serialize(cleaned),source:'named-tuple',status:cleaned.some(wire=>wire.type==='w.request.unread') ? 'partial' : 'matched'};
}
