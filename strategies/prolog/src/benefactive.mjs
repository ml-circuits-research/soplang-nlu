import { parse, serialize, str } from './knowledge.mjs';
import { evidenceReport, literalRanges } from './evidence.mjs';
import { tokens } from './lexicon.mjs';
import { quotedSpans } from './literal-roles.mjs';

const all=(wire,key)=>(wire.attrs[key] ?? []).map(str);
const one=(wire,key)=>str(wire?.attrs[key]?.[0]);
const normalized=text=>tokens(text ?? '').map(([word])=>word).join(' ');
const type='w.relational.beneficiary';
const title=/^\p{Lu}[\p{L}\p{M}]+$/u;
const nominal=new Set(['definite','indefinite','possessive','demonstrative']);

export function compileBenefactives(facts) {
  const declarations=facts('pro.reader.benefactive');
  const acts=new Set(declarations.flatMap(wire=>all(wire,'act')));
  const markers=new Set(declarations.flatMap(wire=>all(wire,'marker')));
  if (!acts.size || !markers.size) return;
  const predicates=new Map();
  for (const wire of facts('w.lang.en.alternation')) {
    if (one(wire,'family')!=='dative shift') continue;
    const from=/^(\p{L}+) (\p{L}+) (\{\w+\})$/u.exec(one(wire,'from'));
    const to=/^(\p{L}+) (\{\w+\}) (\p{L}+) (\p{L}+)$/u.exec(one(wire,'to'));
    // The native beneficiary alternate uses "for". The "to" family is
    // transfer to a recipient and requires a different semantic role.
    if (!from || !to || !markers.has(to[3]) || from[1]!==to[1] || from[2]!==to[4] || from[3]!==to[2]) continue;
    const entry=predicates.get(from[1]) ?? {markers:new Set(),pronouns:new Set()};
    entry.markers.add(to[3]);
    entry.pronouns.add(from[2]);
    predicates.set(from[1],entry);
  }
  if (!predicates.size) return;
  const surfaces=(provider,filter)=>new Set(declarations.flatMap(declaration=>{
    const type=one(declaration,provider), key=one(declaration,'name_key');
    if (!type || !key) return [];
    return facts(type).flatMap(wire=>all(wire,key)).filter(filter).map(normalized);
  }));
  return {acts,predicates,names:surfaces('name_provider',name=>title.test(name)),
    blockedNames:surfaces('name_blocker',Boolean)};
}

function benefactiveMatch(text,worlds) {
  const inventory=worlds.benefactives;
  const ts=tokens(text), chars=Array.from(text);
  const rule=inventory.predicates.get(ts[0]?.[0]);
  if (!rule || ts.length<4 || ts.some(([key],i)=>key===';' || key==='?' ||
      (key==='.' || key==='!') && i!==ts.length-1)) return;
  const end=ts.length-(['.','!'].includes(ts.at(-1)[0]) ? 1 : 0);
  const classify=([key,written])=>{
    if (rule.pronouns.has(key)) return 'pronoun';
    if (title.test(written) && inventory.names.has(key) && !worlds.evidenceVocabulary.grammar.has(key) &&
        !worlds.lookup(key).some(([role])=>['target','marker','act'].includes(role))) return 'name';
  };
  const early=classify(ts[1]);
  const late=end>3 && rule.markers.has(ts[end-2][0]) &&
    !inventory.blockedNames.has(ts[end-1][0]) && classify(ts[end-1]);
  if (Boolean(early)===Boolean(late)) return;
  const index=early ? 1 : end-1;
  const remove=early ? 1 : index-1;
  const left=chars.slice(0,ts[remove][2]).join('').trimEnd();
  const right=chars.slice(ts[index][3]).join('').trimStart();
  const body=left+(right && !/^[.!]/u.test(right) ? ' ' : '')+right;
  return {body,kind:early || late,words:ts[index][1],predicate:ts[0][1],
    needsFrame:Boolean(early) && !nominal.has(worlds.determiners[ts[2][0]])};
}

function bindCandidate(candidate,text,match,worlds) {
  if (!candidate?.sop) return;
  const wires=parse(candidate.sop);
  const requests=wires.filter(w=>w.type==='w.request.request'), targets=wires.filter(w=>w.type==='w.request.target');
  if (requests.length!==1 || targets.length!==1 ||
      wires.some(w=>w.type===type || w.type==='w.request.unread' &&
        !Object.hasOwn(worlds.determiners,one(w,'text')?.toLowerCase()))) return;
  const [request]=requests,[target]=targets;
  const ref='$'+request.id, act=one(request,'act'), family=one(target,'family');
  if (one(target,'request')!==ref || one(target,'mode')!=='new' || !worlds.benefactives.acts.has(act) ||
      !worlds.literalGrammar.licenses(family,act) || one(request,'predicate')!==match.predicate || request.attrs.want ||
      one(request,'mood') && one(request,'mood')!=='do') return;
  if (candidate.source!=='argument-frame') {
    if (match.needsFrame) return;
    const surface=one(target,'sort_words') ?? one(target,'sort');
    if (!surface || literalRanges(match.body,surface).length!==1 ||
        !worlds.lookup(normalized(surface)).some(([role,action,owner,mode,sort])=>
          role==='target' && ['*',act].includes(action) && owner===family && mode==='new' && sort===one(target,'sort'))) return;
  }
  const evidence=evidenceReport(match.body,wires,worlds.evidenceVocabulary);
  if (evidence.missing.length || evidence.counts.uncovered || literalRanges(text,match.words).length!==1) return;
  request.attrs.words=[JSON.stringify(text)];
  let id=request.id+'.beneficiary';
  while (wires.some(wire=>wire.id===id)) id+='_';
  wires.push({id,type,attrs:{request:[ref],kind:[match.kind],words:[JSON.stringify(match.words)],
    value:[JSON.stringify(match.kind==='pronoun' ? match.words.toLowerCase() : match.words)]}});
  return {family,candidate:{sop:serialize(wires),source:'benefactive',status:candidate.status}};
}

export async function benefactiveReadings(text,worlds,read,permit) {
  if (!worlds.benefactives || !worlds.validationModules?.types.has(type)) return [];
  const match=benefactiveMatch(text,worlds);
  if (!match || quotedSpans(text).length || !permit(text,[])) return [];
  const choices=(await read(match.body)).map(candidate=>bindCandidate(candidate,text,match,worlds)).filter(Boolean);
  if (new Set(choices.map(choice=>choice.family)).size!==1) return [];
  return choices.map(choice=>choice.candidate);
}
