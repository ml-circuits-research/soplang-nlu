// Thin persistent Z3 WASM runner using z3-solver's SMT-LIB2 evaluator (MaxSMT + push/pop).
// Uses the installed z3-solver package unless the caller supplies a module.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

const PRELUDE_SMT = readFileSync(join(ROOT, 'smt', 'prelude.smt2'), 'utf8');
const AXIOMS_SMT = readFileSync(join(ROOT, 'smt', 'axioms.smt2'), 'utf8');

async function loadZ3Module(explicitModule) {
  if (typeof explicitModule === 'string') {
    return await import(pathToFileURL(resolve(explicitModule)).href);
  }
  return explicitModule ?? await import('z3-solver');
}

// Parse an S-expression string returned by Z3's (get-objectives) + (get-value (...))
// into { status, values: Map<name, value>, objective: number|null, raw }.
export function parseSmtValues(output) {
  const rawStr = String(output || '');
  const lines = rawStr.split(/\r?\n/);
  const statusLine = lines.find((l) => /^(sat|unsat|unknown)\b/.test(l.trim()))?.trim() ?? 'unknown';
  const map = new Map();
  let objective = null;
  if (statusLine !== 'sat') return { status: statusLine, values: map, objective, raw: output };

  // Find the first S-expr block starting after the status line.
  const idx = rawStr.indexOf('(');
  if (idx < 0) return { status: statusLine, values: map, objective, raw: output };
  const body = rawStr.slice(idx);

  // Tokenize S-expressions: '(', ')', or atom/string.
  const toks = [];
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { toks.push(c); i++; continue; }
    if (c === '"') {
      let s = '"'; i++;
      while (i < body.length) {
        if (body[i] === '"' && body[i + 1] === '"') { s += '"'; i += 2; continue; }
        if (body[i] === '"') { s += '"'; i++; break; }
        s += body[i++];
      }
      toks.push(s);
      continue;
    }
    let a = '';
    while (i < body.length && !/[\s()]/.test(body[i])) a += body[i++];
    toks.push(a);
  }

  let pos = 0;
  function readExpr() {
    if (pos >= toks.length) return null;
    const t = toks[pos++];
    if (t !== '(') return t;
    const list = [];
    while (pos < toks.length && toks[pos] !== ')') list.push(readExpr());
    if (toks[pos] === ')') pos++;
    return list;
  }

  function decodeAtom(expr) {
    if (Array.isArray(expr)) {
      if (expr.length === 2 && expr[0] === '-' && /^\d+(\.\d+)?$/.test(expr[1])) return -Number(expr[1]);
      if (expr.length === 3 && expr[0] === '/' && /^\d+$/.test(expr[1]) && /^\d+$/.test(expr[2])) {
        return Number(expr[1]) / Number(expr[2]);
      }
      return expr;
    }
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
    return expr;
  }

  // Parse (objectives (...)) and (get-value (...)) blocks cleanly.
  while (pos < toks.length) {
    const block = readExpr();
    if (!Array.isArray(block)) continue;
    if (block[0] === 'objectives') {
      let sum = 0;
      let foundObj = false;
      for (let j = 1; j < block.length; j++) {
        const entry = block[j];
        if (Array.isArray(entry) && entry.length >= 1) {
          const val = decodeAtom(entry[entry.length - 1]);
          if (typeof val === 'number' && !Number.isNaN(val)) {
            sum += val;
            foundObj = true;
          }
        } else if (typeof entry === 'string') {
          const val = decodeAtom(entry);
          if (typeof val === 'number' && !Number.isNaN(val)) {
            sum += val;
            foundObj = true;
          }
        }
      }
      if (foundObj) objective = sum;
      continue;
    }
    for (const pair of block) {
      if (Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string') {
        map.set(pair[0], decodeAtom(pair[1]));
      }
    }
  }
  return { status: statusLine, values: map, objective, raw: output };
}

