import {tokens} from './lexicon.mjs';
import {nativeInventory} from './native-inventory.mjs';
import {politeBody} from './trailing-discourse.mjs';

export const removalWishType='pro.reader.removal_wish';
const quote=JSON.stringify;
const values=(wire,key)=>(wire.attrs[key] ?? []).map(value=>value.startsWith('"') ? JSON.parse(value) : value);
const one=(wire,key)=>values(wire,key)[0];
const form=surface=>tokens(surface).map(([key])=>key).join(' ');
const headForm=surface=>form(surface.replace(/(?<=\p{L})['’](?=\p{L})/gu,''));

export function compileRemovalWishes(facts,words) {
  const frames=new Map(facts('w.lang.en.frame').map(wire=>[one(wire,'name'),wire]));
  const parts=Map.groupBy(facts('w.lang.en.part'),wire=>one(wire,'frame'));
  const fixed=new Set(facts('w.lang.en.fixed').map(wire=>one(wire,'frame')));
  const inventories=new Map();
  return facts(removalWishType).flatMap(binding=>{
    const [frame,family,provider]=['frame','family','provider'].map(key=>one(binding,key));
    const native=frames.get(frame);
    if (!native || fixed.has(frame) || one(native,'act')!=='remove' || one(native,'needs')!=='wish' ||
        values(native,'role').join()!=='thing' || !family || !provider) return [];
    const body=(parts.get(frame) ?? []).slice().sort((a,b)=>Number(one(a,'at'))-Number(one(b,'at')))
      .filter(part=>one(part,'is')!=='lead' || one(part,'optional')!=='yes');
    const [head,det,thing,tail]=body;
    if (body.length!==4 || one(head,'is')!=='word' || one(head,'optional')==='yes' ||
        one(det,'is')!=='det' || one(det,'optional')!=='yes' || one(thing,'is')!=='role' ||
        one(thing,'role')!=='thing' || one(thing,'takes')!=='words' || one(tail,'is')!=='word') return [];
    const heads=new Set(values(binding,'head').map(headForm));
    const tails=new Set(values(binding,'cessation').map(form));
    const nativeHeads=values(head,'word').map(headForm), nativeTails=values(tail,'word').map(form);
    if (!heads.size || !tails.size || [...heads].some(head=>!nativeHeads.includes(head)) ||
        [...tails].some(tail=>!nativeTails.includes(tail))) return [];
    if (!inventories.has(provider)) inventories.set(provider,nativeInventory(facts,provider,words));
    return [{family,heads,tails,inventory:inventories.get(provider)}];
  });
}

export function removalWishReadings(text,ts,worlds,politeness) {
  const body=politeBody(text,ts,politeness,3);
  if (!body) return [];
  const {start,end,fillers,phrase,span}=body;
  const result=[];
  for (const {family,heads,tails,inventory} of worlds.removalWishes) {
    if (!worlds.literalGrammar.licenses(family,'remove')) continue;
    for (let first=start+1;first<end-1;first++) {
      if (!heads.has(headForm(span(start,first)))) continue;
      const determiner=worlds.determiners[ts[first][0]];
      if (determiner && determiner!=='definite') continue;
      const nounStart=first+Number(Boolean(determiner));
      for (let last=nounStart+1;last<end;last++) {
        if (!tails.has(phrase(last,end))) continue;
        const noun=phrase(nounStart,last);
        if (worlds.isReference(noun) || worlds.lookup(noun).some(([role])=>role==='act')) continue;
        const sorts=inventory.get(noun);
        if (sorts?.size!==1) continue;
        const [sort]=sorts;
        const sop=[
          '@r w.request.request act=remove mood=do words='+quote(text)+' predicate='+quote(span(start,end)),
          '@t w.request.target request=$r family='+quote(family)+' mode=existing fill=description'+
            ' sort='+quote(sort)+' sort_words='+quote(span(nounStart,last))+' description='+quote(span(first,last))+
            (determiner ? ' determiner='+determiner : ''),
          ...fillers.map((words,i)=>'@f'+(i+1)+' w.request.filler text='+quote(words)),
        ].join('\n');
        result.push({sop,source:'removal-wish',status:'matched'});
      }
    }
  }
  return result;
}
