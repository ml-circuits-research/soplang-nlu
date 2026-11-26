import { tokens } from './lexicon.mjs';
import { maskQuoted, quotedSpans } from './literal-roles.mjs';
import { literalRanges } from './evidence.mjs';
import { requestScope } from './request-scope.mjs';
import { parse, serialize } from './knowledge.mjs';

const quote=JSON.stringify;
const decoded=value=>value?.startsWith('"') ? JSON.parse(value) : value;
const values=(wire,key)=>(wire.attrs[key] ?? []).map(decoded);
const one=(wire,key)=>values(wire,key)[0];
const lexical=key=>key==='’' ? "'" : key;
const phrase=text=>tokens(text).map(([key])=>lexical(key)).join(' ');
const word=/^[\p{L}\p{M}\p{N}_]+$/u;
const boundaries=new Set([',',';','—','–','.']);
const directiveMoods=new Set([undefined,'do']);
const request='w.request.request';
const target='w.request.target';

export function compileDiscourseReasons(facts) {
  const speakers=new Set(facts('w.lang.en.pron').filter(w=>one(w,'person')==='1' &&
    values(w,'case').includes('subject')).flatMap(w=>values(w,'text').map(phrase)));
  const auxiliaries=new Set(facts('w.lang.en.aux').filter(w=>one(w,'tense')==='present' &&
    one(w,'support')==='do').flatMap(w=>values(w,'text').map(phrase)));
  const contracted=new Set();
  for (const wire of facts('w.lang.en.neg')) {
    for (const form of values(wire,'text')) {
      for (const ending of values(wire,'ending')) {
        for (const aux of auxiliaries) {
          const contractedForm=aux+ending;
          if (form.replaceAll("'",'')===contractedForm.replaceAll("'",'')) {
            contracted.add(phrase(form));
            contracted.add(phrase(contractedForm));
          }
        }
      }
    }
  }
  const desires=new Set(facts('w.lang.en.skip').filter(w=>one(w,'class')==='desire')
    .flatMap(w=>values(w,'text').map(phrase)));
  return {speakers,auxiliaries,contracted,desires};
}

function prefixEnd(ts,start,stop,has) {
  for (let end=Math.min(stop,start+8);end>start;end--) {
    if (has(ts.slice(start,end).map(([key])=>lexical(key)).join(' '))) return end;
  }
  return start;
}

function boundedNominal(ts,start,end,worlds) {
  if (start>=end) return false;
  const surface=ts.slice(start,end).map(([key])=>key).join(' ');
  if (worlds.isReference(surface)) return true;
  const first=prefixEnd(ts,start,end,key=>Object.hasOwn(worlds.determiners,key));
  return first>start && first<end && ts.slice(first,end).every(([key])=>
    word.test(key) && !worlds.scopeGrammar.conditionals.has(key) &&
    !worlds.evidenceVocabulary.grammar.has(key) && !worlds.negatives.has(key));
}

function imperativeHeads(body,ts,worlds) {
  if (ts.at(-1)?.[0]==='?') return new Map();
  const scope=requestScope(body,maskQuoted(body,quotedSpans(body)),worlds,[]);
  if (scope.restricted) return new Map();
  const result=new Map();
  for (let start=0;start<Math.min(8,ts.length-1);start++) {
    const lead=ts.slice(0,start).map(([key])=>key).join(' ');
    if (lead && !worlds.fillerPhrases.has(lead) && !worlds.literalGrammar.leads.has(lead)) continue;
    for (let end=start+1;end<=Math.min(ts.length,start+6);end++) {
      const head=ts.slice(start,end).map(([key])=>key).join(' ');
      const acts=worlds.lookup(head).filter(([role,act,mood])=>
        role==='act' && act!=='ask' && (mood==='' || directiveMoods.has(mood))).map(([,act])=>act);
      if (acts.length) result.set(head,new Set(acts));
    }
  }
  return result;
}

export function discourseReason(text,worlds) {
  const grammar=worlds.discourseReasons;
  if (!grammar) return;
  const ts=tokens(text), chars=Array.from(text), quotes=quotedSpans(text);
  if (!ts.length) return;
  const subject=prefixEnd(ts,0,ts.length,key=>grammar.speakers.has(key));
  if (!subject) return;
  const auxiliary=prefixEnd(ts,subject,ts.length,key=>grammar.auxiliaries.has(key));
  const negative=auxiliary>subject && prefixEnd(ts,auxiliary,ts.length,key=>worlds.scopeGrammar.predicateNegators.has(key));
  const polarity=negative>auxiliary ? negative : prefixEnd(ts,subject,ts.length,key=>grammar.contracted.has(key));
  if (polarity===subject) return;
  const verb=prefixEnd(ts,polarity,ts.length,key=>grammar.desires.has(key));
  if (verb===polarity) return;
  const separator=ts.findIndex(([key],i)=>i>verb && boundaries.has(key));
  if (separator<0 || separator>verb+12 || !ts[separator+1] ||
    !boundedNominal(ts,verb,separator,worlds) ||
    quotes.some(q=>q.start<ts[separator][2] && ts[0][2]<q.end)) return;
  let first=separator+1;
  const conjunction=prefixEnd(ts,first,ts.length,key=>['sequence','contrast','clause'].includes(worlds.joiners[key]));
  if (conjunction>first) first=conjunction;
  if (first>=ts.length || ts[first][2]===ts[separator][3] && ts[separator][0]==='.') return;
  const body=chars.slice(ts[first][2]).join('').trimEnd();
  const heads=imperativeHeads(body,ts.slice(first),worlds);
  if (!heads.size) return;
  return {reason:chars.slice(ts[0][2],ts[separator][2]).join('').trimEnd(),
    connector:first>separator+1 ? chars.slice(ts[separator+1][2],ts[first-1][3]).join('') : undefined,
    prefix:chars.slice(ts[0][2],ts[first][2]).join(''),body,heads};
}

export function discourseReasonReading(split,candidate) {
  if (!candidate?.sop) return;
  const wires=parse(candidate.sop), requests=wires.filter(w=>w.type===request);
  const first=requests[0], predicate=first && one(first,'predicate');
  if (!predicate || !split.heads.get(phrase(predicate))?.has(one(first,'act')) ||
    !directiveMoods.has(one(first,'mood')) ||
    !wires.some(w=>w.type===target && w.attrs.request?.[0]==='$'+first.id)) return;
  let lastEnd=0;
  for (const req of requests) {
    const words=one(req,'words') ?? (requests.length===1 ? split.body : undefined);
    const spans=literalRanges(split.body,words);
    if (spans.length!==1 || spans[0][0]<lastEnd) return;
    lastEnd=spans[0][1];
    if (req===first) req.attrs.words=[quote(split.prefix+split.body.slice(0,lastEnd))];
  }
  let id='reason';
  while (wires.some(w=>w.id===id || w.id.startsWith(id+'.'))) id+='_';
  wires.push({id,type:'w.request.unread',attrs:{request:['$'+first.id],text:[quote(split.reason)],
    note:[quote('stated negative motivation')]}});
  if (split.connector) wires.push({id:id+'.connector',type:'w.request.filler',attrs:{text:[quote(split.connector)]}});
  return {...candidate,sop:serialize(wires),source:'discourse-reason',status:'partial'};
}
