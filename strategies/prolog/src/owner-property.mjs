import {nativeInventory} from './native-inventory.mjs';
import { tokens } from './lexicon.mjs';
import { parse } from './schema.mjs';
import { quotedSpans } from './literal-roles.mjs';

const form = text => tokens(text).map(([key])=>key).join(' ');
const quote = JSON.stringify;
const word = /^[\p{L}\p{M}\p{N}_]+$/u;
const decoded = value => value?.startsWith('"') ? JSON.parse(value) : value;
const atom = /^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u;
const decimal = /^[+-]?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/u;

const valuesOf=(wire,key)=>(wire.attrs[key] ?? []).map(decoded);
const identity=(family,key)=>JSON.stringify([family,key]);

export function resolvePropertyUnit(worlds,family,key,normalized,written) {
  const dimensions=worlds.ownerPropertyUnits?.get(identity(family,key));
  if (dimensions?.size!==1) return;
  const units=new Map([
    ...(worlds.ownerPropertyUnitNames?.get(normalized) ?? []),
    ...(worlds.ownerPropertyUnitSymbols?.get(written) ?? []),
  ]);
  if (units.size!==1) return;
  const [unit]=units.values();
  if (dimensions.has(unit.quantity)) return unit.name;
}

export function resolveWrittenMeasurement(text,worlds,family,key) {
  const ts=tokens(text), chars=Array.from(text);
  const span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  const before=(a,b)=>ts.slice(a,b).map(([term])=>term).join(' ');
  let measurement;
  for (let j=ts.length;j>0;j--) {
    const written=span(0,j), numeral=worlds.nominalNumbers.get(before(0,j));
    const literal=decimal.test(written) && Number.isFinite(Number(written));
    const article=j<ts.length && worlds.singularArticles?.has(before(0,j));
    if (!literal && !article && !(numeral?.kind==='cardinal' && /^\d+$/u.test(numeral.value))) continue;
    const number=literal ? written : article ? '1' : numeral.value;
    if (j===ts.length) return {value:number};
    if (written.startsWith('-')) continue;
    const unit=resolvePropertyUnit(worlds,family,key,before(j,ts.length),span(j,ts.length));
    if (!unit || article && before(j,ts.length)!==form(unit.replaceAll('_',' '))) continue;
    if (measurement) return null;
    const measure=number.replace(/^\+/u,'').replace(/^\./u,'0.');
    measurement={measure,unit,words:written};
  }
  return measurement ? {value:text,measurement} : {};
}

