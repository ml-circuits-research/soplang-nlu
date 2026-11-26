import { createFormaliser } from './index.mjs';
import { unquoteSop } from './contracts.mjs';

export function readerError(text, error, { status = 'error', line } = {}) {
  return {
    engine: 'z3', text: typeof text === 'string' ? text : null,
    candidates: [], unresolved: [], error: error instanceof Error ? error.message : String(error),
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
      return { engine: 'z3', text, candidates, unresolved, error, ok, status, elapsedMs, stats, ambiguity };
    } catch (error) {
      return readerError(text, error);
    }
  }

  // A Z3 context has a mutable assertion stack. Serialize proposals and wait
  // for accepted work before closing the context and its WASM workers.
  let pending = Promise.resolve();
  let closing;
  return {
    async propose(text) {
      if (closing) return readerError(text, 'Reader is closed.');
      const result = pending.then(() => read(text));
      pending = result.then(() => {});
      return result;
    },
    async close() {
      closing ??= pending.then(() => formaliser.close());
      await closing;
    },
  };
}
