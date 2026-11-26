import { parse, serialize } from './knowledge.mjs';
import { tokens } from './lexicon.mjs';

const requestConstraint = 'w.request.constraint';
const requestTarget = 'w.request.target';
const requestLookup = 'w.request.lookup';
const decode = value => value?.startsWith('"') ? JSON.parse(value) : value;
const one = (wire, name) => wire.attrs[name]?.[0];
const surface = value => tokens(value).map(([key])=>key).join(' ');
const atom = value => /^[\p{L}_][\p{L}\p{N}_.-]*$/u.test(value) ? value : JSON.stringify(value);

function readSpatialWires(sop) {
  if (!sop.includes(' relation=')) return null;
  let wires;
  try { wires = parse(sop); } catch { return null; }
  const intermediates = wires.filter(wire => wire.type === requestConstraint &&
    one(wire, 'on') === 'place' && one(wire, 'operator') === 'relation' &&
    wire.attrs.relation && wire.attrs.value?.length === 1 && wire.attrs.words && !wire.attrs.attribute);
  return intermediates.length ? { wires, intermediates } : null;
}

function unusedId(usedIds, stem) {
  let id = stem, suffix = 2;
  while (usedIds.has(id)) id = stem + '.' + suffix++;
  usedIds.add(id);
  return id;
}

