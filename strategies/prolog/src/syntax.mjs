import {lexicalTokens} from './syntax-lexicon.mjs';
import {quotedSpans} from './literal-roles.mjs';
import {parse} from './schema.mjs';

const field = (wire,key) => {
  const raw = wire.attrs[key]?.[0];
  return raw?.startsWith('"') ? JSON.parse(raw) : raw;
};
const uniq = values => [...new Set(values.filter(Boolean))];
const lexicalWord = /[\p{L}\p{M}\p{N}_]/u;
const numerals = /^(?:\p{N}+|[+-]?[0-9]*\.[0-9]+)$/u;
const clockValue = /^[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?$/u;
const dateValue = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;
const discourse = new Set(['filler','politeness','interjection']);
const coordinationKind = kind => kind==='coordination' ? 'conjunctive' : kind==='addition' ? 'additive' : kind;

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
    if (/^\d{4}-\d{2}-\d{2}$/u.test(surface)) positions.push('noun', 'numeral');
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
      frames:facts.frames ?? [], base:Boolean(facts.base), pos:uniq(positions), acts:uniq(lookup.filter(([role])=>role==='act').map(([,act])=>act)),
      kinds:uniq(shapes.length || shapeKinds.has(surface) && positions.includes('noun') ?
        [...shapes, surface] : targets.map(([, , family, , sort])=>sort || family)), colors, markers,
      preposition:uniq([...(facts.preposition ?? []),...markers.map(([,slot,relation])=>relation || slot)]),
      pronoun:facts.pronoun ?? [], joiner:facts.joiner ?? [],
      auxiliary:Boolean(facts.auxiliary || facts.pos?.includes('auxiliary')),
      copula:Boolean(facts.copula), question:Boolean(facts.question),
      adverb:Boolean(facts.adverb || facts.pos?.length===1 && facts.pos.includes('adverb') ||
        facts.pos?.includes('adverb') && /ly$/u.test(surface)),
      clockValue:clockValue.test(surface), temporalValue:clockValue.test(surface) || dateValue.test(surface),
      comparative:Boolean(facts.comparative), participle:Boolean(facts.participle),
      clauseTaker:Boolean(facts.clauseTaker),
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
      const useful=entry.pos.length || entry.acts.length || entry.frames.length || entry.preposition.length ||
        entry.joiner.length || entry.question || entry.auxiliary || entry.negation || entry.skip;
      if (end===at+1 || useful) entries.unshift({...entry,end});
    }
    return entries;
  });
  const particles=[];
  for (let start=0;start<source.length;start++) {
    if (source[start].quoted) continue;
    for (let at=start+1;at<Math.min(source.length,start+16);at++) {
      if (source[at].quoted) break;
      for (let end=at+1;end<=Math.min(source.length,at+4);end++) {
        if (source[end-1].quoted) break;
        const tail=source.slice(at,end).map(token=>token.key).join(' ');
        if (!worlds.referenceCommands.particles.has(tail)) continue;
        const head=source[start].key;
        const pair=JSON.stringify([head,tail]);
        const acts=uniq([...(worlds.referenceCommands.splitTargets.get(pair) ?? []),
          ...(worlds.referenceCommands.verbs.get(pair) ?? []),
          ...(worlds.syntaxLexicon(head+' '+tail).action ? lexical(head).acts : [])]);
        if (acts.length) particles.push([start,at,end,acts]);
      }
    }
  }
  return {source,packet:{tokens:source.map(({raw,quoted})=>[raw,quoted]),forms,
    recipientActs:worlds.syntaxRecipientActs,particles}};
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
  const covered = new Set(), semanticEvidence=[];
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
    if (kinds.length===1 && !groundedName) semanticEvidence.push({
      wire:id,key:'kind',sourceSlot:'head',source:span(phrase.head)});
    const modifierRole=([start,end])=>{
      const readings=forms[start].filter(form=>form.end===end);
      return readings.some(form=>form.pos.includes('noun')) &&
        !readings.some(form=>form.pos.includes('adjective')) ? 'compound' : 'modifier';
    };
    if (color.length===1) for (const range of phrase.modifiers) {
      if (forms[range[0]].some(form=>form.end===range[1] && form.colors.some(([,value])=>value===color[0]))) {
        semanticEvidence.push({wire:id,key:'color',sourceSlot:modifierRole(range),source:span(range)});
      }
    }
    lines.push('@'+id+' nlu.entity'+identity+nominalModifier(phrase.determiner,'determiner')+
      phrase.modifiers.map(range=>nominalModifier(range,modifierRole(range))).join('')+
      atom('kind',kinds.length===1 && !groundedName?kinds[0]:undefined)+atom('color',color.length===1?color[0]:undefined));
    return id;
  }
  function group(ids, joins) {
    if (!joins.length) return ids[0];
    const id='g'+nextCoordination++;
    for (const join of joins) semanticEvidence.push({wire:id,key:'kind',sourceSlot:'cue',source:span(join.cue)});
    lines.push('@'+id+' nlu.coordination'+atom('kind',coordinationKind(joins[0].kind))+
      ids.map(member=>ref('member',member)).join('')+joins.map(join=>raw('cue',join.cue)).join(''));
    return id;
  }
  const clauses=[];
  function flatten(items) {
    let previous;
    for (const node of items) {
      const id='c'+(clauses.length+1);
      const entry={node,id,previous};
      clauses.push(entry);
      if (node.embedded.length) {
        entry.embedded='c'+(clauses.length+1);
        flatten(node.embedded);
      }
      previous=id;
    }
  }
  flatten(analysis.clauses);
  for (const {node:{join}} of clauses) {
    if (!join.length) continue;
    for (let at=join[0];at<join[1];at++) covered.add(at);
  }
  for (const {node:clause,id,previous,embedded} of clauses) {
    const request=matchingRequest(clause,candidate,span);
    const act=possibleAct(clause,request);
    const targets=request ? candidate.filter(wire=>wire.type==='w.request.target' &&
      field(wire,'request')==='$'+request.id) : [];
    const entitiesBySource=new Map();
    const remember=(phrase,options)=> {
      const wire=entity(phrase,options);
      entitiesBySource.set(phrase.from,wire);
      return wire;
    };
    const subjects=clause.subjects.map(phrase=>remember(phrase));
    const subject=group(subjects,clause.subjectCoordinations);
    const objects=clause.objects.map(phrase=>remember(phrase,targets));
    let indirectObject=clause.indirect[0] && entity(clause.indirect[0]);
    for (const item of clause.relations) {
      const selectedOwner=item.cue[0]===attachment?.cue ? attachment.owner : item.owner;
      const ownerWire=entitiesBySource.get(selectedOwner);
      const target=group(item.entities.map(phrase=>remember(phrase)),item.coordinations);
      const relation='r'+nextRelation++;
      const relationKind = ()=>semanticEvidence.push({wire:relation,key:'kind',sourceSlot:'cue',source:span(item.cue)});
      const licensed = item.markers.filter(([license])=>license==='*' || act===license);
      const roles = uniq(licensed.map(([,role])=>role).filter(role=>['source','destination','recipient','beneficiary'].includes(role)));
      if (roles.length===1 && ['recipient','beneficiary'].includes(roles[0]) && !indirectObject) {
        indirectObject=target;
        relationKind();
        lines.push('@'+relation+' nlu.relation'+atom('kind',roles[0])+ref('from',id)+ref('to',target)+raw('cue',item.cue));
        continue;
      }
      const kind = item.kinds[0]==='agent' ? 'agent' :
        roles.length===1 ? roles[0] : uniq(licensed.map(([, ,marker])=>marker))[0] ?? item.kinds[0];
      const owner = ownerWire ?? (item.attachment==='subject' ||
        clause.predicate[0]===clause.predicate[1] ? subject ?? id : id);
      relationKind();
      lines.push('@'+relation+' nlu.relation'+atom('kind',kind)+ref('from',owner)+ref('to',target)+raw('cue',item.cue));
    }
    const object=group(objects,clause.coordinations);
    if (clause.join.length) {
      const [start,end,kind]=clause.join;
      if (kind==='condition') {
        const relation='r'+nextRelation++;
        semanticEvidence.push({wire:relation,key:'kind',sourceSlot:'cue',source:span([start,end])});
        lines.push('@'+relation+' nlu.relation kind=condition'+
          ref('from',id)+ref('to',previous)+raw('cue',[start,end]));
      } else {
        const coordination='g'+nextCoordination++;
        semanticEvidence.push({wire:coordination,key:'kind',sourceSlot:'cue',source:span([start,end])});
        lines.push('@'+coordination+' nlu.coordination'+atom('kind',coordinationKind(kind))+
          ref('member',previous)+ref('member',id)+raw('cue',[start,end]));
      }
    }
    const role = clause.predicate[0]===clause.predicate[1] ? 'topic' : 'subject';
    const resultColors=clause.complement.length ? uniq(forms[clause.complement[0]]
      .filter(form=>form.end===clause.complement[1]).flatMap(form=>form.colors.map(([,color])=>color))) : [];
    if (act) {
      semanticEvidence.push({wire:id,key:'act',sourceSlot:'predicate',source:span(clause.predicate)});
      if (clause.particle.length) semanticEvidence.push({wire:id,key:'act',sourceSlot:'particle',
        source:span(clause.particle)});
    }
    if (clause.negation.length) for (const range of clause.negation) semanticEvidence.push({
      wire:id,key:'polarity',sourceSlot:'negation',source:span(range)});
    if (resultColors.length===1) semanticEvidence.push({wire:id,key:'result_color',
      sourceSlot:'result_complement',source:span(clause.complement)});
    if (clause.speechAct) semanticEvidence.push({wire:id,key:'speech_act',
      sourceSlot:'expression',source:span(clause.expression)});
    const discourseFields=(clause.expression ? raw('expression',clause.expression) : '')+
      atom('speech_act',clause.speechAct)+
      (clause.separators ?? []).map(range=>raw('separator',range)).join('');
    const fields=discourseFields+raw('predicate',clause.predicate)+ref(role,subject)+
      ref('direct_object',object)+ref('indirect_object',indirectObject)+ref('clausal_complement',embedded)+raw('result_complement',clause.complement)+
      clause.auxiliary.map(range=>raw('auxiliary',range)).join('')+
      clause.negation.map(range=>raw('negation',range)).join('')+raw('particle',clause.particle)+
      (clause.marker ? raw('marker',clause.marker) : '')+raw('question',clause.question)+raw('terminator',clause.terminator)+
      clause.adverb.filter(([start,end])=>Array.from({length:end-start},(_,offset)=>start+offset)
        .every(at=>!covered.has(at))).map(range=>raw('adverb',range)).join('')+
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
  return {sop:lines.join('\n'),semanticEvidence};
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
    const enriched=candidates.map(candidate=>circuit(text,source,forms,analysis,parse(candidate.sop)));
    const decorated=candidates.map((candidate,index)=>({...candidate,
      analysisSop:enriched[index].sop,analysisEvidence:enriched[index].semanticEvidence}));
    const alternatives=analysis.attachments
      .map(attachment=>circuit(text,source,forms,analysis,undefined,attachment));
    const proposals=new Map([base,...alternatives,...enriched].map(proposal=>[proposal.sop,proposal]));
    return {analyses:[...proposals.values()],candidates:decorated};
  };
}