export function compileOwnerPropertyOperands(facts,requestKeys,words) {
  const slots=facts('core.slot');
  const slotsByField=new Map();
  for (const slot of slots) {
    const id=identity(valuesOf(slot,'of')[0],valuesOf(slot,'key')[0]);
    const group=slotsByField.get(id) ?? [];
    group.push(slot);
    slotsByField.set(id,group);
  }
  const openString=slot=>{
    const kinds=valuesOf(slot,'kind');
    return kinds.length===1 && kinds[0]==='string' &&
      !['enum','ref','type','by','prefix','min','max','step','range','match','excludes','unique','id','to']
        .some(key=>slot.attrs[key]?.length);
  };
  const validBackings=new Set(slots.filter(slot=>openString(slot) &&
    slotsByField.get(identity(valuesOf(slot,'of')[0],valuesOf(slot,'key')[0])).every(openString))
    .map(slot=>slot.id));
  const groups=new Map();
  for (const key of requestKeys) {
    const groupKey=identity(key.family,key.name), group=groups.get(groupKey) ?? [];
    group.push(key);
    groups.set(groupKey,group);
  }
  const ownerPropertyOpen=new Set([...groups].filter(([,keys])=>keys.every(key=>
    !key.values.length && key.head.split('+').includes('candidate') &&
      validBackings.has(key.means))).map(([id])=>id));
  const numericSlots=new Set(slots.filter(slot=>{
    const peers=slotsByField.get(identity(valuesOf(slot,'of')[0],valuesOf(slot,'key')[0]));
    return peers.every(peer=>{
      const kinds=valuesOf(peer,'kind');
      return kinds.length===1 && ['number','integer'].includes(kinds[0]);
    });
  }).map(slot=>slot.id));
  const ownerPropertyNumeric=new Set([...groups].filter(([,keys])=>keys.every(key=>
    !key.values.length && numericSlots.has(key.means))).map(([id])=>id));

  const ownerInventory=new Map(), cache=new Map();
  const addOwner=(act,surface,family,sort)=>{
    const lookup=identity(act,surface), entries=ownerInventory.get(lookup) ?? [];
    entries.push({family,sort});
    ownerInventory.set(lookup,entries);
  };
  for (const binding of facts('pro.reader.owner_inventory')) {
    const [family,act,provider]=['family','act','provider'].map(key=>valuesOf(binding,key)[0]);
    if (!family || !act || !provider || !requestKeys.some(key=>key.family===family)) continue;
    if (!cache.has(provider)) cache.set(provider,nativeInventory(facts,provider,words));
    for (const [surface,sorts] of cache.get(provider)) {
      for (const sort of sorts) addOwner(act,surface,family,sort);
    }
  }
  for (const binding of facts('pro.reader.owner_sort')) {
    const [family,act,slot]=['family','act','slot'].map(key=>valuesOf(binding,key)[0]);
    if (!act || !slot || !requestKeys.some(key=>key.family===family && key.means===slot)) continue;
    const allowed=new Set(slots.filter(w=>w.id===slot).flatMap(w=>valuesOf(w,'enum')));
    const labels=new Map([...allowed].map(sort=>[form(sort.replaceAll('_',' ')),sort]));
    for (const wire of words) {
      const of=valuesOf(wire,'of'), means=valuesOf(wire,'means');
      if (of.includes(slot) && allowed.has(means[0])) {
        for (const surface of valuesOf(wire,'text')) addOwner(act,form(surface),family,means[0]);
      } else if (!of.length && means.includes(slot)) {
        for (const surface of valuesOf(wire,'text').map(form)) {
          const sort=labels.get(surface);
          if (sort) addOwner(act,surface,family,sort);
        }
      }
    }
  }
  const unitsByName=new Map(), unitNames=new Map(), unitSymbols=new Map(), ownerPropertyUnits=new Map();
  const addUnit=(table,surface,unit)=>{
    if (!table.has(surface)) table.set(surface,new Map());
    table.get(surface).set(unit.id,unit);
  };
  for (const wire of facts('k.units.unit')) {
    const [name]=valuesOf(wire,'name'), [quantity]=valuesOf(wire,'quantity');
    if (!name || !quantity) continue;
    const unit={id:wire.id,name,quantity};
    addUnit(unitNames,form(name),unit);
    for (const symbol of valuesOf(wire,'symbol')) addUnit(unitSymbols,symbol,unit);
    addUnit(unitsByName,name,unit);
  }
  for (const wire of words) {
    if (!valuesOf(wire,'of').includes('k.units.unit.name')) continue;
    for (const name of valuesOf(wire,'means')) for (const unit of unitsByName.get(name)?.values() ?? []) {
      for (const surface of valuesOf(wire,'text')) addUnit(unitNames,form(surface),unit);
    }
  }
  for (const wire of facts('pro.reader.property_quantity')) {
    const [family,key,quantity]=['family','key','quantity'].map(field=>valuesOf(wire,field)[0]);
    if (!family || !key || !quantity) continue;
    const id=identity(family,key);
    if (!ownerPropertyUnits.has(id)) ownerPropertyUnits.set(id,new Set());
    ownerPropertyUnits.get(id).add(quantity);
  }
  const ownerPropertyMultipliers=new Map();
  for (const wire of facts('w.lang.en.number')) {
    const [kind]=valuesOf(wire,'kind'), [text]=valuesOf(wire,'text'), [value]=valuesOf(wire,'value');
    if (!text || !['times','multiple'].includes(kind) || !decimal.test(value) ||
        !Number.isFinite(Number(value)) || Number(value)<=0) continue;
    const surface=form(text), factors=ownerPropertyMultipliers.get(surface) ?? new Set();
    factors.add(value);
    ownerPropertyMultipliers.set(surface,factors);
  }
  return {ownerPropertyOpen,ownerPropertyNumeric,ownerInventory,ownerPropertyUnits,
    ownerPropertyUnitNames:unitNames,ownerPropertyUnitSymbols:unitSymbols,ownerPropertyMultipliers};
}

function catalogProperties(worlds,family,surface) {
  const aliases=worlds.ownerPropertyLabels?.get(identity(surface,family)) ?? [];
  const attributes=new Set(aliases.map(({attribute})=>attribute));
  return [...attributes].flatMap(attribute=>{
    const [key,...others]=worlds.requestKeys.filter(k=>k.family===family && k.name===attribute);
    if (!key || others.some(other=>other.head!==key.head || other.values.length!==key.values.length ||
        other.values.some(value=>!key.values.includes(value)))) return [];
    return [key];
  });
}

