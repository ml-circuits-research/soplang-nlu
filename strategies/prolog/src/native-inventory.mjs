import {tokens} from './lexicon.mjs';

const values=(wire,key)=>(wire.attrs[key] ?? []).map(raw=>raw.startsWith('"') ? JSON.parse(raw) : raw);
const normal=surface=>tokens(surface).map(([term])=>term).join(' ');

// A provider's name and aliases refer only to members of that provider.
// Keep competing meanings so each grammar can require an unambiguous match.
export function nativeInventory(facts,type,words) {
  const forms=new Map(), referents=new Map();
  function add(index,key,name) {
    const known=index.get(key) ?? new Set();
    known.add(name);
    index.set(key,known);
  }
  for (const record of facts(type)) {
    for (const name of values(record,'name')) {
      if (!name) continue;
      add(referents,record.id,name);
      add(referents,name,name);
      add(forms,normal(name),name);
      add(forms,normal(name.replaceAll('_',' ')),name);
    }
  }
  for (const alias of words) {
    if (!values(alias,'of').includes(type+'.name')) continue;
    for (const referent of values(alias,'means')) {
      for (const name of referents.get(referent) ?? []) {
        for (const text of values(alias,'text')) add(forms,normal(text),name);
      }
    }
  }
  return forms;
}
