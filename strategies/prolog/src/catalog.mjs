// The request catalog is evaluated separately from native SOP type validity.
import {tokens} from './lexicon.mjs';

const indexes=new WeakMap();
const value=v=>v?.startsWith('"') ? JSON.parse(v) : v;
function keyIndex(worlds) {
  if (!indexes.has(worlds)) {
    const index=new Map();
    for (const key of worlds.requestKeys) {
      if (!index.has(key.name)) index.set(key.name,[]);
      index.get(key.name).push({family:key.family,values:new Set(key.values.map(s=>s.toLowerCase()))});
    }
    indexes.set(worlds,index);
  }
  return indexes.get(worlds);
}

export function catalogIssues(wires,worlds) {
  const issues=[],index=keyIndex(worlds);
  const subjectRules=worlds.strictNominalSubjects;
  const targets=Map.groupBy(wires.filter(wire=>wire.type==='w.request.target'),
    wire=>value(wire.attrs.request?.[0]));
  for (const {id,type,attrs} of wires) {
    if (type==='w.request.target') {
      const family=value(attrs.family?.[0]);
      if (!worlds.semanticFamilies.has(family)) issues.push({wire:id,slot:'family',value:family,code:'unlicensed_family'});
    }
    if (type!=='w.request.constraint') continue;
    const name=value(attrs.attribute?.[0]);
    if (name===undefined && value(attrs.on?.[0])==='manner') continue;
    const group=targets.get(value(attrs.request?.[0])) ?? [];
    const families=new Set(group.map(wire=>value(wire.attrs.family?.[0])));
    const available=index.get(name) ?? [];
    const owned=available.filter(key=>families.has(key.family));
    const declarations=owned.length ? owned : available;
    if (!declarations.length) {
      issues.push({wire:id,slot:'attribute',value:name??null,code:'unlicensed_key'});
      continue;
    }
    if (!owned.length && families.size && new Set(available.map(key=>key.family)).size>1) {
      issues.push({wire:id,slot:'attribute',value:name,code:'ambiguous_property_owner'});
      continue;
    }
    if (subjectRules?.size && group.length===1) {
      const family=value(group[0].attrs.family?.[0]), sort=value(group[0].attrs.sort?.[0]);
      if (sort) for (const raw of attrs.value ?? []) {
        const allowed=subjectRules.get(JSON.stringify([family,name,value(raw).toLowerCase()]));
        if (allowed && !allowed.has(tokens(sort).map(([key])=>key).join(' '))) {
          issues.push({wire:id,slot:'value',value:value(raw),attribute:name,code:'unlicensed_value_subject'});
        }
      }
    }
    const open=value(attrs.open_value?.[0])==='true';
    if (value(attrs.phase?.[0])==='result' && (open || !attrs.value?.length) &&
        declarations.every(key=>worlds.ownedEffects?.closedChoices?.has(JSON.stringify([key.family,name])))) {
      issues.push({wire:id,slot:'value',value:value(attrs.value?.[0]) ?? null,attribute:name,code:'unresolved_finite_choice'});
      continue;
    }
    if (open) continue;
    for (const item of attrs.value ?? []) {
      const v=value(item);
      if (!declarations.some(k=>!k.values.size || k.values.has(v.toLowerCase())))
        issues.push({wire:id,slot:'value',value:v,attribute:name,code:'outside_value_bank'});
    }
  }
  return issues;
}