function measuredProperty(worlds,key,operand) {
  return !key.values.length && key.head.split('+').includes('number') &&
    resolveWrittenMeasurement(operand,worlds,key.family,key.name)?.measurement;
}

function catalogProperty(worlds,family,surface,operand) {
  const keys=catalogProperties(worlds,family,surface);
  if (keys.length===1) return keys[0];
  if (!operand) return;
  const matching=keys.filter(key=>measuredProperty(worlds,key,operand));
  if (matching.length===1) return matching[0];
}

function closedValue(worlds,key,surface) {
  const values = new Set(key.values.filter(value=>form(value.replaceAll('_',' '))===surface ||
    form(value)===surface));
  for (const [body] of worlds.ownerPropertyValues?.get(JSON.stringify([key.family,surface])) ?? []) {
    const attrs=parse('@value w.request.constraint '+body)[0].attrs;
    const value=decoded(attrs.value?.[0]);
    if (decoded(attrs.attribute?.[0])===key.name && key.values.includes(value)) values.add(value);
  }
  return values.size===1 ? [...values][0] : undefined;
}

export function inventoryModifiers(worlds,act,family,words,start,end) {
  const reachable=new Set([start]);
  for (let left=start;left<end;left++) {
    if (!reachable.has(left)) continue;
    for (let right=left+1;right<=end;right++) {
      const surface=words(left,right);
      if (Object.hasOwn(worlds.determiners,surface) || worlds.lookup(surface).some(([role,licence,owner])=>
          role==='constraint' && (licence==='*' || licence===act) && owner===family)) reachable.add(right);
    }
  }
  return reachable.has(end);
}

function describedAssignmentFamilies(keys,from,to,worlds) {
  const words=(a,b)=>keys.slice(a,b).join(' ');
  for (let head=from;head<to;head++) {
    const phrase=words(head,to);
    const lookup=surface=>[
      ...(worlds.ownerInventory?.get(identity('change',surface)) ?? [])
        .filter(({family})=>inventoryModifiers(worlds,'change',family,words,from,head))
        .map(({family,sort})=>['target','change',family,'existing',sort]),
      ...worlds.lookup(surface).filter(([role,act,,mode])=>role==='target' && act==='change' && mode==='existing'),
    ];
    const families=[...lookup(phrase),...worlds.nominalInflection(phrase,lookup)].map(([, ,family])=>family);
    if (families.length) return [...new Set(families)];
    const term=keys[head];
    if (!word.test(term) || worlds.lookup(term).some(([role])=>role==='marker') || worlds.joiners[term]) break;
  }
}

