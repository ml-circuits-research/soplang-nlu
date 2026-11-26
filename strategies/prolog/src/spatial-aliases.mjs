// A native frame can list alternative prepositions immediately before its place
// operand. Its fixed relation and two existing prepositions corroborate the sense.
export function spatialAliases(facts, spatial, values, normalize) {
  const one = (w,k) => values(w,k)[0];
  const parts = Map.groupBy(facts('w.lang.en.part'),w => one(w,'frame'));
  const readings = new Map();
  for (const fixed of facts('w.lang.en.fixed')) {
    if (one(fixed,'role') !== 'rel') continue;
    const base = normalize(one(fixed,'value') ?? '');
    const meanings = spatial.get(base);
    if (new Set(meanings).size !== 1) continue;
    const [meaning] = meanings;
    const ordered = [...(parts.get(one(fixed,'frame')) ?? [])].sort((a,b) => Number(one(a,'at'))-Number(one(b,'at')));
    for (const [i,part] of ordered.entries()) {
      if (one(part,'is') !== 'word') continue;
      const next = one(ordered[i+1] ?? {attrs:{}},'is') === 'det' ? i+2 : i+1;
      const arg = ordered[next];
      if (!arg || one(arg,'is') !== 'role' || one(arg,'role') !== 'place' || one(arg,'takes') !== 'words') continue;
      const forms = new Set(values(part,'word').map(normalize));
      if (!forms.has(base) || [...forms].filter(f => spatial.get(f)?.includes(meaning)).length < 2) continue;
      for (const form of forms) {
        if (spatial.has(form)) continue;
        const senses = readings.get(form) ?? new Map();
        readings.set(form,senses);
        senses.set(meaning,base);
      }
    }
  }
  return [...readings].filter(([,senses]) => senses.size === 1)
    .map(([form,senses]) => [form,...senses.entries().next().value]);
}
