import { unquoteSop, KEY_ALIASES } from './contracts.mjs';

function summarizeCircuit(sop, parse) {
  if (!sop) return [];
  let wires;
  try {
    wires = parse(sop);
  } catch {
    return [];
  }
  const reqMap = new Map();
  for (const w of wires) {
    if (w.type === 'w.request.request') {
      reqMap.set(w.id, {
        act: unquoteSop(w.attrs.act?.[0] ?? ''),
        mode: unquoteSop(w.attrs.mode?.[0] ?? 'none'),
        mood: unquoteSop(w.attrs.mood?.[0] ?? 'do'),
        question: unquoteSop(w.attrs.question?.[0] ?? 'none'),
        family: '',
        tmode: '',
        constraints: [],
      });
    } else if (w.type === 'w.request.target') {
      const ref = String(w.attrs.request?.[0] ?? '').replace(/^\$/, '');
      const r = reqMap.get(ref);
      if (r) {
        r.family = unquoteSop(w.attrs.family?.[0] ?? '');
        r.tmode = unquoteSop(w.attrs.mode?.[0] ?? '');
      }
    } else if (w.type === 'w.request.constraint') {
      const ref = String(w.attrs.request?.[0] ?? '').replace(/^\$/, '');
      const r = reqMap.get(ref);
      if (r) {
        const rawAttr = unquoteSop(w.attrs.attribute?.[0] ?? '');
        const attr = KEY_ALIASES[rawAttr] ?? rawAttr;
        const val = unquoteSop(w.attrs.value?.[0] ?? w.attrs.step?.[0] ?? '');
        r.constraints.push(`${attr}=${val}`);
      }
    }
  }
  return [...reqMap.values()];
}

/**
 * Compute concrete human/downstream-readable differences between Top-1 and Top-2 Z3 circuits.
 */
export function describeAmbiguity(top1Sop, top2Sop, parse) {
  if (!top1Sop || !top2Sop || top1Sop === top2Sop) return [];
  const a = summarizeCircuit(top1Sop, parse);
  const b = summarizeCircuit(top2Sop, parse);
  const diffs = [];

  if (a.length !== b.length) {
    diffs.push(`request_count: ${a.length} vs ${b.length}`);
  }
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const p = n > 1 ? `r${i + 1}.` : '';
    const ra = a[i];
    const rb = b[i];
    if (ra.act !== rb.act) diffs.push(`${p}act: ${ra.act} vs ${rb.act}`);
    if (ra.mode !== rb.mode) diffs.push(`${p}act_mode: ${ra.mode} vs ${rb.mode}`);
    if (ra.mood !== rb.mood) diffs.push(`${p}mood: ${ra.mood} vs ${rb.mood}`);
    if (ra.question !== rb.question) diffs.push(`${p}question: ${ra.question} vs ${rb.question}`);
    if (ra.family !== rb.family) diffs.push(`${p}family: ${ra.family} vs ${rb.family}`);
    if (ra.tmode !== rb.tmode) diffs.push(`${p}target_mode: ${ra.tmode} vs ${rb.tmode}`);
    if (diffs.length === 0) {
      const ca = ra.constraints.slice().sort().join(', ');
      const cb = rb.constraints.slice().sort().join(', ');
      if (ca !== cb) diffs.push(`${p}constraints: [${ca}] vs [${cb}]`);
    }
  }
  return diffs.slice(0, 4);
}

export function solverAmbiguity(proposals, parse) {
  const [first, second] = proposals;
  if (!first) return undefined;
  const objective = first.objective;
  const alternativeObjective = second?.objective ?? null;
  const margin = objective !== null && alternativeObjective !== null ? alternativeObjective - objective : null;
  const differences = parse && second ? describeAmbiguity(first.sop, second.sop, parse) : [];
  return { objective, alternativeObjective, margin, differences };
}
