import {compileMeasuredMotion} from './measured-motion.mjs';
import {compileLandmarkPairs,landmarkPairType,landmarkSelectorsMatchCatalog} from './landmark-pairs.mjs';
import {compileRequestIntents} from './request-intents.mjs';
import {compileStructuredArguments,scalarNumber,structuredZones} from './structured-arguments.mjs';
import {compileBenefactives} from './benefactive.mjs';
import {compileParticipantAdjuncts} from './participant-adjunct.mjs';
import {compileUniversalAgreement,compileUniversalInventory,universalInventoryProviderTypes,universalInventoryType} from './universal-inventory.mjs';
import {compileSourceContainers} from './source-container.mjs';
import {compileSetExclusions} from './set-exclusion.mjs';
import {compileSpatialModifiers} from './spatial-modifier.mjs';
import {compileDependentOperands} from './dependent-operands.mjs';
import {compileDialogueCoverage} from './dialogue-coverage.mjs';
import {compileOwnedEffects} from './owned-effects.mjs';
import {compileAppositiveSelectors} from './appositive-selector.mjs';
import {compileQuantifiedVerbs} from './quantified-verb.mjs';
import {compileTopicCommandDeclarations} from './topic-commands.mjs';
import {compilePostposedClauses} from './postposed-clause.mjs';
import {compileStandingPositions,standingClosings} from './standing-position.mjs';
import {incidentalModifiers} from './incidental-modifiers.mjs';
import {analyticalAdjunctAlias,analyticalArgumentFacts,compileAnalyticalAdjuncts,compileAnalyticalOwnerProperties} from './analytical-frames.mjs';
import {compileOrientationLandmarks} from './orientation-landmark.mjs';
import {compileValidationModules} from './schema.mjs';
import {compileReciprocal} from './reciprocal-reading.mjs';
import {compileDiscourseReasons} from './discourse-reason.mjs';
import {sequenceFreshQualifiers,sequenceObjectPronouns} from './sequence-reference.mjs';
import {compileNominalNumbers} from './nominal-number.mjs';
import {compileNativePropertyFrames} from './native-property-frames.mjs';
import {compilePreservationAdjuncts} from './preservation-adjunct.mjs';
import { compileOwnerPropertyOperands } from './owner-property.mjs';
import { compileDirectionalResults } from './directional-result.mjs';
import { compileNominalSelectors,nominalSelectorProviders,nominalSelectorType } from './nominal-selectors.mjs';
import { nativeVerbEffects } from './verb-effects.mjs';
import { compileTransformations } from './transformation.mjs';
import { compileCreationRoles } from './literal-roles.mjs';
import { effectGrammar } from './coordinated-effects.mjs';
import { compileTrailingDiscourse,compileDiscourseEdges } from './trailing-discourse.mjs';
import { affectedMorphologyTypes, createAffectedParticiples } from './affected-target.mjs';
import { compileAlternations } from './request-alternations.mjs';
import {nominalScaleForms,nominalScaleTypes} from './nominal-scales.mjs';
import {argumentSequences} from './argument-sequences.mjs';
import { compileFixedProperties } from './fixed-properties.mjs';
import { nominalPositionForms,strictNominalSubjects } from './nominal-phrases.mjs';
import { spatialAliases } from './spatial-aliases.mjs';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, delimiter, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { knowledge, parse, quote, str } from './knowledge.mjs';
import { languageFrames } from './language-frames.mjs';
import { compileClosedRequests } from './closed-requests.mjs';
import { compileRemovalWishes, removalWishType } from './removal-wishes.mjs';
import { compileReferenceCommands } from './reference-commands.mjs';
import { evidenceVocabulary } from './evidence.mjs';
import { scopeGrammar } from './scope-grammar.mjs';
import { tokens } from './lexicon.mjs';
import { compileOrdering } from './ordering.mjs';
import { compileCountOperandConflicts } from './count-operands.mjs';
import { compileCodeSelectors } from './target-names.mjs';
import { createNominalInflection, nominalInflectionTypes } from './nominal-inflection.mjs';
import { nativeTargetInventory, nativeTargetInventoryType, nativeTargetProviderTypes } from './native-target-inventory.mjs';

const types = new Set([
  ...nominalInflectionTypes,...nominalScaleTypes,...affectedMorphologyTypes,
  'w.lang.en.alternation','w.lang.en.frame', 'w.lang.en.fixed', 'w.lang.en.part', 'w.lang.en.phrase',
  'w.lang.en.closed', 'w.lang.en.imperative.lead', 'w.lang.en.contraction', 'w.lang.en.contraction.ending',
  'pro.reader.nominal_pattern','pro.reader.nominal_value','pro.reader.participant_adjunct', 'pro.reader.dependent_operand','w.lang.en.answer','k.feelings.feeling',
  'pro.reader.owned_effect','pro.reader.effect_sense','pro.reader.effect_owner','pro.reader.landmark_surface','pro.reader.appositive_selector','pro.reader.quantified_verb','pro.reader.quantified_marker','pro.reader.quantified_reference','pro.reader.topic_command','pro.reader.postposed_clause','pro.reader.orientation','w.lang.en.correction','pro.reader.analytical_frame','pro.reader.analytical_owner_property','pro.reader.body_lead', 'pro.reader.owner_sort', 'pro.reader.property_quantity', 'k.units.unit',
  'pro.reader.request_intent_frame','pro.reader.unresolved_destination','w.lang.en.ellipsis.repeat','pro.reader.result_request','pro.reader.standing_position','pro.reader.incidental_modifier','pro.reader.closed_request','pro.reader.reference_command',removalWishType,
  'w.lang.en.lex','k.time.zone','pro.reader.argument_format',
  nativeTargetInventoryType, universalInventoryType, nominalSelectorType, 'pro.reader.universal_agreement', 'pro.reader.set_count', 'pro.reader.collection_question', 'core.type', 'core.word', 'std.schema.world', 'std.schema.kind', 'core.slot',
  'k.actions.act', 'k.actions.verb', 'k.actions.role', 'k.actions.marking', 'w.request.key', 'pro.reader.target', 'pro.reader.spatial', 'pro.reader.literal', 'pro.reader.preservation', 'pro.reader.tuple',
  'k.layouts.slot','pro.reader.region_form','pro.reader.retention','k.values.direction','w.lang.en.prep.time','pro.reader.motion','pro.reader.measured_motion','pro.reader.owner_inventory','k.values.comparative','pro.reader.transformation','pro.reader.spatial_surface','pro.reader.spatial_modifier','pro.reader.argument_label','pro.reader.source_container','pro.reader.landmark_pair','pro.reader.set_exclusion','pro.reader.creation_role','pro.reader.coordinated_effects','pro.reader.member_action','pro.reader.trailing_discourse','pro.reader.discourse_edge','pro.reader.sentence_addition','pro.reader.benefactive','pro.reader.affected_lead','pro.reader.affected_source','pro.reader.owner_property','pro.reader.argument_sequence','pro.reader.compound_reference','pro.reader.nominal_class', 'pro.reader.fixed_property', 'pro.reader.identity', 'w.lang.en.arrangement', 'pro.reader.arguments', 'pro.reader.question_kind', 'pro.reader.scope_cue', 'pro.reader.instance_code',
  'w.lang.en.aux', 'w.lang.en.copula', 'w.lang.en.wh',
  'w.lang.en.cue', 'w.lang.en.number', 'w.lang.en.ordinal',
  'w.lang.en.det', 'w.lang.en.prep', 'w.lang.en.pron', 'w.lang.en.anaphor', 'w.lang.en.joiner', 'w.lang.en.neg', 'w.lang.en.neg.imperative', 'w.lang.en.skip', 'pro.reader.fresh_reference',
  'w.reader.en.binding', 'w.reader.en.feature', 'w.reader.en.filter', 'pro.reader.count_operand_conflict',
]);
const wireStart = /^[\t ]*[@?][^\s]+[\t ]+([^\s#]+)/gm;
const values = (wire, key) => (wire.attrs[key] ?? []).map(str);
const one = (wire, key) => str(wire.attrs[key]?.[0]);
const phrase = text => tokens(text).map(([lower]) => lower).join(' ');
const label = value => value.replaceAll('_', ' ');

function* worldFiles(dir, overlay) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && !['preview', 'node_modules'].includes(entry.name)) {
        yield* worldFiles(file, overlay);
      }
    } else if (entry.isFile() && extname(entry.name) === '.sop') {
      if (overlay || entry.name === 'schema.sop' || dir.endsWith('/shards')) yield file;
    }
  }
}

