import { str } from './knowledge.mjs';
import { tokens } from './lexicon.mjs';
import {directHead,nominalSelectors} from './nominal-selectors.mjs';
import { nativeTargetInventory, nativeTargetInventoryType, nativeTargetProviderTypes } from './native-target-inventory.mjs';

export const universalInventoryType='pro.reader.universal_inventory';
const vals=(w,key)=>(w.attrs[key] ?? []).map(str);
const one=(w,key)=>vals(w,key)[0];
const keys=text=>tokens(text).map(([key])=>key);
const view=facts=>type=>type===nativeTargetInventoryType ? facts(universalInventoryType) : facts(type);
const noun=/^[\p{L}\p{M}\p{N}_]+$/u;

export function universalInventoryProviderTypes(facts) {
  return nativeTargetProviderTypes(view(facts));
}

export function compileUniversalAgreement(facts) {
  const agreements=facts('pro.reader.universal_agreement').flatMap(wire=>{
    const number=one(wire,'number');
    if (!['sg','pl'].includes(number)) return [];
    return vals(wire,'text').map(phrase=>[keys(phrase),number]);
  });
  const invariant=new Set(facts('w.lang.en.irregular').filter(w=>one(w,'singular')===one(w,'plural'))
    .map(w=>one(w,'singular')).filter(Boolean).map(text=>keys(text).join(' ')));
  return {agreements,invariant,heads:new Set(agreements.map(([[head]])=>head))};
}

// Match the entire written noun after a declared quantifier. An unsupported
// qualifier or number mismatch cannot broaden a population to its bare sort.
export function universalOwner(ts,worlds,family,act,span) {
  const agreement=worlds.universalAgreement;
  if (!agreement?.heads.has(ts[0]?.[0])) return;
  const [prefix,number]=agreement.agreements.filter(([form])=>
    worlds.scopeGrammar.universals.has(form.join(' ')) && form.every((term,i)=>ts[i]?.[0]===term))
    .sort(([a],[b])=>b.length-a.length)[0] ?? [];
  if (!prefix || prefix.length===ts.length) return {};
  const phrase=(a,b)=>ts.slice(a,b).map(([term])=>term).join(' ');
  const target=sort=>['target',act,family,'existing',sort,0];
  const agree=(surface,lookup)=>{
    const singular=lookup(surface), plural=worlds.nominalInflection(surface,lookup);
    const invariant=agreement.invariant.has(surface.split(' ').at(-1));
    const compatible=number==='pl' ? [...plural,...(invariant ? singular : [])] :
      plural.length && !invariant ? [] : singular;
    return new Set(compatible.map(entry=>entry[4]).filter(Boolean));
  };
  const selectors=(worlds.nominalSelectorRules ?? []).filter(row=>row.family===family);
  const qualified=nominalSelectors(selectors,prefix.length,ts.length,phrase,span,(surface,binding)=>
    agree(surface,lemma=>[...(directHead(lemma,binding) ?? [])].map(target)));
  const choices=new Map(qualified.map(item=>[JSON.stringify(item),item]));
  if (choices.size) return choices.size===1 ? choices.values().next().value : {};
  const lookup=text=>{
    const entries=(worlds.ownerInventory?.get(JSON.stringify([act,text])) ?? [])
      .filter(item=>item.family===family).map(({sort})=>target(sort));
    const pilot=worlds.universalInventory?.lookup(text).filter(([,sense,owner])=>sense===act && owner===family) ?? [];
    return [...entries,...pilot];
  };
  const sorts=agree(phrase(prefix.length,ts.length),lookup);
  return sorts.size===1 ? {sort:[...sorts][0],sortWords:span(prefix.length,ts.length)} : {};
}

export function compileUniversalInventory(facts,words,licensed,agreement=compileUniversalAgreement(facts)) {
  const declarations=facts(universalInventoryType);
  if (!declarations.length) return;
  const records=nativeTargetInventory(view(facts),words,licensed);
  const resultActions=[...new Map(declarations.filter(w=>one(w,'requires_result')==='true')
    .map(w=>[JSON.stringify([one(w,'family'),one(w,'act')]),[one(w,'family'),one(w,'act')]])).values()];
  const surfaces=new Map();
  for (const {family,sort,mode,acts,surfaces:aliases} of records) {
    if (mode!=='existing') continue;
    for (const alias of aliases) {
      const text=keys(alias).join(' ');
      const values=surfaces.get(text) ?? new Map();
      for (const act of acts) {
        const entry=['target',act,family,mode,sort,0];
        values.set(JSON.stringify(entry),entry);
      }
      surfaces.set(text,values);
    }
  }
  const lookup=term=>[...(surfaces.get(term)?.values() ?? [])];
  return {lookup,resultActions,...agreement};
}

export function universalInventoryPacket(ts,quotes,worlds) {
  const inventory=worlds.universalInventory;
  if (!inventory?.agreements.length || quotes.length || !ts.some(([key])=>inventory.heads.has(key))) return;
  const forms=inventory.agreements.filter(([form])=>worlds.scopeGrammar.universals.has(form.join(' ')));
  if (!forms.length) return;
  const nouns=[], predicates=[];
  const phrase=(begin,end)=>ts.slice(begin,end).map(([key])=>key).join(' ');
  for (let end=1;end<Math.min(9,ts.length);end++) {
    const marker=phrase(0,end);
    for (const [role,act,mood] of worlds.lookup(marker)) {
      if (role==='act' && ['',undefined,'do','propose'].includes(mood)) predicates.push([ts[0][2],ts[end-1][3],act]);
    }
  }
  if (!predicates.length) return;
  const starts=new Set();
  for (let i=0;i<ts.length-1;i++) for (const [form] of forms) {
    if (form.every((key,j)=>ts[i+j]?.[0]===key)) starts.add(i+form.length);
  }
  for (const start of starts) {
    let surface='';
    for (let i=start;i<Math.min(ts.length,start+8) && noun.test(ts[i][0]);i++) {
      surface+=(i===start ? '' : ' ')+ts[i][0];
      const last=ts[i][0], singular=inventory.lookup(surface);
      const plural=worlds.nominalInflection(surface,inventory.lookup);
      const pluralSorts=new Set(plural.map(entry=>JSON.stringify(entry)));
      for (const entry of singular) {
        if (!pluralSorts.has(JSON.stringify(entry))) nouns.push(['sg',[ts[start][2],ts[i][3],entry,0]]);
      }
      const plurals=inventory.invariant.has(last) ? [...plural,...singular] : plural;
      for (const entry of plurals) nouns.push(['pl',[ts[start][2],ts[i][3],entry,0]]);
    }
  }
  if (nouns.length) return {forms,nouns,predicates,resultActions:inventory.resultActions,
    exclusions:(worlds.setExclusions ?? []).flatMap(spec=>spec.leads.map(lead=>lead.split(' ')))};
}
