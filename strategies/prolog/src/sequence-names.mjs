import { parse } from './schema.mjs';
import { tokens } from './lexicon.mjs';
import { quotedSpans } from './literal-roles.mjs';
import { namedArgumentCandidates } from './named-arguments.mjs';
import { composeParts } from './composition.mjs';

const value=(wire,key)=>{
  const raw=wire.attrs[key]?.[0];
  return raw?.startsWith('"') ? JSON.parse(raw) : raw;
};

// Propagate only names actually bound by the matching creation alternative.
// Each new circuit still identifies the consumer by its written name.
export function sequenceNameReadings(parts,results,worlds,sequenceOptions) {
  if (parts.length!==2) return [];
  const [producer,consumer]=parts;
  const [first]=results;
  const quotes=quotedSpans(consumer),ts=tokens(consumer);
  const out=[], seen=new Set();
  for (const candidate of [first,...first.alternatives]) {
    const wires=parse(candidate.sop);
    const requests=wires.filter(w=>w.type==='w.request.request');
    const targets=wires.filter(w=>w.type==='w.request.target');
    if (requests.length!==1 || targets.length!==1 || value(requests[0],'act')!=='make' || value(targets[0],'mode')!=='new') continue;
    const family=value(targets[0],'family');
    const bindings=worlds.literalGrammar.bindings.filter(b=>b.family===family && b.role==='name');
    const names=wires.filter(w=>w.type==='w.request.constraint' && value(w,'phase')==='result' &&
        value(w,'operator')==='eq' && bindings.some(b=>b.attribute===value(w,'attribute')))
      .map(w=>value(w,'value'));
    names.push(value(targets[0],'name'));
    const written=new Set(names.filter(n=>n && /^\p{Ll}/u.test(n) && producer.includes(n) && consumer.includes(n)));
    if (!written.size) continue;
    for (const reading of namedArgumentCandidates(consumer,ts,quotes,worlds,sequenceOptions,new Map([[family,written]]))) {
      const used=parse(reading.sop).find(w=>w.type==='w.request.target');
      if (!used || value(used,'family')!==family || !written.has(value(used,'name'))) continue;
      const sop=composeParts(parts,[candidate,reading]);
      if (!seen.has(sop)) {
        seen.add(sop);
        out.push({sop,source:'sequence',status:'partial',parts:[{text:producer,source:candidate.source},{text:consumer,source:reading.source}]});
      }
    }
  }
  return out;
}
