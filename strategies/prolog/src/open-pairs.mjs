import { literalField, literalRanges } from './evidence.mjs';
import { tokens } from './lexicon.mjs';
import { consumeUnread } from './nominal-evidence.mjs';
import { parse, serialize } from './knowledge.mjs';

const requestType = 'w.request.request';
const targetType = 'w.request.target';
const constraintType = 'w.request.constraint';
const unreadType = 'w.request.unread';
const nameSlot = 'target.name';
const word = /^[\p{L}\p{M}\p{N}_]+$/u;
const textValue = /\p{L}/u;
const punctuation = /^[,.;:!?—–，。！？；：]$/u;
const decode = value => value?.startsWith('"') ? JSON.parse(value) : value;
const field = (wire, key) => decode(wire.attrs[key]?.[0]);
const keyOf = (request, target) => JSON.stringify([field(target,'family'), field(request,'act'), field(target,'mode')]);
const asAtom = value => /^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u.test(value) ? value : JSON.stringify(value);

function matchesAt(visible, start, keys) {
  return keys.every((key,i) => visible[start+i] === key);
}

function anchored(prefix, request, family, worlds) {
  for (let start=0; start<prefix.length; start++) {
    for (let end=start+1; end<=prefix.length; end++) {
      const surface = prefix.slice(start,end).join(' ');
      if (surface === field(request,'predicate')?.toLowerCase() ||
        worlds.lookup(surface).some(([role,,target]) => role === 'target' && target === family)) return true;
    }
  }
  return false;
}

function readOperand(ts, quotes, worlds, family, span, start, end) {
  if (start >= end || end - start > 14) return;
  const from = ts[start][2], to = ts[end-1][3];
  const touched = quotes.filter(quote => quote.start < to && from < quote.end);
  if (touched.length) {
    const [quote] = touched;
    if (touched.length !== 1 || quote.start !== from || quote.end !== to || !textValue.test(quote.value)) return;
    return {value:quote.value,from,to};
  }
  if (!word.test(ts[start][0]) || !word.test(ts[end-1][0]) ||
      !ts.slice(start,end).some(([token]) => textValue.test(token) && !Object.hasOwn(worlds.determiners,token)) ||
      worlds.lookup(ts[start][0]).some(([role]) => role === 'marker')) return;
  for (let i=start; i<end; i++) {
    const [token] = ts[i];
    const question = worlds.scopeGrammar.questions.get(token);
    if (punctuation.test(token) || worlds.negatives.has(token) || question && !question.requiresAsk ||
        worlds.scopeGrammar.auxiliary.has(token) || worlds.scopeGrammar.conditionals.has(token) ||
        ['sequence','clause','contrast'].includes(worlds.joiners[token]) ||
        worlds.lookup(token).some(([role,,kind]) => role === 'marker' && ['part','replacement','tool','format'].includes(kind))) return;
    for (let after=i+2; after<=Math.min(end,i+4); after++) {
      const cue = ts.slice(i,after).map(part => part[0]).join(' ');
      if (worlds.lookup(cue).some(([role,,target]) => role === 'target' && target === family)) return;
    }
  }
  const value = span(from,to);
  return textValue.test(value) && !worlds.isReference(value) ? {value,from,to} : undefined;
}

function safetyTail(ts, visible, start, stop, worlds) {
  for (let i=start; i<stop; i++) {
    if (!visible[i]) continue;
    const token = ts[i][0];
    if (punctuation.test(token) || ['sequence','clause','contrast'].includes(worlds.joiners[token])) return i;
    if (worlds.joiners[token] === 'coordination' &&
        worlds.lookup(visible[i+1] ?? '').some(([role]) => role === 'act')) return i;
  }
  return stop;
}

function readFrames(ts, quotes, span, request, target, forms, worlds, start, stop) {
  const visible = ts.map(([lower,,from]) => quotes.some(q => q.start <= from && from < q.end) ? '' : lower);
  const family = field(target,'family');
  const readings = [];
  for (const {prefix,connector,slots,support} of forms) {
    if (!anchored(prefix,request,family,worlds)) continue;
    for (let i=start; i+prefix.length<stop; i++) {
      if (!matchesAt(visible,i,prefix)) continue;
      const leftStart = i+prefix.length;
      const end = safetyTail(ts,visible,leftStart,stop,worlds);
      for (let split=leftStart+1; split+connector.length<end; split++) {
        if (!matchesAt(visible,split,connector)) continue;
        const first = readOperand(ts,quotes,worlds,family,span,leftStart,split);
        const second = readOperand(ts,quotes,worlds,family,span,split+connector.length,end);
        if (!first || !second) continue;
        readings.push({first,second,slots,support,start:i,split,end,connectorSize:connector.length,prefixSize:prefix.length});
      }
    }
  }
  if (!readings.length) return;
  readings.sort((a,b) => b.prefixSize-a.prefixSize || b.connectorSize-a.connectorSize || b.support-a.support);
  const best = readings[0];
  const signature = reading => JSON.stringify([reading.slots,reading.first,reading.second]);
  // More-specific aliases for the same occurrence do not create a second
  // reading. Independently eligible separators or spans stay ambiguous.
  if (readings.some(reading => signature(reading) !== signature(best) &&
    (reading.prefixSize === best.prefixSize && reading.connectorSize === best.connectorSize ||
     reading.first.from !== best.first.from ||
     reading.split >= best.split + best.connectorSize || best.split >= reading.split + reading.connectorSize))) return;
  return best;
}

