import { str } from './knowledge.mjs';

export const nativeTargetInventoryType='pro.reader.target_inventory';
const values=(wire,key)=>(wire?.attrs[key] ?? []).map(str);
const one=(wire,key)=>values(wire,key)[0];
const noun=/^[\p{L}][\p{L}\p{M}\p{N}]*(?:(?:[ '\u2019-])[\p{L}\p{M}\p{N}]+)*$/u;

function inventorySchema(facts) {
  const types=new Map(facts('core.type').map(w=>[one(w,'of'),values(w,'extends')]));
  const slots=Map.groupBy(facts('core.slot'),w=>one(w,'of'));
  function slot(type,key,visited=new Set()) {
    if (visited.has(type) || !types.has(type)) return;
    visited.add(type);
    const declared=slots.get(type)?.find(w=>one(w,'key')===key);
    if (declared) return declared;
    for (const ancestor of types.get(type)) {
      const inherited=slot(ancestor,key,visited);
      if (inherited) return inherited;
    }
  }
  return slot;
}

export function nativeTargetProviderTypes(facts) {
  const declarations=facts(nativeTargetInventoryType);
  if (!declarations.length) return [];
  const slot=inventorySchema(facts);
  return declarations.flatMap(wire=>{
    const provider=one(wire,'provider');
    return [provider,one(slot(provider,one(wire,'requires')),'type')].filter(Boolean);
  });
}

export function nativeTargetInventory(facts,words,licensed) {
  const declarations=facts(nativeTargetInventoryType);
  if (!declarations.length) return [];
  const slot=inventorySchema(facts);
  const owners=new Set(declarations.map(wire=>one(wire,'provider')+'.'+one(wire,'identity')));
  const aliases=new Map();
  for (const wire of words) {
    for (const owner of values(wire,'of').filter(value=>owners.has(value))) {
      for (const value of values(wire,'means')) {
        const id=JSON.stringify([owner,value]);
        aliases.set(id,[...(aliases.get(id) ?? []),...values(wire,'text').filter(text=>noun.test(text))]);
      }
    }
  }
  const live=w=>one(w,'derived')!=='true';
  return declarations.flatMap(wire=>{
    const family=one(wire,'family'),mode=one(wire,'mode'),argumentRole=one(wire,'argument_role');
    const provider=one(wire,'provider'),identity=one(wire,'identity'),requires=one(wire,'requires');
    const acts=[...new Set(values(wire,'act'))].filter(act=>licensed.some(binding=>
      binding.family===family && binding.acts.includes(act) &&
      (binding.mode ?? (act==='make' ? 'new' : 'existing'))===mode));
    if (!['new','existing'].includes(mode) || !acts.length || one(slot(provider,identity),'id')!=='true') return [];
    const relation=requires && slot(provider,requires);
    const destination=one(relation,'type'),by=one(relation,'by');
    if (requires && (!destination || !by || one(slot(destination,by),'id')!=='true')) return [];
    const members=requires && new Set(facts(destination).filter(live).flatMap(w=>values(w,by)));
    return facts(provider).filter(live).flatMap(fact=>{
      const names=values(fact,identity);
      const [sort]=names;
      if (names.length!==1 || !noun.test(sort) ||
          requires && !values(fact,requires).some(value=>members.has(value))) return [];
      const surfaces=[sort,...(aliases.get(JSON.stringify([provider+'.'+identity,sort])) ?? [])];
      return [{family,sort,mode,acts,surfaces,argumentRole}];
    });
  });
}
