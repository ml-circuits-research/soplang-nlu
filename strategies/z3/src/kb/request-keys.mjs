import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { unquoteSop } from '../contracts.mjs';

export function readRequestKeyWires(parse, worldsDir) {
  const directory = join(worldsDir, 'w.request', 'shards');
  return readdirSync(directory).filter((file) => file.endsWith('.sop')).sort().flatMap((file) =>
    parse(readFileSync(join(directory, file), 'utf8')).filter((wire) => wire.type === 'w.request.key'));
}

export function indexRequestKeyDeclarations(wires) {
  const keys = new Map();
  const families = new Set();
  const get = (wire, slot) => unquoteSop(wire.attrs[slot]?.[0] ?? '');
  for (const wire of wires) {
    const name = get(wire, 'name');
    const family = get(wire, 'family');
    const values = (wire.attrs.value ?? []).map((value) => unquoteSop(value).toLowerCase());
    const declaration = { id: wire.id, name, family, head: get(wire, 'head'), means: get(wire, 'means'),
      values: values.length ? new Set(values) : null };
    if (!keys.has(name)) keys.set(name, []);
    keys.get(name).push(declaration);
    families.add(family);
  }
  if (!keys.size) throw new Error('No request key declarations found');
  return { keys, families };
}
