import {str} from './knowledge.mjs';
import {tokens} from './lexicon.mjs';
import {resolveWrittenMeasurement} from './owner-property.mjs';

const date = /^[1-9]\d{3}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
const clock = /^(?:[01]?\d|2[0-3]):[0-5]\d$/u;
const identifier = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;
const shapeByFormat = new Map([
  ['identifier', ['candidate','span']], ['date', ['candidate','span']],
  ['clock', ['candidate','span']], ['zone', ['candidate','span']], ['measurement', ['number']],
  ['nominal_description', ['span']], ['scalar_number', ['number']], ['positive_count', ['number']],
]);
const one = (wire,key) => str(wire.attrs[key]?.[0]);
const form = text => tokens(text).map(([key])=>key).join(' ');

export function compileStructuredArguments(facts, catalog) {
  const formats = new Map();
  for (const wire of facts('pro.reader.argument_format')) {
    const [family,key,format] = ['family','key','format'].map(field=>one(wire,field));
    const shape=shapeByFormat.get(format);
    if (shape && catalog.some(row=>row.family===family && row.name===key &&
        !row.values.length && row.head.split('+').some(head=>shape.includes(head)))) {
      const id=JSON.stringify([family,key]), choices=formats.get(id) ?? new Set();
      choices.add(format);
      formats.set(id,choices);
    }
  }
  return new Map([...formats].flatMap(([id,choices])=>choices.size===1 ? [[id,[...choices][0]]] : []));
}

export function structuredZones(facts) {
  const names=facts('k.time.zone').map(wire=>one(wire,'name')).filter(Boolean);
  for (const wire of facts('core.word')) {
    if (!(wire.attrs.of ?? []).map(str).includes('k.time.zone.name')) continue;
    names.push(...(wire.attrs.text ?? []).map(str));
  }
  return new Set(names.map(form));
}

export function scalarNumber(text,worlds,family,key) {
  const result=resolveWrittenMeasurement(text,worlds,family,key);
  if (!result?.measurement) return result?.value;
}

function operand(format,raw,worlds,family,key) {
  switch (format) {
    case 'identifier': return identifier.test(raw) ? '' : undefined;
    case 'date': {
      if (!date.test(raw)) return;
      const instant = new Date(raw + 'T00:00:00Z');
      return Number.isFinite(Number(instant)) && instant.toISOString().startsWith(raw+'T') ? '' : undefined;
    }
    case 'clock': return clock.test(raw) ? '' : undefined;
    case 'zone': return worlds.argumentZones.has(form(raw)) ? '' : undefined;
    case 'scalar_number': return scalarNumber(raw,worlds,family,key);
    case 'positive_count': {
      const value=scalarNumber(raw,worlds,family,key);
      if (Number.isSafeInteger(Number(value)) && Number(value)>0) return value;
      return undefined;
    }
    case 'nominal_description': {
      const [article,...terms]=tokens(raw).map(([term])=>term);
      if (!worlds.determiners[article] || !terms.length || terms.some(term=>
        !/^[\p{L}\p{M}\p{N}_]+$/u.test(term) || worlds.joiners[term] || worlds.negatives.has(term) ||
        worlds.scopeGrammar.conditionals.has(term) || worlds.scopeGrammar.modals.has(term))) return;
      if (terms.some((term,i)=>worlds.determiners[terms[i+1]] &&
          worlds.lookup(term).some(([role])=>role==='act'))) return;
      return !worlds.evidenceVocabulary.grammar.has(terms[0]) &&
        !worlds.evidenceVocabulary.grammar.has(terms.at(-1)) ? '' : undefined;
    }
    case 'measurement': {
      if (!/^[\p{L}\p{N}.+\- ]+$/u.test(raw)) return;
      const result=resolveWrittenMeasurement(raw,worlds,family,key);
      return result?.measurement ? result : undefined;
    }
  }
}

export function structuredBank(text,ts,start,stop,worlds,family,{key,format}) {
  const bank = [];
  const chars = Array.from(text);
  for (let a=start; a<stop; a++) for (let b=a+1; b<=Math.min(a+8,stop); b++) {
    const raw=chars.slice(ts[a][2],ts[b-1][3]).join('');
    const value=operand(format,raw,worlds,family,key);
    if (value!==undefined) bank.push([ts.slice(a,b).map(([term])=>term),value,ts[a][2],ts[b-1][3]]);
  }
  return bank;
}
