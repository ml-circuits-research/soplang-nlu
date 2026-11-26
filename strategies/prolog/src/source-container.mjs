import { literalRanges } from './evidence.mjs';
import { tokens } from './lexicon.mjs';
import { quotedSpans } from './literal-roles.mjs';
import { parse } from './schema.mjs';
import { serialize } from './knowledge.mjs';

const type=name=>'w.request.'+name;
const sourceScope='w.relational.source_scope';
const decode=raw=>raw?.startsWith('"') ? JSON.parse(raw) : raw;
const fields=(wire,key)=>(wire?.attrs[key] ?? []).map(decode);
const get=(wire,key)=>fields(wire,key)[0];
const normalized=text=>tokens(text).map(([key])=>key).join(' ');
const boundary=new Set([',',';','.','!','?','—','–']);

export function compileSourceContainers(facts) {
  const aliases=facts('pro.reader.source_container').flatMap(wire=>{
    const family=get(wire,'family'), affected=fields(wire,'affected_family'), population=get(wire,'population');
    return family && affected.length ? fields(wire,'text').map(label=>({family,affected,population,label:normalized(label)})) : [];
  });
  const markers=new Map();
  for (const wire of facts('k.actions.role')) {
    if (get(wire,'name')!=='source' || !['place','group','thing'].includes(get(wire,'holds'))) continue;
    const act=get(wire,'act');
    if (!markers.has(act)) markers.set(act,new Set());
    for (const marker of fields(wire,'marker')) markers.get(act).add(normalized(marker));
  }
  return {aliases,markers,surfaces:new Set([...markers.values()].flatMap(items=>[...items]))};
}

function matchSourceContainers(text,worlds,ts,quotes) {
  const inventory=worlds.sourceContainers;
  if (!inventory?.aliases.length) return [];
  const chars=Array.from(text);
  const offset=[0];
  for (const char of chars) offset.push(offset.at(-1)+char.length);
  const form=(start,end)=>ts.slice(start,end).map(([key])=>key).join(' ');
  const matches=[];
  for (const marker of inventory.surfaces) {
    const size=marker.split(' ').length;
    for (let i=0;i+size+1<ts.length;i++) {
      const det=i+size;
      if (worlds.determiners[ts[det][0]]!=='definite' || form(i,det)!==marker) continue;
      for (const entry of inventory.aliases) {
        const end=det+1+entry.label.split(' ').length;
        if (end>ts.length || form(det+1,end)!==entry.label) continue;
        const following=ts[end]?.[0];
        if (following && !boundary.has(following) && !worlds.joiners[following] &&
            !worlds.scopeGrammar.negatives.has(following)) continue;
        const from=ts[i][2],to=ts[end-1][3];
        if (quotes.some(q=>q.start<to && q.end>from)) continue;
        matches.push({...entry,marker,first:i,end,from:offset[from],to:offset[to],
          written:text.slice(offset[ts[det][2]],offset[to])});
      }
    }
  }
  return matches;
}

export function sourceContainerMatch(text,worlds) {
  return worlds.validationModules?.types.has(sourceScope) ?
    matchSourceContainers(text,worlds,tokens(text),quotedSpans(text)) : [];
}

// Prove the written object independently of a complete, declared source
// tail. The source marker is licensed against the eventual proved action.
export function sourceFramePlans(text,ts,quotes,worlds) {
  let end=ts.length;
  while (['.','!'].includes(ts[end-1]?.[0])) end--;
  return matchSourceContainers(text,worlds,ts,quotes).flatMap(match=>{
    if (!match.first || match.end!==end) return [];
    const language=worlds.languageFrames.prepare(ts.slice(0,match.first),quotes,worlds);
    if (!language.frames.length) return [];
    const acts=[...worlds.sourceContainers.markers].filter(([,markers])=>markers.has(match.marker)).map(([act])=>act);
    return [{language,acts,families:match.affected,boundary:ts[match.first][2]}];
  });
}

export function sourceContainerReading(text,candidate,worlds,matches=sourceContainerMatch(text,worlds)) {
  if (!worlds.validationModules?.types.has(sourceScope) || !matches.length ||
      !candidate.sop?.includes(' w.request.unread ')) return;
  const wires=parse(candidate.sop);
  const requests=wires.filter(w=>w.type===type('request'));
  const members=Map.groupBy(wires,w=>get(w,'request'));
  const ids=new Set(wires.map(w=>w.id)), accepted=new Map();
  let next=0;
  for (const request of requests) {
    const act=get(request,'act'),mode=get(request,'mood');
    const scope=get(request,'words') ?? (requests.length===1 ? text : undefined);
    const bounds=scope && literalRanges(text,scope,next)[0];
    if (!bounds) continue;
    next=bounds[1];
    if (request.attrs.polarity || ![undefined,'do','propose'].includes(mode) ||
        !worlds.sourceContainers.markers.has(act)) continue;
    const ref='$'+request.id;
    const local=members.get(ref) ?? [];
    const targets=local.filter(w=>w.type===type('target'));
    const [target]=targets;
    if (targets.length!==1 || get(target,'mode')!=='existing' || local.some(w=>w.type===sourceScope)) continue;
    const family=get(target,'family');
    const sources=new Map();
    for (const wire of local) {
      if (wire.type!==type('unread')) continue;
      const written=get(wire,'text');
      const raw=written?.replace(/[.!]$/u,'').trimEnd();
      const hit=literalRanges(text,raw,...bounds);
      if (hit.length!==1) continue;
      const [[from,to]]=hit;
      for (const source of matches) {
        if (source.from!==from || source.to!==to || source.family===family || !source.affected.includes(family) ||
            !worlds.semanticFamilies.has(source.family) ||
            !worlds.sourceContainers.markers.get(act).has(source.marker)) continue;
        sources.set(JSON.stringify([wire.id,source.family]),{...source,wire,start:from});
      }
    }
    if (sources.size!==1) continue;
    const [source]=sources.values();
    const head=get(target,'sort_words') ?? get(target,'family_words') ?? get(target,'sort') ??
      get(target,'description') ?? get(target,'name');
    // The container follows an independently written target or a bound
    // direct pronoun. It cannot supply the affected target itself.
    const before=text.slice(bounds[0],source.start);
    if (head ? !literalRanges(before,head).length :
        !(get(request,'refers')==='thing' && tokens(before).some(([key])=>worlds.isReference(key)))) continue;
    if (local.some(w=>w.type===type('constraint') && ['words','value'].some(key=>fields(w,key).some(value=>
      literalRanges(get(source.wire,'text'),value).length)))) continue;
    const stem=request.id+'.sourceScope';
    let id=stem;
    for (let n=2;ids.has(id);n++) id=stem+n;
    ids.add(id);
    accepted.set(source.wire,[{id,type:sourceScope,attrs:{
      request:[ref],affected:['$'+target.id],container_family:[source.family],
      container_words:[JSON.stringify(source.written)],lookup:['page'],
      words:[JSON.stringify(text.slice(source.from,source.to))],
    }}]);
    if (!request.attrs.words) {
      accepted.set(request,[{...request,attrs:{...request.attrs,words:[JSON.stringify(scope)]}}]);
    }
  }
  if (!accepted.size) return;
  const revised=wires.flatMap(wire=>accepted.get(wire) ?? [wire]);
  return {sop:serialize(revised).trimEnd(),source:'source-container',
    status:revised.some(w=>w.type===type('unread')) ? 'partial' : 'matched'};
}
