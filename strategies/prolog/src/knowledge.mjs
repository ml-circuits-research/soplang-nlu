import { AsyncLocalStorage } from 'node:async_hooks';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const scope = new AsyncLocalStorage();
const installations = new Map();

export async function openKnowledge(directory) {
  const root = resolve(directory);
  let installation = installations.get(root);
  if (!installation) {
    const entry = pathToFileURL(join(root, 'tools/sopworld/sopworld.mjs'));
    installation = import(entry).then(api => ({root, api}));
    installations.set(root, installation);
    installation.catch(() => installations.delete(root));
  }
  return installation;
}

export function withKnowledge(installation, action) {
  return scope.run(installation, action);
}

export function knowledge() {
  const installation = scope.getStore();
  if (!installation) throw new Error('SOP knowledge is unavailable outside an open Prolog strategy');
  return installation;
}

export const parse = (...args) => knowledge().api.parse(...args);
export const quote = (...args) => knowledge().api.quote(...args);
export const str = (...args) => knowledge().api.str(...args);
export const serialize = (...args) => knowledge().api.serialize(...args);
export const analyse = (...args) => knowledge().api.analyse(...args);
export const morphOf = (...args) => knowledge().api.morphOf(...args);
export const inflectBy = (...args) => knowledge().api.inflectBy(...args);
