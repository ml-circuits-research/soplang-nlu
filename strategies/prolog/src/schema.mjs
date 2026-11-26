import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { knowledge, parse, serialize, str } from './knowledge.mjs';

export { parse };
const schemas = new WeakMap();

function activeSchema() {
  const source = knowledge();
  if (!schemas.has(source)) schemas.set(source, createSchema(source));
  return schemas.get(source);
}

export function compileValidationModules(modules, requestKeyFacts) {
  return activeSchema().compileValidationModules(modules, requestKeyFacts);
}

export function validate(sop, worlds) {
  return activeSchema().validate(sop, worlds);
}

function createSchema({api: {World}, root}) {
  const read = path => readFileSync(join(root, 'docs/worlds', path), 'utf8');
  const library = Object.fromEntries(['k.named', 'k.actions', 'w.request'].map(id => [id, read(id + '/schema.sop')]));
  const one = (wire, key) => str(wire.attrs[key]?.[0]);
  // The pinned catalogue requires this retired UI field. Strip only its
  // metadata slot on import until the shared catalogue drops the requirement.
  library['w.request']=serialize(parse(library['w.request']).filter(wire=>wire.id!=='w.request.key.tab'));
  const requestTypes = new Set(parse(library['w.request']).filter(wire => wire.type === 'core.type')
    .map(wire => one(wire, 'of')).filter(type => type !== 'w.request.key'));

  function requireOk(result, message) {
    if (!result.ok) throw Error(message + ': ' + JSON.stringify(result.violations));
  }

  function loadSchema(modules = {}) {
    const world = new World({library:{...library, ...modules}});
    for (const id of ['std.acts', 'k.actions', 'w.request']) {
      requireOk(world.use(id), 'Schema loading failed for ' + id);
    }
    for (const id of Object.keys(modules)) {
      requireOk(world.tell([{id:'use.'+id,type:'core.use',attrs:{world:[id],prefix:['false']}}]),
        'Schema loading failed for ' + id);
    }
    return world;
  }
  const schema = loadSchema();

  function bindActs(acts, source = schema) {
    const base = source.fork();
    requireOk(base.tell(acts, {factsOnly:true}), 'Invalid act facts');
    base.closeType('k.actions.act');
    return base;
  }

  // Only explicitly installed library modules can extend the circuit vocabulary.
  // Their supplied catalogue wires belong to the world, not to a proposal.
  function compileValidationModules(modules, requestKeyFacts = []) {
    if (!modules.length) return undefined;
    const extension = Object.create(null), types = new Set(), ownedTypes = new Set(), catalog = [];
    const catalogTypes = new Set(['w.request.key']);
    for (const {schema, facts = [], catalogTypes: reserved = []} of modules) {
      const headers = schema.filter(wire => wire.type === 'core.module');
      const name = headers.length === 1 && one(headers[0], 'name');
      if (!name || name.startsWith('std.') || Object.hasOwn(library, name) || Object.hasOwn(extension, name)) {
        throw Error('Expected a distinct extension core.module name: ' + String(name));
      }
      const declared = new Set(schema.filter(wire => wire.type === 'core.type').map(wire => one(wire, 'of')));
      if ([...declared].some(type => !type?.startsWith(name + '.'))) {
        throw Error('Extension types must belong to ' + name);
      }
      for (const type of declared) ownedTypes.add(type);
      for (const raw of headers[0].attrs.exports ?? []) {
        const exportName = str(raw), type = exportName.startsWith(name + '.') ? exportName : name + '.' + exportName;
        if (declared.has(type)) types.add(type);
      }
      const moduleFacts = facts.filter(wire => declared.has(wire.type));
      for (const type of [...reserved, ...moduleFacts.map(wire => wire.type)]) {
        if (!declared.has(type)) throw Error('Unknown catalogue type ' + type + ' for ' + name);
        catalogTypes.add(type);
      }
      catalog.push(...moduleFacts);
      extension[name] = serialize(schema);
    }
    const extended = loadSchema(extension);
    requireOk(extended.tell(catalog, {factsOnly:true}), 'Invalid extension catalogue facts');
    // A native module can also define reference records in its schema file.
    const catalogIds = new Set();
    for (const type of ownedTypes) {
      const records = extended.ofType(type).filter(wire => wire.type === type);
      if (records.length) catalogTypes.add(type);
      for (const wire of records) catalogIds.add(wire.id);
    }
    for (const type of catalogTypes) types.delete(type);
    const keys = requestKeyFacts.filter(wire=>wire.type==='w.request.key').map(wire=>{
      const attrs={...wire.attrs};
      delete attrs.tab;
      return {...wire,attrs};
    });
    // Admit only facts valid as native foreign targets.
    if (!extended.tell(keys, {factsOnly:true}).ok) {
      for (const key of keys) extended.tell([key], {factsOnly:true});
    }
    for (const wire of keys) catalogIds.add(wire.id);
    return {types, catalogIds, bindActs:acts => bindActs(acts, extended)};
  }

  const defaultActs = parse(read('k.actions/shards/acts.sop')).filter(wire => wire.type === 'k.actions.act');
  const base = bindActs(defaultActs);
  const validators = new WeakMap();
  const extensionValidators = new WeakMap();

  function validator(worlds) {
    if (!worlds) return base;
    if (!validators.has(worlds)) validators.set(worlds, bindActs(worlds.acts));
    return validators.get(worlds);
  }

  function validate(sop, worlds) {
    if (!sop.trim()) return false;
    try {
      const wires = parse(sop);
      if (!wires.length) return false;
      if (wires.every(wire => requestTypes.has(wire.type))) {
        return validator(worlds).fork().tell(wires, {factsOnly:true}).ok;
      }
      const extension = worlds?.validationModules;
      if (!extension || !wires.every(wire => !extension.catalogIds.has(wire.id) &&
          (requestTypes.has(wire.type) || extension.types.has(wire.type)))) return false;
      if (!extensionValidators.has(worlds)) extensionValidators.set(worlds, extension.bindActs(worlds.acts));
      const native = extensionValidators.get(worlds).fork().tell(wires, {factsOnly:true, strict:true});
      return native.ok && (extension.validateWires?.(wires) ?? true);
    } catch {
      return false;
    }
  }
  return {compileValidationModules, validate};
}