function readFacts(file, selectedTypes) {
  const text = readFileSync(file, 'utf8');
  try {
    if (!selectedTypes) return parse(text);
    // Pinned shards start each wire on a fresh line. Read complete declarations
    // for the types used here and leave out unrelated geometry and glosses.
    const selected = [];
    let start;
    for (const match of text.matchAll(wireStart)) {
      if (start !== undefined) selected.push(text.slice(start, match.index));
      start = selectedTypes.has(match[1]) ? match.index : undefined;
    }
    if (start !== undefined) selected.push(text.slice(start));
    return selected.length ? parse(selected.join('\n')) : [];
  } catch (cause) {
    throw new Error(`Cannot read SOP world ${file}: ${cause.message}`, { cause });
  }
}

function index(map, key, entry) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(entry);
}

function isEnglish(wire) {
  const languages = values(wire, 'lang');
  if (languages.length) return languages.some(lang => /^en(?:[-_]|$)/i.test(lang));
  return !/^w\.lang\.(?!en\.)/.test(wire.id);
}

function determination(wire) {
  const kind = one(wire, 'kind');
  const definite = one(wire, 'definite');
  if (kind === 'article' && definite) return definite === 'yes' ? 'definite' : 'indefinite';
  if (kind === 'numeral' || kind === 'quantifier') return 'quantified';
  if (kind === 'possessive' || kind === 'demonstrative') return kind;
}

function* boundLexicon(facts) {
  const features = new Map(), filters = new Map();
  for (const wire of facts('w.reader.en.feature')) index(features, one(wire, 'binding'), wire);
  for (const wire of facts('w.reader.en.filter')) index(filters, one(wire, 'binding'), wire);
  for (const binding of facts('w.reader.en.binding')) {
    const name = one(binding, 'name'), type = one(binding, 'source_type');
    const textKey = one(binding, 'text_key'), sourceId = one(binding, 'source_id');
    const cat = one(binding, 'cat');
    if (!name || !type || !textKey || !cat) continue;
    const definitions = features.get(name) ?? [];
    const tests = (filters.get(name) ?? []).map(wire => [one(wire, 'key'), one(wire, 'value')]);
    for (const source of facts(type)) {
      if ((sourceId && source.id !== sourceId) || !isEnglish(source)) continue;
      if (!tests.every(([field, value]) => values(source, field).includes(value))) continue;
      for (const text of values(source, textKey).filter(Boolean)) {
        if (!tests.every(([field, value]) => field !== textKey || text === value)) continue;
        let fields = [[]];
        for (const feature of definitions) {
          const key = one(feature, 'key'), from = one(feature, 'from_key');
          const literal = one(feature, 'value');
          const projected = literal !== undefined ? [literal] : one(feature, 'from_id') === 'true'
            ? [source.id] : from === textKey ? [text] : values(source, from);
          fields = fields.flatMap(row => projected.map(value => [...row, [key, value]]));
        }
        for (const row of fields) yield { cat, text, feat: Object.fromEntries(row) };
      }
    }
  }
}

const senseType = 'k.words.sense';
const stativeSenses = new Set([senseType]);
const lexicalSenseCache = new WeakMap();

