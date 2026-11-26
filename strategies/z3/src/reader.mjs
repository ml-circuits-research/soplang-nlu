import { createFormaliser } from './index.mjs';
import { unquoteSop } from './contracts.mjs';

export function readerError(text, error, { status = 'error', line } = {}) {
  return {
    engine: 'z3', text: typeof text === 'string' ? text : null,
    candidates: [], analyses: [], unresolved: [], error: error instanceof Error ? error.message : String(error),
    ok: false, status, line,
  };
}

export async function createReader({ knowledgeDir, worldPaths, z3Module, timeout, topK, confidence, ambiguity: includeAmbiguity = confidence } = {}) {
  const formaliser = await createFormaliser({ knowledgeDir, worldPaths, z3Module, includeLegacy: false });

  async function read(text) {
    if (typeof text !== 'string' || !text.trim()) {
      return readerError(text, 'Expected a nonempty text string.', { status: 'invalid-input' });
    }
    try {
      const result = await formaliser.formaliseCurrentText(text, { timeout, topK, confidence: includeAmbiguity });
      const unresolved = [...(result.unresolved ?? [])];
      const candidates = (result.proposals ?? []).map((proposal, candidate) => {
        const { ok, errors, warnings, uncoveredWords, wires } = formaliser.verifier.check(text, proposal.sop);
        for (const wire of wires ?? []) {
          if (wire.type !== 'w.request.unread') continue;
          unresolved.push({
            candidate,
            text: unquoteSop(wire.attrs.text?.[0]),
            note: wire.attrs.note ? unquoteSop(wire.attrs.note[0]) : undefined,
          });
        }
        return { ...proposal, check: { ok, errors, warnings, uncoveredWords } };
      });
      const error = result.status === 'unknown' && unresolved.length ? null : result.error ?? null;
      const { ok, elapsedMs, stats, ambiguity } = result;
      const status = result.status === 'sat' && unresolved.some(({ candidate }) => candidate === 0)
        ? 'partial' : result.status;
      return { engine: 'z3', text, candidates, unresolved, error, ok, status, elapsedMs, stats, ambiguity, analyses: [] };
    } catch (error) {
      return readerError(text, error);
    }
  }

  async function analyse(text) {
    if (typeof text !== 'string' || !text.trim()) {
      return readerError(text, 'Expected a nonempty text string.', { status: 'invalid-input' });
    }
    try {
      return await formaliser.analyseCurrentText(text, { timeout, topK });
    } catch (error) {
      return { analyses: [], analysisDiagnostics: { solver: 'z3', status: 'error', error: error.message } };
    }
  }

  // Both entry points own the same mutable assertion stack, so serialize them.
  let pending = Promise.resolve();
  let closing;
  function enqueue(text, operation) {
    if (closing) return Promise.resolve(readerError(text, 'Reader is closed.'));
    const result = pending.then(() => operation(text));
    pending = result.then(() => {}, () => {});
    return result;
  }
  return {
    analyse: (text) => enqueue(text, analyse),
    propose: (text) => enqueue(text, read),
    async close() {
      closing ??= pending.then(() => formaliser.close());
      await closing;
    },
  };
}
