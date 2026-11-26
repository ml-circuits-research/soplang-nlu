import {measuredMotionReadings} from './measured-motion.mjs';
import {landmarkPairReadings} from './landmark-pairs.mjs';
import {coordinatedRequestReadings,sentenceRequestReadings} from './sentence-requests.mjs';
import {relativePlacementPacket,requestIntentPlans,resultRequestReading,unresolvedDestinationReadings,withRequestIntents} from './request-intents.mjs';
import {orderingPacket} from './ordering.mjs';
import {countOperandConflicts,keepConflictingCountsUnread} from './count-operands.mjs';
import {namedTupleReading,tupleAssignments,tupleTargetNames} from './tuple-assignments.mjs';
import {benefactiveReadings} from './benefactive.mjs';
import {participantAdjunctReadings} from './participant-adjunct.mjs';
import {universalInventoryPacket} from './universal-inventory.mjs';
import {sourceContainerMatch,sourceContainerReading,sourceFramePlans} from './source-container.mjs';
import {setExclusionReadings} from './set-exclusion.mjs';
import {spatialModifierReadings} from './spatial-modifier.mjs';
import {dependentOperandReadings} from './dependent-operands.mjs';
import {createDialogueCoverage} from './dialogue-coverage.mjs';
import {createEffectSequence} from './effect-sequence.mjs';
import {ellipticalPropertyReadings,ownedEffectReadings} from './owned-effects.mjs';
import {adjacentSelectorReading,createAppositiveSelectorReader} from './appositive-selector.mjs';
import {quantifiedVerbReadings} from './quantified-verb.mjs';
import {createTopicCommands,topicCommandPacket,topicCommandReading} from './topic-commands.mjs';
import {postposedCause,postposedClauseReadings,readsCauseAsCommand,withPostposedCause} from './postposed-clause.mjs';
import {standingPositionReadings,trailingStandingReadings} from './standing-position.mjs';
import {incidentalModifier,withIncidentalModifier} from './incidental-modifiers.mjs';
import {analyticalAdjunctBindings,analyticalOwnerBindings} from './analytical-frames.mjs';
import {orientationLandmarkReadings} from './orientation-landmark.mjs';
import {reciprocalReading} from './reciprocal-reading.mjs';
import {spatialAnchorReadings} from './spatial-anchor.mjs';
import {discourseReason,discourseReasonReading} from './discourse-reason.mjs';
import {sequenceReferenceReadings} from './sequence-reference.mjs';
import {nativePropertyPacket,nativePropertyReadings} from './native-property-frames.mjs';
import {namedRetentionReadings,preservationAdjunct,preservationAdjunctReading,retentionCorrectionReadings} from './preservation-adjunct.mjs';
import { directionalResultCandidates } from './directional-result.mjs';
import { verbEffectIndex,verbEffectReading } from './verb-effects.mjs';
import { transformationReadings } from './transformation.mjs';
import { numberedCreationReadings, numberedQualifierReadings } from './numbered-qualifier.mjs';
import { coordinatedPacket,effectReading } from './coordinated-effects.mjs';
import { detachedDiscourse,discourseBody,politeBody } from './trailing-discourse.mjs';
import { memberActionPackets,memberActionReadings } from './member-actions.mjs';
import { affectedTargetCandidates } from './affected-target.mjs';
import { fitsNumericAssignment,numericAssignmentReadings,numericAssignmentRoles,ownerPropertyReadings } from './owner-property.mjs';
import { serialize } from './knowledge.mjs';
import { alternateBodies } from './request-alternations.mjs';
import { evidenceReport, literalRanges } from './evidence.mjs';
import {createEndpointReferenceReader} from './endpoint-reference.mjs';
import {createCompoundReferenceReader} from './compound-reference.mjs';
import {nominalScaleReading} from './nominal-scales.mjs';
import { sequencePacket,sequenceReading,sequenceFrameReading,sequenceScopeText } from './argument-sequences.mjs';
import { fixedPropertyReadings } from './fixed-properties.mjs';
import { nominalClassReading } from './nominal-class.mjs';
import { identitySelectorReadings } from './identity-selectors.mjs';
import { openPairReadings } from './open-pairs.mjs';
import { clauseQualifiers } from './clause-qualifiers.mjs';
import { nativeNominalPhraseReadings, nominalHeadingReadings } from './nominal-phrases.mjs';
import { sequenceNameReadings } from './sequence-names.mjs';
import { collectionQuestions, postfixSetQuestions, prefixSetQuestions, universalTargetReading } from './set-query.mjs';
import { ellipticalNominals } from './nominal-selectors.mjs';
import { keepOwnedQuotesLiteral, literalAttachments, numericSettingsInOwnedQuotes, quotedLiteralCleanup } from './literal-attachment.mjs';
import { nominalNumberReading } from './nominal-number.mjs';
import { keepWrittenDesignations,namedTargetReading } from './target-names.mjs';
import { catalogIssues } from './catalog.mjs';
import { frameSupport } from './language-frames.mjs';
import { closedRequestReadings } from './closed-requests.mjs';
import { removalWishReadings } from './removal-wishes.mjs';
import { referenceCommandReadings, splitTargetPlans } from './reference-commands.mjs';
import { prologWorker } from './prolog-worker.mjs';
import { requestScope } from './request-scope.mjs';
import { sceneParts } from './scene-parts.mjs';
import { guardedPropertyReadings } from './guarded-properties.mjs';
import { createRelationKeyResolver } from './relation-keys.mjs';
import { createInstanceReferenceReader } from './instance-references.mjs';
import { signatures } from './signatures.mjs';
import { tokens } from './lexicon.mjs';
import { literalRoleCandidates, maskQuoted, quotedSpans } from './literal-roles.mjs';
import { namedArgumentCandidates } from './named-arguments.mjs';
import { clausePrefixes, composableWires, composeParts, coordinationActs, enumeratedParts, sequenceParts, visibleTokens } from './composition.mjs';
import { constraintGrounder, evidenceInText } from './grounding.mjs';
import { parse, validate } from './schema.mjs';

const conditionalScope = Symbol('conditional scope');

function add(map, key, item) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(item);
}

const valueOf=(wire,key)=>{
  const raw=wire.attrs[key]?.[0];
  return raw?.startsWith('"') ? JSON.parse(raw) : raw;
};

function spatialOverlap(hits,chars,ts) {
  const markers=hits.filter(([, , [role,,slot,relation]])=>
    role==='marker' && relation && ['spatial','place'].includes(slot));
  const byEnd=new Map(), byPropertyEnd=new Map();
  const previousEnd=new Map(ts.slice(1).map((token,i)=>[token[2],ts[i][3]]));
  for (const marker of markers) add(byEnd,marker[1],marker);
  for (const hit of hits) {
    if (hit[2][0]==='constraint' && typeof hit[2][3]==='string' && hit[2][3].includes('key_words='))
      add(byPropertyEnd,hit[1],hit);
  }
  const omitted=new Set(), evidence=[];
  for (const longer of markers) {
    const [start,end,[,license,slot]]=longer;
    for (const [boundary,,[,shortLicense,shortSlot,relation]] of byEnd.get(end)) {
      if (boundary<=start || shortLicense!==license || shortSlot!==slot) continue;
      for (const [propertyStart,,[,,family,body]] of byPropertyEnd.get(previousEnd.get(boundary)) ?? []) {
        if (propertyStart>=start) continue;
        const [property]=parse('@p w.request.constraint '+body);
        const key=valueOf(property,'attribute'), value=valueOf(property,'value');
        if (!key || !value || valueOf(property,'operator')!=='eq' || valueOf(property,'on')!=='attribute' ||
            !valueOf(property,'key_words') || property.attrs.want) continue;
        omitted.add(longer);
        evidence.push({family,key,value,relation,marker:chars.slice(boundary,end).join('')});
      }
    }
  }
  if (!omitted.size) return;
  return {hits:hits.filter(hit=>!omitted.has(hit)),evidence};
}

function keepsSpatialOverlap(sop,evidence) {
  const wires=parse(sop), constraints=wires.filter(w=>w.type==='w.request.constraint');
  return evidence.some(({family,key,value,relation,marker})=>wires.some(target=>
    target.type==='w.request.target' && valueOf(target,'family')===family &&
    constraints.some(field=>valueOf(field,'request')===valueOf(target,'request') &&
      valueOf(field,'attribute')===key && valueOf(field,'value')===value) &&
    constraints.some(field=>valueOf(field,'request')===valueOf(target,'request') &&
      valueOf(field,'relation')===relation && valueOf(field,'words')?.startsWith(marker+' '))));
}

