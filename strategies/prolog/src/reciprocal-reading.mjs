import { serialize } from './knowledge.mjs';
import { literalRanges, sortRanges } from './evidence.mjs';
import { quotedSpans } from './literal-roles.mjs';
import { tokenize } from './lexicon.mjs';
import { consumeUnread } from './nominal-evidence.mjs';
import { parse } from './schema.mjs';

const decode=value=>value?.startsWith('"') ? JSON.parse(value) : value;
const fields=(wire,key)=>(wire.attrs[key] ?? []).map(decode);
const one=(wire,key)=>fields(wire,key)[0];
const phrase=text=>tokenize(text ?? '').map(token=>token.key).join(' ');
const words=/[\p{L}\p{N}]/u;
const directionalFields=new Set(['request','on','attribute','phase','operator','open_value','words','value','key_words']);

export function compileReciprocal(facts) {
  const predicates=facts('w.relational.predicate');
  const known=new Set(predicates.map(wire=>wire.id));
  const markers=new Set(facts('pro.reader.reciprocal_marker').flatMap(wire=>fields(wire,'text').map(phrase)).filter(Boolean));
  const forms=new Map(), directional=new Map();
  for (const wire of facts('core.word')) {
    const languages=fields(wire,'lang');
    if (languages.length && !languages.some(lang=>/^en(?:[-_]|$)/iu.test(lang))) continue;
    const meanings=fields(wire,'means').filter(meaning=>known.has(meaning));
    for (const verb of fields(wire,'text').map(phrase).filter(Boolean)) {
      for (const marker of markers) {
        const form=verb+' '+marker;
        const bindings=forms.get(form) ?? new Set();
        for (const meaning of meanings) bindings.add(meaning);
        if (bindings.size) forms.set(form,bindings);
        for (const meaning of meanings) for (const key of fields(wire,'of')) {
          const id=JSON.stringify([form,meaning,key]);
          directional.set(id,{verb,marker});
        }
      }
    }
  }
  return {predicates,forms,directional,maxLength:Math.max(0,...[...forms.keys()].map(form=>form.split(' ').length))};
}

function restricted(text,input,worlds) {
  const grammar=worlds.scopeGrammar;
  return input.some((token,i)=>{
    if (token.key==='?') return true;
    for (let j=i+1;j<=Math.min(input.length,i+6);j++) {
      const form=input.slice(i,j).map(part=>part.key).join(' ');
      const surface=text.slice(token.start,input[j-1].end).toLowerCase().replaceAll('’',"'");
      if (worlds.negatives.has(form) || grammar.negatives.has(form) ||
          grammar.predicateNegators.has(form) || grammar.conditionals.has(form) ||
          [...grammar.endings].some(ending=>surface.endsWith(ending))) return true;
    }
    return false;
  });
}

function pairAt(text,target,wires,input,afterVerb,headStart,owner,worlds) {
  const asNumber=form=>/^\d+$/u.test(form) ? Number(form) :
    Number(worlds.nominalNumbers.get(form)?.value);
  const index=input.findIndex(token=>token.start===headStart);
  if (index<1 || target.attrs.ordinal || target.attrs.quantifier) return false;
  const countWires=wires.filter(wire=>wire.type==='w.request.constraint' &&
    one(wire,'request')===owner && one(wire,'on')==='count');
  const spoken=[...fields(target,'count_words'),...fields(target,'quantity'),...countWires.flatMap(wire=>fields(wire,'words'))];
  const declared=[...fields(target,'count'),...countWires.flatMap(wire=>fields(wire,'value'))];
  if ([...spoken,...declared].some(surface=>asNumber(phrase(surface))!==2) ||
      countWires.some(wire=>one(wire,'operator')!=='eq' || wire.attrs.want)) return false;
  if (!spoken.length && !declared.length) return false;
  const adjacent=input.filter(token=>token.start>=afterVerb && token.end<=headStart);
  if (!adjacent.length || phrase(text.slice(afterVerb,headStart))!==adjacent.map(token=>token.key).join(' ')) return false;
  const forms=[adjacent];
  if (worlds.determiners[adjacent[0].key]==='definite') forms.push(adjacent.slice(1));
  return forms.some(parts=>{
    const form=parts.map(token=>token.key).join(' ');
    const number=worlds.nominalNumbers.get(form);
    const exact=(number && ['cardinal','group'].includes(number.kind) && Number(number.value)===2) || /^0*2$/u.test(form);
    return exact && (!spoken.length || spoken.some(surface=>phrase(surface)===form));
  });
}

function placeBridge(text,wires,owner,left,right) {
  if (left===right || !text.slice(left,right).trim()) return true;
  return wires.some(wire=>wire.type==='w.request.constraint' && one(wire,'request')===owner &&
    one(wire,'on')==='place' && ['words','value'].some(key=>fields(wire,key).some(value=>
      value===text.slice(left,right).trim())));
}

