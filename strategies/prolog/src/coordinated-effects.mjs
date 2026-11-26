import {parse,serialize} from './knowledge.mjs';
import {tokens} from './lexicon.mjs';

const atom=value=>/^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u.test(value) ? value : JSON.stringify(value);
const value=(wire,key)=>{
  const raw=wire.attrs[key]?.[0];
  return raw?.startsWith('"') ? JSON.parse(raw) : raw;
};
const nominal=/^\p{Lu}[\p{L}\p{M}\p{N}_]*$/u;
const roles=new Set(['owner','effect','verbal_effect','join','assignment','article','bundle','lead']);
const terms=surface=>tokens(surface).map(([key])=>key);

function bundleStarts(keys,worlds) {
  if (!worlds.effectBundles?.length) return false;
  for (let start=0;start<Math.min(keys.length,9);start++) {
    if (start && !worlds.literalGrammar.leads.has(keys.slice(0,start).join(' '))) continue;
    for (let end=start+1;end<=Math.min(keys.length,start+8);end++) {
      if (worlds.effectAssignments.has(keys.slice(start,end).join(' '))) return true;
    }
  }
  return false;
}

// Emit chart edges for the words actually present. A property value is typed
// by its own catalog field; the grammar can never borrow it for another family.
export function coordinatedPacket(ts,worlds) {
  const end=ts.length-Number(['.','?','!'].includes(ts.at(-1)?.[0]));
  const keys=ts.slice(0,end).map(t=>t[0]);
  const hasJoin=keys.some(k=>worlds.joiners[k]==='coordination');
  const starts=bundleStarts(keys,worlds);
  const frames=[...(hasJoin ? worlds.effectFrames : []),...(starts ? worlds.effectBundles : [])];
  if (!frames.length) return;
  const events=[],seen=new Set();
  function add(start,stop,role,family='',key='',val='') {
    const event=[start,stop,role,family,key,val], id=JSON.stringify(event);
    if (!seen.has(id)) {seen.add(id);events.push(event);}
  }
  for (let i=0;i<end;i++) {
    if (worlds.joiners[keys[i]]==='coordination') {
      add(i,i+1,'join');
      if (i>=2 && i+2<end && keys[i-1]==='-' && keys[i+1]==='-' &&
          ts.slice(i-2,i+2).every((t,j)=>t[3]===ts[i-1+j]?.[2])) add(i-1,i+2,'join');
    }
    if (starts && ['coordination','list-or-clause'].includes(worlds.joiners[keys[i]])) {
      add(i,i+1,'bundle_join');
      if (worlds.joiners[keys[i]]==='list-or-clause' && worlds.joiners[keys[i+1]]==='coordination') {
        add(i,i+2,'bundle_join');
      }
    }
    for (let j=i+1;j<=Math.min(i+8,end);j++) {
      const term=keys.slice(i,j).join(' ');
      if (starts) {
        if (worlds.effectAssignments.has(term)) add(i,j,'assignment');
        if (i===0 && worlds.literalGrammar.leads.has(term)) add(i,j,'lead');
        if (worlds.singularArticles.has(term)) add(i,j,'article');
        const article=worlds.determiners[keys[i]];
        const noun=['definite','demonstrative','possessive'].includes(article) ? keys.slice(i+1,j).join(' ') : term;
        for (const family of worlds.effectOwners.get(noun) ?? []) {
          if (worlds.literalGrammar.licenses(family,'change')) add(i,j,'owner',family);
        }
      }
      const senses=worlds.lookup(term);
      const entries=senses;
      for (const [role,act,family,mode,sort,count] of entries) {
        if (role==='target' && act==='change' && mode==='existing' && (!count || sort===term && worlds.literalGrammar.licenses(family,act))) {
          for (let start=i;start>=0 && start>=i-4;start--) {
            const determiner=worlds.determiners[keys[start]], offset=start+Number(Boolean(determiner));
            if (determiner && !['definite','demonstrative','possessive'].includes(determiner) ||
                offset>i || !ts.slice(offset,i).every(t=>nominal.test(t[1]))) continue;
            add(start,j,'owner',family);
          }
        }
      }
      const verbal=entries.some(([kind,act,mood])=>kind==='act' && act==='change' && (!mood || mood==='do'));
      for (const [role,act,family,body,count] of entries) {
        if (role!=='constraint' || !['*','change'].includes(act)) continue;
        const [w]=parse('@p w.request.constraint '+body);
        const key=value(w,'attribute'),val=value(w,'value');
        if (value(w,'operator')!=='eq' || value(w,'phase')!=='result' || value(w,'on')!=='attribute' ||
            w.attrs.want || w.attrs.value?.length!==1 || !worlds.effectBanks.get(family)?.get(key)?.has(val)) continue;
        add(i,j,'effect',family,key,val);
        if (starts && count===0) add(i,j,'declared_effect',family,key,val);
        if (verbal) add(i,j,'verbal_effect',family,key,val);
      }
    }
  }
  if (!events.some(e=>e[2]==='owner') || !events.some(e=>e[2]==='effect')) return;
  return {keys,events,frames};
}

