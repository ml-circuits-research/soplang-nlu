import {lexicalTokens} from './syntax-lexicon.mjs';
import {quotedSpans} from './literal-roles.mjs';
import {parse} from './schema.mjs';

const field = (wire,key) => {
  const raw = wire.attrs[key]?.[0];
  return raw?.startsWith('"') ? JSON.parse(raw) : raw;
};
const uniq = values => [...new Set(values.filter(Boolean))];
const lexicalWord = /[\p{L}\p{M}\p{N}_]/u;
const numerals = /^\p{N}+$/u;
const discourse = new Set(['filler','politeness','interjection']);

function nativeInput(text, worlds) {
  const quotes = quotedSpans(text);
  const unitToPoint = new Map();
  let unit = 0, point = 0;
  for (const character of text) {
    unitToPoint.set(unit,point++);
    unit += character.length;
  }
  unitToPoint.set(unit,point);
  const source = lexicalTokens(text).map(match=>{
    const raw=match[0], start=match.index, end=start+raw.length;
    const quoted = quotes.some(quote=>unitToPoint.get(start) >= quote.start && unitToPoint.get(end) <= quote.end);
    return {raw,start,end,key:raw.toLowerCase(),quoted};
  });
  const cache = new Map();
  const shapeKinds = new Set(worlds.requestKeys.filter(request=>request.name.endsWith('.shape'))
    .flatMap(request=>request.values));
  function lexical(surface) {
    if (cache.has(surface)) return cache.get(surface);
    const facts = worlds.syntaxLexicon(surface);
    const lookup = worlds.lookup(surface);
    const targets = [...lookup,...worlds.frameTargets(surface)].filter(([role])=>role==='target');
    const positions = [...(facts.pos ?? [])];
    if (targets.length) positions.push('noun');
    if (numerals.test(surface)) positions.push('numeral');
    if (worlds.nominalNumbers.has(surface)) positions.push('numeral');
    if (!surface.includes(' ') && !positions.includes('noun')) {
      const inflected=worlds.nominalInflection(surface,worlds.lookup).filter(([role])=>role==='target');
      if (inflected.length) {
        positions.push('noun');
        targets.push(...inflected);
      }
    }
    const colors = [], shapes = [];
    for (const [role,,family,body] of lookup) {
      if (role!=='constraint' || !/\b(?:color|colour|shape)\b/u.test(body)) continue;
      const [wire] = parse('@syntax.color w.request.constraint ' + body);
      const attribute=field(wire,'attribute') ?? '';
      const value = field(wire,'value');
      if (value && /\.(?:color|colour)$/u.test(attribute)) colors.push([family,value]);
      if (value===surface && /\.shape$/u.test(attribute)) shapes.push(value);
    }
    const markers=lookup.filter(([role])=>role==='marker').map(([,act,slot,relation])=>[act,slot,relation]);
    const result = {
      pos:uniq(positions), acts:uniq(lookup.filter(([role])=>role==='act').map(([,act])=>act)),
      kinds:uniq(shapes.length || shapeKinds.has(surface) && positions.includes('noun') ?
        [...shapes, surface] : targets.map(([, , family, , sort])=>sort || family)), colors, markers,
      preposition:uniq([...(facts.preposition ?? []),...markers.map(([,slot,relation])=>relation || slot)]),
      pronoun:facts.pronoun ?? [], joiner:facts.joiner ?? [],
      auxiliary:Boolean(facts.auxiliary || facts.pos?.includes('auxiliary')),
      copula:Boolean(facts.copula), question:Boolean(facts.question),
      negation:Boolean(facts.negation || worlds.scopeGrammar.predicateNegators.has(surface)),
      skip:Boolean(facts.cues?.some(cue=>discourse.has(cue))),
      word:lexicalWord.test(surface)
    };
    cache.set(surface,result);
    return result;
  }
  const forms = source.map((token,at)=>{
    const entries=[];
    if (token.quoted) return [{...lexical(''),end:at+1}];
    for (let end=at+1; end<=Math.min(source.length,at+8); end++) {
      if (source[end-1].quoted) break;
      const term=source.slice(at,end).map(item=>item.key).join(' ');
      const entry=lexical(term);
      const useful=entry.pos.length || entry.acts.length || entry.preposition.length ||
        entry.joiner.length || entry.question || entry.auxiliary || entry.negation || entry.skip;
      if (end===at+1 || useful) entries.unshift({...entry,end});
    }
    return entries;
  });
  return {source,packet:{tokens:source.map(({raw,quoted})=>[raw,quoted]),forms}};
}

