import { HYP_KINDS } from '../contracts.mjs';

export function sharedCreationReadings(lattice, grammar, maxRequests) {
  if (maxRequests < 2 || !grammar.constructions.has('ellipsis.verb')) return [];
  const { text, tokens, candidates, splitPoints, nonDirectives } = lattice;
  if (nonDirectives.length || splitPoints.some(({ isStrong, endTok }) => isStrong && endTok < tokens.length - 1)) return [];

  const isCoordinator = ({ text: word }) => word !== ',' && grammar.coordinators.has(word.toLowerCase());
  const coordinators = splitPoints.filter(isCoordinator);
  if (!coordinators.length) return [];

  // Each coordinated argument must have its own determiner and declared noun head.
  const headsAt = new Map();
  for (const candidate of candidates) {
    if (candidate.det !== 'indefinite' ||
        ![HYP_KINDS.TARGET_SORT, HYP_KINDS.TARGET_FAMILY].includes(candidate.kind)) continue;
    const { detTok } = candidate;
    if (!headsAt.has(detTok)) headsAt.set(detTok, []);
    headsAt.get(detTok).push(candidate);
  }
  const joins = coordinators.filter(({ endTok }) => headsAt.has(endTok + 1));
  if (!joins.length) return [];

  // Include a preceding comma in the same separator. A comma by itself
  // introduces a list item only when the final item has a coordinator.
  const lastJoin = joins.at(-1);
  const commas = splitPoints.filter(({ text: word, endTok }) =>
    word === ',' && endTok < lastJoin.startTok && headsAt.has(endTok + 1));
  const cuts = [...commas, ...joins.map((join) =>
    tokens[join.startTok - 1]?.text === ',' ? { ...join, startTok: join.startTok - 1 } : join)]
    .sort((a, b) => a.startTok - b.startTok);
  if (cuts.length >= maxRequests) return [];

  // A different written directive after a coordinator needs its own parse.
  const predicateStarts = new Set(candidates.filter(({ kind }) => kind === HYP_KINDS.PREDICATE)
    .map(({ startTok }) => startTok));
  if (coordinators.some(({ endTok }) => predicateStarts.has(endTok + 1))) return [];

  const predicates = candidates.filter((candidate) => candidate.kind === HYP_KINDS.PREDICATE &&
    candidate.licensed?.some(({ act }) => act === 'make') &&
    headsAt.has(candidate.endTok + 1) &&
    candidate.endTok < cuts[0].startTok &&
    tokens.slice(0, candidate.startTok).every((token) => token.isGrammar || token.isFiller || token.isPunct));
  return predicates.flatMap((predicate) => {
    // A complement introduced by "with" can own the following list. Keep
    // that attachment in the ordinary solve instead of projecting a verb.
    if (tokens.slice(predicate.endTok + 1, cuts.at(-1).startTok).some(({ lower }) => lower === 'with')) return [];
    const starts = [predicate.endTok + 1, ...cuts.map(({ endTok }) => endTok + 1)];
    const ends = [...cuts.map(({ startTok }) => startTok - 1), tokens.length - 1];
    // An inner indefinite head before a cut may coordinate with the next
    // noun inside the same complement ("a frame containing a heading and
    // a paragraph"). Avoid assigning that noun the outer creation verb.
    if (ends.slice(0, -1).some((end, i) =>
      [...headsAt.keys()].some((detTok) => detTok > starts[i] && detTok <= end))) return [];
    const predicateLength = predicate.endTok - predicate.startTok + 1;
    const parts = starts.map((start, i) => {
      const end = ends[i];
      const heads = headsAt.get(start).filter(({ endTok }) => endTok <= end);
      const requestWords = text.slice(i === 0 ? 0 : tokens[start].start, tokens[end].end).trim();
      const projectedText = i === 0 ? requestWords : `${predicate.text} ${requestWords}`;
      const predicateStart = i === 0 ? predicate.startTok : 0;
      return { heads, requestWords, projectedText, predicateStart, predicateEnd: predicateStart + predicateLength - 1 };
    });
    return parts.every(({ heads }) => heads.length) ? [parts] : [];
  });
}
