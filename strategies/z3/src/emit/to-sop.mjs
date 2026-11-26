// Deterministic projection from a Z3 model (Map<varName, value>) into canonical w.request SOP Lang wires.
// No semantic heuristics here: purely formats what Z3 decided, honoring w.request non-redundancy rules.

import {
  HYP_KINDS,
  SMT_TO_ACT,
  SMT_TO_MODE,
  SMT_TO_MOOD,
  SMT_TO_QUESTION,
  SMT_TO_TMODE,
  SMT_TO_TFILL,
  SMT_TO_DET,
  SMT_TO_PHASE,
  SMT_TO_WANT,
  acceptsPropertyFamily,
  defaultOnFor,
  fmtSopValue,
} from '../contracts.mjs';

function escRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textSays(phrase, text) {
  if (!phrase) return false;
  return new RegExp(`(?<![\\w])${escRegex(phrase)}(?:e?s)?(?![\\w])`, 'i').test(text);
}

function wireLine(id, type, pairs) {
  const body = pairs
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      if (typeof v === 'object' && v.ref) return `${k}=${v.ref}`;
      if (typeof v === 'object' && v.asString) return `${k}=${fmtSopValue(v.val, { asString: true })}`;
      return `${k}=${fmtSopValue(v)}`;
    })
    .join(' ');
  return `@${id} ${type}${body ? ' ' + body : ''}`;
}

