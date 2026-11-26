import { tokens } from './lexicon.mjs';
import { quotedSpans } from './literal-roles.mjs';
import { parse } from './schema.mjs';
import { universalTargetReading } from './set-query.mjs';
import { serialize } from './knowledge.mjs';

const type=name=>'w.request.'+name;
const decode=raw=>raw?.startsWith('"') ? JSON.parse(raw) : raw;
const fields=(wire,key)=>(wire?.attrs[key] ?? []).map(decode);
const get=(wire,key)=>fields(wire,key)[0];
const normalized=text=>tokens(text).map(([key])=>key).join(' ');
const lexical=/^[\p{L}\p{M}\p{N}_-]+$/u;
const title=/^\p{Lu}[\p{L}\p{M}\p{N}_-]*$/u;

export function compileSetExclusions(facts) {
  return facts('pro.reader.set_exclusion').flatMap(wire=>{
    const leads=fields(wire,'text').map(normalized).filter(Boolean);
    const acts=new Set(fields(wire,'act'));
    if (!leads.length || !acts.size) return [];
    return [{leads,acts,order:get(wire,'order') ?? 'after',anaphors:new Set(fields(wire,'anaphor').map(normalized))}];
  });
}

function readPair(scope,family,worlds,exceptionWords,chars) {
  const choices=new Map();
  const raw=start=>chars.slice(scope[start][2],scope.at(-1)[3]).join('');
  const norm=(start,end)=>scope.slice(start,end).map(([key])=>key).join(' ');
  for (let i=1;i<Math.min(7,scope.length);i++) {
    const marker=norm(0,i);
    const relations=worlds.lookup(marker).filter(([role,act,slot])=>role==='marker' && act==='*' && slot==='spatial');
    if (!relations.length) continue;
    const landmark=scope.slice(i), anchor=raw(i);
    const det=worlds.determiners[landmark[0][0]];
    if (!landmark.every(([key])=>lexical.test(key)) || landmark.length>7) continue;
    if (['definite','demonstrative'].includes(det)) {
      if (landmark.length<2 || landmark.slice(1).some(([key])=>worlds.determiners[key] ||
          worlds.evidenceVocabulary.grammar.has(key) || worlds.lookup(key).some(([role])=>role==='marker'))) continue;
    } else if (!landmark.every(([,written])=>title.test(written))) continue;
    const nominal=landmark.slice(1);
    // A typed noun suffix must account for any word also read as an action.
    const firstAct=nominal.findIndex(([key])=>worlds.lookup(key).some(([role])=>role==='act'));
    const nouns=nominal.slice(0,firstAct===-1 ? nominal.length : firstAct+1).map((_,j)=>norm(i+1+j));
    for (const binding of worlds.spatialBindings.filter(b=>b.family===family)) {
      const bank=worlds.requestKeys.find(k=>k.name===binding.relationKey && k.family===family);
      if (!bank || !worlds.requestKeys.some(k=>k.name===binding.anchorKey && k.family===family &&
          k.head==='fill+span' && !k.values.length)) continue;
      if (det && !nouns.some(noun=>worlds.lookup(noun).some(([role])=>role==='target') ||
          ['change','place','pick'].some(act=>worlds.ownerInventory?.get(JSON.stringify([act,noun]))
            ?.length))) continue;
      for (const [,,,value] of relations) {
        if (!bank.values.includes(value)) continue;
        if ((worlds.nominalPositions.get(family)?.get(scope[0][0]) ?? []).some(
            ([keys,,,,operator])=>operator==='region' && keys.join(' ')===norm(0))) continue;
        const item={anchor,anchorKey:binding.anchorKey,attrs:{on:['place'],attribute:[binding.relationKey],
          value:[value],operator:['relation'],words:[JSON.stringify(exceptionWords)]}};
        choices.set(JSON.stringify(item),item);
      }
    }
  }
  if (choices.size!==1) return;
  return choices.values().next().value;
}

function readProperty(terms,family,act,worlds,exceptionWords) {
  if (terms.split(' ').some(term=>worlds.determiners[term] || worlds.scopeGrammar.universalHeads.has(term))) return;
  const options=new Map();
  for (const [role,license,owner,body] of worlds.lookup(terms)) {
    if (role!=='constraint' || owner!==family || license!=='*' && license!==act || typeof body!=='string') continue;
    const [wire]=parse('@property w.request.constraint '+body);
    const attr=get(wire,'attribute'), value=get(wire,'value'), on=get(wire,'on');
    if (!['attribute','size'].includes(on) || wire.attrs.value?.length!==1 || ![undefined,'eq'].includes(get(wire,'operator')) || wire.attrs.want ||
        !worlds.requestKeys.some(k=>k.family===family && k.name===attr &&
          (k.values.includes(value) || !k.values.length && k.head.split('+').includes('candidate')))) continue;
    const attrs={on:[on],attribute:[attr],value:wire.attrs.value,operator:['eq'],words:[JSON.stringify(exceptionWords)]};
    options.set(JSON.stringify(attrs),attrs);
  }
  if (options.size===1) return {attrs:options.values().next().value};
}