export async function createZ3Runner({ module: explicitModule, timeoutMs = 4000 } = {}) {
  const z3Mod = await loadZ3Module(explicitModule);
  const { Context, Z3, em } = await z3Mod.init();
  let ctx = new Context('nl_formaliser');
  let initialised = false;
  let solveCount = 0;

  async function ensureInit() {
    if (initialised) return;
    const header = `(set-option :timeout ${timeoutMs})\n${PRELUDE_SMT}\n${AXIOMS_SMT}\n`;
    const res = await Z3.eval_smtlib2_string(ctx.ptr, header);
    if (/\(error\b/.test(String(res))) {
      throw new Error('Z3 prelude/axioms SMT-LIB2 error: ' + res);
    }
    initialised = true;
  }

  // Periodically recreate context after many solves to keep WASM heap lean.
  async function maybeReset() {
    if (solveCount > 0 && solveCount % 250 === 0) {
      ctx = new Context(`nl_formaliser_${solveCount}`);
      initialised = false;
      await ensureInit();
    }
  }

  // Solve a MaxSMT problem body (declarations + assertions + assert-soft), returning values for `queryVars`.
  // Supports topK > 1 via blocking clauses over `blockVars`.
  async function solve(smtBody, queryVars, { topK = 1, blockVars = [], timeout = timeoutMs } = {}) {
    await ensureInit();
    await maybeReset();
    solveCount++;

    const solutions = [];
    const objectives = [];
    const blocks = [];

    for (let k = 0; k < topK; k++) {
      const getVal = queryVars.length ? `(get-value (${queryVars.join(' ')}))` : '';
      const script = [
        '(push 1)',
        `(set-option :timeout ${timeout})`,
        smtBody,
        ...blocks,
        '(check-sat)',
        '(get-objectives)',
        getVal,
        '(pop 1)',
      ].join('\n');

      const raw = await Z3.eval_smtlib2_string(ctx.ptr, script);
      const parsed = parseSmtValues(raw);
      const diagnostics = String(raw).split(/\r?\n/).filter((line) => /^\s*\(error\b/.test(line));
      // The batch still asks for a model after a non-satisfiable check. This
      // diagnostic is expected when the last available proposal was blocked.
      const unexpected = diagnostics.some((line) => parsed.status === 'sat' ||
        !/: model is not available"\)\s*$/.test(line));
      if (unexpected) {
        // The evaluator may already have run the scripted pop. Recreate the
        // private context instead of popping an unknown stack depth.
        ctx = new Context(`nl_formaliser_recover_${solveCount}`);
        initialised = false;
        return { ok: false, status: 'error', error: String(raw).trim(), solutions, objectives };
      }

      if (parsed.status !== 'sat') {
        if (solutions.length > 0) break;
        return { ok: false, status: parsed.status, solutions, objectives, raw };
      }
      solutions.push(parsed.values);
      objectives.push(parsed.objective);

      if (k + 1 < topK && blockVars.length > 0) {
        const lits = [];
        for (const v of blockVars) {
          const val = parsed.values.get(v);
          if (val === undefined) continue;
          const smtVal = typeof val === 'boolean' ? (val ? 'true' : 'false')
            : typeof val === 'number' && val < 0 ? `(- ${-val})`
            : String(val);
          lits.push(`(not (= ${v} ${smtVal}))`);
        }
        if (lits.length > 0) blocks.push(`(assert (or ${lits.join(' ')}))`);
        else break;
      }
    }

    return { ok: solutions.length > 0, status: solutions.length > 0 ? 'sat' : 'unsat', solutions, objectives };
  }

  // Diagnose an UNSAT core by wrapping named hard assertions in a fresh plain check.
  async function unsatCore(namedHardDeclsAndAsserts) {
    const diagCtx = new Context('nl_formaliser_diag');
    const script = [
      '(set-option :produce-unsat-cores true)',
      PRELUDE_SMT,
      AXIOMS_SMT,
      namedHardDeclsAndAsserts,
      '(check-sat)',
      '(get-unsat-core)',
    ].join('\n');
    const raw = await Z3.eval_smtlib2_string(diagCtx.ptr, script);
    return String(raw).trim();
  }

  function fullSmtDump(smtBody, queryVars = []) {
    const getVal = queryVars.length ? `(get-value (${queryVars.join(' ')}))` : '';
    return [
      `; Generated by nl-formaliser`,
      `(set-option :timeout ${timeoutMs})`,
      PRELUDE_SMT,
      AXIOMS_SMT,
      smtBody,
      '(check-sat)',
      getVal,
    ].join('\n');
  }

  let closing;
  function close() {
    closing ??= Promise.resolve().then(() => {
      ctx = null;
      return z3Mod.killThreads?.(em);
    });
    return closing;
  }

  return { solve, unsatCore, fullSmtDump, close };
}