export function modelToSop(model, lattice, meta) {
  const { text, tokens, candidates } = lattice;
  const { R, tabSpec, previous, clock, elided } = meta;
  const candById = new Map(candidates.map((c) => [c.id, c]));
  const lines = [];

  // 1. Optional context wires supplied as input (@prev, @clock)
  if (previous) {
    lines.push(wireLine('prev', 'w.request.previous', [['text', previous]]));
  }
  if (clock?.now && clock?.timezone) {
    lines.push(wireLine('clock', 'w.request.clock', [['now', clock.now], ['timezone', clock.timezone]]));
  }

  // Collect selected candidates by kind and owner
  const selected = (meta.activeCandidates ?? candidates).filter((c) => model.get(`sel_${c.id}`) === true);
  const fillers = selected
    .filter((c) => c.kind === HYP_KINDS.FILLER)
    .sort((a, b) => a.startTok - b.startTok);

  let fIdx = 0;
  for (const f of fillers) {
    if (!f.text || !text.includes(f.text)) continue;
    lines.push(wireLine(`f${++fIdx}`, 'w.request.filler', [['text', f.text]]));
  }

  // Determine active requests
  const activeReqs = [];
  for (let r = 1; r <= R; r++) {
    if (model.get(`active_${r}`) === true) activeReqs.push(r);
  }
  const multiReq = activeReqs.length > 1;

  // Map KEY_WORD bindings: constraintId -> KEY_WORD[]
  const kwByConstraint = new Map();
  for (const c of selected.filter((x) => x.kind === HYP_KINDS.CONSTRAINT)) {
    const kwId = model.has(`kw_${c.id}`) ? model.get(`kw_${c.id}`) : (elided?.get(c.id)?.kw ?? -1);
    if (typeof kwId === 'number' && kwId >= 0) {
      const kw = candById.get(kwId);
      if (kw && model.get(`sel_${kw.id}`) === true) {
        if (!kwByConstraint.has(c.id)) kwByConstraint.set(c.id, []);
        kwByConstraint.get(c.id).push(kw);
      }
    }
  }

  for (let idx = 0; idx < activeReqs.length; idx++) {
    const r = activeReqs[idx];
    const rId = `r${idx + 1}`;
    const mine = selected
      .filter((c) => model.get(`own_${c.id}`) === r)
      .sort((a, b) => a.startTok - b.startTok);

    const act = SMT_TO_ACT[model.get(`act_${r}`)] ?? 'change';
    const mode = SMT_TO_MODE[model.get(`amode_${r}`)] ?? 'none';
    const mood = SMT_TO_MOOD[model.get(`mood_${r}`)] ?? 'do';
    const question = SMT_TO_QUESTION[model.get(`q_${r}`)] ?? 'none';
    const askedId = model.get(`asked_${r}`);
    const famId = model.get(`fam_${r}`) ?? 0;
    const family = tabSpec.families[famId] ?? tabSpec.families[0];
    const tmode = SMT_TO_TMODE[model.get(`tmode_${r}`)] ?? 'existing';
    const tfill = SMT_TO_TFILL[model.get(`tfill_${r}`)] ?? 'none';
    const tdet = SMT_TO_DET[model.get(`tdet_${r}`)] ?? 'none';
    const hasLookup = model.get(`lookup_${r}`) === true;

    const pred = mine.find((c) => c.kind === HYP_KINDS.PREDICATE);
    const tSort = mine.find((c) => c.kind === HYP_KINDS.TARGET_SORT);
    const tFam = mine.find((c) => c.kind === HYP_KINDS.TARGET_FAMILY);
    const tRef = mine.find((c) => c.kind === HYP_KINDS.TARGET_REF);
    const kws = mine.filter((c) => c.kind === HYP_KINDS.KEY_WORD);
    const cons = mine.filter((c) => c.kind === HYP_KINDS.CONSTRAINT);
    const unreads = mine.filter((c) => c.kind === HYP_KINDS.UNREAD);

    // Exact tight substring for multi-request words OR single requests with an outer content-bearing filler
    // (never repeat full text; ensures check.mjs sees outer fillers like "That would help" strictly outside the request!)
    const hasOuterContentFiller = fillers.some((f) => meta.outerFillerIds?.has(f.id));
    let reqWords = null;
    if ((multiReq || hasOuterContentFiller || meta.nonDirectives?.length) && mine.length > 0 && tokens.length > 0) {
      const requestStart = model.get(`rstart_${r}`);
      const ownerDeterminers = [tSort, tFam, tRef].map((head) => head?.detTok)
        .filter((tok) => Number.isInteger(tok) && tok >= 0 && tok >= requestStart);
      const minS = Math.min(...mine.map((c) => c.startTok), ...ownerDeterminers);
      const maxE = Math.max(...mine.map((c) => c.endTok));
      const span = text.slice(tokens[minS].start, tokens[maxE].end);
      if (span && span !== text) reqWords = span;
    }

    // Request wire
    const reqPairs = [['act', act]];
    if (mode !== 'none') reqPairs.push(['mode', mode]);
    reqPairs.push(['mood', mood]);
    if (reqWords) reqPairs.push(['words', reqWords]);
    if (pred && pred.text && text.includes(pred.text) && (!reqWords || reqWords.includes(pred.text))) {
      reqPairs.push(['predicate', pred.text]);
    }
    if (question !== 'none') reqPairs.push(['question', question]);
    if (pred?.bareReference) reqPairs.push(['refers', 'thing']);
    if (typeof askedId === 'number' && askedId >= 0 && askedId < tabSpec.keyList.length) {
      const askedAttr = tabSpec.keyList[askedId].name;
      reqPairs.push(['asked', askedAttr]);
      for (const kw of kws) {
        if ((kw.attrs ?? []).includes(askedAttr) && (!reqWords || reqWords.includes(kw.text))) {
          reqPairs.push(['asked_words', kw.text]);
        }
      }
    }
    lines.push(wireLine(rId, 'w.request.request', reqPairs));

    // Target wire
    const tPairs = [
      ['request', { ref: '$' + rId }],
      ['family', family],
      ['mode', tmode],
    ];
    if (tdet !== 'none') tPairs.push(['determiner', tdet]);
    if (tmode !== 'new' && tfill !== 'none') tPairs.push(['fill', tfill]);

    const scopeText = reqWords ?? text;

    if (tSort) {
      const sortVal = tSort.sort;
      const sortWords = tSort.sortWords && tSort.sortWords !== sortVal && scopeText.includes(tSort.sortWords)
        ? tSort.sortWords
        : (!textSays(sortVal, text) && scopeText.includes(tSort.text) ? tSort.text : null);
      if (sortVal && (sortWords || textSays(sortVal, text))) {
        tPairs.push(['sort', sortVal]);
        if (sortWords && sortWords !== sortVal) tPairs.push(['sort_words', sortWords]);
      }
      if (tSort.count !== undefined && tSort.countWords && scopeText.includes(tSort.countWords)) {
        tPairs.push(['count', tSort.count]);
        tPairs.push(['count_words', tSort.countWords]);
      }
      if (tSort.quantifier && scopeText.includes(tSort.quantifier)) {
        tPairs.push(['quantifier', tSort.quantifier]);
      }
      if (tSort.ordinal && scopeText.includes(tSort.ordinal)) {
        tPairs.push(['ordinal', tSort.ordinal]);
      }
    }

    if (tRef) {
      if (tRef.name && scopeText.includes(tRef.name)) {
        tPairs.push(['name', tRef.name]);
        // Attach any selected name introducer KEY_WORD ("called", "labelled", "named")
        for (const kw of kws) {
          if (kw.isNameIntro && kw.endTok < tRef.startTok && (tRef.startTok - kw.endTok) <= 3 && scopeText.includes(kw.text)) {
            tPairs.push(['name_words', kw.text]);
          }
        }
      }
      if (tRef.description && scopeText.includes(tRef.description)) {
        tPairs.push(['description', tRef.description]);
      }
      if (tRef.codeWords && scopeText.includes(tRef.codeWords)) {
        tPairs.push(['code_words', tRef.codeWords]);
      }
      if (tRef.ids?.length && !(tRef.ids.length === 1 && tRef.name && tRef.ids[0] === tRef.name)) {
        for (const id of tRef.ids) {
          if (scopeText.includes(id)) tPairs.push(['ids', id]);
        }
      }
      if (tRef.quantifier && !tSort?.quantifier && scopeText.includes(tRef.quantifier)) {
        tPairs.push(['quantifier', tRef.quantifier]);
      }
      if (tRef.ordinal && !tSort?.ordinal && scopeText.includes(tRef.ordinal)) {
        tPairs.push(['ordinal', tRef.ordinal]);
      }
    }

    if (tFam) {
      if (tFam.familyWords && scopeText.includes(tFam.familyWords)) {
        tPairs.push(['family_words', tFam.familyWords]);
      }
      if (tFam.description && !tRef?.description && scopeText.includes(tFam.description)) {
        tPairs.push(['description', tFam.description]);
      }
      if (tFam.count != null && tFam.countWords && !tSort?.countWords && scopeText.includes(tFam.countWords)) {
        tPairs.push(['count', tFam.count]);
        tPairs.push(['count_words', tFam.countWords]);
      }
      if (tFam.ordinal && !tSort?.ordinal && !tRef?.ordinal && scopeText.includes(tFam.ordinal)) {
        tPairs.push(['ordinal', tFam.ordinal]);
      }
      if (tFam.quantifier && !tSort?.quantifier && !tRef?.quantifier && scopeText.includes(tFam.quantifier)) {
        tPairs.push(['quantifier', tFam.quantifier]);
      }
    }

    if (!pred?.targetless && !pred?.bareReference) lines.push(wireLine(`${rId}.t`, 'w.request.target', tPairs));

    let lookupIndex = 0;
    const emitThingLookup = (owner, wireId, from, words) => {
      lines.push(wireLine(`${rId}.l${++lookupIndex}`, 'w.request.lookup', [
        ['request', { ref: `$${rId}` }],
        ...(owner ? [[owner, { ref: `$${wireId}` }]] : []),
        ['key', 'thing'],
        ['from', from],
        ['words', words],
      ]));
    };

    if (hasLookup && !pred?.targetless) {
      const reference = tRef?.isPronoun && scopeText.includes(tRef.text) ? tRef.text : null;
      const fromWhere = lattice.catalog ? 'any' : previous || tfill === 'journal_step' ? 'previous' : (reference ? 'any' : 'page');
      // An unresolved artifact can belong to the request without a typed target.
      if (pred?.bareReference) emitThingLookup(null, null, fromWhere, reference);
      else emitThingLookup('target', `${rId}.t`, fromWhere, reference);
    }

    // Constraint wires (including atomic pairedConstraints like coord x,y)
    let cIdx = 0;
    const seenConstraintSigs = new Set();

    const emitOneConstraint = (spec, phase, want, boundKws) => {
      const attr = spec.attribute;
      if (!attr || !tabSpec.keys.has(attr)) return;
      const keySpec = tabSpec.keys.get(attr);
      const op = spec.operator ?? 'eq';
      const on = spec.on ?? defaultOnFor(attr, op);

      const srcVal = Array.isArray(spec.values) && spec.values.length > 0 ? spec.values : spec.value;
      const rawVals = (srcVal === undefined || srcVal === null
        ? []
        : (Array.isArray(srcVal) ? srcVal : [srcVal]).map((v) => String(v))
      ).filter((v) => v.length > 0);

      // Grounding rule (check.mjs lines 142-147):
      // - Never emit `words` equal to single `value`.
      // - If vals is empty (e.g. operator=delta step=more) or any value is NOT a substring of scopeText,
      //   we MUST emit `words` (exact substring of scopeText).
      const vals = [];
      let needsOpen = Boolean(spec.openValue);
      for (const v of rawVals) {
        const isClosed = keySpec.values ? keySpec.values.has(v.toLowerCase()) : false;
        const isNumeric = /^-?\d+(\.\d+)?$/.test(v);
        if (keySpec.values && !isClosed) needsOpen = true;
        const wouldQuote = !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(v) && !isNumeric && v !== 'true' && v !== 'false';
        if (wouldQuote && !text.includes(v) && !isClosed) continue;
        vals.push(v);
      }

      const candidateWords = spec.words ?? spec.text;
      let wordsToEmit = null;
      const allValsInScope = vals.length > 0 && vals.every((v) => scopeText.includes(v));
      if (candidateWords && scopeText.includes(candidateWords)) {
        if (vals.length !== 1 || candidateWords !== vals[0]) {
          if (!allValsInScope || (spec.words && spec.words !== vals[0])) {
            wordsToEmit = candidateWords;
          }
        }
      }
      if (!wordsToEmit && !allValsInScope) {
        if (spec.text && scopeText.includes(spec.text) && !(vals.length === 1 && spec.text === vals[0])) {
          wordsToEmit = spec.text;
        }
      }

      const sig = `${attr}|${vals.join('\0')}|${wordsToEmit ?? ''}|${op}|${phase}|${want}|${spec.step ?? ''}`;
      if (seenConstraintSigs.has(sig)) return;
      seenConstraintSigs.add(sig);

      const cPairs = [
        ['request', { ref: '$' + rId }],
        ['on', on],
        ['attribute', attr],
      ];
      for (const v of vals) {
        // Numeric strings in w.request.constraint value are written quoted as strings or atoms consistently
        const isNumStr = /^-?\d+(\.\d+)?$/.test(v);
        cPairs.push(['value', isNumStr ? { asString: true, val: v } : v]);
      }
      if (wordsToEmit) cPairs.push(['words', wordsToEmit]);
      if (op) cPairs.push(['operator', op]);
      if (phase) cPairs.push(['phase', phase]);
      if (want && want !== 'yes') cPairs.push(['want', want]);
      if (spec.step && spec.step !== 'none') cPairs.push(['step', spec.step]);
      if (spec.character && spec.character !== 'requirement') cPairs.push(['character', spec.character]);
      if (spec.measure !== undefined) cPairs.push(['measure', spec.measure]);
      if (spec.measureWords && scopeText.includes(spec.measureWords)) cPairs.push(['measure_words', spec.measureWords]);
      if (spec.unit) cPairs.push(['unit', spec.unit]);
      if (needsOpen) cPairs.push(['open_value', true]);
      for (const kw of boundKws) {
        if (kw.text && scopeText.includes(kw.text)) cPairs.push(['key_words', kw.text]);
      }

      const constraintId = `${rId}.c${++cIdx}`;
      lines.push(wireLine(constraintId, 'w.request.constraint', cPairs));
      if (spec.lookupWords && scopeText.includes(spec.lookupWords)) {
        emitThingLookup('constraint', constraintId, previous ? 'previous' : 'any', spec.lookupWords);
      }
    };

    for (const c of cons) {
      const el = elided?.get(c.id);
      const rawPh = model.has(`ph_${c.id}`) ? model.get(`ph_${c.id}`) : el?.phase;
      const rawWnt = model.has(`wnt_${c.id}`) ? model.get(`wnt_${c.id}`) : el?.want;
      const phase = SMT_TO_PHASE[rawPh] ?? 'result';
      const want = SMT_TO_WANT[rawWnt] ?? 'yes';
      const boundKws = kwByConstraint.get(c.id) ?? [];

      if (c.pairedConstraints?.length) {
        for (const sub of c.pairedConstraints) {
          emitOneConstraint({ ...sub, text: sub.words ?? c.text }, phase, want, boundKws);
        }
      } else {
        emitOneConstraint(c, phase, want, boundKws);
      }
    }

    // Emit verb-intrinsic constraints from k.actions (e.g., "enlarge" -> size delta more, "bold" -> format=bold)
    // ONLY when the verb carries a concrete value/delta, matches the chosen target family (or compat), and no explicit constraint already sets that short attribute!
    if (act === 'change' && pred?.intrinsicConstraints?.length && pred.text && scopeText.includes(pred.text)) {
      const explicitShorts = new Set(
        cons.flatMap((c) => (c.pairedConstraints?.length ? c.pairedConstraints.map((x) => x.attribute) : [c.attribute]))
          .filter(Boolean)
          .map((a) => (a.includes('.') ? a.split('.').slice(1).join('.') : a))
      );
      const validIntrinsics = pred.intrinsicConstraints.filter((ic) => {
        const key = ic?.attribute ? tabSpec.keys.get(ic.attribute) : null;
        if (!key || !acceptsPropertyFamily(family, key.family)) return false;
        if (!ic.value && ic.operator !== 'delta') return false;
        const sk = ic.attribute.includes('.') ? ic.attribute.split('.').slice(1).join('.') : ic.attribute;
        if (explicitShorts.has(sk)) return false;
        if (sk === 'size' && (explicitShorts.has('width') || explicitShorts.has('height') || explicitShorts.has('length'))) return false;
        return true;
      });
      const famMatch = validIntrinsics.find((ic) => ic.attribute.startsWith(`${family}.`));
      const chosenIc = famMatch ?? validIntrinsics.find((ic) => ic.attribute === 'inline.format');
      if (chosenIc) {
        const keySpec = tabSpec.keys.get(chosenIc.attribute);
        const valOk = !chosenIc.value || !keySpec?.values || keySpec.values.has(String(chosenIc.value).toLowerCase());
        if (valOk) {
          emitOneConstraint({ ...chosenIc, text: pred.text }, 'result', 'yes', []);
        }
      }
    }

    for (const [index, intent] of mine.filter((candidate) => candidate.kind === HYP_KINDS.INTENT).entries()) {
      lines.push(wireLine(`${rId}.i${index + 1}`, 'w.request.intent', [
        ['request', { ref: '$' + rId }],
        ['role', intent.role],
        ['value', intent.value],
        ['words', intent.text],
      ]));
    }

    // Merge contiguous selected UNREAD tokens (including bridging grammar words) into clean multi-word unread phrases
    const mergedUnreads = [];
    for (const u of unreads) {
      const prevU = mergedUnreads[mergedUnreads.length - 1];
      if (prevU && prevU.note === u.note && u.startTok - prevU.endTok <= 2) {
        // Check that any gap token between prevU and u is pure grammar (not punct, not selected elsewhere)
        let okBridge = true;
        for (let t = prevU.endTok + 1; t < u.startTok; t++) {
          if (!tokens[t] || tokens[t].isPunct || !tokens[t].isGrammar) { okBridge = false; break; }
        }
        if (okBridge) {
          prevU.endTok = u.endTok;
          prevU.text = text.slice(tokens[prevU.startTok].start, tokens[prevU.endTok].end);
          continue;
        }
      }
      mergedUnreads.push({ startTok: u.startTok, endTok: u.endTok, text: u.text, note: u.note });
    }

    let uIdx = 0;
    for (const u of mergedUnreads) {
      if (!u.text || !scopeText.includes(u.text)) continue;
      const uPairs = [
        ['request', { ref: '$' + rId }],
        ['text', u.text],
      ];
      if (u.note) uPairs.push(['note', u.note]);
      lines.push(wireLine(`${rId}.u${++uIdx}`, 'w.request.unread', uPairs));
    }
  }

  return lines.join('\n');
}