// A value-frame predicate and catalogue label can prove the role of words
// that could otherwise be consumed as an opaque object name.
export function numericAssignmentRoles(text,worlds) {
  if (!worlds.numericAssignmentFamilies?.size || /["'“‘]/u.test(text) && quotedSpans(text).length) return;
  const ts=tokens(text), chars=Array.from(text), keys=ts.map(([key])=>key);
  const end=keys.length-Number(/^[.!?]$/u.test(keys.at(-1) ?? ''));
  const span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  const words=(a,b)=>keys.slice(a,b).join(' ');
  if (end<4 || end>24) return;
  const verbs=[];
  for (let a=0;a<Math.min(end-3,6);a++) {
    const lead=words(0,a).replace(/ ,$/u,'');
    if (a && !worlds.literalGrammar.leads.has(lead) && !worlds.fillerPhrases.has(lead)) continue;
    if (keys.at(-1)==='?' && !worlds.literalGrammar.leads.has(lead)) continue;
    for (let b=a+1;b<=Math.min(a+5,end-3);b++) {
      const senses=worlds.lookup(words(a,b));
      if (senses.some(([role,act,mood])=>role==='act' && act==='change' && (!mood || mood==='do')) &&
          senses.some(([role,act,slot])=>role==='frame' && act==='change' && slot==='value')) verbs.push([a,b]);
    }
  }
  if (verbs.length!==1) return;
  const [[verbStart,verbEnd]]=verbs;
  const det=worlds.determiners[keys[verbEnd]];
  if (!['possessive','definite','demonstrative'].includes(det)) return;
  const start=verbEnd+1;
  const proposals=[];
  for (const {act,value:separator,owner:connector} of worlds.ownerPropertyFrames) {
    if (act!=='change' || !separator || !connector) continue;
    const valueKeys=tokens(separator).map(([key])=>key);
    const ownerKeys=tokens(connector).map(([key])=>key);
    for (let pivot=start+1;pivot+valueKeys.length<end;pivot++) {
      if (!valueKeys.every((key,i)=>key===keys[pivot+i])) continue;
      const operand=span(pivot+valueKeys.length,end);
      const interpretations=[];
      if (det==='possessive') {
        interpretations.push({label:words(start,pivot),propertyWords:span(start,pivot),reference:true});
      } else {
        for (let i=start+1;i<pivot;i++) {
          const known=describedAssignmentFamilies(keys,start,i,worlds);
          if (known) interpretations.push({label:words(i,pivot),propertyWords:span(i,pivot),noun:span(verbEnd,i),known});
          const after=i+ownerKeys.length;
          if (after<pivot && ownerKeys.every((key,j)=>key===keys[i+j]) &&
              keys.slice(after,pivot).every(key=>word.test(key) && !worlds.joiners[key])) {
            const ownerStart=after+Number(Boolean(worlds.determiners[keys[after]]));
            interpretations.push({label:words(start,i),propertyWords:span(start,i),
              known:describedAssignmentFamilies(keys,ownerStart,pivot,worlds)});
          }
        }
      }
      for (const interpretation of interpretations) {
        const {label,known}=interpretation;
        const properties=(worlds.numericAssignmentFamilies.get(label) ?? []).flatMap(family=>
          known && !known.includes(family) ? [] : catalogProperties(worlds,family,label).flatMap(key=>{
            if (key.values.length || !key.head.split('+').includes('number') &&
                !worlds.ownerPropertyNumeric?.has(identity(family,key.name))) return [];
            const result=resolveWrittenMeasurement(operand,worlds,family,key.name);
            return result?.value ? [{family,key:key.name,...result}] : [];
          }));
        if (properties.length) proposals.push({...interpretation,properties,operand,
          predicate:span(verbStart,verbEnd),head:words(verbStart,verbEnd),
          fragment:span(verbEnd,end),lead:verbStart ? span(0,verbStart).replace(/,$/u,'') : undefined});
      }
      break; // A later marker may belong to a separate coordinated value.
    }
  }
  const unique=new Map(proposals.map(role=>[JSON.stringify(role),role]));
  if (unique.size===1) return unique.values().next().value;
}

export function fitsNumericAssignment(role,request,wires) {
  const predicate=decoded(request.attrs.predicate?.[0]);
  if (decoded(request.attrs.act?.[0])!=='change' || predicate && form(predicate)!==role.head) return false;
  const owned=wires.filter(w=>decoded(w.attrs.request?.[0])==='$'+request.id);
  const targets=owned.filter(w=>w.type==='w.request.target');
  const effects=owned.filter(w=>w.type==='w.request.constraint' && decoded(w.attrs.phase?.[0])!=='selector');
  if (role.reference) return !targets.length && !effects.length;
  if (targets.some(w=>['name','description','family_words','sort_words'].some(slot=>{
    const value=decoded(w.attrs[slot]?.[0]), name=value && form(value);
    return name===role.head || name?.startsWith(role.head+' ');
  }))) return false;
  return effects.every(w=>role.properties.some(({family,key,value})=>{
    const actual=decoded(w.attrs.value?.[0]);
    return decoded(w.attrs.attribute?.[0])===key && [undefined,'eq'].includes(decoded(w.attrs.operator?.[0])) &&
      (actual===value || actual===role.operand ||
        decimal.test(actual ?? '') && decimal.test(value) && Number(actual)===Number(value)) &&
      (!targets.length || targets.some(t=>decoded(t.attrs.family?.[0])===family));
  }));
}

export function numericAssignmentReadings(text,role) {
  const request='@r1 w.request.request act=change mood=do predicate='+quote(role.predicate)+' words='+quote(text);
  const lead=role.lead ? ['@f1 w.request.filler text='+quote(role.lead)] : [];
  if (role.reference) return [{sop:[request+' refers=thing',...lead,
    '@r1.u1 w.request.unread request=$r1 text='+quote(role.fragment)].join('\n'),
  source:'unresolved-property-owner',status:'partial'}];
  if (!role.noun) return [];
  return role.properties.map(({family,key,value,measurement})=>({sop:[
    request,
    '@r1.t w.request.target request=$r1 family='+quote(family)+' mode=existing fill=description description='+quote(role.noun),
    '@r1.l w.request.lookup request=$r1 target=$r1.t key=thing from=page',
    '@r1.c1 w.request.constraint request=$r1 on=attribute attribute='+quote(key)+
      ' operator=eq phase=result key_words='+quote(role.propertyWords)+' words='+quote(role.operand)+
      ' value='+(decimal.test(value) ? value : quote(value))+(measurement ? ' measure='+measurement.measure+' unit='+quote(measurement.unit)+
        ' measure_words='+quote(measurement.words) : ''),
    ...lead,
  ].join('\n'),source:'numeric-property-assignment',status:'matched'}));
}

function scaledProperty(worlds,family,source,result,multiplier) {
  if (!source?.numeric || !worlds.validationModules?.types.has('w.relational.scaled')) return;
  const factors=worlds.ownerPropertyMultipliers?.get(multiplier);
  if (factors?.size!==1) return;
  const sources=worlds.ownerPropertyUnits?.get(identity(family,source.property));
  const results=worlds.ownerPropertyUnits?.get(identity(family,result));
  if (sources?.size!==1 || results?.size!==1 || !results.has([...sources][0])) return;
  const keyId=name=>{
    const keys=worlds.requestKeys.filter(key=>key.family===family && key.name===name);
    return keys.length===1 && atom.test(keys[0].id ?? '') ? keys[0].id : undefined;
  };
  const sourceKey=keyId(source.property), resultKey=keyId(result);
  if (!sourceKey || !resultKey) return;
  const [factor]=factors;
  return {sourceKey,resultKey,factor:factor.replace(/^\+/u,'').replace(/^\./u,'0.')};
}

export function ownerPropertyReadings(text,ts,quotes,worlds) {
  if (!worlds.ownerPropertyFrames?.length || !ts.length) return [];
  const chars=Array.from(text), keys=ts.map(t=>t[0]);
  const span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  const before=(a,b)=>keys.slice(a,b).join(' ');
  const quoted=i=>quotes.some(q=>q.start<ts[i][3] && ts[i][2]<q.end);
  const plain=(a,b)=>a<b && ts.slice(a,b).every(([key,,start,end],j)=>
    !quoted(a+j) && (word.test(key) || key==='-' && j>0 && a+j+1<b &&
      ts[a+j-1][3]===start && ts[a+j+1][2]===end));
  const matches=(at,phrase)=>before(at,at+phrase.length)===phrase.join(' ') &&
    ts.slice(at,at+phrase.length).every((_,j)=>!quoted(at+j));
  const unsafe=(a,b)=>keys.slice(a,b).some((key,j)=>{
    const i=a+j;
    if (quoted(i)) return false;
    if (worlds.negatives.has(key) || worlds.joiners[key]) return true;
    return [1,2,3,4].some(n=>i+n<=b && (worlds.scopeGrammar.negatives.has(before(i,i+n)) ||
      worlds.scopeGrammar.conditionals.has(before(i,i+n))));
  });
  const detAt=(a,b)=>{
    for (let stop=Math.min(a+5,b);stop>a;stop--) {
      const mode=worlds.determiners[before(a,stop)];
      if (mode) return {mode,next:stop};
    }
    return {next:a};
  };
  const terminal=['.','?','!'].includes(keys.at(-1)) && !quoted(keys.length-1);
  const end=keys.length-Number(terminal);
  const outputs=new Map();
  for (const frame of worlds.ownerPropertyFrames) {
    const {act}=frame, owner=form(frame.owner ?? '').split(' '), value=form(frame.value ?? '').split(' ');
    if (!owner[0] || !value[0]) continue;
    const overlapsConnector=(a,b)=>keys.slice(a,b).some((_,j)=>
      [owner,value].some(part=>a+j+part.length<=b && matches(a+j,part)));
    const propertyValues=(family,first,label,payload)=>{
      const segments=[];
      let start=payload;
      for (let i=payload;i<end;i++) {
        if (quoted(i) || worlds.joiners[keys[i]]!=='coordination') continue;
        const stop=i-Number(keys[i-1]===',' && !quoted(i-1));
        if (stop<=start) return [];
        segments.push([start,stop]);
        start=i+1;
      }
      segments.push([start,end]);
      const seen=new Set(), records=[];
      for (const [i,[a,b]] of segments.entries()) {
        let options=[{property:first,label,start:a}];
        if (i>0) {
          options=[];
          const from=detAt(a,b).next;
          for (let j=from+1;j<Math.min(from+9,b);j++) {
            if (!matches(j,value) || j+value.length>=b || !plain(from,j)) continue;
            const property=catalogProperty(worlds,family,before(from,j),span(j+value.length,b));
            if (property) options.push({property,label:span(from,j),start:j+value.length});
          }
        }
        if (options.length!==1) return [];
        const [{property,label:keyWords,start:from}]=options;
        if (from>=b || seen.has(property.name)) return [];
        seen.add(property.name);
        const quotedValue=quotes.find(q=>q.start===ts[from][2] && q.end===ts[b-1][3]);
        const raw=span(from,b), words=quotedValue?.value ?? raw;
        const heads=property.head.split('+');
        const number=heads.includes('number') && !property.values.length;
        if (!words.trim() || !quotedValue && (unsafe(from,b) || overlapsConnector(from,b) ||
            !number && !plain(from,b))) return [];
        let resolved, measurement;
        if (property.values.length) resolved=closedValue(worlds,property,form(words));
        else if (number && !quotedValue) {
          const numeric=resolveWrittenMeasurement(raw,worlds,family,property.name);
          if (!numeric) return [];
          ({value:resolved,measurement}=numeric);
          // A written reference to an earlier property is not a scalar
          // operand. Preserve it without evaluating it or guessing a formula.
          if (!resolved && i>0 && plain(from,b) && !worlds.lookup(before(from,from+1)).some(([role])=>role==='act')) {
            const references=keys.slice(from+1,b).flatMap((_,offset)=>{
              const at=from+offset+1, det=detAt(at,b);
              if (det.mode!=='definite') return [];
              const referenced=catalogProperty(worlds,family,before(det.next,b))?.name;
              return seen.has(referenced) && referenced!==property.name ? [{referenced,at}] : [];
            });
            if (references.length) {
              const [{referenced,at}]=references;
              const scaled=references.length===1 && scaledProperty(worlds,family,
                records.find(record=>record.property===referenced),property.name,before(from,at));
              records.push({unread:span(a,b),scaled});
              continue;
            }
          }
        } else if (heads.includes('span') || worlds.ownerPropertyOpen?.has(identity(family,property.name))) {
          resolved=words;
        }
        if (!resolved || resolved!==words && !atom.test(resolved) && !decimal.test(resolved)) return [];
        records.push({property:property.name,keyWords,words,resolved,measurement,numeric:number});
      }
      return records;
    };
    for (let verbAt=0;verbAt<Math.min(12,end);verbAt++) {
      const lead=before(0,verbAt);
      if (lead && !worlds.literalGrammar.leads.has(lead) && !worlds.fillerPhrases.has(lead)) continue;
      if (keys.at(-1)==='?' && !lead) continue;
      for (let verbEnd=verbAt+1;verbEnd<Math.min(end,verbAt+8);verbEnd++) {
        const readings=worlds.lookup(before(verbAt,verbEnd));
        if (!readings.some(([role,sense,mood])=>role==='act' && sense===act && (!mood || mood==='do')) ||
            !readings.some(([role,sense,slot])=>role==='frame' && sense===act && slot==='value')) continue;
        const propertyAt=detAt(verbEnd,end).next;
        for (let ownerAt=propertyAt+1;ownerAt<Math.min(propertyAt+9,end);ownerAt++) {
          if (!matches(ownerAt,owner) || !plain(propertyAt,ownerAt)) continue;
          const start=ownerAt+owner.length, det=detAt(start,end);
          if (det.mode && !['definite','demonstrative','possessive'].includes(det.mode)) continue;
          for (let valueAt=det.next+1;valueAt<Math.min(end,det.next+13);valueAt++) {
            if (!matches(valueAt,value) || !plain(start,valueAt) ||
                overlapsConnector(start,valueAt) || unsafe(propertyAt,valueAt)) continue;
            const payload=valueAt+value.length;
            if (payload>=end) continue;
            const coordinated=keys.findIndex((key,i)=>i>=payload && !quoted(i) && worlds.joiners[key]==='coordination');
            const firstEnd=coordinated<0 ? end : coordinated-Number(keys[coordinated-1]===',');
            if (firstEnd<=payload) continue;
            const operand=span(payload,firstEnd), label=before(propertyAt,ownerAt);
            const nounOptions=[];
            let knownOwner=false;
            for (let noun=det.next;noun<valueAt;noun++) {
              const surface=before(noun,valueAt);
              const fromInventory=worlds.ownerInventory?.get(identity(act,surface)) ?? [];
              const fromLexicon=worlds.lookup(surface).flatMap(([role,sense,family,mode,sort])=>
                role==='target' && sense===act && mode==='existing' ? [{family,sort}] : []);
              for (const {family,sort} of [...fromInventory,...fromLexicon]) {
                if (!sort && fromInventory.some(item=>item.family===family)) continue;
                knownOwner=true;
                const property=catalogProperty(worlds,family,label,operand);
                if (property) nounOptions.push({noun,family,sort,property});
              }
            }
            const name=span(det.next,valueAt);
            if (!knownOwner && (det.mode==='definite' || /^\p{Lu}/u.test(name)) &&
                !worlds.scopeGrammar.universalHeads.has(keys[start]) && !worlds.isReference(before(det.next,valueAt))) {
              const matching=[...worlds.semanticFamilies].flatMap(family=>
                worlds.literalGrammar.licenses(family,act) ? catalogProperties(worlds,family,label)
                  .filter(key=>measuredProperty(worlds,key,operand)) : []);
              if (matching.length===1) {
                const [property]=matching;
                nounOptions.push({noun:det.next,family:property.family,property,name});
              }
            }
            const firstByFamily=new Map();
            for (const {noun,family} of nounOptions) {
              if (!firstByFamily.has(family)) firstByFamily.set(family,noun);
            }
            for (const {noun,family,sort,property,name:writtenName} of nounOptions) {
              if (noun!==firstByFamily.get(family)) continue;
              const records=propertyValues(family,property,span(propertyAt,ownerAt),payload);
              if (!records.length) continue;
              const head=span(noun,valueAt);
              const prefix=[
                '@r1 w.request.request act='+quote(act)+' mood=do predicate='+quote(span(verbAt,verbEnd)),
                '@r1.t w.request.target request=$r1 family='+quote(family)+' mode=existing'+
                  (det.mode ? ' determiner='+det.mode : '')+(writtenName ? ' fill=written name='+quote(writtenName) :
                    ' fill=description description='+quote(span(start,valueAt))+
                    (sort ? ' sort='+quote(sort)+' sort_words='+quote(head) : ' family_words='+quote(head)))
              ];
              const circuit=useScaled=>[...prefix,...records.map(({unread,scaled,property,keyWords,words,resolved,measurement},i)=>{
                if (useScaled && scaled) return '@r1.s'+(i+1)+' w.relational.scaled request=$r1 result=$r1.t'+
                  ' result_key=$'+scaled.resultKey+' source=$r1.t source_key=$'+scaled.sourceKey+
                  ' source_phase=result factor='+scaled.factor+' words='+quote(unread);
                return unread ?
                  '@r1.u'+(i+1)+' w.request.unread request=$r1 text='+quote(unread) :
                  '@r1.c'+(i+1)+' w.request.constraint request=$r1 on=attribute attribute='+quote(property)+
                  ' value='+(resolved===words || decimal.test(resolved) ? quote(resolved) : resolved)+
                  ' operator=eq phase=result key_words='+quote(keyWords)+' words='+quote(words)+
                  (measurement ? ' measure='+measurement.measure+' unit='+quote(measurement.unit)+
                    ' measure_words='+quote(measurement.words) : '');
              })].join('\n');
              const sop=circuit(false);
              const alternatives=outputs.get(family) ?? new Map();
              const unread=records.flatMap(record=>record.unread ? [record.unread] : []).join(' ');
              const candidates=[{sop,source:'owner-property',...(unread ? {unread} : {})}];
              if (records.some(record=>record.scaled)) {
                const remaining=records.flatMap(record=>record.unread && !record.scaled ? [record.unread] : []).join(' ');
                candidates.push({sop:circuit(true),source:'scaled-property',...(remaining ? {unread:remaining} : {})});
              }
              alternatives.set(sop,candidates);
              outputs.set(family,alternatives);
            }
          }
        }
      }
    }
  }
  return [...outputs.values()].flatMap(readings=>readings.size===1 ? readings.values().next().value : []);
}
