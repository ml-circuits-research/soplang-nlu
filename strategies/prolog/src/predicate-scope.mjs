import { literalRanges } from './evidence.mjs';
import { quotedSpans } from './literal-roles.mjs';
const decode=v=>v?.startsWith('"') ? JSON.parse(v) : v;

// Quoted text can be a literal argument to another request. A predicate needs
// an occurrence in its own clause outside the quoted payload.
export function quotedPredicates(text,wires) {
  if (!/["'“‘]/u.test(text)) return [];
  const quotes=quotedSpans(text);
  if (!quotes.length) return [];
  const chars=Array.from(text),bounds=quotes.map(q=>[chars.slice(0,q.start).join('').length,chars.slice(0,q.end).join('').length]);
  const issues=[];
  for (const w of wires.filter(w=>w.type==='w.request.request' && w.attrs.predicate)) {
    const predicate=decode(w.attrs.predicate[0]),clause=decode(w.attrs.words?.[0]);
    const scopes=clause ? literalRanges(text,clause) : [[0,text.length]];
    const ranges=scopes.flatMap(([a,b])=>literalRanges(text,predicate,a,b));
    if (ranges.length && ranges.every(([a,b])=>bounds.some(([x,y])=>x<=a && b<=y)))
      issues.push({wire:w.id,slot:'predicate',literal:predicate,code:'predicate_inside_quotation'});
  }
  return issues;
}