export async function setExclusionReadings(text,worlds,read,permit,planClauses) {
  const specs=worlds.setExclusions ?? [];
  if (!specs.length) return [];
  const ts=tokens(text), keys=ts.map(([key])=>key), chars=Array.from(text);
  if (!keys.some(key=>worlds.scopeGrammar.universalHeads.has(key)) || quotedSpans(text).length ||
      keys.some(key=>['?',';'].includes(key))) return [];
  const sub=(start,end)=>keys.slice(start,end).join(' ');
  const span=(start,end)=>chars.slice(ts[start][2],ts[end-1][3]).join('');
  const end=/^[.!]$/u.test(keys.at(-1) ?? '') ? ts.length-1 : ts.length;
  if ([...worlds.scopeGrammar.conditionals.keys()].some(form=>keys.some((_,i)=>
      sub(i,i+form.split(' ').length)===form))) return [];
  if (!specs.some(spec=>spec.leads.some(lead=>keys.includes(lead.split(' ')[0])))) return [];
  const rules=specs.map((spec,index)=>({index,order:spec.order,markers:spec.leads.map(lead=>lead.split(' '))}));
  const matches=await planClauses({tokens:keys.slice(0,end),rules});
  if (matches.length!==1) return [];
  const [{rule,main:[begin,stop],start,after,end:exceptEnd}]=matches;
  const spec=specs[rule], main=span(begin,stop);
  if (!permit(main,[])) return [];
  const tail=ts.slice(after,exceptEnd);
  if (!tail.length || !tail.every(([key])=>lexical.test(key) && !worlds.negatives.has(key) &&
      !worlds.scopeGrammar.negatives.has(key) && !worlds.joiners[key])) return [];
  const det=!spec.anaphors.has(tail[0][0]) &&
    ['definite','demonstrative'].includes(worlds.determiners[tail[0][0]]) ? 1 : 0;
  const exceptionWords=span(start,exceptEnd);
  const base=await read(main), outputs=new Map(), mainTokens=tokens(main);
  for (const candidate of [base,...(base.alternatives ?? [])]) {
    if (!candidate.sop) continue;
    const initial=parse(candidate.sop);
    const actions=initial.filter(w=>w.type===type('request')), subjects=initial.filter(w=>w.type===type('target'));
    if (actions.length!==1 || subjects.length!==1) continue;
    const [request]=actions,[target]=subjects;
    const predicate=get(request,'predicate'),act=get(request,'act');
    if (!spec.acts.has(act) || request.attrs.polarity || ![undefined,'do','propose'].includes(get(request,'mood')) ||
        !predicate || normalized(predicate)!==sub(begin,begin+tokens(predicate).length) ||
        get(target,'mode')!=='existing' || get(target,'request')!=='$'+request.id) continue;
    const universal=get(target,'fill')==='all' && get(target,'quantifier')==='all' ? candidate :
      universalTargetReading(main,mainTokens,worlds,candidate,[]);
    if (!universal || target.attrs.count && get(target,'fill')!=='all') continue;
    const head=normalized(get(target,'sort_words') ?? get(target,'family_words') ?? get(target,'sort') ?? '');
    const terms=tail.slice(det).map(([key])=>key);
    const nounSize=head.split(' ').length;
    const first=terms.slice(0,nounSize).join(' ');
    const last=terms.slice(-nounSize).join(' ');
    const length=spec.anaphors.has(terms[0]) ? 1 : head && first===head ? nounSize : 0;
    const propertyEnd=spec.anaphors.has(terms.at(-1)) ? terms.length-1 : head && last===head ? terms.length-nounSize : 0;
    const family=get(target,'family');
    const spatial=length && readPair(tail.slice(det+length),family,worlds,exceptionWords,chars);
    const property=propertyEnd>0 && readProperty(terms.slice(0,propertyEnd).join(' '),family,act,worlds,exceptionWords);
    if (Boolean(spatial)===Boolean(property)) continue;
    const plan=spatial || property;
    const wires=parse(universal.sop);
    const set=wires.find(w=>w.type===type('target'));
    if (set.attrs.count || wires.some(w=>w.type===type('constraint') && (get(w,'want')==='no' ||
        plan.anchor && [plan.anchorKey,get(plan,'attribute')].includes(get(w,'attribute'))))) continue;
    const root=wires.find(w=>w.type===type('request'));
    root.attrs={...root.attrs,words:[JSON.stringify(text)]};
    const ids=new Set(wires.map(w=>w.id));
    function id(part) {
      const base=root.id+'.'+part;
      let result=base;
      for (let n=2;ids.has(result);n++) result=base+n;
      ids.add(result);
      return result;
    }
    const ref='$'+root.id;
    wires.push({id:id('exclusion'),type:type('constraint'),
      attrs:{request:[ref],...plan.attrs,want:['no'],phase:['selector']}});
    if (plan.anchor) {
      const anchor=id('exclusionAnchor');
      wires.push({id:anchor,type:type('constraint'),attrs:{request:[ref],on:['place'],attribute:[plan.anchorKey],
        value:[JSON.stringify(plan.anchor)],operator:['relation'],phase:['selector']}});
      wires.push({id:id('exclusionLookup'),type:type('lookup'),
        attrs:{request:[ref],constraint:['$'+anchor],key:['thing'],from:['page']}});
    }
    const sop=serialize(wires).trimEnd();
    outputs.set(sop,{sop,source:'set-exclusion',status:wires.some(w=>w.type===type('unread')) ? 'partial' : 'matched'});
  }
  return [...outputs.values()];
}