function lexicalSenses(facts) {
  const source = knowledge();
  if (!lexicalSenseCache.has(source)) lexicalSenseCache.set(source, new Map());
  const lexicalSenseShards = lexicalSenseCache.get(source);
  const overlays = facts(senseType);
  const overrides = new Set(overlays.map(wire => wire.id));
  const byWord = new Map();
  for (const wire of overlays) {
    const word = one(wire, 'word');
    if (word) index(byWord, phrase(word), wire);
  }
  return surface => {
    const word = phrase(surface);
    // k.words groups lexical senses by the first two letters of the lemma.
    const shard = /^[a-z]+$/u.test(word) ? word.slice(0, 2) : null;
    if (shard && !lexicalSenseShards.has(shard)) {
      const words = new Map();
      try {
        const path = join(source.root, 'docs/worlds', 'k.words', 'shards', shard + '.sop');
        for (const wire of readFacts(path, stativeSenses)) {
          const lemma = one(wire, 'word');
          if (lemma) index(words,phrase(lemma),wire);
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      lexicalSenseShards.set(shard,words);
    }
    return [...(lexicalSenseShards.get(shard)?.get(word) ?? []).filter(wire => !overrides.has(wire.id)),
      ...(byWord.get(word) ?? [])];
  };
}

function compile(facts) {
  const nominalInflection = createNominalInflection(facts);
  const senses=lexicalSenses(facts);
  const knownWords = new Set();
  const acts = new Map(), targets = new Map(), framedTargets = new Map(), constraints = new Map(), markers = new Map();
  const semanticFamilies = new Set(), familyActs = new Map();
  const determiners = new Map(), joiners = new Map(), negatives = new Set(), fillerPhrases = new Set(), discourse = [];
  const actFacts = facts('k.actions.act');
  const actNames = new Set(actFacts.map(wire => one(wire, 'name')).filter(Boolean));
  const words = facts('core.word').filter(isEnglish);
  const targetNameLabels = new Set(words.filter(wire=>values(wire,'means').includes('w.request.target.name'))
    .flatMap(wire=>values(wire,'text').map(phrase)));
  const targetNameWords = new Set(facts('w.lang.en.lex').filter(wire=>one(wire,'name')==='name.letter.after')
    .flatMap(wire=>values(wire,'item').map(phrase)).filter(marker=>targetNameLabels.has(marker)));
  const declarations = facts('w.request.key').map(wire => ({
    id: wire.id, family: one(wire, 'family'), name: one(wire, 'name'),
    head: one(wire, 'head'), values: values(wire, 'value'), means: one(wire, 'means'),
  })).filter(key => key.family && key.name && key.head);
  const requestKeys=[...new Map(declarations.map(key=>[
    JSON.stringify([key.family,key.name,key.head,[...key.values].sort(),key.means]),key,
  ])).values()];
  const literalBindings = facts('pro.reader.literal').map(wire => ({
    family: one(wire,'family'), attribute: one(wire,'attribute'), role: one(wire,'role'),
    containerSort: one(wire,'container_sort')==='true', surfaces: values(wire,'text').map(phrase),
  })).filter(binding => requestKeys.some(key => key.family === binding.family && key.name === binding.attribute &&
    key.head.split('+').includes('span') && !key.values.length));
  const tuples = new Map();
  for (const wire of facts('pro.reader.tuple')) {
    const family = one(wire,'family');
    const keys = [one(wire,'first_key'),one(wire,'second_key')];
    const labels = [one(wire,'first_label'),one(wire,'second_label')].map(label=>label && phrase(label));
    if (!family || keys[0] === keys[1] || !keys.every(name => requestKeys.some(key =>
      key.family === family && key.name === name && key.head.split('+').includes('number') &&
      !key.values.length))) continue;
    for (const act of values(wire,'act').filter(act => actNames.has(act))) {
      for (const cue of values(wire,'text')) {
        index(tuples,phrase(cue),{kind:'tuple',family,act,keys,
          ...(labels[0]!==labels[1] && labels.every(label=>label && !label.includes(' ')) ? {labels} : {})});
      }
    }
  }
  const argumentPatterns = new Map(), openPairs=new Map();
  for (const wire of facts('pro.reader.arguments')) {
    const family = one(wire,'family');
    const act = one(wire,'act'), mode = one(wire,'mode');
    const keys = [one(wire,'first_key'),one(wire,'second_key')];
    const phases = [one(wire,'first_phase') ?? 'result',one(wire,'second_phase') ?? 'result'];
    if (!actNames.has(act) || !['new','existing'].includes(mode) ||
        keys[0] === keys[1] || !phases.every(phase => ['selector','result'].includes(phase)) ||
        !keys.every(name => requestKeys.some(key => key.family === family &&
          key.name === name && key.head.split('+').includes('span') && !key.values.length))) continue;
    const prefixes = values(wire,'prefix').map(phrase).filter(Boolean);
    for (const separator of values(wire,'separator').map(phrase).filter(Boolean)) {
      if (one(wire,'anchor')==='nominal') {
        for (const prefix of prefixes) index(openPairs,JSON.stringify([family,act,mode]),{
          prefix:prefix.split(' '),connector:separator.split(' '),slots:keys.map((key,i)=>[key,phases[i]]),support:0
        });
      } else index(argumentPatterns,act,{family,mode,keys,phases,prefixes,separator});
    }
  }
  const keysByOwner = new Map();
  const slotOwners = new Map(), slotNames = new Map();
  for (const wire of facts('core.slot')) {
    const owner = one(wire, 'of'), key = one(wire, 'key');
    if (!owner || !key) continue;
    slotOwners.set(wire.id, owner);
    slotOwners.set(owner + '.' + key, owner);
    slotNames.set(wire.id, key);
    slotNames.set(owner + '.' + key, key);
  }
  const aliases = new Map();
  const valuesBySlot = new Map();
  const closedValueAliases = new Map();
  const kindBindings = [];
  const boundValues = new Map(), boundAttributes = new Map(), properties = new Map();

  function spell(text) {
    for (const word of text.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? []) knownWords.add(word);
  }

  function bind({ of, family, sort = '', acts, mode, surfaces, argumentRole }) {
    semanticFamilies.add(family);
    const binding = { family, sort, acts: [...new Set(acts.filter(act => actNames.has(act)))], mode };
    for (const act of binding.acts) index(familyActs, family, act);
    for (const text of new Set([...surfaces, ...(aliases.get(of) ?? [])])) {
      spell(text);
      if (argumentRole) {
        for (const act of binding.acts) index(framedTargets, phrase(text),
          ['target',act,family,mode,sort,0,argumentRole]);
      } else index(targets, phrase(text), binding);
    }
  }

  for (const wire of words) {
    const texts = values(wire, 'text');
    const meanings = values(wire, 'means');
    const owners = values(wire, 'of');
    for (const text of texts) {
      spell(text);
      for (const meaning of meanings) {
        if (!owners.length || owners.includes('std.schema.world.name')) index(aliases, meaning, text);
        if ((!owners.length || owners.includes('k.actions.act.name')) && actNames.has(meaning)) {
          index(acts, phrase(text), ['act', meaning, '', 0]);
        }
        for (const owner of owners) index(valuesBySlot, owner, { text, value: meaning });
      }
    }
  }

  const references = new Set();
  for (const wire of facts('w.lang.en.pron')) {
    if (!values(wire, 'case').includes('object') || !values(wire, 'refers').includes('thing')) continue;
    for (const text of values(wire, 'text')) references.add(phrase(text));
  }
  for (const wire of facts('w.lang.en.anaphor')) {
    if (!['none', 'one'].includes(one(wire, 'head'))) continue;
    for (const text of values(wire, 'text')) references.add(phrase(text));
  }

  const spatial = new Map();
  for (const wire of facts('w.lang.en.prep')) {
    const relation = one(wire, 'rel');
    const space = one(wire, 'space');
    if (!relation || !space || Number(one(wire, 'arity') ?? 1) !== 1) continue;
    for (const text of values(wire, 'text')) {
      const form = phrase(text);
      index(spatial, form, relation);
      index(markers, form, ['marker', '*', 'spatial', relation, 0]);
    }
  }
  const aliasesByPrep = new Map();
  const explicitAliases=facts('pro.reader.spatial_surface').flatMap(w=>{
    const base=phrase(one(w,'base') ?? ''), relation=one(w,'relation');
    return spatial.has(base) && relation ? values(w,'text').map(t=>[phrase(t),relation,base]) : [];
  });
  for (const [form,relation,base] of [...spatialAliases(facts,spatial,values,phrase),...explicitAliases]) {
    index(aliasesByPrep,base,form);
    index(spatial,form,relation);
    index(markers,form,['marker','*','spatial',relation,0]);
  }
  for (const wire of facts('k.actions.role')) {
    const act = one(wire, 'act'), role = one(wire, 'name'), holds = one(wire, 'holds');
    if (!actNames.has(act) || !role || !holds || one(wire, 'needed') === 'true') continue;
    for (const text of values(wire, 'marker')) {
      const form = phrase(text);
      const forms = holds === 'place' ? [form,...(aliasesByPrep.get(form) ?? [])] : [form];
      for (const surface of forms) {
        for (const relation of (holds === 'place' ? spatial.get(surface) : undefined) ?? ['']) {
          index(markers,surface,['marker',act,role,relation,0]);
        }
      }
    }
  }

  const replacementFrames = new Set(facts('w.lang.en.frame')
    .filter(wire => one(wire, 'mode') === 'replace' && values(wire, 'role').includes('replacement'))
    .map(wire => one(wire, 'name')));
  const replacementForms = new Set(facts('w.lang.en.part')
    .filter(wire => replacementFrames.has(one(wire, 'frame')) && one(wire, 'is') === 'word')
    .flatMap(wire => values(wire, 'word')).map(phrase));
  const leads = new Set(facts('w.lang.en.phrase')
    .filter(wire => ['lead.polite', 'lead.filler'].includes(one(wire, 'name')))
    .flatMap(wire => values(wire, 'item')).map(phrase));
  const contentLeads = new Set(facts('w.lang.en.cue')
    .filter(wire => one(wire, 'on') === 'with')
    .flatMap(wire => values(wire, 'lead')).map(phrase));
  const namingLeads = new Set(aliases.get('w.request.target.name')?.map(phrase) ?? []);
  const literalVerbs = new Map(), identityAssignmentVerbs = new Set();
  for (const wire of facts('k.actions.verb')) {
    const act = one(wire, 'act');
    for (const text of values(wire, 'text')) {
      spell(text);
      if (!actNames.has(act)) continue;
      const form = phrase(text);
      index(acts, form, ['act', act, '', 0]);
      if (one(wire,'attribute') === 'name' && one(wire,'complement') === 'value') identityAssignmentVerbs.add(form);
      if (one(wire, 'complement') === 'value') index(markers, form, ['frame', act, 'value', '', 0]);
      const object = one(wire, 'object');
      if (act === 'make' && object === 'kind') index(literalVerbs, form, {act, object});
      if (replacementForms.has(form) && ['thing', 'replacement'].includes(object)) {
        index(literalVerbs, form, {act, object});
      }
    }
  }

  for (const { cat, text, feat } of boundLexicon(facts)) {
    spell(text);
    if (cat === 'VALUE' && feat.value && feat.operator === 'eq') {
      if (feat.attribute) index(boundAttributes, feat.attribute, { text, value: feat.value });
      else if (feat.concept) index(boundValues, feat.concept, { text, value: feat.value });
    }
    if (cat === 'PROPERTY' && feat.concept) index(properties, feat.concept, text);
  }

  for (const key of requestKeys) {
    semanticFamilies.add(key.family);
    if (slotOwners.has(key.means)) index(keysByOwner, slotOwners.get(key.means), key);
    spell(label(key.name.split('.').at(-1)));
    for (const value of key.values) spell(label(value));
  }

  const schemas = new Set(facts('std.schema.world').map(wire => one(wire, 'name')));
  for (const wire of facts('std.schema.kind')) {
    const of = one(wire, 'of');
    if (!of) continue;
    const local = of.split('.').at(-1);
    for (const world of values(wire, 'world').filter(id => schemas.has(id) && id !== 'w.request')) {
      const schemaName = world.slice('w.'.length);
      const keys = keysByOwner.get(of) ?? [];
      const families = new Set(keys.map(key => key.family));
      if (!families.size) families.add(local);
      const surfaces = [label(local), ...(local === schemaName ? aliases.get(world) ?? [] : [])];
      for (const family of families) {
        kindBindings.push({ of, family, surfaces, acts: values(wire, 'acts') });
      }
    }
  }

  // Explicit bindings supply a request family, mode and sort when they differ
  // from the vocabulary of the domain schema.
  const explicit = facts('pro.reader.target');
  const mapped = new Set(explicit.map(wire => one(wire, 'of')).filter(Boolean));
  const targetFamilies=kindBindings.filter(binding=>!mapped.has(binding.of));
  for (const binding of targetFamilies) bind(binding);
  for (const wire of explicit) {
    const of = one(wire, 'of');
    const family = one(wire, 'family');
    const mode = one(wire, 'mode');
    const kind = kindBindings.find(binding => binding.of === of);
    if (!family || (mode && !['new', 'existing', 'bound'].includes(mode))) {
      throw new Error(`Invalid pro.reader.target binding @${wire.id}`);
    }
    const sort = one(wire, 'sort') ?? '';
    const surfaces = values(wire, 'text');
    const actionNames = values(wire, 'act');
    const binding={
      of, family, sort, mode,
      acts: actionNames.length ? actionNames : kind?.acts ?? [],
      surfaces: surfaces.length ? surfaces : sort ? [label(sort)] : kind?.surfaces ?? [],
    };
    bind(binding);
    targetFamilies.push(binding);
  }
  for (const binding of nativeTargetInventory(facts,words,targetFamilies)) bind(binding);

  // A bare value needs a single declared key in its family. An explicit key
  // surface can disambiguate otherwise overlapping value banks.
  const compatibleValues = new Map(), propertyLabels = new Map();
  const canonicalSlots = new Map();
  for (const key of requestKeys) {
    if (slotNames.get(key.means) === key.name.split('.').at(-1)) {
      canonicalSlots.set(JSON.stringify([key.family, key.means]), key);
    }
  }
  for (const key of requestKeys) {
    const canonical = canonicalSlots.get(JSON.stringify([key.family, key.means]));
    const heads = new Set(key.head.split('+'));
    const canonicalHeads = new Set(canonical?.head.split('+'));
    // Prefer the canonical slot spelling for a narrower key with the same
    // value bank. Equal or incompatible key declarations remain ambiguous.
    const alias = canonicalHeads.size > heads.size && [...heads].every(head => canonicalHeads.has(head)) &&
      canonical.values.length === key.values.length && key.values.every(value => canonical.values.includes(value));
    const attribute = alias ? canonical.name : key.name;
    const keyAliases = [...(aliases.get(key.means) ?? []), ...(aliases.get(key.name) ?? [])];
    const concepts = new Set([key.name, key.means, slotNames.get(key.means), ...keyAliases].filter(Boolean));
    for (const concept of concepts) keyAliases.push(...(properties.get(concept) ?? []));
    const identifier = label(key.name.split('.').at(-1));
    const spoken = identifier.replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu,'$1 $2')
      .replace(/([\p{Ll}\d])(\p{Lu})/gu,'$1 $2').toLowerCase();
    const keyForms = new Set([identifier, spoken, ...keyAliases]);
    const kinds = [];
    if (heads.has('number')) kinds.push('number');
    if (heads.has('span')) kinds.push('quoted');
    for (const text of keyForms) {
      const surface = phrase(text);
      if (surface) index(propertyLabels, JSON.stringify([surface, key.family]), { attribute, kinds });
    }
    const candidate = heads.has('candidate');
    if (!heads.has('class') && !candidate) continue;
    const forms = key.values.map(value => ({ text: label(value), value }));
    if (heads.has('class') && !key.values.length && !candidate) {
      // With no declared bank, only a binding to this exact key or its
      // backing slot can establish membership. Labels can be homonyms.
      forms.push(...(boundAttributes.get(key.name) ?? []));
      for (const identity of new Set([key.name, key.means].filter(Boolean))) {
        forms.push(...(valuesBySlot.get(identity) ?? []), ...(boundValues.get(identity) ?? []));
      }
    }
    for (const alias of valuesBySlot.get(key.means) ?? []) {
      if (key.values.includes(alias.value)) forms.push(alias);
    }
    for (const {text,value} of [...valuesBySlot.get(key.name) ?? [],...valuesBySlot.get(key.means) ?? []]) {
      if (key.values.length && key.values.includes(value)) {
        const id=JSON.stringify([key.family,key.name,phrase(text)]);
        const meanings=closedValueAliases.get(id) ?? new Set();
        meanings.add(value);
        closedValueAliases.set(id,meanings);
      }
    }
    const lexicalForms = [...(boundAttributes.get(key.name) ?? []), ...[...concepts]
      .flatMap(concept => boundValues.get(concept) ?? [])];
    for (const form of lexicalForms) {
      if (key.values.includes(form.value)) forms.push(form);
      else if (candidate) forms.push({ ...form, open: true });
    }
    for (const { text, value, open } of forms) {
      const valueEvidence = text !== value ? ` words=${quote(text)}` : '';
      const openValue = open && key.values.length ? ' open_value=true' : '';
      const body = `on=attribute attribute=${quote(attribute)} value=${quote(value)} operator=eq phase=result${openValue}`;
      for (const keyText of keyForms) {
        const surface = phrase(`${keyText} ${text}`);
        const evidence = ` key_words=${quote(keyText)}${valueEvidence}`;
        index(compatibleValues, JSON.stringify([key.family, surface]), [body, evidence]);
      }
      index(compatibleValues, JSON.stringify([key.family, phrase(text)]), [body, valueEvidence]);
    }
  }
  const propertiesBySurface = new Map();
  for (const [id, records] of propertyLabels) {
    const attributes = new Set(records.map(record => record.attribute));
    if (attributes.size !== 1) continue;
    const [surface, family] = JSON.parse(id);
    const [attribute] = attributes;
    for (const kind of new Set(records.flatMap(record => record.kinds))) {
      index(propertiesBySurface, surface, { family, attribute, kind });
    }
  }
  // A language cue such as "degrees" or "pixels wide" can follow a number.
  // Resolve its property through the same per-family catalog as prefix labels.
  for (const cue of facts('w.lang.en.cue')) {
    const attribute = one(cue,'attribute');
    if (!attribute || one(cue,'on') !== 'attribute' || one(cue,'takes') !== 'number') continue;
    const keys = (propertiesBySurface.get(phrase(attribute)) ?? []).filter(k=>k.kind==='number');
    const unit = one(cue,'unit');
    for (const trail of values(cue,'trail')) {
      for (const key of keys) index(propertiesBySurface,phrase(trail),
        {...key,kind:'postfix_number',...(unit ? {unit} : {})});
    }
  }
  for (const [id, forms] of compatibleValues) {
    const bodies = new Map(forms);
    if (bodies.size !== 1) continue;
    const [family, surface] = JSON.parse(id);
    const [body, evidence] = bodies.entries().next().value;
    index(constraints, surface, ['constraint', '*', family, body + evidence, 0]);
  }

  for (const wire of facts('w.lang.en.det')) {
    const type = determination(wire);
    if (type) for (const text of values(wire, 'text')) determiners.set(phrase(text), type);
  }

  for (const wire of facts('w.lang.en.joiner')) {
    const kind = one(wire, 'kind');
    if (kind) for (const text of values(wire, 'text')) joiners.set(phrase(text), kind);
  }

  for (const wire of facts('w.lang.en.neg')) {
    for (const text of [...values(wire, 'text'), ...values(wire, 'ending')]) negatives.add(text.toLowerCase());
  }

  for (const wire of facts('w.lang.en.skip')) {
    if (!['filler', 'politeness', 'interjection'].includes(one(wire, 'class'))) continue;
    for (const text of values(wire, 'text')) {
      const surface = phrase(text);
      if (surface && !joiners.has(surface)) {
        fillerPhrases.add(surface);
        discourse.push({text:surface,class:one(wire,'class')});
        spell(text);
      }
    }
  }

  const nominalClasses = new Map();
  for (const wire of facts('pro.reader.nominal_class')) {
    const family=one(wire,'family'), attribute=one(wire,'attribute');
    const key=requestKeys.find(k => k.family===family && k.name===attribute);
    if (!key?.head.split('+').some(h=>h==='class' || h==='candidate')) continue;
    const forms=nominalClasses.get(family) ?? new Map();
    nominalClasses.set(family,forms);
    for (const value of key.values) {
      for (const noun of values(wire,'noun')) {
        const words=phrase(label(value)+' '+noun).split(' ');
        index(forms,words[0],{words,attribute,value});
      }
    }
  }
  const selectorKeys = new Map();
  for (const wire of facts('pro.reader.identity')) {
    const family = one(wire,'family'), name = one(wire,'attribute');
    if (!requestKeys.some(key => key.family === family && key.name === name &&
        ['span','candidate'].includes(key.head))) continue;
    if (!selectorKeys.has(family)) selectorKeys.set(family,new Set());
    selectorKeys.get(family).add(name);
  }
  const spatialBindings = facts('pro.reader.spatial').map(wire => ({
    regionKey:one(wire,'region_key'),
    family: one(wire, 'family'),
    relationKey: one(wire, 'relation_key'), anchorKey: one(wire, 'anchor_key'),
    namedActs: values(wire,'named_act'),
  }));
  for (const {family,relationKey,anchorKey,namedActs} of spatialBindings) {
    const keys = requestKeys.filter(key => key.family === family);
    const relation = keys.find(key => key.name === relationKey && key.head === 'class');
    const anchor = keys.find(key => key.name === anchorKey && key.head === 'fill+span' && !key.values.length);
    if (!relation || !anchor) continue;
    for (const act of namedActs.filter(act => familyActs.get(family)?.includes(act))) {
      for (const [separator,entries] of markers) {
        for (const [,licensed,role,rel] of entries) {
          if (licensed === act && role === 'place' && relation.values.includes(rel)) {
            index(argumentPatterns,act,{family,mode:'existing',prefixes:[],separator,relation:rel,relationKey,anchorKey});
          }
        }
      }
    }
  }
  const leadForms=role=>new Set(facts('pro.reader.body_lead').filter(w=>one(w,'role')===role)
    .flatMap(w=>values(w,'text').map(phrase)));
  const argumentFormats=compileStructuredArguments(facts,requestKeys);
  const scalarArgumentKeys=new Set([...argumentFormats].filter(([,format])=>['scalar_number','positive_count'].includes(format))
    .map(([id])=>id));
  const frames=argumentSequences(type=>type==='pro.reader.argument_sequence' ?
    [...facts(type),...analyticalArgumentFacts(facts)] : facts(type),requestKeys,argumentFormats);
  const propertyOperands=compileOwnerPropertyOperands(facts,requestKeys,words);
  const numericAssignmentFamilies=new Map();
  for (const [id,labels] of propertyLabels) {
    const [surface,family]=JSON.parse(id);
    if (!labels.some(label=>label.kinds.includes('number') ||
        propertyOperands.ownerPropertyNumeric.has(JSON.stringify([family,label.attribute])))) continue;
    index(numericAssignmentFamilies,surface,family);
  }
  const universalAgreement=compileUniversalAgreement(facts);
  const nominalSelectorRules=compileNominalSelectors(facts,requestKeys,words);
  const nominalPositions=nominalPositionForms(facts,requestKeys,words);
  const ownedEffects=compileOwnedEffects(facts,requestKeys,propertyLabels);
  return {
    codeSelectors:compileCodeSelectors(facts,requestKeys),
    numericSettingKeys:new Set(requestKeys.filter(key=>key.head.split('+').includes('number')).map(key=>key.name)),
    bodyLeads:{neutral:leadForms('neutral'),nominal:leadForms('nominal'),actionOnly:leadForms('action_only')},
    knownWords, requestKeys, negatives, fillerPhrases, discourse,
    nominalSelectorRules,
    targetNameWords,
    nominalNumbers:compileNominalNumbers(facts),
    sequenceObjectPronouns:sequenceObjectPronouns(facts),
    sequenceFreshQualifiers:sequenceFreshQualifiers(facts),
    discourseReasons:compileDiscourseReasons(facts),
    singularArticles:new Set(facts('w.lang.en.det').filter(w=>one(w,'kind')==='article' &&
      one(w,'number')==='sg' && one(w,'definite')==='no').flatMap(w=>values(w,'text').map(phrase))),
    languageFrames:languageFrames(facts),
    closedRequests:compileClosedRequests(facts,actNames),
    removalWishes:compileRemovalWishes(facts,words),
    referenceCommands:compileReferenceCommands(facts,actNames),
    alternations:compileAlternations(facts),
    scopeGrammar:scopeGrammar(facts),
    discourseEdges:compileDiscourseEdges(facts,discourse),
    sentenceAdditions:new Set(facts('pro.reader.sentence_addition').flatMap(w=>values(w,'text').map(phrase))),
    benefactives:compileBenefactives(facts),
    literalGrammar: {
      creationRoles:compileCreationRoles(facts,requestKeys,words),
      leads, contentLeads, namingLeads, bindings:literalBindings.filter(binding=>binding.role!=='quoted'),
      quoteBindings:literalBindings,
      verbs: surface => literalVerbs.get(surface) ?? [],
      licenses: (family, act) => familyActs.get(family)?.includes(act),
    }, evidenceVocabulary:evidenceVocabulary(facts),
    openPairs:Object.fromEntries(openPairs),
    argumentPatterns: act => argumentPatterns.get(act) ?? [],
    preservationBindings: facts('pro.reader.preservation').map(wire => ({
      family:one(wire,'family'), attribute:one(wire,'attribute'), concept:one(wire,'concept'),
    })),
    motionAmountPhrases: facts('w.lang.en.lex').filter(wire=>one(wire,'name')==='space.amounts')
      .flatMap(wire=>values(wire,'item').map(text=>phrase(text).split(' '))).filter(words=>words.length>1),
    fixedProperties:compileFixedProperties(facts,requestKeys),
    analyticalOwnerProperties:compileAnalyticalOwnerProperties(facts,requestKeys),
    analyticalAdjuncts:compileAnalyticalAdjuncts(facts,requestKeys),
    dialogueCoverage:compileDialogueCoverage(facts),
    dependentOperands:compileDependentOperands(facts,requestKeys),
    ownedEffects,
    landmarkSurfaceFacts:facts('pro.reader.landmark_surface'),
    appositiveSelectors:compileAppositiveSelectors(facts,requestKeys,words),
    quantifiedVerbs:compileQuantifiedVerbs(facts,requestKeys),
    requestIntents:compileRequestIntents(facts,frames,lemma=>senses(lemma).some(wire=>one(wire,'pos')==='verb'),nominalPositions),
    topicCommands:compileTopicCommandDeclarations(facts,requestKeys),
    postposedClauses:compilePostposedClauses(facts,requestKeys,words,lemma=>
      senses(lemma).some(wire=>one(wire,'pos')==='verb')),
    orientationLandmarks:compileOrientationLandmarks(facts,requestKeys),
    argumentSequences:frames,
    argumentZones:structuredZones(facts),
    ownerPropertyFrames:facts('pro.reader.owner_property').map(w=>({act:one(w,'act'),owner:one(w,'owner'),value:one(w,'value')})),
    ...effectGrammar(facts,requestKeys),
    ...propertyOperands,
    nativePropertyFrames:compileNativePropertyFrames(facts),
    preservationAdjuncts:compilePreservationAdjuncts(facts,requestKeys),
    nominalSelectorRules, directionalResults:compileDirectionalResults(facts,requestKeys,words,nominalSelectorRules),
    measuredMotion:compileMeasuredMotion(facts,requestKeys),
    transformations:compileTransformations(facts,requestKeys,words),
    trailingDiscourse:compileTrailingDiscourse(facts),
    memberActions:facts('pro.reader.member_action').map(w=>({
      family:one(w,'family'),act:one(w,'act'),mode:one(w,'mode'),key:one(w,'key'),phase:one(w,'phase'),
      separators:values(w,'separator'),suffixes:values(w,'suffix'),nouns:values(w,'noun'),
      numericId:one(w,'numeric_id')==='true',effectKey:one(w,'effect_key'),memberFamilies:values(w,'member_family'),
    })),
    affectedParticiples:createAffectedParticiples(facts),
    affectedTargetLeads:new Set(facts('pro.reader.affected_lead').flatMap(w=>values(w,'text').map(phrase))),
    affectedTargetSources:facts('pro.reader.affected_source').map(w=>Object.fromEntries(
      ['act','family','marker','keyword','attribute'].map(k=>[k,one(w,k)]))),
    nativeVerbEffects:nativeVerbEffects(facts,requestKeys,propertyLabels),
    argumentLabels:Map.groupBy(facts('pro.reader.argument_label').flatMap(w=>
      values(w,'text').map(text=>({key:one(w,'key'),words:tokens(text).map(t=>t[0])}))).filter(entry=>entry.key && entry.words.length),entry=>entry.key),
    ownerPropertyLabels:propertyLabels,
    numericAssignmentFamilies,
    ownerPropertyValues:compatibleValues,
    declaredValueAlias(family,key,text,value) {
      const surface=phrase(text);
      const meanings=closedValueAliases.get(JSON.stringify([family,key,surface]));
      const nominalValues=new Set(nominalSelectorRules.flatMap(rule=>{
        const match=rule.family===family && rule.key===key && rule.bank.get(surface);
        return match ? [match] : [];
      }));
      for (const reading of ownedEffects.elliptical) {
        if (reading.family===family && reading.key===key && reading.bank.has(surface)) {
          nominalValues.add(reading.bank.get(surface));
        }
      }
      return meanings?.size===1 && meanings.has(value) ||
        !meanings && nominalValues.size===1 && nominalValues.has(value) ||
        scalarArgumentKeys.has(JSON.stringify([family,key])) && scalarNumber(text,this,family,key)===value ||
        analyticalAdjunctAlias(this,family,key,text,value);
    },
    compoundReferences:facts('pro.reader.compound_reference').map(w=>({family:one(w,'family'),firstKey:one(w,'first_key'),secondKey:one(w,'second_key'),delimiter:one(w,'delimiter')})),
    universalAgreement, universalInventory:compileUniversalInventory(facts,words,targetFamilies,universalAgreement),
    nominalClasses, participantAdjuncts:compileParticipantAdjuncts(facts,requestKeys), sourceContainers:compileSourceContainers(facts), landmarkPairs:compileLandmarkPairs(facts), setExclusions:compileSetExclusions(facts), spatialModifiers:compileSpatialModifiers(facts), spatialBindings, selectorKeys, identityAssignmentVerbs,
    nominalScales:nominalScaleForms(facts,requestKeys),
    ordering:compileOrdering(facts,lemma=>senses(lemma).some(wire=>one(wire,'pos')==='noun')),
    countOperandConflicts:compileCountOperandConflicts(facts,argumentFormats),
    nominalPositions, strictNominalSubjects:strictNominalSubjects(nominalPositions),
    standingPositions:compileStandingPositions(facts,requestKeys),
    standingClosings:standingClosings(facts),
    incidentalModifiers:incidentalModifiers(facts),
    instanceBindings: facts('pro.reader.instance_code').map(wire => ({
      family:one(wire,'family'), prefix:one(wire,'prefix')?.toLowerCase(),
    })).filter(({family,prefix}) => familyActs.has(family) && /^\p{L}+$/u.test(prefix ?? '')),
    determiners: Object.fromEntries(determiners),
    joiners: Object.fromEntries(joiners),
    semanticFamilies,
    lexicon: Object.fromEntries(acts),
    properties: surface => propertiesBySurface.get(surface) ?? [],
    tuples: surface => tuples.get(surface) ?? [],
    nominalInflection,
    frameTargets: surface => framedTargets.get(surface) ?? [],
    isReference: text => references.has(phrase(text)),
    lookup(surface, activeActs = actNames) {
      const entries = [...(acts.get(surface) ?? []), ...(constraints.get(surface) ?? []), ...(markers.get(surface) ?? [])];
      if (references.has(surface)) entries.push(['reference', '*', 'thing', '', 0]);
      for (const { family, sort, mode, acts } of targets.get(surface) ?? []) {
        for (const act of acts) {
          if (!activeActs.has(act)) continue;
          entries.push(['target', act, family, mode ?? (act === 'make' ? 'new' : 'existing'), sort, 0]);
        }
      }
      return [...new Map(entries.map(entry => [JSON.stringify(entry), entry])).values()];
    },
    acts: actFacts,
  };
}

function collect(facts, file, selection) {
  const wires=readFacts(file, selection);
  for (const wire of wires) {
    if (wire.pattern || Object.values(wire.attrs).some(items => items.some(item => item.startsWith('?')))) continue;
    if (!facts.has(wire.type)) facts.set(wire.type, new Map());
    facts.get(wire.type).set(wire.id, wire);
  }
  return wires;
}

function providerTypes(facts, effective=facts) {
  const sources=[...(facts.get('w.reader.en.binding')?.values() ?? [])].map(w=>one(w,'source_type'));
  for (const frame of facts.get('pro.reader.transformation')?.values() ?? []) {
    sources.push(one(frame,'owner_type'),one(frame,'value_type'));
  }
  for (const role of facts.get('pro.reader.creation_role')?.values() ?? []) sources.push(one(role,'value_type'));
  for (const frame of facts.get('pro.reader.postposed_clause')?.values() ?? []) sources.push(one(frame,'value_type'));
  for (const frame of facts.get('pro.reader.dependent_operand')?.values() ?? []) sources.push(one(frame,'item_type'));
  for (const frame of facts.get('pro.reader.appositive_selector')?.values() ?? []) {
    sources.push(one(frame,'item_type'),...values(frame,'subject_type'));
  }
  for (const frame of facts.get('pro.reader.orientation')?.values() ?? []) sources.push(one(frame,'landmark_type'));
  for (const frame of facts.get('pro.reader.motion')?.values() ?? []) sources.push(one(frame,'target_type'));
  for (const frame of facts.get('pro.reader.argument_sequence')?.values() ?? []) sources.push(one(frame,'owner_kind_type'));
  for (const selector of facts.get(nominalSelectorType)?.values() ?? []) sources.push(...nominalSelectorProviders(selector));
  for (const type of ['pro.reader.nominal_pattern','pro.reader.nominal_value']) {
    for (const frame of facts.get(type)?.values() ?? []) sources.push(...values(frame,'subject_type'));
  }
  for (const frame of facts.get('pro.reader.benefactive')?.values() ?? []) sources.push(one(frame,'name_provider'),one(frame,'name_blocker'));
  for (const binding of facts.get('pro.reader.owner_inventory')?.values() ?? []) sources.push(one(binding,'provider'));
  for (const binding of facts.get(removalWishType)?.values() ?? []) sources.push(one(binding,'provider'));
  const providerFacts=type=>[...(([nativeTargetInventoryType,universalInventoryType].includes(type) ? facts : effective)
    .get(type)?.values() ?? [])];
  sources.push(...nativeTargetProviderTypes(providerFacts),...universalInventoryProviderTypes(providerFacts));
  return new Set(sources.filter(Boolean));
}

function compileFacts(facts) {
  return compile(type => [...(facts.get(type)?.values() ?? [])]);
}

const configurations = new WeakMap();

function baseConfiguration() {
  const source = knowledge();
  const cached = configurations.get(source);
  if (cached) return cached;
  const files = [...worldFiles(join(source.root, 'docs/worlds'), false)];
  const loadPinned = (facts, selection) => {
    for (const file of files) collect(facts, file, selection);
  };
  const baseFacts = new Map();
  loadPinned(baseFacts, types);
  const local = fileURLToPath(new URL('../worlds/pro.reader/', import.meta.url));
  for (const file of worldFiles(local, true)) collect(baseFacts, file);
  const pinnedProviders = providerTypes(baseFacts);
  loadPinned(baseFacts, new Set([...pinnedProviders].filter(type => !types.has(type))));
  const result = {baseFacts, pinnedProviders, loadPinned};
  configurations.set(source, result);
  return result;
}

export function loadWorlds({paths = (process.env.SOP_WORLDS ?? '').split(delimiter).filter(Boolean)} = {}) {
  const base = baseConfiguration();
  const {baseFacts, pinnedProviders, loadPinned} = base;
  if (!paths.length) return base.worlds ??= compileFacts(baseFacts);

  const overlay = new Map();
  const overlayFiles = new Map();
  for (const entry of paths) {
    const path = resolve(entry);
    const files = statSync(path).isDirectory() ? worldFiles(path, true) : [path];
    for (const file of files) {
      if (!overlayFiles.has(file)) overlayFiles.set(file,collect(overlay,file));
    }
  }
  const facts = new Map([...baseFacts].map(([type, wires]) => [type, new Map(wires)]));
  const mergeOverlay=()=>{
    for (const [type, wires] of overlay) {
      if (!facts.has(type)) facts.set(type, new Map());
      for (const [id, wire] of wires) facts.get(type).set(id, wire);
    }
  };
  mergeOverlay();
  const extra = new Set([...providerTypes(overlay,facts)].filter(type => !types.has(type) && !pinnedProviders.has(type)));
  if (extra.size) {
    loadPinned(facts, extra);
    mergeOverlay();
  }
  const worlds=compileFacts(facts);
  // Only a request extension explicitly selected by the caller participates
  // in circuit validation. Its shard facts belong to the same module.
  const modules=[];
  for (const [file,schema] of overlayFiles) {
    if (basename(file)!=='schema.sop' || !schema.some(w=>w.type==='core.module' &&
        values(w,'imports').includes('w.request'))) continue;
    const shards=join(dirname(file),'shards');
    const moduleFacts=[...overlayFiles].filter(([path])=>dirname(path)===shards).flatMap(([,wires])=>wires);
    modules.push({schema,facts:moduleFacts});
  }
  if (modules.length) {
    const referenceSlots=new Map();
    for (const {schema} of modules) {
      for (const slot of schema.filter(w=>w.type==='core.slot' && one(w,'type'))) {
        const owner=one(slot,'of');
        if (!referenceSlots.has(owner)) referenceSlots.set(owner,new Set());
        referenceSlots.get(owner).add(one(slot,'key'));
      }
    }
    worlds.evidenceVocabulary.referenceSlots=referenceSlots;
    worlds.validationModules=compileValidationModules(modules,[...facts.get('w.request.key').values()]);
    if (worlds.validationModules.types.has(landmarkPairType)) {
      worlds.validationModules.validateWires=wires=>landmarkSelectorsMatchCatalog(wires,worlds);
    }
    worlds.reciprocal=compileReciprocal(type=>[...(facts.get(type)?.values() ?? [])]);
  }
  return worlds;
}
