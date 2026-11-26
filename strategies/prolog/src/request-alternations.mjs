import { tokens } from './lexicon.mjs';
import { quotedSpans } from './literal-roles.mjs';

const slot=Symbol('slot');
const word=/^[\p{L}\p{N}\p{M}_]+$/u;
const terminal=new Set(['.','?','!','。','？','！']);
const question=new Set(['?','？']);
const apostrophe=new Set(["'",'’']);
const decode=value=>value?.startsWith('"') ? JSON.parse(value) : value;
const field=(wire,key)=>decode(wire.attrs[key]?.[0]);
const keyOf=key=>apostrophe.has(key) ? "'" : key;

function pattern(text) {
  if (!text) return;
  const matches=[...text.matchAll(/\{([\p{L}_][\p{L}\p{N}_-]*)\}/gu)];
  if (matches.length!==1) return;
  const [match]=matches;
  const start=match.index, end=start+match[0].length;
  const left=text.slice(0,start), right=text.slice(end);
  if (/[{}]/u.test(left+right) || word.test(Array.from(left).at(-1) ?? '') ||
      word.test(Array.from(right)[0] ?? '') || /['’\-]$/u.test(left) || /^['’\-]/u.test(right)) return;
  const parts=surface=>tokens(surface).map(([key,,start],i,ts)=>({
    key:keyOf(key), joined:i>0 && ts[i-1][3]===start,
  }));
  return {variable:match[1],parts:[...parts(left),{key:slot,joined:false},...parts(right)]};
}

function samePattern(from,to,start) {
  return to.every((piece,i)=>from[start+i]?.key===piece.key &&
    (i===0 || from[start+i].joined===piece.joined));
}

export function compileAlternations(facts) {
  const negatives=new Set(), endings=new Set();
  const addWords=wire=>{
    for (const value of wire.attrs.text ?? []) {
      negatives.add(tokens(decode(value)).map(([key])=>keyOf(key)).join(' '));
    }
  };
  for (const wire of facts('w.lang.en.neg')) {
    addWords(wire);
    for (const value of wire.attrs.ending ?? []) endings.add(decode(value).toLowerCase().replaceAll('’',"'"));
  }
  for (const wire of facts('w.lang.en.joiner')) {
    if (['condition','contrast'].includes(field(wire,'kind'))) addWords(wire);
  }
  for (const wire of facts('pro.reader.scope_cue')) {
    if (['condition','negatives'].includes(field(wire,'kind'))) addWords(wire);
  }
  const unsafe=pieces=>{
    const surface=pieces.map(piece=>piece.key).join(' ');
    const tight=pieces.map((piece,i)=>(i && !piece.joined ? ' ' : '')+piece.key).join('');
    const phrases=[...negatives];
    return phrases.some(phrase=>(' '+surface+' ').includes(' '+phrase+' ')) ||
      tight.split(/\s+/u).some(word=>[...endings].some(ending=>word.endsWith(ending)));
  };
  const rules=new Map();
  for (const wire of facts('w.lang.en.alternation')) {
    const explicit=field(wire,'mode');
    const family=field(wire,'family');
    const ordered=!explicit && family==='sequence lead';
    const mode=ordered ? 'ordered' : explicit;
    if (!ordered && !['request','question'].includes(mode)) continue;
    const lhs=pattern(field(wire,'from')), rhs=pattern(field(wire,'to'));
    if (!lhs || !rhs || lhs.variable!==rhs.variable || lhs.parts.length<=rhs.parts.length) continue;
    const starts=lhs.parts.flatMap((_,i)=>samePattern(lhs.parts,rhs.parts,i) ? [i] : []);
    if (starts.length!==1) continue;
    const [start]=starts, end=start+rhs.parts.length;
    if (unsafe(lhs.parts.slice(0,start)) || unsafe(lhs.parts.slice(end))) continue;
    const pivot=lhs.parts.findIndex(piece=>piece.key===slot);
    const before=lhs.parts.slice(0,pivot), after=lhs.parts.slice(pivot+1);
    if (ordered && (!before.length || after.length || rhs.parts.length!==1 || rhs.parts[0].key!==slot)) continue;
    const rule={mode,family,before,after,dropBefore:start,dropAfter:lhs.parts.length-end};
    rules.set(JSON.stringify(rule),rule);
  }
  for (const wire of facts('pro.reader.body_lead').filter(w=>field(w,'role')==='action_opening')) {
    for (const raw of wire.attrs.text ?? []) {
      const {parts}=pattern(decode(raw)+' {action}') ?? {};
      const before=parts?.slice(0,-1);
      if (!before?.length || unsafe(before)) continue;
      const rule={mode:'action',before,after:[],dropBefore:before.length,dropAfter:0};
      rules.set(JSON.stringify(rule),rule);
    }
  }
  return [...rules.values()];
}

