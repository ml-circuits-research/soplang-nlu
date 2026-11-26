import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

function* sopFiles(path) {
  if (statSync(path).isFile()) {
    if (!path.endsWith('.sop')) throw new TypeError(`Expected a SOP file at ${path}`);
    yield path;
    return;
  }
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) yield* sopFiles(child);
    if (entry.isFile() && entry.name.endsWith('.sop')) yield child;
  }
}

export function readOverlayWires(parse, worldPaths) {
  if (!Array.isArray(worldPaths) || worldPaths.some((path) => typeof path !== 'string' || !path.trim())) {
    throw new TypeError('Z3 worldPaths must be an array of SOP file or directory paths.');
  }
  const wires = new Map();
  for (const path of worldPaths) {
    for (const file of sopFiles(resolve(path))) {
      for (const wire of parse(readFileSync(file, 'utf8'))) {
        if (wire.type === 'core.word' || wire.type === 'w.request.key') wires.set(wire.id, wire);
      }
    }
  }
  return wires;
}

export function overlayWires(installed, overlays, type) {
  return [
    ...installed.filter((wire) => !overlays.has(wire.id)),
    ...Array.from(overlays.values()).filter((wire) => wire.type === type),
  ];
}