export function effectGrammar(facts,keys) {
  const frames=facts('pro.reader.coordinated_effects').map(w=>
    (w.attrs.part ?? []).map(s=>s.startsWith('"') ? JSON.parse(s) : s))
    .filter(parts=>parts.length<=10 && parts.filter(s=>s==='owner').length===1);
  const toGrammar=parts=>parts.map(part=>roles.has(part) ? part : terms(part));
  const effectFrames=frames.filter(parts=>!parts.includes('bundle') &&
    parts.filter(s=>['effect','verbal_effect'].includes(s)).length===2 &&
    parts.filter(s=>s==='join').length===1).map(toGrammar);
  const effectBundles=frames.filter(parts=>parts[0]==='assignment' && parts.at(-1)==='bundle' &&
    parts.filter(part=>part==='bundle').length===1)
    .flatMap(parts=>[parts,['lead',...parts]]).map(toGrammar);
  const decode=raw=>raw?.startsWith('"') ? JSON.parse(raw) : raw;
  const fields=(wire,key)=>(wire.attrs[key] ?? []).map(decode);
  const effectAssignments=new Set(facts('k.actions.verb').filter(w=>value(w,'act')==='change' &&
    value(w,'object')==='thing' && value(w,'complement')==='value')
    .flatMap(w=>fields(w,'text')).map(surface=>terms(surface).join(' ')));
  const effectOwners=new Map();
  for (const wire of facts('pro.reader.effect_owner')) for (const surface of fields(wire,'text')) {
    const term=terms(surface).join(' '), families=effectOwners.get(term) ?? new Set();
    families.add(value(wire,'family')); effectOwners.set(term,families);
  }
  const effectBanks=new Map();
  for (const k of keys.filter(k=>k.values.length)) {
    const bank=effectBanks.get(k.family) ?? new Map();
    const values=bank.get(k.name) ?? new Set();
    k.values.forEach(v=>values.add(v)); bank.set(k.name,values);effectBanks.set(k.family,bank);
  }
  return {effectBanks,effectFrames,effectBundles,effectAssignments,effectOwners};
}

export function effectReading(text,ts,{family,owner,effects,predicate,lead}) {
  const chars=Array.from(text), span=([from,to])=>chars.slice(ts[from][2],ts[to-1][3]).join('');
  const target=span(owner);
  const wires=[{id:'r',type:'w.request.request',attrs:{act:['change'],mood:['do'],words:[JSON.stringify(text)]}},
    {id:'target',type:'w.request.target',attrs:{request:['$r'],family:[atom(family)],mode:['existing'],fill:['description'],description:[JSON.stringify(target)]}}];
  if (predicate) {
    wires[0].attrs.predicate=[JSON.stringify(span(predicate))];
    wires.push({id:'lookup',type:'w.request.lookup',attrs:{request:['$r'],target:['$target'],key:['thing'],from:['page']}});
  }
  if (lead) wires.push({id:'lead',type:'w.request.filler',attrs:{text:[JSON.stringify(span(lead))]}});
  for (const [i,[from,to,key,val]] of effects.entries()) wires.push({id:'effect'+i,type:'w.request.constraint',
    attrs:{request:['$r'],on:['attribute'],attribute:[atom(key)],value:[atom(val)],words:[JSON.stringify(span([from,to]))],operator:['eq'],phase:['result']}});
  return {sop:serialize(wires),source:'coordinated-effects',status:'matched'};
}