function matches(ts, specified, offset) {
  return offset>=0 && specified.every(({key,joined},i)=>{
    const target=ts[offset+i];
    return target && target.key===key && !target.hidden &&
      (!i || target.joined===joined);
  });
}

function removeBoundaryCommas(ts, dropBefore, dropAfter, before, after) {
  const first=dropBefore, last=ts.length-dropAfter-1;
  const omitFirst=dropBefore && ts[first]?.key===',' && !ts[first].hidden &&
    ts[first-1].key!==',' && before[first]?.key!==',';
  const omitLast=dropAfter && ts[last]?.key===',' && !ts[last].hidden &&
    ts[last+1]?.key!==',' && after[after.length-dropAfter-1]?.key!==',';
  if (!omitFirst && !omitLast) return ts;
  return ts.flatMap((token,i)=>{
    if (omitFirst && i===first || omitLast && i===last) return [];
    if (omitFirst && i===first+1 || omitLast && i===last+1) return [{...token,joined:false}];
    return [token];
  });
}

export function alternateBodies(text, compiled) {
  if (!compiled?.length) return [];
  const chars=Array.from(text), quotes=quotedSpans(text);
  const ts=tokens(text).map(([key,,start,end],i,all)=>({
    key:keyOf(key),start,end,joined:i>0 && all[i-1][3]===start,
    hidden:quotes.some(q=>q.start<end && q.end>start),
  }));
  if (!ts.length) return [];
  if (ts.some(({key,start,end,hidden})=>!hidden &&
    (/^["“”‘]$/u.test(key) || key==="'" && !(word.test(chars[start-1] ?? '') && word.test(chars[end] ?? ''))))) return [];

  const last=ts.length-1;
  const ends=[ts.length];
  if (terminal.has(ts[last].key) && !ts[last].hidden) ends.push(last);
  const alternatives=new Map();
  for (const {before,after,mode,family,dropBefore,dropAfter} of compiled) {
    if (mode==='action' && question.has(ts[last].key) && !ts[last].hidden) continue;
    // A comma separates a turn-opening order marker from a noun modifier
    // (for example, “next, …” versus “next month” and “next to …”).
    if (mode==='ordered' && ts[before.length]?.key!==',') continue;
    for (const end of ends) {
      const visible=removeBoundaryCommas(ts.slice(0,end),dropBefore,dropAfter,before,after);
      const capturedEnd=visible.length-after.length;
      if (capturedEnd<=before.length || !matches(visible,before,0) || !matches(visible,after,capturedEnd) ||
          visible[before.length].hidden || !word.test(visible[before.length].key)) continue;
      let keptEnd=visible.length-dropAfter;
      if (end===last && !dropAfter && (mode==='question' || !question.has(ts[last].key))) {
        visible.push(ts[last]);
        keptEnd++;
      }
      if (end===ts.length && mode==='request' && !dropAfter && !after.length && question.has(ts[last].key) &&
          !ts[last].hidden) keptEnd--;
      if (keptEnd<=dropBefore || visible.slice(dropBefore,keptEnd-1).some(({key,start,end,hidden})=>
          !hidden && (key===';' || key==='；' || terminal.has(key) &&
            !(key==='.' && /\d/u.test(chars[start-1] ?? '') && /\d/u.test(chars[end] ?? ''))))) continue;
      if (terminal.has(visible[keptEnd-1].key) && keptEnd<=before.length+1) continue;
      const from=visible[dropBefore].start, to=visible[keptEnd-1].end;
      const start=chars.slice(0,from).join('').length, stop=chars.slice(0,to).join('').length;
      const right=to===ts[last].end && terminal.has(ts[last].key) ? visible[keptEnd-2].end : to;
      const specificity=before.length+after.length;
      const id=JSON.stringify([mode,start,stop]), previous=alternatives.get(id);
      if (!previous || previous.specificity<specificity) {
        alternatives.set(id,{text:text.slice(start,stop),mode,family,start,end:stop,right,specificity,
          prefix:text.slice(0,start).trim(),suffix:text.slice(stop).trim()});
      }
    }
  }
  const candidates=[...alternatives.values()];
  const contains=(a,b)=>a.start<=b.start && a.right>=b.right;
  const narrower=(a,b)=>contains(a,b) && (a.start<b.start || a.right>b.right);
  const prefers=(a,b)=>narrower(b,a) && (a.mode===b.mode || a.specificity>b.specificity);
  if (candidates.some((a,i)=>candidates.slice(i+1).some(b=>
      !contains(a,b) && !contains(b,a) || a.mode!==b.mode && !prefers(a,b) && !prefers(b,a)))) return [];
  return candidates.filter(a=>!candidates.some(b=>prefers(b,a))).map(({right,specificity,...candidate})=>candidate);
}