// The index eliminates impossible candidates. Prolog unifies the full pattern,
// binds the raw input spans and orders the resulting circuits.
export function createFormaliser(worlds, {languageFrames=true, swipl} = {}) {
  const nativeHead=(surface,act)=>surface===act || worlds.languageFrames.fixedPredicates.has(surface);
  const pairGrammars=[worlds.openPairs].filter(Boolean);
  const openPairHeads=new Set(pairGrammars.flatMap(grammar=>
    Object.values(grammar).flatMap(frames=>frames.map(f=>f.prefix[0]))));
  const dialogueCoverage=createDialogueCoverage(worlds);
  const appositiveSelector=createAppositiveSelectorReader(worlds);
  const topicGrammar=createTopicCommands(worlds);
  const effectSequence=createEffectSequence(worlds);
  const targetRoles=[...new Set(worlds.languageFrames.bindings.filter(b=>b.type==='w.request.target').map(b=>b.role))];
  const verbIndex=verbEffectIndex(worlds);
  const ground = constraintGrounder();
  const resolveRelationKeys = createRelationKeyResolver(worlds);
  const compounds=createCompoundReferenceReader(worlds);
  const endpoints=createEndpointReferenceReader(worlds);
  const instanceReferences = createInstanceReferenceReader(worlds);
  const preservationKeys=new Set(worlds.preservationBindings.map(binding=>binding.attribute));
  const ordinaryAct = coordinationActs(worlds);
  const sequenceOptions = {
    isAct:(surface,context)=>worlds.requestIntents.predicates.has(surface) || ordinaryAct(surface,context),
    prefixes:clausePrefixes([...(worlds.literalGrammar?.leads ?? []),
      ...(worlds.discourse ?? []).filter(({class:kind})=>kind==='politeness' || kind==='interjection').map(({text})=>text)]),
  };
  const politeness=new Set(worlds.discourse.filter(({class:kind})=>kind==='politeness')
    .map(({text})=>tokens(text).map(([key])=>key).join(' ')));
  let lastAssignmentText, lastAssignment;
  function assignmentRole(text) {
    if (lastAssignmentText!==text) {
      lastAssignment=numericAssignmentRoles(text,worlds);
      lastAssignmentText=text;
    }
    return lastAssignment;
  }
  function admissibleKey(text, sop) {
    if (!sop || !validate(sop,worlds) || !evidenceInText(text,sop,worlds)) return;
    const wires = parse(sop);
    if (wires.some(wire=>wire.type==='w.request.previous' ||
        wire.type==='w.request.lookup' && valueOf(wire,'from')==='previous')) return;
    const requests=wires.filter(wire=>wire.type==='w.request.request');
    for (const request of requests) {
      const clause=valueOf(request,'words');
      const role=(requests.length===1 ? assignmentRole(text) : undefined) ?? (clause && assignmentRole(clause));
      if (role && !fitsNumericAssignment(role,request,wires)) return;
    }
    if (catalogIssues(wires,worlds).length) return;
    if (countOperandConflicts(text,wires,worlds).length) return;
    if (numericSettingsInOwnedQuotes(text,wires,worlds).length) return;
    return JSON.stringify(signatures(wires,true));
  }
  const classHeads = new Set([...(worlds.nominalClasses?.values() ?? [])].flatMap(forms => [...forms.keys()]));
  const numberHeads = new Set([...worlds.nominalNumbers.keys()].map(term=>term.split(' ')[0]));
  const positionHeads = new Set([...(worlds.nominalPositions?.values() ?? [])].flatMap(forms => [...forms.keys()]));
  const ownerNouns=new Set([...worlds.ownerInventory.keys()].map(key=>JSON.parse(key)[1]));
  const nounEvidence=surface=>ownerNouns.has(surface) ? [['target']] :
    worlds.lookup(surface).filter(([role])=>role==='target');
  const worker = prologWorker(new URL('../prolog/formalise.pl',import.meta.url),swipl);
  async function read(text) {
    if (typeof text !== 'string') throw Error('Expected a text string');
    const ts = tokens(text), chars = Array.from(text);
    const ambiguousTargets = [], hits = [], determiners = [], properties = [];
    const inflectionHits = [], inflectionTargets = [], declaredActs = [], nominalHeads = [], frameTargets = [];
    const demonstratives=ts.some(([key])=>worlds.determiners[key]==='demonstrative');
    // A quoted label may itself contain punctuation, negation or a sequence word.
    // Its span remains available to property binding in Prolog.
    const quotes = quotedSpans(text);
    const language = languageFrames ? worlds.languageFrames.prepare(ts,quotes,worlds) : {length:ts.length,events:[],frames:[]};
    const relativePlacement=languageFrames ? relativePlacementPacket(ts,quotes,worlds) : undefined;
    const splitPlans=languageFrames && !quotes.length ? splitTargetPlans(text,ts,worlds,politeness) : [];
    const splitNominals=[], splitNumbers=[];
    const scopeText = maskQuoted(text,quotes);
    const outside = scopeText === text ? null : new Set(tokens(scopeText).map(t => t[2]));
    const amounts=ts.flatMap((_,start)=>worlds.motionAmountPhrases.flatMap(words=>
      words.every((word,i)=>ts[start+i]?.[0]===word && (!outside || outside.has(ts[start+i][2]))) ?
        [[start,start+words.length]] : []));
    for (let i=0; i<ts.length; i++) {
      let words = '';
      for (let j=i; j<ts.length && j<i+8; j++) {
        if (outside && !outside.has(ts[j][2])) break;
        words += (j===i?'':' ') + ts[j][0];
        for (const property of worlds.properties(words)) properties.push([ts[i][2],ts[j][3],property]);
        for (const tuple of worlds.tuples(words)) {
          const labelled = tupleAssignments(ts,j+1,tuple.labels);
          if (labelled || /^(?:[0-9]+|[(:=+-])$/u.test(ts[j+1]?.[0] ?? '')) {
            properties.push([ts[i][2],ts[j][3],labelled ? {...tuple,...labelled} : tuple]);
          }
        }
        if (Object.hasOwn(worlds.determiners,words)) determiners.push([ts[i][2],ts[j][3],worlds.determiners[words]]);
        const declared = worlds.lookup(words);
        if ((['ordinal','cardinal'].includes(worlds.nominalNumbers.get(words)?.kind) || /^\d{1,8}$/u.test(words)) &&
            splitPlans.some(plan=>ts[i][2]>=plan.nounStart && ts[j][3]<=plan.nounEnd)) {
          splitNumbers.push([ts[i][2],ts[j][3]]);
        }
        if (splitPlans.some(plan=>ts[i][2]>=plan.nounStart && ts[j][3]===plan.nounEnd)) {
          const lookup=surface=>[...worlds.frameTargets(surface),...worlds.lookup(surface)]
            .filter(([role,, ,mode])=>role==='target' && mode==='existing');
          const entries=lookup(words);
          for (const entry of entries.length ? entries : worlds.nominalInflection(words,lookup)) {
            splitNominals.push([ts[i][2],ts[j][3],entry.slice(0,6)]);
          }
        }
        if (language.frames.length || relativePlacement) {
          const direct=worlds.frameTargets(words);
          const entries=direct.length ? direct : worlds.nominalInflection(words,worlds.frameTargets);
          for (const entry of entries) frameTargets.push([ts[i][2],ts[j][3],entry.slice(0,6),entry[6]]);
        }
        const nativeActs = [...new Set(declared.filter(([role])=>role==='act').map(([,act])=>act))];
        if (nativeActs.length) {
          declaredActs.push([ts[i][2],ts[j][3],nativeActs,nativeActs.length===1 && nativeHead(words,nativeActs[0])]);
        }
        const families = new Set(declared.filter(e=>e[0]==='target').map(e=>e[2]));
        if (demonstratives && !worlds.referenceCommands.particles.has(words) &&
            (families.size || ownerNouns.has(words) || worlds.nominalInflection(words,nounEvidence).length)) {
          nominalHeads.push([ts[i][2],ts[j][3]]);
        }
        if (!families.size) {
          const senses = worlds.nominalInflection(words, worlds.lookup);
          for (const entry of senses) {
            inflectionHits.push([ts[i][2],ts[j][3],entry,0]);
            inflectionTargets.push([entry[2],entry[4],chars.slice(ts[i][2],ts[j][3]).join('')]);
          }
        }
        if (families.size>1) ambiguousTargets.push([ts[i][2],ts[j][3], [...families]]);
        for (let entry of declared) {
          const [role] = entry;
          if (role === 'act' && Object.hasOwn(worlds.determiners,words) && !Object.hasOwn(worlds.lexicon,words)) continue;
          if (role === 'constraint') {
            if (Object.hasOwn(worlds.determiners,words)) continue;
            entry = ground(entry,chars.slice(ts[i][2],ts[j][3]).join(''));
            if (!entry) continue;
            if (amounts.some(([start,end])=>i>=start && j<end && j-i+1<end-start) &&
                preservationKeys.has(valueOf(parse('@c w.request.constraint '+entry[3])[0],'attribute'))) continue;
          }
          hits.push([ts[i][2],ts[j][3],entry,0]);
        }
      }
    }
    const tupleNames = tupleTargetNames(ts,properties,hits,quotes,worlds);
    const scope = requestScope(text,maskQuoted(scopeText,tupleNames),worlds,hits);
    hits.push(...scope.intentHits);
    const allowConstraints = scope.windows.length > 0;
    const sourceFrames=languageFrames && frameTargets.length && !scope.restricted ?
      sourceFramePlans(text,ts,quotes,worlds) : [];
    const topicCommands=scope.restricted ? undefined : topicCommandPacket(text,ts,quotes,worlds,topicGrammar);
    const argumentSequences=quotes.length ? [] : sequencePacket(ts,worlds,scope.restricted,text);
    const memberActions=scope.restricted ? [] : memberActionPackets(text,ts,quotes,worlds);
    const coordinatedEffects=scope.restricted || quotes.length ? undefined : coordinatedPacket(ts,worlds);
    const verbEffects=scope.restricted || quotes.length ? [] : [...new Set(ts.map(t=>t[0]))].flatMap(head=>verbIndex.get(head) ?? []);
    const nativeProperties=nativePropertyPacket(text,ts,quotes,worlds,{questionsOnly:scope.restricted});
    const titleConnectors = ts.map(([key])=>key).filter(key=>worlds.evidenceVocabulary.grammar.has(key));
    const universalInventory=scope.restricted ? undefined : universalInventoryPacket(ts,quotes,worlds);
    // Pass the comma boundary and world-licensed roles to the independent
    // fronted search. Ordinary search keeps its own alternatives and limits.
    const comma=ts.findIndex(([key])=>key===',');
    const frontedPlan=!scope.restricted && !quotes.length && comma>0 && comma<ts.length-2 &&
      !ts.slice(comma+1).some(([key])=>[',',';','?'].includes(key)) &&
      hits.some(([start,,[role]])=>start===ts[comma+1][2] && role==='act') &&
      hits.some(([,end,[role,,slot]])=>end<=ts[comma][2] && role==='marker' && ['place','spatial'].includes(slot)) ? {
        comma:ts[comma][2],anchorEnd:ts[comma-1][3],predicate:ts[comma+1][2],
        acts:[...new Set(worlds.spatialBindings.flatMap(binding=>binding.namedActs))],
        modifiers:[...worlds.spatialModifiers.rules.keys()].map(words=>words.split(/\s+/u)),
      } : undefined;
    const ordering=languageFrames && !scope.restricted ? orderingPacket(ts,quotes,worlds) : undefined;
    const request = {text,ordering,relativePlacement:scope.restricted?undefined:relativePlacement,frontedPlan,universalInventory,topicCommands,nativeProperties,verbEffects,coordinatedEffects,memberActions,argumentSequences,scopes:scope.windows,language,declaredActs,nominalHeads,frameTargets,sourceFrames,splitPlans:scope.restricted?[]:splitPlans,splitNominals,splitNumbers,targetRoles,ambiguousTargets,allowConstraints,tokens:ts,hits,determiners,properties};
    const candidates = [], seen = new Set();
    function retain(answer,readingScope=scope,preferCompleteEvidence=false) {
      answer=keepOwnedQuotesLiteral(text,answer,worlds);
      answer=keepConflictingCountsUnread(text,answer,worlds);
      const key = admissibleKey(text,answer.sop);
      if (!key || readingScope.restricted && !readingScope.permits(parse(answer.sop))) return;
      if (!seen.has(key)) { seen.add(key); candidates.push(answer); return true; }
      if (!preferCompleteEvidence) return;
      // Equivalent readings can differ in how much written evidence they
      // attach. Keep the complete proof when it grounds more of the text.
      const wires=parse(answer.sop);
      if (wires.some(wire=>wire.type==='w.request.unread')) return;
      const current=evidenceReport(text,wires,worlds.evidenceVocabulary);
      if (current.missing.length || current.counts.uncovered || current.counts.ambiguous_occurrence) return;
      const index=candidates.findIndex(candidate=>JSON.stringify(signatures(parse(candidate.sop),true))===key);
      if (index<0) return;
      const previous=evidenceReport(text,parse(candidates[index].sop),worlds.evidenceVocabulary);
      if ((current.counts.grounded ?? 0)>(previous.counts.grounded ?? 0)) {
        candidates[index]=answer;
        return true;
      }
    }
    const nominalRoles=new Set();
    let exclusive=false;
    // Closed frames account for the entire current utterance, including
    // negative words that express a desired state rather than a prohibition.
    if (!quotes.length) for (const {exclusive:complete,...reading} of closedRequestReadings(text,ts,worlds,politeness)) {
      if (retain(reading,{restricted:false}) && complete) exclusive=true;
    }
    if (scope.restricted && !quotes.length) for (const reading of removalWishReadings(text,ts,worlds,politeness)) {
      retain(reading,{restricted:false});
    }
    if (!scope.restricted && !quotes.length) {
      const referenceReadings=referenceCommandReadings(text,ts,worlds,politeness);
      let referenceKept=false;
      for (const {exclusive:_complete,...reading} of referenceReadings) {
        if (retain(reading)) referenceKept=true;
      }
      exclusive ||= referenceKept && referenceReadings.every(reading=>reading.exclusive);
      for (const reading of ellipticalPropertyReadings(text,ts,worlds,politeness)) retain(reading);
      for (const {nominalWords,...reading} of ellipticalNominals(text,ts,worlds,politeness)) {
        const {missing,counts}=evidenceReport(text,parse(reading.sop),worlds.evidenceVocabulary);
        if (missing.length || counts.uncovered || counts.unread || counts.ambiguous_occurrence) continue;
        if (!retain(reading)) continue;
        for (const phrase of nominalWords) nominalRoles.add(phrase);
      }
    }
    if (exclusive) {
      const [first,...alternatives]=candidates;
      return {...first,alternatives,[conditionalScope]:false};
    }
    const assignment=!scope.restricted && assignmentRole(text);
    if (assignment) for (const reading of numericAssignmentReadings(text,assignment)) retain(reading);
    for (const candidate of namedArgumentCandidates(text,ts,quotes,worlds,sequenceOptions)) retain(candidate);
    for (const candidate of literalRoleCandidates(text,ts,quotes,worlds)) retain(candidate);
    if (!scope.restricted) {
      for (const candidate of unresolvedDestinationReadings(text,ts,worlds)) retain(candidate);
    }
    if (!scope.restricted && !quotes.length) {
      const result = resultRequestReading(text,ts,worlds);
      if (result) retain(result);
    }
    const contextualTargets = [];
    const response = await worker.request(request);
    for (const answer of response.candidates) {
      if (answer.source !== 'lexicon') { retain(answer); continue; }
      if (nominalRoles.size && parse(answer.sop).some(wire=>{
        if (wire.type!=='w.request.request') return false;
        const predicate=valueOf(wire,'predicate');
        return nominalRoles.has(predicate) &&
          !worlds.lookup(tokens(predicate).map(([key])=>key).join(' ')).some(([role,act])=>
            role==='act' && act===valueOf(wire,'act'));
      })) continue;
      const lexical = {...answer,sop:resolveRelationKeys(answer.sop)};
      for (const plan of tupleNames) {
        const named = namedTupleReading(text,lexical,plan,worlds);
        if (named) retain(named);
      }
      retain(lexical);
      for (const attachment of literalAttachments(text,lexical,worlds)) retain(attachment);
      const named = namedTargetReading(text,lexical,worlds);
      if (named) retain(named);
      for (const sop of resolveRelationKeys.targetlessAlternatives(answer.sop)) {
        contextualTargets.push({...answer,sop});
      }
    }
    const incompleteSplitTargets=[];
    for (const {needsNumber,...answer} of response.splitTargets ?? []) {
      const sop=resolveRelationKeys(answer.sop);
      const reading={...answer,sop,source:'split-target-frame'};
      // An exact contiguous predicate encloses the nominal. Publish it only
      // after the enclosed words have an interpretation of their own.
      if (needsNumber || parse(sop).some(wire=>wire.type==='w.request.unread')) incompleteSplitTargets.push(reading);
      else retain({...reading,status:'matched'},scope,true);
    }
    for (const answer of response.frameTargets ?? []) {
      const sop=resolveRelationKeys(answer.sop);
      const partial=parse(sop).some(wire=>wire.type==='w.request.unread');
      retain({...answer,sop,source:'frame-target-inventory',status:partial?'partial':'matched'});
    }
    for (const answer of response.frontedCandidates ?? []) {
      for (const sop of [resolveRelationKeys(answer.sop),...resolveRelationKeys.targetlessAlternatives(answer.sop)]) {
        const wires=parse(sop), target=wires.find(w=>w.type==='w.request.target');
        if (!target) continue;
        const act=valueOf(wires.find(w=>w.type==='w.request.request'),'act');
        const allowed=worlds.spatialBindings.filter(b=>b.family===valueOf(target,'family') && b.namedActs.includes(act));
        if (wires.some(w=>w.type==='w.request.constraint' && valueOf(w,'phase')==='result' &&
            allowed.some(b=>b.relationKey===valueOf(w,'attribute')))) retain({sop,source:'fronted-destination'});
      }
    }
    const dialogue=dialogueCoverage(text);
    if (dialogue) retain(dialogue);
    // The ordinary search prefers a longer marker. If its prefix also
    // finishes a grounded property, try the native suffix marker separately.
    const competing=allowConstraints && !scope.restricted && spatialOverlap(hits,chars,ts);
    if (competing) {
      const alternative=await worker.request({...request,hits:competing.hits,
        argumentSequences:[],
        coordinatedEffects:undefined,verbEffects:[]});
      for (const answer of alternative.candidates) {
        if (answer.source!=='lexicon' || !keepsSpatialOverlap(answer.sop,competing.evidence)) continue;
        retain({...answer,sop:resolveRelationKeys(answer.sop)});
      }
    }
    for (const reading of nativePropertyReadings(text,response.nativeProperties ?? [])) retain(reading);
    if (scope.restricted) for (const reading of directionalResultCandidates(text,ts,quotes,worlds)) {
      if (reading.source==='directional-prohibition') retain(reading);
    }
    if (scope.restricted) {
      for (const reading of ownedEffectReadings(text,worlds)) {
        if (reading.source==='negative-owned-effect') retain(reading);
      }
    }
    if (!scope.restricted) {
      for (const candidate of compounds(text,ts,quotes)) retain(candidate);
      for (const candidate of endpoints(text,ts,quotes)) retain(candidate);
      for (const reading of affectedTargetCandidates(text,ts,quotes,worlds)) retain(reading);
      const directional=directionalResultCandidates(text,ts,quotes,worlds);
      for (const reading of directional.filter(reading=>reading.source!=='directional-incomplete')) retain(reading);
      const firstLexical=candidates.findIndex(candidate=>candidate.source==='lexicon');
      const afterDirect=candidates.length;
      for (const reading of directional.filter(reading=>reading.source==='directional-incomplete')) retain(reading);
      if (firstLexical>=0) candidates.splice(firstLexical,0,...candidates.splice(afterDirect));
      for (const reading of namedRetentionReadings(text,worlds)) retain(reading);
      for (const reading of transformationReadings(text,ts,quotes,worlds)) retain(reading);
      for (const reading of ownedEffectReadings(text,worlds)) retain(reading);
      for (const reading of quantifiedVerbReadings(text,worlds)) retain(reading);
      for (const reading of ownerPropertyReadings(text,ts,quotes,worlds)) retain(reading);
    }
    for (const candidate of instanceReferences(text,ts,quotes,hits)) retain(candidate);
    // Family hypotheses for pronouns follow the text's own readings. The
    // independent estimator can promote one when there is supporting context.
    for (const candidate of contextualTargets) retain(candidate);
    for (const answer of response.universalCandidates ?? []) {
      const candidate={...answer,sop:resolveRelationKeys(answer.sop)};
      const reading=universalTargetReading(text,ts,worlds,candidate,quotes,answer.requiresResult);
      if (reading) retain({...reading,source:'universal-inventory'});
    }
    for (const candidate of collectionQuestions(text,ts,worlds,hits,quotes)) retain(candidate);
    for (const candidate of prefixSetQuestions(text,ts,worlds,hits,quotes)) retain(candidate);
    for (const candidate of postfixSetQuestions(text,ts,worlds,hits,quotes)) retain(candidate);
    if (!scope.restricted && ts.some(t=>worlds.scopeGrammar.universalHeads.has(t[0]))) {
      for (const candidate of [...candidates,...incompleteSplitTargets]) {
        const universal=universalTargetReading(text,ts,worlds,candidate,quotes);
        if (!universal) continue;
        const split=candidate.source==='split-target-frame';
        if (!split) retain(universal);
        else if (!parse(universal.sop).some(wire=>wire.type==='w.request.unread')) {
          retain({...universal,status:'matched'},scope,true);
        }
      }
    }
    if (!scope.restricted && worlds.nominalScales?.byFamily.size) {
      for (const candidate of [...candidates]) {
        const reading=nominalScaleReading(text,ts,quotes,candidate,worlds);
        if (reading) retain(reading);
      }
    }
    if (ts.some(t=>numberHeads.has(t[0]) || /^\d+$/u.test(t[0]))) {
      for (const candidate of [...candidates,...incompleteSplitTargets]) {
        const qualified=nominalNumberReading(text,candidate,worlds.nominalNumbers,quotes,worlds);
        if (!qualified) continue;
        if (candidate.source!=='split-target-frame') retain(qualified);
        else if (!parse(qualified.sop).some(wire=>wire.type==='w.request.unread')) {
          retain({...qualified,source:'split-target-frame',status:'matched'},scope,true);
        }
      }
    }
    if (!scope.restricted && ts.some(t=>openPairHeads.has(t[0]))) {
      for (const candidate of [...candidates]) {
        for (const grammar of pairGrammars) {
          for (const reading of openPairReadings(text,ts,quotes,candidate,grammar,worlds)) retain(reading);
        }
      }
    }
    if (inflectionHits.length) {
      // Resolve morphology on the original text in a separate search so a
      // fallback sense cannot replace an existing proposal in the beam.
      const extended = await worker.request({...request, hits:[...hits,...inflectionHits]});
      for (const answer of extended.candidates) {
        const sop = resolveRelationKeys(answer.sop);
        const used = parse(sop).some(wire => {
          if (wire.type !== 'w.request.target') return false;
          const value = key => {
            const raw = wire.attrs[key]?.[0];
            return raw?.startsWith('"') ? JSON.parse(raw) : raw;
          };
          return inflectionTargets.some(([family,sort,surface]) => value('family') === family &&
            (sort ? value('sort') === sort && value('sort_words') === surface : value('family_words') === surface));
        });
        if (!used) continue;
        const candidate = {...answer,sop,source:'nominal-inflection',status:'partial'};
        retain(candidate);
        const qualified = nominalNumberReading(text,candidate,worlds.nominalNumbers,quotes,worlds);
        if (qualified) retain(qualified);
      }
    }
    if (!scope.restricted && worlds.fixedProperties?.has(ts[0]?.[0])) {
      for (const candidate of [undefined,...candidates]) {
        for (const reading of fixedPropertyReadings(text,ts,quotes,candidate,worlds)) retain(reading,scope,true);
      }
    }
    if (!scope.restricted && ts.some(([key]) => classHeads.has(key))) {
      for (const candidate of [...candidates]) {
        const reading=nominalClassReading(text,ts,quotes,candidate,worlds);
        if (reading) retain(reading);
      }
    }
    if (!scope.restricted && ts.some(([key]) => positionHeads.has(key))) {
      for (const candidate of [...candidates]) {
        for (const reading of nativeNominalPhraseReadings(text,ts,quotes,candidate,worlds.nominalPositions,worlds)) retain(reading);
      }
    }
    if (!scope.restricted) {
      for (const candidate of [...candidates]) {
        if (candidate.sop.includes('phase=result')) {
          for (const selected of identitySelectorReadings(text,candidate,worlds)) retain(selected);
        }
      }
    }
    for (const proof of response.sequences ?? []) {
      if (proof.owned) {
        const ownerBindings=analyticalOwnerBindings(text,proof,worlds);
        const adjuncts=analyticalAdjunctBindings(text,proof,worlds,ownerBindings);
        const reading=sequenceFrameReading(text,proof,ownerBindings,worlds.argumentLabels,adjuncts);
        if (reading) {
          const reparsed=scope.restricted && sequenceScopeText(text,proof);
          if (reparsed) {
            const checked=requestScope(text,reparsed,worlds,hits);
            if (!checked.restricted) retain(reading,checked);
          } else retain(reading);
        }
        continue;
      }
      for (const candidate of [...candidates]) {
        const reading=sequenceReading(text,candidate,proof);
        if (reading) retain(reading);
      }
    }
    if (!scope.restricted && ts.some(([key])=>/\d/u.test(key) || worlds.nominalNumbers.has(key))) {
      for (const reading of numberedCreationReadings(text,ts,quotes,worlds)) retain(reading);
      for (const candidate of [...candidates]) for (const reading of numberedQualifierReadings(text,candidate,worlds)) retain(reading);
    }
    if (response.verbEffects?.length) {
      const owners=candidates.slice();
      for (const proof of response.verbEffects) for (const candidate of owners) {
        const reading=verbEffectReading(text,candidate,proof);
        if (reading) retain(reading);
      }
    }
    for (const proof of response.topicCommands ?? []) retain(topicCommandReading(text,proof));
    for (const proof of response.coordinatedEffects ?? []) retain(effectReading(text,ts,proof));
    for (const reading of memberActionReadings(text,response.memberActions ?? [],worlds)) retain(reading);
    if (!scope.restricted && !quotes.length && ts.some(([key])=>worlds.spatialModifiers?.heads.has(key))) {
      for (const candidate of [...candidates]) {
        for (const reading of spatialModifierReadings(text,candidate,worlds)) retain(reading);
      }
    }
    if (!scope.restricted && !quotes.length && ts.some(([term])=>worlds.appositiveSelectors.adjacentHeads.has(term))) {
      const offset=candidates.length;
      const lexical=candidates.findIndex(candidate=>candidate.source==='lexicon');
      for (const candidate of [...candidates]) {
        const reading=adjacentSelectorReading(text,candidate,worlds,()=>true,ts);
        if (reading) retain(reading);
      }
      if (lexical>=0) candidates.splice(lexical,0,...candidates.splice(offset));
    }
    const groundedRanges=response.groundedPredicates ?? [];
    const groundedPredicates=new Map(groundedRanges.map(([start,end,act])=>[chars.slice(start,end).join(''),act]));
    const compoundRanges=groundedRanges.filter(([start,end])=>ts.some(token=>token[2]===start && token[3]<end))
      .map(([start,end])=>[chars.slice(0,start).join('').length,chars.slice(0,end).join('').length]);
    if (groundedPredicates.size) {
      for (let i=candidates.length-1;i>=0;i--) {
        if (candidates[i].source==='split-target-frame') continue;
        const requests=parse(candidates[i].sop).filter(wire=>wire.type==='w.request.request');
        if (requests.length!==1) continue;
        const predicate=valueOf(requests[0],'predicate');
        const act=valueOf(requests[0],'act');
        const groundedAct=groundedPredicates.get(predicate);
        const declared=worlds.lookup(tokens(predicate ?? '').map(([key])=>key).join(' '));
        const occurrences=compoundRanges.length ? literalRanges(text,predicate) : [];
        const embedded=occurrences.length && occurrences.every(([start,end])=>
          compoundRanges.some(([a,b])=>start>=a && end<=b));
        if (groundedAct ? groundedAct!==act :
            predicate && (embedded || !declared.some(([role,licensed])=>role==='act' && licensed===act))) {
          candidates.splice(i,1);
        }
      }
    }
    for (const {sop,hasSource} of response.relativePlacements ?? []) {
      retain({sop,source:hasSource?'placement-with-source':'relative-placement',status:hasSource?'partial':'matched'});
    }
    for (const sop of response.orderings ?? []) retain({sop,source:'comparative-order',status:'matched'});
    if (!candidates.length) return {status:'unresolved',sop:'',unread:text,alternatives:[],[conditionalScope]:scope.preventsSplitting};
    if (response.proofs.length) {
      for (const c of candidates) {
        const proof=frameSupport(parse(c.sop),response.proofs,ts,text,worlds);
        if (proof) c.language=proof;
      }
      // Break ties between lexical fallback readings using frame evidence.
      const lexical=candidates.filter(c=>c.source==='lexicon');
      const fit=c=>c.language?.conflicts.length ? -1 : c.language?.discriminating ? 1 : 0;
      lexical.sort((a,b)=>fit(b)-fit(a));
      let i=0;
      for (let j=0;j<candidates.length;j++) if (candidates[j].source==='lexicon') candidates[j]=lexical[i++];
    }
    const [best,...alternatives] = candidates;
    return {...best,status:best.status ?? (best.source === 'lexicon' || best.unread ? 'partial' : 'matched'),alternatives,[conditionalScope]:scope.preventsSplitting};
  }
  function combine(text, parts, results, enumeration) {
    let beam = [{cost:0,clauses:[]}];
    const coverageChoice = [];
    for (const [index,result] of results.entries()) {
      const {alternatives,[conditionalScope]:_conditional,...first} = result;
      const targets = enumeration?.items[index];
      const item = targets && {act:enumeration.act,predicate:enumeration.predicate,targets};
      // Discard non-composable readings before they can occupy the beam.
      // Original rank and clause order still break ties between usable readings.
      const options = [first,...alternatives].flatMap((clause,rank)=>{
        const wires = composableWires(clause,item);
        if (!wires) return [];
        const unread = wires.filter(w=>w.type==='w.request.unread')
          .flatMap(w=>w.attrs.text ?? [])
          .reduce((sum,raw)=>sum+tokens(raw.startsWith('"') ? JSON.parse(raw) : raw).length,0);
        return [{clause,rank,unread}];
      });
      if (!options.length) return [];
      coverageChoice.push(options.reduce((a,b)=>b.unread<a.unread ? b : a).clause);
      const next = beam.flatMap(prefix => options.map(({clause,rank}) =>
        ({cost:prefix.cost+rank,clauses:[...prefix.clauses,clause]})));
      beam = next.sort((a,b)=>a.cost-b.cost).slice(0,12);
    }
    const readings = [];
    const seen = new Set();
    // An independently complete reading of each clause can fall outside the
    // rank-sum beam. Keep that combination too; validation and deduplication follow.
    for (const {clauses} of [...beam,{clauses:coverageChoice}]) {
      const sop = composeParts(parts,clauses,enumeration);
      const key = admissibleKey(text,sop);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      readings.push({sop,source:enumeration?'enumeration':'sequence',
        status:enumeration?.prefix || clauses.some(c=>c.status==='partial' || c.source==='lexicon' || c.unread) ? 'partial' : 'matched',
        parts:parts.map((text,i)=>({text,source:clauses[i].source}))});
    }
    return readings;
  }
  function mergeReadings(base, readings, preferBase) {
    if (!readings.length) return base;
    const {alternatives,...single} = base;
    const ordered = preferBase ? [single,...readings,...alternatives] : [...readings,single,...alternatives];
    const seen = new Set();
    const [best,...rest] = ordered.filter(candidate => {
      if (!candidate.sop) return false;
      const key = JSON.stringify(signatures(parse(candidate.sop),true));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return {...best,alternatives:rest};
  }
  const enumerationPlans = (text,ts = tokens(text)) => {
    const options={...sequenceOptions,visible:visibleTokens(Array.from(text),ts)};
    const scene=sceneParts(text,ts,worlds,options);
    const enumeration=enumeratedParts(text,ts,worlds,{prefixes:sequenceOptions.prefixes});
    const plans=enumeration ? (scene?.prefix || scene?.frontedLocation ? [enumeration,scene] : [enumeration]) : (scene ? [scene] : []);
    return plans;
  };
  async function readEnumeration(text, base, plans) {
    if (!plans.length || base[conditionalScope]) return base;
    const readings = [], inputs = new Map();
    for (const plan of plans) {
      const results = [];
      for (const input of plan.inputs) {
        if (!inputs.has(input)) inputs.set(input,await read(input));
        results.push(inputs.get(input));
      }
      if (plan.singleNominal) {
        const [{alternatives,...first}]=results;
        const item={act:plan.act,predicate:plan.predicate,targets:plan.items[0]};
        const [article,articleText]=tokens(text)[0];
        const determiner=worlds.determiners[article];
        const projected=(choice,predicate)=>composableWires(choice,{...item,predicate});
        const options=[first,...alternatives].map(choice=>projected(choice,item.predicate));
        // A bare quantity has no written verb. The nominal plan supplies the
        // kind and action; every word still needs independent evidence below.
        if (plan.quantity) {
          const ts=tokens(text), length=tokens(plan.quantity).length, chars=Array.from(text);
          for (const target of item.targets) {
            if (target.start!==length || ts.slice(target.end).some(([key])=>key!=='.' && key!=='!')) continue;
            const noun=chars.slice(ts[target.start][2],ts[target.end-1][3]).join('');
            const semanticHead=target.sort ? 'sort='+JSON.stringify(target.sort)+' sort_words=' : 'family_words=';
            options.push(parse('@r w.request.request act=make mood=do\n@t w.request.target request=$r mode=new family='+
              JSON.stringify(target.family)+' '+semanticHead+JSON.stringify(noun)+' quantity='+JSON.stringify(plan.quantity)+
              ' count_words='+JSON.stringify(plan.quantity)));
          }
          for (const choice of [base,...base.alternatives]) {
            if (!choice.sop || !choice.sop.includes('quantity=')) continue;
            const root=parse(choice.sop).find(w=>w.type==='w.request.request');
            if (root) options.push(projected(choice,valueOf(root,'predicate')));
          }
        }
        for (const wires of options) {
          if (!wires || wires.some(w=>['w.request.previous','w.request.clock','w.request.context'].includes(w.type))) continue;
          const req=wires.find(w=>w.type==='w.request.request');
          delete req.attrs.predicate;
          delete req.attrs.words;
          const target=wires.find(w=>w.type==='w.request.target');
          if (plan.quantity) {
            if (valueOf(target,'quantity')!==plan.quantity || target.attrs.count) continue;
            target.attrs.determiner=['quantified'];
          } else {
            if (valueOf(target,'determiner') && valueOf(target,'determiner')!==determiner) continue;
            target.attrs.determiner=[determiner];
          }
          const retained=wires.filter(w=>w.type!=='w.request.unread' ||
            valueOf(w,'text')!==articleText);
          const proof=evidenceReport(text,retained,worlds.evidenceVocabulary);
          if (proof.missing.length || proof.counts.uncovered || proof.counts.unread) continue;
          const sop=serialize(retained);
          if (admissibleKey(text,sop)) readings.push({sop,source:'nominal-creation',status:'matched'});
        }
        continue;
      }
      readings.push(...combine(text,plan.parts,results,plan));
    }
    return mergeReadings(base,readings,base.status==='matched');
  }
  async function formaliseBase(text) {
    const base = await read(text);
    if (base[conditionalScope]) {
      const guarded = await guardedPropertyReadings(text,worlds,read);
      return mergeReadings(base,guarded.filter(candidate=>admissibleKey(text,candidate.sop)),base.status==='matched');
    }
    const ts = tokens(text);
    const parts = sequenceParts(text,ts,worlds.joiners,sequenceOptions);
    if (!parts.length) {
      const enumerated=await readEnumeration(text,base,enumerationPlans(text,ts));
      const headings=await nominalHeadingReadings(text,ts,worlds,async body=>
        readEnumeration(body,await read(body),enumerationPlans(body)));
      return mergeReadings(enumerated,headings.filter(candidate=>admissibleKey(text,candidate.sop)),
        enumerated.status==='matched');
    }
    const plans = parts.map(part=>enumerationPlans(part));
    // A complete existing sequence can preserve dependencies that separate
    // lexical reads do not currently resolve.
    const complete = base.status==='matched' &&
      parse(base.sop).filter(w=>w.type==='w.request.request').length>=parts.length;
    // A matching request count does not establish that all arguments were bound.
    const plain = [], results = [];
    for (const [index,part] of parts.entries()) {
      const ordinary = await read(part);
      const enumerated = await readEnumeration(part,ordinary,plans[index]);
      const result = await attachIntents(part,enumerated,read);
      if (!result.sop) return base;
      plain.push(ordinary);
      results.push(result);
    }
    const readings = combine(text,parts,results);
    if (!results.some(r=>r[conditionalScope])) {
      for (const reading of sequenceNameReadings(parts,results,worlds,sequenceOptions)) {
        if (admissibleKey(text,reading.sop)) readings.push(reading);
      }
    }
    if (results.some((result,index)=>result!==plain[index])) readings.push(...combine(text,parts,plain));
    return mergeReadings(base,readings,
      complete || base.status==='matched' && results.some(r=>r.status!=='matched'));
  }
  async function attachIntents(text,base,readBody) {
    const readings = [];
    const crossesRequest = value => sequenceParts(value,tokens(value),worlds.joiners,
      {...sequenceOptions,requireLeftAct:false}).length > 0;
    for (const plan of requestIntentPlans(text,worlds,crossesRequest)) {
      const body = await readBody(plan.body);
      if (body[conditionalScope]) continue;
      for (const candidate of [body,...body.alternatives]) {
        if (!candidate.sop) continue;
        const reading = withRequestIntents(text,plan,candidate,worlds);
        if (reading && admissibleKey(text,reading.sop)) readings.push(reading);
      }
    }
    return mergeReadings(base,readings,base.status==='matched');
  }
  async function formalise(text) {
    return attachIntents(text,await formaliseBase(text),formaliseBase);
  }
  // A courtesy wrapper only displaces competing readings when the
  // independently read command body establishes its action.
  function politeCommandBody(text,body) {
    if (body.mode!=='request') return;
    if (body.family==='polite word') {
      const fillers=body.fillers ?? [
        body.prefix.replace(/,\s*$/u,''),
        body.suffix.replace(/^[\s,]+|[.!?。！？\s]+$/gu,''),
      ].filter(Boolean);
      return fillers.length ? {...body,fillers} : undefined;
    }
    if (body.family!=='ability question' || !body.prefix || (body.suffix && body.suffix!=='?')) return;
    let result={...body,fillers:[body.prefix]};
    for (;;) {
      const nested=alternateBodies(result.text,worlds.alternations);
      if (nested.length!==1) return result;
      const [next]=nested;
      if (next.mode!=='request' || next.family!=='polite word' || !next.prefix || next.suffix) return result;
      const start=result.start+next.start, end=result.start+next.end;
      const prefix=text.slice(0,start).trim();
      result={...body,text:next.text,start,end,prefix,fillers:[prefix]};
    }
  }
  function provedCommand(text,choices) {
    for (const {language,source,status} of choices) {
      if (!language?.discriminating || language.conflicts.length || !text.startsWith(language.predicate)) continue;
      const surface=tokens(language.predicate).map(([key])=>key).join(' ');
      const inventory=source==='frame-target-inventory' && status==='matched';
      if (!nativeHead(surface,language.act) && !inventory) continue;
      const declared=worlds.lookup(surface).filter(([role])=>role==='act');
      if (declared.length && declared.every(([,act])=>act===language.act)) return language;
    }
  }
  function lexicalActionScopes(text,requests) {
    return requests.every(request=>{
      const clause=valueOf(request,'words') ?? text;
      const predicate=valueOf(request,'predicate'), act=valueOf(request,'act'), mood=valueOf(request,'mood');
      if (!predicate || act==='ask' || (mood && mood!=='do') ||
          !literalRanges(clause,predicate).some(([start])=>start===0)) return false;
      const terms=tokens(predicate).map(([key])=>key), surface=terms.join(' ');
      return worlds.lookup(surface).some(([role,name,kind])=>role==='act' && name===act && (!kind || kind==='do')) ||
        worlds.ordering.frames.some(frame=>frame.act===act && frame.mode===valueOf(request,'mode') && frame.predicates.has(surface)) ||
        (worlds.argumentSequences.get(terms[0]) ?? []).some(frame=>frame.act===act && frame.prefix.join(' ')===surface);
    });
  }
  async function wrapped(text) {
    const base=await formalise(text);
    const {alternatives,[conditionalScope]:conditional,...first}=base;
    const candidates=first.sop ? [first,...alternatives] : [];
    if (!languageFrames || conditional) return candidates;
    const bodies=alternateBodies(text,worlds.alternations);
    if (!bodies.length) {
      const ts=tokens(text);
      if (ts.some(([key])=>/^["“”‘’']$/u.test(key))) return candidates;
      const courtesy=politeBody(text,ts,politeness,2);
      if (!courtesy?.fillers.length) return candidates;
      bodies.push({text:courtesy.span(courtesy.start,courtesy.end),mode:'request',family:'polite word',
        prefix:'',suffix:'',fillers:courtesy.fillers});
    }
    const seen=new Set(candidates.map(c=>JSON.stringify(signatures(parse(c.sop),true))));
    for (const original of bodies) {
      const modal=politeCommandBody(text,original);
      const body=modal ?? original;
      const actionOpening=body.mode==='action';
      const references=[];
      if (actionOpening) {
        const chars=Array.from(body.text);
        for (const [key,,start,end] of tokens(maskQuoted(body.text,quotedSpans(body.text)))) {
          if (worlds.isReference(key) && worlds.referenceCommands.references.has(key))
            references.push([chars.slice(0,start).join('').length,chars.slice(0,end).join('').length]);
        }
      }
      const {alternatives,...head}=await formalise(body.text);
      if (actionOpening && head[conditionalScope]) continue;
      const choices=[head,...alternatives];
      const command=modal && provedCommand(body.text,choices);
      if (original.fillers && !command) continue;
      const grounded=new Map();
      const boundaries=sequenceParts(body.text,tokens(body.text),worlds.joiners,sequenceOptions);
      for (const choice of choices) {
        if (!choice.sop) continue;
        const wires=parse(choice.sop), requests=wires.filter(w=>w.type==='w.request.request');
        if (!command && !actionOpening && wires.some(w=>w.type==='w.request.unread' &&
            !Object.hasOwn(worlds.determiners,valueOf(w,'text')?.toLowerCase()))) continue;
        if (!requests.length || requests.length<boundaries.length ||
            requests.length>1 && requests.some(r=>!r.attrs.words)) continue;
        const [request]=requests;
        if (command && (requests.length!==1 || valueOf(request,'act')!==command.act ||
            valueOf(request,'predicate')!==command.predicate || choice.language?.conflicts.length)) continue;
        if (actionOpening && (!lexicalActionScopes(body.text,requests) ||
            !wires.some(w=>['w.request.target','w.request.constraint','w.request.lookup'].includes(w.type)))) continue;
        if (body.mode==='question' && !['ask','check'].includes(request.attrs.mood?.[0]) && request.attrs.act?.[0]!=='ask') continue;
        const evidence=evidenceReport(body.text,wires,worlds.evidenceVocabulary);
        if (evidence.missing.length || evidence.counts.uncovered) continue;
        if (references.length) {
          const allowed=new Set(wires.filter(wire=>wire.type==='w.request.lookup' || wire.type==='w.request.unread' ||
            wire.type==='w.request.intent' && valueOf(wire,'role')==='destination').map(wire=>wire.id));
          if (references.some(([start,end])=>!evidence.spans.some(span=>allowed.has(span.wire) &&
              span.ranges.some(([a,b])=>a<=start && end<=b)))) continue;
        }
        if (requests.length===1) request.attrs.words=[JSON.stringify(text)];
        else if (body.prefix) {
          const firstScope=valueOf(request,'words');
          if (!body.text.startsWith(firstScope)) continue;
          request.attrs.words=[JSON.stringify(text.slice(0,body.start+firstScope.length))];
        }
        if (command || actionOpening) {
          const ids=new Set(wires.map(wire=>wire.id));
          let suffix=1;
          for (const filler of actionOpening ? [body.prefix.replace(/,\s*$/u,'')] : body.fillers) {
            while (ids.has('f'+suffix)) suffix++;
            wires.push({id:'f'+suffix++,type:'w.request.filler',attrs:{text:[JSON.stringify(filler)]}});
          }
        }
        const sop=serialize(wires);
        const key=admissibleKey(text,sop);
        if (key && command && !grounded.has(key)) {
          grounded.set(key,{sop,status:choice.status,source:'language-alternation'});
        } else if (key && !command && !seen.has(key)) {
          seen.add(key);
          candidates.push({sop,status:choice.status,source:'language-alternation'});
        }
      }
      if (grounded.size) {
        const courtesyWord=modal.family==='polite word';
        const retained=candidates.filter(candidate=>{
          const wires=parse(candidate.sop), requests=wires.filter(wire=>wire.type==='w.request.request');
          if (requests.length!==1 || valueOf(requests[0],'act')!==command.act) return false;
          const predicate=valueOf(requests[0],'predicate');
          if (courtesyWord) {
            // An independently parsed command can bind additional argument
            // markers and keep a different evidence layout.
            return predicate && literalRanges(predicate,command.predicate).length>0;
          }
          return predicate===command.predicate && !grounded.has(JSON.stringify(signatures(wires,true)));
        });
        if (courtesyWord) {
          const originalSops=new Set(retained.map(candidate=>candidate.sop));
          return [...grounded.values()].filter(candidate=>!originalSops.has(candidate.sop)).concat(retained);
        }
        return [...grounded.values(),...retained];
      }
    }
    return candidates;
  }
  return {
    formalise:async function propose(text,independent=true) {
      const candidates=await wrapped(text);
      const reason=discourseReason(text,worlds);
      if (reason) {
        const seen=new Set(candidates.map(c=>JSON.stringify(signatures(parse(c.sop),false))));
        const steps=sequenceParts(reason.body,tokens(reason.body),worlds.joiners,sequenceOptions);
        for (const candidate of await wrapped(reason.body)) {
          if (steps.length && parse(candidate.sop).filter(w=>w.type==='w.request.request').length<steps.length) continue;
          const reading=discourseReasonReading(reason,candidate);
          const key=reading && admissibleKey(text,reading.sop) && JSON.stringify(signatures(parse(reading.sop),false));
          if (key && !seen.has(key)) {seen.add(key);candidates.push(reading);}
        }
      }
      const body=discourseBody(text,worlds.trailingDiscourse);
      if (body) {
        const byMeaning=new Map(candidates.map((c,i)=>[JSON.stringify(signatures(parse(c.sop),true)),i]));
        const steps=sequenceParts(body.text,tokens(body.text),worlds.joiners,sequenceOptions);
        const coverage=wires=>evidenceReport(text,wires,worlds.evidenceVocabulary).counts;
        for (const candidate of await wrapped(body.text)) {
          const wires=parse(candidate.sop);
          if (steps.length>wires.filter(w=>w.type==='w.request.request').length) continue;
          let id='courtesy';
          while (wires.some(w=>w.id===id)) id+='_';
          wires.push({id,type:'w.request.filler',attrs:{text:[JSON.stringify(body.suffix)]}});
          const sop=serialize(wires),key=admissibleKey(text,sop);
          if (!key) continue;
          const prior=byMeaning.get(key), reading={sop,status:candidate.status,source:'trailing-discourse'};
          const previous=prior===undefined ? undefined : coverage(parse(candidates[prior].sop));
          const current=previous && coverage(wires);
          if (!previous || (current.unread ?? 0)<(previous.unread ?? 0) &&
              (current.uncovered ?? 0)<=(previous.uncovered ?? 0)) {
            byMeaning.set(key,candidates.length);
            candidates.push(reading);
          }
        }
      }
      const retained=preservationAdjunct(text,worlds);
      const retentionScope=retained?.reinforcement ? retained.body : text;
      if (retained && !requestScope(retentionScope,maskQuoted(retentionScope,quotedSpans(retentionScope)),worlds,[]).restricted) {
        const seen=new Set(candidates.map(c=>JSON.stringify(signatures(parse(c.sop),true))));
        const sequenceBody=retained.retentionWords ? incidentalModifier(retained.body,worlds)?.body ?? retained.body : retained.body;
        const steps=sequenceParts(sequenceBody,tokens(sequenceBody),worlds.joiners,sequenceOptions);
        const bodyReadings=retained.retentionWords ? (await propose(retained.body,independent)).candidates :
          await wrapped(retained.body);
        for (const base of [...bodyReadings,...candidates]) {
          if (steps.length && parse(base.sop).filter(w=>w.type==='w.request.request').length<steps.length) continue;
          const reading=preservationAdjunctReading(text,retained,base,worlds);
          const key=reading && admissibleKey(text,reading.sop);
          if (key && !seen.has(key)) {seen.add(key);candidates.push(reading);}
        }
      }
      const permit=(words,quotes)=>
        !requestScope(words,maskQuoted(words,quotes),worlds,[]).restricted;
      const canSplit=(words,quotes)=>
        !requestScope(words,maskQuoted(words,quotes),worlds,[]).preventsSplitting;
      const readWhole=async part=>(await propose(part,false)).candidates;
      const qualify=clauseQualifiers(text,worlds,permit);
      const additional=new Map();
      const separatedClauses=[];
      for (const reading of retentionCorrectionReadings(text,worlds)) {
        const key=admissibleKey(text,reading.sop);
        if (key) additional.set(key,reading);
      }
      for (const reading of standingPositionReadings(text,worlds)) {
        const key=admissibleKey(text,reading.sop);
        if (key) additional.set(key,reading);
      }
      for (const reading of await trailingStandingReadings(text,worlds,readWhole,permit,admissibleKey)) {
        additional.set(JSON.stringify(signatures(parse(reading.sop),true)),reading);
      }
      for (const reading of await measuredMotionReadings(text,worlds,wrapped,permit)) {
        const key=admissibleKey(text,reading.sop);
        if (key) additional.set(key,reading);
      }
      for (const reading of await landmarkPairReadings(text,worlds,wrapped,permit,packet=>worker.request({landmarkPair:packet}))) {
        const key=admissibleKey(text,reading.sop);
        if (key) additional.set(key,reading);
      }
      for (const reading of [...await benefactiveReadings(text,worlds,wrapped,permit), ...await participantAdjunctReadings(text,worlds,wrapped,permit), ...await effectSequence(text,read), ...await setExclusionReadings(text,worlds,read,permit,packet=>worker.request({setExclusion:packet}))]) {
        const key=admissibleKey(text,reading.sop);
        if (key) additional.set(key,reading);
      }
      if (independent) {
        const ts=tokens(text);
        const strict=sequenceParts(text,ts,worlds.joiners,sequenceOptions);
        const flexible=sequenceParts(text,ts,worlds.joiners,{...sequenceOptions,requireLeftAct:false});
        const bounded=sequenceParts(text,ts,worlds.joiners,{requireClauseBoundary:true});
        const plans=JSON.stringify(strict)===JSON.stringify(flexible) ? [strict] : [strict,flexible];
        if (bounded.length || plans.some(parts=>parts.length)) {
          const scope=requestScope(text,maskQuoted(text,quotedSpans(text)),worlds,[]);
          if (!scope.preventsSplitting) {
            const fragments=new Map();
            const readClause=part=>{
              if (!fragments.has(part)) fragments.set(part,readWhole(part));
              return fragments.get(part);
            };
            for (const parts of plans) for (const reading of await coordinatedRequestReadings(parts,worlds,readClause,canSplit)) {
              const key=admissibleKey(text,reading.sop);
              if (key && scope.permits(parse(reading.sop))) additional.set(key,reading);
            }
            for (const reading of await coordinatedRequestReadings(bounded,worlds,readClause,canSplit,{text})) {
              if (admissibleKey(text,reading.sop) && scope.permits(parse(reading.sop))) separatedClauses.push(reading);
            }
          }
        }
      }
      for (const candidate of candidates) {
        if (!candidate.sop.includes(' words=') || candidate.sop.indexOf(' w.request.request')===
            candidate.sop.lastIndexOf(' w.request.request')) continue;
        const enriched=qualify(candidate);
        if (enriched) {
          const key=admissibleKey(text,enriched.sop);
          if (key) additional.set(key,enriched);
        }
      }
      const sourceTokens=tokens(text), sourceQuotes=quotedSpans(text);
      const scaleBanks=[...worlds.nominalScales.byFamily.values()];
      if (sourceTokens.some(([key])=>scaleBanks.some(bank=>bank.forms.has(key))) && permit(text,sourceQuotes)) {
        const options={splitCompounds:true};
        const distinctModifiers=clauseQualifiers(text,worlds,permit,options);
        for (const candidate of [...candidates,...additional.values()]) {
          // Add a competing attachment after ordinary composition, so the
          // full reading of a lexical compound remains available as well.
          const single=candidate.sop.indexOf(' w.request.request')===candidate.sop.lastIndexOf(' w.request.request');
          const reading=single ? nominalScaleReading(text,sourceTokens,sourceQuotes,candidate,worlds,options) :
            distinctModifiers(candidate);
          const key=reading && admissibleKey(text,reading.sop);
          if (key) additional.set(key,reading);
        }
      }
      for (const candidate of [...candidates,...additional.values()]) {
        if (candidate.sop.indexOf(' w.request.request')===candidate.sop.lastIndexOf(' w.request.request')) continue;
        for (const reading of sequenceReferenceReadings(text,candidate,worlds,permit)) {
          const key=admissibleKey(text,reading.sop);
          if (key) additional.set(key,reading);
        }
      }
      for (const candidate of [...candidates,...additional.values()]) {
        for (const reading of spatialAnchorReadings(text,candidate,worlds,permit)) {
          const key=admissibleKey(text,reading.sop);
          if (key) additional.set(key,reading);
        }
      }
      for (const candidate of [...candidates,...additional.values()]) {
        for (const reading of dependentOperandReadings(text,candidate,worlds,permit)) {
          const key=admissibleKey(text,reading.sop);
          if (key) additional.set(key,reading);
        }
      }
      if (text.includes(',') && worlds.appositiveSelectors.bindings.length) {
        for (const candidate of [...candidates,...additional.values()]) {
          const reading=appositiveSelector(text,candidate,permit);
          const key=reading && admissibleKey(text,reading.sop);
          if (key) additional.set(key,reading);
        }
      }
      if (worlds.postposedClauses.bindings.length) {
        for (const candidate of [...candidates,...additional.values()]) {
          for (const reading of postposedClauseReadings(text,candidate,worlds,permit)) {
            const key=admissibleKey(text,reading.sop);
            if (key) additional.set(key,reading);
          }
        }
      }
      if (worlds.orientationLandmarks.bindings.length) {
        for (const candidate of [...candidates,...additional.values()]) {
          for (const reading of orientationLandmarkReadings(text,candidate,worlds,permit)) {
            const key=admissibleKey(text,reading.sop);
            if (key) additional.set(key,reading);
          }
        }
      }
      if (quotedSpans(text).length) {
        for (const candidate of [...candidates,...additional.values()]) {
          const reading=quotedLiteralCleanup(text,candidate,worlds);
          const key=reading && admissibleKey(text,reading.sop);
          if (key) additional.set(key,reading);
        }
      }
      if (worlds.reciprocal) {
        for (const candidate of [...candidates,...additional.values()]) {
          const reading=reciprocalReading(text,candidate,worlds);
          const key=reading && admissibleKey(text,reading.sop);
          if (key) additional.set(key,reading);
        }
      }
      const containerMatches=sourceContainerMatch(text,worlds);
      if (containerMatches.length) {
        for (const candidate of [...candidates,...additional.values()]) {
          const reading=sourceContainerReading(text,candidate,worlds,containerMatches);
          const key=reading && admissibleKey(text,reading.sop);
          if (key) additional.set(key,reading);
        }
      }
      if (independent) {
        for (const reading of await sentenceRequestReadings(text,worlds,readWhole,canSplit)) {
          const key=admissibleKey(text,reading.sop);
          if (key && !additional.has(key)) additional.set(key,reading);
        }
        const edge=detachedDiscourse(text,worlds.discourseEdges);
        if (edge) {
          const body=await propose(edge.body,false);
          const originalScope=requestScope(text,maskQuoted(text,quotedSpans(text)),worlds,[]);
          for (const candidate of body.candidates) {
            const wires=parse(candidate.sop);
            if (!wires.some(w=>w.type==='w.request.request') || !originalScope.permits(wires)) continue;
            for (const extra of edge.extras) {
              let id='discourse';
              while (wires.some(w=>w.id===id)) id+='_';
              wires.push({id,type:'w.request.filler',attrs:{text:[JSON.stringify(extra)]}});
            }
            const sop=serialize(wires),key=admissibleKey(text,sop);
            if (key && !additional.has(key)) additional.set(key,{sop,source:'detached-discourse',status:candidate.status});
          }
        }
      }
      if (additional.size) {
        for (const candidate of candidates) additional.delete(JSON.stringify(signatures(parse(candidate.sop),true)));
        candidates.push(...additional.values());
      }
      if (separatedClauses.length) {
        // An unread clause can contain a missing antecedent. Do not infer links
        // across it when deriving within-utterance references.
        const seen=new Set(candidates.map(c=>JSON.stringify(signatures(parse(c.sop),c.status!=='partial'))));
        for (const reading of separatedClauses) {
          const key=JSON.stringify(signatures(parse(reading.sop),reading.status!=='partial'));
          if (!seen.has(key)) {seen.add(key);candidates.push(reading);}
        }
      }
      const modifier=incidentalModifier(text,worlds);
      if (modifier) {
        const seen=new Set(candidates.map(c=>JSON.stringify(signatures(parse(c.sop),true))));
        for (const candidate of (await propose(modifier.body,independent)).candidates) {
          const reading=withIncidentalModifier(text,modifier,candidate);
          const key=reading && admissibleKey(text,reading.sop);
          if (key && !seen.has(key)) {seen.add(key);candidates.push(reading);}
        }
      }
      const cause=postposedCause(text,worlds);
      const separated=[];
      let groundedCause=false;
      if (cause && permit(cause.body,quotedSpans(cause.body))) {
        const seen=new Set(candidates.map(c=>JSON.stringify(signatures(parse(c.sop),false))));
        for (const candidate of (await propose(cause.body,independent)).candidates) {
          const reading=withPostposedCause(text,cause,candidate,worlds);
          const key=reading && admissibleKey(text,reading.sop) && JSON.stringify(signatures(parse(reading.sop),false));
          if (!key) continue;
          groundedCause=true;
          if (!seen.has(key)) {seen.add(key);separated.push(reading);}
        }
      }
      const composed=groundedCause ? [...candidates.filter(c=>!readsCauseAsCommand(text,cause,c)),...separated] : candidates;
      // Repair written designations after composition and semantic deduplication.
      const repaired=composed.map(candidate=>keepWrittenDesignations(text,candidate,worlds));
      const unique=new Map();
      for (const candidate of repaired) if (!unique.has(candidate.sop)) unique.set(candidate.sop,candidate);
      const output=repaired.some((candidate,index)=>candidate!==composed[index]) ? [...unique.values()] : repaired;
      return {candidates:output,candidateCount:output.length,multipleInterpretations:output.length>1,
        ...(!output.length ? {unread:text} : {})};
    },
    analyseSyntax:packet=>worker.request({syntaxOnly:packet}),
    close:worker.close
  };
}