export function openPairReadings(text, ts, quotes, candidate, grammar, worlds) {
  if (!grammar || !candidate.sop) return [];
  const wires = parse(candidate.sop);
  const requests = wires.filter(wire => wire.type === requestType), targets = wires.filter(wire => wire.type === targetType);
  if (requests.length !== 1 || targets.length !== 1) return [];
  const [request] = requests, [target] = targets;
  const forms = grammar[keyOf(request,target)];
  const ref = '$' + request.id;
  if (!forms?.length || field(target,'request') !== ref) return [];
  const scope = field(request,'words') ?? text, located = literalRanges(text,scope);
  if (located.length !== 1) return [];
  const [utfStart] = located[0];
  const start = Array.from(text.slice(0,utfStart)).length, end = start + Array.from(scope).length;
  const chars = Array.from(text);
  const span = (a,b) => chars.slice(a,b).join('');
  const startIndex = ts.findIndex(token => token[2]>=start);
  const stopIndex = ts.findIndex(token => token[2]>=end);
  if (startIndex < 0 || ts.slice(startIndex,stopIndex<0 ? ts.length : stopIndex).some(([token,,from]) =>
    !quotes.some(q => q.start<=from && from<q.end) && (worlds.negatives.has(token) ||
      worlds.scopeGrammar.negatives.has(token) || worlds.scopeGrammar.conditionals.has(token)))) return [];
  const reading = readFrames(ts,quotes,span,request,target,forms,worlds,startIndex,stopIndex<0 ? ts.length : stopIndex);
  if (!reading) return [];
  const operands = [reading.first,reading.second], slots = reading.slots;
  const constraints = wires.filter(wire => wire.type === constraintType);
  const family = field(target,'family');
  if (slots.some(([key]) => key !== nameSlot && !worlds.requestKeys.some(prop =>
    prop.family === family && prop.name === key && prop.head.split('+').includes('span') && !prop.values.length))) return [];
  const added = [], ids = new Set(wires.map(w => w.id));
  let revised = target;
  for (const [index,[key,phase]] of slots.entries()) {
    const {value} = operands[index];
    if (key === nameSlot) {
      const name = field(target,'name');
      if (name && name !== value || field(target,'mode') !== 'existing') return [];
      if (name !== value) revised = {...target,attrs:{...target.attrs,fill:['written'],name:[JSON.stringify(value)]}};
      continue;
    }
    const existing = constraints.filter(w => field(w,'attribute') === key && (field(w,'phase') ?? 'result') === phase);
    if (existing.some(w => field(w,'value') !== value)) return [];
    if (existing.length) continue;
    const stem = target.id+'.pair'+(index+1);
    let id = stem;
    for (let n=2; ids.has(id); n++) id = stem+'.'+n;
    added.push({id,type:constraintType,attrs:{request:[ref],on:['attribute'],attribute:[asAtom(key)],
      value:[JSON.stringify(value)],words:[JSON.stringify(value)],operator:['eq'],phase:[phase]}});
  }
  if (revised === target && !added.length) return [];
  const replaced = new Set(slots.map(([key]) => key));
  const from = span(0,reading.first.from).length, to = span(0,reading.second.to).length;
  const overlaps = operand => literalRanges(text,operand).some(([a,b]) => a < to && b > from);
  for (const wire of wires) {
    if (wire === request || wire.type === unreadType || replaced.has(field(wire,'attribute'))) continue;
    const evidence = Object.keys(wire.attrs).filter(literalField);
    if (wire.type === constraintType && !wire.attrs.words && wire.attrs.value) evidence.push('value');
    if (evidence.some(k => wire.attrs[k].some(item => overlaps(decode(item))))) return [];
  }
  const remaining = consumeUnread(wires.map(wire => wire === target ? revised : wire), text, from, to);
  return [{sop:serialize([...remaining,...added]),source:'open-pair',support:reading.support,
    status:remaining.some(wire => wire.type === unreadType) ? 'partial' : 'matched'}];
}