export function createRelationKeyResolver(worlds) {
  const pairs = new Map(), keysByFamily = new Map();
  for (const key of worlds.requestKeys) {
    const familyKeys = keysByFamily.get(key.family) ?? [];
    familyKeys.push(key);
    keysByFamily.set(key.family, familyKeys);
  }
  function addPair(key, anchor, namedActs) {
    for (const value of key.values) {
      const families = pairs.get(value) ?? new Map();
      const matches = families.get(key.family) ?? new Map();
      const signature=JSON.stringify([key.name,anchor.name]);
      const pair=matches.get(signature) ?? {relation:key.name,anchor:anchor.name,namedActs:new Set()};
      for (const act of namedActs) pair.namedActs.add(act);
      matches.set(signature,pair);
      families.set(key.family, matches);
      pairs.set(value, families);
    }
  }
  for (const binding of worlds.spatialBindings ?? []) {
    const signature = binding.family;
    const keys = keysByFamily.get(signature) ?? [];
    const relations = keys.filter(key => key.name === binding.relationKey && key.head === 'class');
    const anchors = keys.filter(key => key.name === binding.anchorKey &&
      key.head === 'fill+span' && !key.values.length);
    if (relations.length === 1 && anchors.length === 1) addPair(relations[0], anchors[0], binding.namedActs ?? []);
  }
  function resolveWires(wires, intermediates) {
    const usedIds = new Set(wires.map(wire => wire.id));
    const replacements = new Map(), lookupTargets = new Map();
    for (const wire of intermediates) {
      const request = one(wire, 'request');
      const families = new Set(wires.filter(target => target.type === requestTarget &&
        one(target, 'request') === request).map(target => decode(one(target, 'family'))));
      const value = decode(one(wire, 'relation'));
      const anchor = decode(one(wire, 'value'));
      const words = decode(one(wire, 'words'));
      const marker = words.endsWith(anchor) ? words.slice(0, -anchor.length).trimEnd() : '';
      const keys = families.size === 1 ? pairs.get(value)?.get([...families][0]) : undefined;
      if (keys?.size !== 1 || !marker) {
        replacements.set(wire.id, [{
          id: wire.id, type: 'w.request.unread',
          attrs: { request: [request], text: [JSON.stringify(words)], note: ['"unresolved spatial relation"'] },
        }]);
        lookupTargets.set('$' + wire.id, null);
        continue;
      }
      const [pair] = keys.values();
      const anchorId = unusedId(usedIds, wire.id + '.anchor');
      const attrs = { ...wire.attrs, attribute: [atom(pair.relation)], value: [atom(value)] };
      delete attrs.relation;
      if (marker === value) delete attrs.words;
      else attrs.words = [JSON.stringify(marker)];
      replacements.set(wire.id, [
        { ...wire, attrs },
        { id: anchorId, type: requestConstraint, attrs: {
          request: [request], on: ['place'], attribute: [atom(pair.anchor)],
          value: [atom(anchor)], operator: ['relation'], phase: ['selector'],
        } },
      ]);
      lookupTargets.set('$' + wire.id, '$' + anchorId);
    }

    const resolved = wires.flatMap(wire => {
      if (replacements.has(wire.id)) return replacements.get(wire.id);
      const constraint = one(wire, 'constraint');
      if (wire.type !== requestLookup || !lookupTargets.has(constraint)) return [wire];
      const target = lookupTargets.get(constraint);
      return target ? [{ ...wire, attrs: { ...wire.attrs, constraint: [target] } }] : [];
    });
    return serialize(resolved).trimEnd();
  }

  function resolveRelationKeys(sop) {
    const spatial = readSpatialWires(sop);
    return spatial ? resolveWires(spatial.wires, spatial.intermediates) : sop;
  }

  function destinationAct(request, intermediates) {
    if (intermediates.length!==1 || request.attrs.polarity ||
        ![undefined,'do','propose'].includes(decode(one(request,'mood')))) return;
    const [relation]=intermediates;
    if (one(relation,'phase')!=='selector' || relation.attrs.want) return;
    const act=decode(one(request,'act')), predicate=decode(one(request,'predicate'));
    if (!predicate) return;
    const senses=new Set(worlds.lookup(surface(predicate)).filter(([role])=>role==='act').map(([,sense])=>sense));
    if (senses.size!==1 || !senses.has(act)) return;
    const words=decode(one(relation,'words')), anchor=decode(one(relation,'value'));
    if (!words.endsWith(anchor)) return;
    const marker=worlds.lookup(surface(words.slice(0,-anchor.length))).filter(([role])=>role==='marker');
    const roles=marker.flatMap(([,license,role])=>license===act ? [role] : []);
    if (roles.some(role=>role!=='place') || !marker.some(([,license,role,value])=>
        license==='*' && role==='spatial' && value===decode(one(relation,'relation')))) return;
    return act;
  }

  resolveRelationKeys.targetlessAlternatives = function (sop) {
    const spatial = readSpatialWires(sop);
    if (!spatial) return [];
    const { wires, intermediates } = spatial;
    const requests = wires.filter(wire => wire.type === 'w.request.request');
    if (requests.length !== 1 || one(requests[0], 'refers') !== 'thing' ||
        wires.some(wire => wire.type === requestTarget)) return [];
    const [request] = requests;
    const destination=destinationAct(request,intermediates);
    const relations = new Set(intermediates.map(wire => decode(one(wire, 'relation'))));
    const first = pairs.get(relations.values().next().value);
    if (!first) return [];

    const usedIds = new Set(wires.map(wire => wire.id));
    const targetId = unusedId(usedIds, request.id + '.context_target');
    const lookupId = unusedId(usedIds, request.id + '.context_lookup');
    const reference = '$' + request.id;
    return [...first.keys()].sort().filter(family =>
      [...relations].every(value => pairs.get(value)?.get(family)?.size === 1)
    ).flatMap(family => {
      const withTarget = [
        request,
        { id: targetId, type: requestTarget, attrs: {
          request: [reference], family: [atom(family)], mode: ['existing'], fill: ['context'],
        } },
        { id: lookupId, type: requestLookup, attrs: {
          request: [reference], target: ['$' + targetId], key: ['thing'], from: ['any'],
        } },
        ...wires.filter(wire => wire !== request),
      ];
      const outputs=[resolveWires(withTarget,intermediates)];
      const [pair]=first.get(family).values();
      if (pair.namedActs.has(destination)) {
        // The raw attachment follows a consumed direct pronoun. Preserve
        // the normal selector alternative and move only the relation phase.
        const [relation]=intermediates;
        const result={...relation,attrs:{...relation.attrs,phase:['result']}};
        outputs.push(resolveWires(withTarget.map(wire=>wire===relation ? result : wire),[result]));
      }
      return outputs;
    });
  };

  return resolveRelationKeys;
}