function matchingRequest(clause,candidate,span) {
  const written=span(clause.predicate);
  if (!written || !candidate) return;
  const requests=candidate.filter(wire=>wire.type==='w.request.request' && field(wire,'predicate')===written);
  if (requests.length===1) return requests[0];
}

function possibleAct(clause, request) {
  if (clause.acts.length===1) return clause.acts[0];
  const act=request && field(request,'act');
  if (clause.acts.includes(act) && (act!=='ask' || clause.form==='interrogative')) return act;
}

function circuit(text,source,forms,analysis,candidate,attachment) {
  const lines=[];
  const covered = new Set();
  let nextEntity = 1, nextRelation = 1, nextCoordination = 1;
  const span = ([at,end]) => at<end ? text.slice(source[at].start,source[end-1].end) : undefined;
  const raw = (name,range) => {
    const value=span(range);
    if (value===undefined) return '';
    for (let at=range[0]; at<range[1]; at++) covered.add(at);
    return ' '+name+'='+JSON.stringify(value);
  };
  const atom = (name,value) => {
    if (!value) return '';
    return ' '+name+'='+value.replace(/[^\p{L}\p{M}\p{N}_.-]+/gu,'_');
  };
  const ref = (name,id) => id ? ' '+name+'=$'+id : '';
  function entity(phrase,targets=[]) {
    const id='e'+nextEntity++;
    const kinds=uniq(phrase.kinds);
    const color=uniq(phrase.colors.map(([,value])=>value));
    const written=span(phrase.head);
    const groundedName=written && targets.some(target=>field(target,'name')===written);
    const identity = phrase.name.length ? raw('name',phrase.name) :
      phrase.pronoun.length ? raw('pronoun',phrase.pronoun) : raw(groundedName?'name':'head',phrase.head);
    let quantity = false;
    const nominalModifier = (range,role) => {
      if (!quantity && range.length &&
          forms[range[0]].some(form=>form.end===range[1] && form.pos.includes('numeral'))) {
        quantity=true;
        return raw('quantity',range);
      }
      return raw(role,range);
    };
    lines.push('@'+id+' nlu.entity'+identity+nominalModifier(phrase.determiner,'determiner')+
      phrase.modifiers.map(range=>nominalModifier(range,'modifier')).join('')+
      atom('kind',kinds.length===1?kinds[0]:undefined)+atom('color',color.length===1?color[0]:undefined));
    return id;
  }
  for (const {join} of analysis.clauses) {
    if (!join.length) continue;
    for (let at=join[0];at<join[1];at++) covered.add(at);
  }
  for (const [index,clause] of analysis.clauses.entries()) {
    const id='c'+(index+1);
    const request=matchingRequest(clause,candidate,span);
    const act=possibleAct(clause,request);
    const targets=request ? candidate.filter(wire=>wire.type==='w.request.target' &&
      field(wire,'request')==='$'+request.id) : [];
    const subjects=clause.subjects.map(phrase=>entity(phrase));
    const objectIds=new Map(clause.objects.map(phrase=>[phrase.from,entity(phrase,targets)]));
    const objects=[...objectIds.values()];
    const relations=clause.relations.map(item=>[item,entity(item.entity)]);
    let indirectObject;
    for (const [item,target] of relations) {
      const licensed = item.markers.filter(([license])=>license==='*' || act===license);
      const roles = uniq(licensed.map(([,role])=>role).filter(role=>['source','destination','recipient','beneficiary'].includes(role)));
      if (roles.length===1 && ['recipient','beneficiary'].includes(roles[0]) && !indirectObject) {
        indirectObject=target;
        lines.push('@r'+nextRelation+++' nlu.relation'+atom('kind',roles[0])+ref('from',id)+ref('to',target)+raw('cue',item.cue));
        continue;
      }
      const kind = roles.length===1 ? roles[0] : uniq(licensed.map(([, ,relation])=>relation))[0] ?? item.kinds[0];
      const owner = item.cue[0]===attachment && item.attachment==='ambiguous' && objects.length ?
        objects.at(-1) : clause.predicate[0]===clause.predicate[1] ? subjects[0] ?? id : id;
      lines.push('@r'+nextRelation+++' nlu.relation'+atom('kind',kind)+ref('from',owner)+ref('to',target)+raw('cue',item.cue));
    }
    let object=objects[0];
    if (clause.coordinations.length) {
      object='g'+nextCoordination++;
      lines.push('@'+object+' nlu.coordination'+atom('kind',clause.coordinations[0].kind)+
        objects.map(member=>ref('member',member)).join('')+
        clause.coordinations.map(coordinate=>raw('cue',coordinate.cue)).join(''));
    }
    if (clause.join.length) {
      const [start,end,kind]=clause.join;
      if (kind==='condition') {
        lines.push('@r'+nextRelation+++' nlu.relation kind=condition'+
          ref('from',id)+ref('to','c'+index)+raw('cue',[start,end]));
      } else {
        lines.push('@g'+nextCoordination+++' nlu.coordination'+atom('kind',kind)+
          ref('member','c'+index)+ref('member',id)+raw('cue',[start,end]));
      }
    }
    const role = clause.predicate[0]===clause.predicate[1] ? 'topic' : 'subject';
    const resultColors=clause.complement.length ? uniq(forms[clause.complement[0]]
      .filter(form=>form.end===clause.complement[1]).flatMap(form=>form.colors.map(([,color])=>color))) : [];
    const fields=raw('predicate',clause.predicate)+ref(role,subjects[0])+
      ref('direct_object',object)+ref('indirect_object',indirectObject)+raw('result_complement',clause.complement)+
      clause.auxiliary.map(range=>raw('auxiliary',range)).join('')+
      clause.negation.map(range=>raw('negation',range)).join('')+
      raw('question',clause.question)+raw('terminator',clause.terminator)+
      atom('polarity',clause.negation.length?'negative':undefined)+
      atom('result_color',resultColors.length===1 ? resultColors[0] : undefined);
    let gaps='';
    for (let at=clause.from;at<clause.to;at++) {
      if (covered.has(at)) continue;
      const skip=forms[at].find(form=>form.skip && form.end<=clause.to &&
        Array.from({length:form.end-at},(_,i)=>at+i).every(i=>!covered.has(i)));
      if (skip) {
        gaps+=raw('filler',[at,skip.end]);
        at=skip.end-1;
        continue;
      }
      if (/^[,;”“"‘’'—–:]+$/u.test(source[at].raw)) {
        gaps+=raw('filler',[at,at+1]);
        continue;
      }
      let end=at+1;
      while (end<clause.to && !covered.has(end) && lexicalWord.test(source[end].raw) &&
          !forms[end].some(form=>form.skip)) end++;
      gaps+=raw('unresolved',[at,end]);
      at=end-1;
    }
    lines.push('@'+id+' nlu.clause form='+clause.form+fields+atom('act',act)+gaps);
  }
  return lines.join('\n');
}

export function createNativeSyntax(worlds, analyse) {
  const loads = new Map();
  return async (text,candidates=[])=>{
    if (!loads.has(text)) {
      const {source,packet}=nativeInput(text,worlds);
      const result=analyse(packet).then(analysis=>{
        if (analysis.error) throw new Error(analysis.error);
        return {source,forms:packet.forms,analysis};
      });
      loads.set(text,result);
      if (loads.size>8) loads.delete(loads.keys().next().value);
      result.catch(()=>{if (loads.get(text)===result) loads.delete(text)});
    }
    const {source,forms,analysis}=await loads.get(text);
    const base=circuit(text,source,forms,analysis);
    const decorated=candidates.map(candidate=>({...candidate,
      analysisSop:circuit(text,source,forms,analysis,parse(candidate.sop))}));
    const alternatives=analysis.clauses.filter(clause=>clause.objects.length)
      .flatMap(clause=>clause.relations.filter(relation=>relation.attachment==='ambiguous'))
      .slice(0,4).map(relation=>circuit(text,source,forms,analysis,undefined,relation.cue[0]));
    const proposals=uniq([base,...alternatives,...decorated.map(candidate=>candidate.analysisSop)]);
    return {analyses:proposals.map(sop=>({sop})),candidates:decorated};
  };
}
