// A declared selection-wide command has no target object. Demonstrative
// operands belong to the ordinary deselect frame and retain their referent.
export function wholeSelectionPredicates(tokens, grammar, splitPoints, predicates) {
  if (grammar.modeMaps?.get('pick.none') !== 'deselect') return [];
  const frameWords = (frame) => grammar.frames.get(frame)?.parts.filter(({ is }) => is === 'word') ?? [];
  const [clearVerbs, , selectionNouns] = frameWords('acts.more.pick.none.clear');
  const [deselectVerbs, deselectObjects] = frameWords('acts.more.pick.none');
  if (!clearVerbs || !selectionNouns || !deselectVerbs || !deselectObjects) return [];
  const clear = new Set(clearVerbs.words);
  const selection = new Set(selectionNouns.words);
  const deselect = new Set(deselectVerbs.words);
  const universal = new Set(deselectObjects.words.filter((word) => ['all', 'everything'].includes(word)));
  const verbStarts = new Set(predicates.map(({ startTok }) => startTok));
  const boundaries = splitPoints.filter((cut) => {
    if (cut.isStrong) return true;
    let start = cut.endTok + 1;
    while (tokens[start]?.isFiller) start++;
    return verbStarts.has(start);
  });
  const atEnd = (next) => next >= tokens.length || ['.', '!', '?', ';'].includes(tokens[next].text) ||
    boundaries.some(({ startTok }) => startTok === next) ||
    tokens.slice(next).every((token) => token.isFiller || token.isPunct);
  const readings = [];
  for (let start = 0; start < tokens.length; start++) {
    const verb = tokens[start].lower;
    if (!clear.has(verb) && !(deselect.has(verb) && verbStarts.has(start))) continue;
    const lastCut = boundaries.findLast(({ endTok }) => endTok < start);
    if (!tokens.slice((lastCut?.endTok ?? -1) + 1, start)
      .every((token) => token.isGrammar || token.isFiller || token.text === ',')) continue;
    let end = start;
    if (clear.has(verb)) {
      let noun = start + 1;
      if (grammar.determiners.has(tokens[noun]?.lower)) noun++;
      if (tokens[noun]?.lower === 'current') noun++;
      if (!selection.has(tokens[noun]?.lower)) continue;
      end = noun;
    } else if (universal.has(tokens[start + 1]?.lower)) {
      end++;
    }
    if (atEnd(end + 1)) readings.push({ startTok: start, endTok: end });
  }
  return readings;
}
