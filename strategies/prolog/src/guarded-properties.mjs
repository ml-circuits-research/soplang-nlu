import { literalRanges } from './evidence.mjs';
import { valueResolver } from './grounding.mjs';
import { tokens } from './lexicon.mjs';
import { maskQuoted, quotedSpans } from './literal-roles.mjs';
import { parse } from './schema.mjs';
import { serialize } from './knowledge.mjs';

const requestType = 'w.request.request';
const targetType = 'w.request.target';
const constraintType = 'w.request.constraint';
const evidenceFields = ['name','description','sort_words','family_words','sort','ids'];
const decode = value => value?.startsWith('"') ? JSON.parse(value) : value;
const one = (wire,key) => decode(wire.attrs[key]?.[0]);
const normal = value => value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu,' ');
const terminal = new Set(['.','!','?']);
const scalar = key => key.head.split('+').some(head=>head==='class' || head==='candidate');
const atom = value => /^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u.test(value) ? value : JSON.stringify(value);

function guardedForm(text, worlds) {
  const chars = Array.from(text);
  const ts = tokens(maskQuoted(text,quotedSpans(text)));
  const {conditionals,presentSingularCopulas,predicateNegators} = worlds.scopeGrammar;
  const markers = [];
  const max = Math.max(1,...[...conditionals.keys()].map(key=>key.split(' ').length));
  for (let i=0;i<ts.length;i++) {
    let found;
    for (let j=i+1;j<=Math.min(i+max,ts.length);j++) {
      const phrase = ts.slice(i,j).map(([key])=>key).join(' ');
      const polarity = conditionals.get(phrase);
      if (polarity) found={position:i,end:j,polarity};
    }
    if (found) { markers.push(found); i=found.end-1; }
  }
  if (markers.length!==1) return null;
  const [{position,end:markerEnd,polarity}] = markers;
  const separator = position===0 ? ts.findIndex(([key],i)=>i>markerEnd &&
    (key===',' || worlds.joiners[key]==='sequence')) : position;
  if (separator<0) return null;
  const slice = (start,end) => chars.slice(start,end).join('').trim();
  let startAction, endAction, startCondition, endCondition;
  if (position===0) {
    const after = ts[separator][0]===',' && worlds.joiners[ts[separator+1]?.[0]]==='sequence' ? separator+1 : separator;
    startAction=ts[after][3];
    endAction=chars.length;
    startCondition=ts[markerEnd-1][3];
    endCondition=ts[separator][2];
  } else {
    startAction=0;
    endAction=(ts[position-1][0]===',' ? ts[position-1] : ts[position])[2];
    startCondition=ts[markerEnd-1][3];
    endCondition=chars.length;
  }
  const action = slice(startAction,endAction);
  if (!action || tokens(maskQuoted(action,quotedSpans(action))).some(([key])=>worlds.joiners[key])) return null;
  const condition = slice(startCondition,endCondition);
  const guard = tokens(condition);
  while (terminal.has(guard.at(-1)?.[0])) guard.pop();
  const copula = guard.findIndex(([key])=>presentSingularCopulas.has(key));
  if (copula<=0 || guard.length<=copula+1 || quotedSpans(condition).length) return null;
  const negative = predicateNegators.has(guard[copula+1][0]);
  const firstValue = copula+(negative?2:1);
  if (firstValue>=guard.length || guard.slice(firstValue).some(([key])=>
    worlds.joiners[key] || worlds.negatives.has(key) || !/[\p{L}\p{N}]/u.test(key))) return null;
  const conditionChars = Array.from(condition);
  const subject = conditionChars.slice(0,guard[copula-1][3]).join('').trim();
  const value = conditionChars.slice(guard[firstValue][2],guard.at(-1)[3]).join('');
  const inverted = polarity==='negative';
  return {action,subject,value,want:negative!==inverted?'no':undefined};
}

function sameTarget(subject, action, target, worlds) {
  const names = evidenceFields.flatMap(key=>(target.attrs[key] ?? []).map(decode))
    .filter(value=>!worlds.isReference(value) && literalRanges(action,value).length);
  if (!names.length) return false;
  if (worlds.scopeGrammar.singularReferents.has(normal(subject))) return true;
  const phrase = normal(subject);
  if (!literalRanges(normal(action),phrase).length) return false;
  if (names.some(name=>normal(name)===phrase)) return true;
  const [determiner] = tokens(subject);
  return ['definite','demonstrative'].includes(worlds.determiners[determiner?.[0]]) &&
    names.some(name=>normal(Array.from(subject).slice(determiner[3]).join(''))===normal(name));
}

export async function guardedPropertyReadings(text, worlds, read) {
  const guard = guardedForm(text,worlds);
  if (!guard) return [];
  const resolveValue = valueResolver(worlds);
  const reading = await read(guard.action);
  const choices = [reading,...reading.alternatives].filter(candidate=>candidate.sop);
  const results = [];
  for (const candidate of choices) {
    const wires = parse(candidate.sop);
    const requests = wires.filter(w=>w.type===requestType);
    const targets = wires.filter(w=>w.type===targetType);
    const request = requests[0], target = targets[0];
    const constraints = wires.filter(w=>w.type===constraintType);
    if (requests.length!==1 || targets.length!==1 || one(request,'act')!=='change' ||
        ['ask','check','propose'].includes(one(request,'mood')) || !one(request,'predicate') ||
        one(target,'request')!=='$'+request.id || one(target,'mode')!=='existing' ||
        ['all','journal_step'].includes(one(target,'fill')) || one(target,'quantifier') ||
        Number(one(target,'count') ?? 1)!==1 || !sameTarget(guard.subject,guard.action,target,worlds)) continue;
    // A relation or another lookup could introduce a second possible referent
    // for "it". This construction handles only scalar property edits.
    const family = one(target,'family');
    const keys = worlds.requestKeys.filter(key=>key.family===family && scalar(key));
    const keySet = new Set(keys.map(key=>key.name));
    if (!constraints.length || constraints.some(w=>one(w,'operator')!=='eq' ||
        !keySet.has(one(w,'attribute')) || w.attrs.value?.length!==1) ||
        !constraints.some(w=>one(w,'phase')!=='selector' && [undefined,'yes'].includes(one(w,'want'))) ||
        wires.some(w=>w.type==='w.request.lookup' && one(w,'constraint'))) continue;
    const effects = constraints.filter(w=>one(w,'phase')!=='selector').map(w=>one(w,'attribute'));
    if (new Set(effects).size!==effects.length) continue;
    const matches = new Map();
    for (const key of keys) {
      const value = resolveValue({key:'value',attribute:key.name,family,surface:guard.value});
      if (value && (!key.values.length || key.values.includes(value))) matches.set(JSON.stringify([key.name,value]),{attribute:key.name,value});
    }
    if (matches.size!==1) continue;
    const [{attribute,value}] = matches.values();
    const ids = new Set(wires.map(w=>w.id));
    let id = request.id+'.guard', i=2;
    while (ids.has(id)) id=request.id+'.guard.'+i++;
    const attrs = {request:['$'+request.id],on:['attribute'],attribute:[atom(attribute)],value:[atom(value)],
      operator:['eq'],phase:['selector']};
    if (value!==guard.value) attrs.words=[JSON.stringify(guard.value)];
    if (guard.want) attrs.want=[guard.want];
    delete request.attrs.words;
    const index = wires.indexOf(request)+1;
    wires.splice(index,0,{id,type:constraintType,attrs});
    results.push({sop:serialize(wires).trimEnd(),source:'guarded',status:candidate.status ?? 'partial'});
  }
  return results;
}