function scopedPair(text,candidate,worlds,wires,request,target,[left,right],input,visible) {
  const {forms,maxLength,directional}=worlds.reciprocal;
  const owner='$'+request.id,members='$'+target.id;
  const act=one(request,'act'),family=one(target,'family'),predicate=one(request,'predicate');
  if (!predicate || !worlds.literalGrammar.licenses(family,act) ||
      (one(request,'mood') ?? 'do')!=='do' || request.attrs.polarity || request.attrs.guard) return;
  const nativeAct=worlds.lookup(phrase(predicate)).filter(([role,sense,mood])=>
    role==='act' && sense!=='ask' && (!mood || mood==='do'));
  if (!nativeAct.some(([,sense])=>sense===act)) return;
  const head=one(target,'sort_words') ?? one(target,'family_words');
  const heads=(head ? literalRanges(text,head,left,right) : sortRanges(text,one(target,'sort'),left,right))
    .filter(([start,end])=>visible(start,end));
  if (heads.length!==1) return;
  const action=literalRanges(text,predicate,left,heads[0][0]).filter(([start,end])=>visible(start,end));
  if (action.length!==1) return;
  const lead=phrase(text.slice(left,action[0][0]));
  if (lead && !worlds.literalGrammar.leads.has(lead) && !worlds.fillerPhrases.has(lead)) return;
  if (!pairAt(text,target,wires,input,action[0][1],heads[0][0],owner,worlds)) return;
  const matches=[];
  for (let i=0;i<input.length;i++) {
    if (input[i].start<heads[0][1]) continue;
    for (let j=i+1;j<=Math.min(i+maxLength,input.length);j++) {
      const start=input[i].start,end=input[j-1].end;
      if (!visible(start,end)) continue;
      const surface=phrase(text.slice(start,end)),reading=forms.get(surface);
      if (reading?.size===1) matches.push({start,end,surface,relation:reading.values().next().value});
    }
  }
  if (matches.length!==1) return;
  const [{start,end,surface,relation}]=matches;
  if (words.test(input.find(token=>token.start>=end)?.key ?? '')) return;
  if (!placeBridge(text,wires,owner,heads[0][1],start)) return;
  const redundant=new Set();
  for (const wire of wires) {
    if (wire.type!=='w.request.constraint' || one(wire,'request')!==owner || one(wire,'on')!=='attribute') continue;
    const attribute=one(wire,'attribute'),evidence=one(wire,'words');
    const binding=directional.get(JSON.stringify([surface,relation,attribute]));
    if (!binding || !worlds.requestKeys.some(key=>key.family===family && key.name===attribute)) continue;
    if (one(wire,'phase')!=='result' || one(wire,'operator')!=='eq' || one(wire,'open_value')!=='true' ||
        evidence!==text.slice(start,end) || phrase(one(wire,'value'))!==binding.marker ||
        phrase(one(wire,'key_words'))!==binding.verb ||
        Object.entries(wire.attrs).some(([key,values])=>!directionalFields.has(key) || values.length!==1) ||
        wires.some(other=>Object.values(other.attrs).some(values=>values.includes('$'+wire.id)))) return;
    redundant.add(wire.id);
  }
  return {target,members,start:heads[0][0],end,relation,words:text.slice(start,end),redundant};
}

export function reciprocalReading(text,candidate,worlds) {
  if (!worlds.reciprocal?.forms.size) return;
  const wires=parse(candidate.sop);
  const requests=wires.filter(wire=>wire.type==='w.request.request');
  const scopes=requests.map(request=>{
    const words=one(request,'words');
    const bounds=words ? literalRanges(text,words) : requests.length===1 ? [[0,text.length]] : [];
    return {request,bounds:bounds.length===1 ? bounds[0] : undefined};
  });
  if (scopes.some(scope=>!scope.bounds)) return;
  scopes.sort((a,b)=>a.bounds[0]-b.bounds[0]);
  if (scopes.some((scope,i)=>i && scope.bounds[0]<scopes[i-1].bounds[1])) return;
  const lead=phrase(text.slice(0,scopes[0]?.bounds[0]));
  if (scopes[0]?.bounds[0] && lead && !worlds.literalGrammar.leads.has(lead) && !worlds.fillerPhrases.has(lead)) return;
  const offsets=Array.from(text).reduce((items,char)=>{items.push(items.at(-1)+char.length);return items;},[0]);
  const quotes=quotedSpans(text).map(quote=>[offsets[quote.start],offsets[quote.end]]);
  const visible=(from,to)=>!quotes.some(([start,end])=>start<to && from<end);
  const input=tokenize(text).filter(token=>visible(token.start,token.end));
  if (!scopes.length || restricted(text,input.filter(token=>!scopes.some(({bounds:[left,right]})=>
    token.start>=left && token.end<=right)),worlds)) return;
  let retained=wires;
  for (const {request,bounds} of scopes) {
    const owner='$'+request.id;
    if (wires.some(wire=>wire.type==='w.relational.reciprocal' && one(wire,'request')===owner)) continue;
    const targets=wires.filter(wire=>wire.type==='w.request.target' && one(wire,'request')===owner);
    if (targets.length!==1) continue;
    const [left,right]=bounds, local=input.filter(token=>token.start>=left && token.end<=right);
    if (restricted(text,local,worlds)) continue;
    const pair=scopedPair(text,candidate,worlds,wires,request,targets[0],bounds,local,visible);
    if (!pair) continue;
    retained=retained.flatMap(wire=>{
      if (pair.redundant.has(wire.id)) return [];
      if (wire===pair.target) return [{...wire,attrs:{...wire.attrs,count:['2']}}];
      return wire.type==='w.request.unread' && one(wire,'request')===owner
        ? consumeUnread([wire],text,pair.start,pair.end) : [wire];
    });
    let id=request.id+'.reciprocal';
    for (let n=2;retained.some(wire=>wire.id===id);n++) id=request.id+'.reciprocal.'+n;
    retained.push({id,type:'w.relational.reciprocal',attrs:{
      request:[owner],members:[pair.members],predicate:['$'+pair.relation],words:[JSON.stringify(pair.words)]
    }});
  }
  if (retained===wires) return;
  const sop=serialize(retained);
  return {sop,source:'reciprocal',status:candidate.status};
}
