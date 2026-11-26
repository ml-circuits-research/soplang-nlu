import { sequenceParts } from './composition.mjs';

const encode = value => /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u.test(value) ? value : JSON.stringify(value);
const word = /[\p{L}\p{N}]/u;
const terminal = new Set(['.', '!', '?']);
const leadLimit = 12;
const predicateLimit = 8;

function matches(visible, start, phrase) {
  return phrase.split(' ').every((part,i) => visible[start+i] === part);
}

function namedSpan(ts, visible, quotes, start, end, span, worlds) {
  if (start >= end) return;
  const first = ts[start][2], last = ts[end-1][3];
  const quoted = quotes.find(item => item.start === first && item.end === last);
  if (quoted) return word.test(quoted.value) ? quoted.value : undefined;
  const lexemes = visible.slice(start,end);
  if (lexemes.some(token => !token || /[,.!?;:()[\]{}]/u.test(token) ||
      ['sequence','clause','contrast'].includes(worlds.joiners[token]) || worlds.negatives.has(token))) return;
  const raw = span(first,last);
  if (word.test(raw) && !worlds.isReference(raw)) return raw;
}

function hasNameEvidence(ts, quotes, start, end, worlds, allowBare) {
  if (quotes.some(quote => quote.start === ts[start][2] && quote.end === ts[end-1][3])) return true;
  const [surface,raw] = ts[start];
  if (Object.hasOwn(worlds.determiners,surface)) return false;
  const label = /^[\p{L}\p{N}\p{M}_]+$/u;
  const identifier = /^(?=.*\p{L})(?=.*\p{N})[\p{L}\p{N}\p{M}_]+$/u;
  const grammatical = token => worlds.evidenceVocabulary.grammar.has(token) ||
    worlds.fillerPhrases.has(token) || worlds.scopeGrammar.conditionals.has(token) ||
    worlds.scopeGrammar.auxiliary.has(token) || worlds.scopeGrammar.questions.has(token);
  if (grammatical(surface)) return false;
  const parts = ts.slice(start,end).map(([,part]) => part);
  const proper = part => /^\p{Lu}/u.test(part) && label.test(part);
  if (parts.every(part => identifier.test(part) || proper(part))) return true;
  if (parts.length>1 && /^[0-9]+$/u.test(parts.at(-1)) && parts.slice(0,-1).every(proper)) return true;
  // A single bare content word can be an unresolved written name between a
  // licensed placement predicate and marker, or after that marker.
  return allowBare && end===start+1 && label.test(raw) && /\p{L}/u.test(raw) &&
    !worlds.lookup(surface).some(([role]) => ['act','marker','reference'].includes(role));
}

function proposal(predicate, act, pattern, [left,right], marker) {
  const {family,mode,keys,phases,relation,relationKey,anchorKey} = pattern;
  const lines = [
    '@r1 w.request.request act=' + encode(act) + ' mood=do predicate=' + encode(predicate),
    '@r1.t w.request.target request=$r1 family=' + encode(family) + ' mode=' + mode +
      (relation ? ' fill=written name=' + encode(left) : ''),
  ];
  if (relation) {
    lines.push('@r1.c1 w.request.constraint request=$r1 on=place attribute=' + encode(relationKey) +
      ' value=' + encode(relation) + (marker===relation ? '' : ' words=' + JSON.stringify(marker)) +
      ' operator=relation phase=result',
    '@r1.c2 w.request.constraint request=$r1 on=place attribute=' + encode(anchorKey) +
      ' value=' + encode(right) + ' operator=relation phase=selector',
    '@r1.a1 w.request.lookup request=$r1 constraint=$r1.c2 key=thing from=page');
  } else {
    for (const [i,value] of [left,right].entries()) {
      lines.push('@r1.c' + (i+1) + ' w.request.constraint request=$r1 on=attribute attribute=' +
        encode(keys[i]) + ' value=' + encode(value) + ' operator=eq phase=' + phases[i]);
    }
  }
  return {sop:lines.join('\n'),source:'named-arguments',support:0};
}

export function namedArgumentCandidates(text, ts, quotes, worlds, sequenceOptions, licensedNames) {
  if (ts.length < 4 || !worlds.argumentPatterns) return [];
  const visible = ts.map(([surface,,start]) =>
    quotes.some(quote => quote.start <= start && start < quote.end) ? '' : surface);
  const chars = Array.from(text);
  const span = (start,end) => chars.slice(start,end).join('');
  let stop = ts.length;
  while (terminal.has(visible[stop-1])) stop--;
  let courtesy;
  for (let i=Math.max(1,stop-12);i<stop;i++) {
    if (!terminal.has(visible[i-1]) && visible[i-1]!==',') continue;
    if (!worlds.fillerPhrases.has(visible.slice(i,stop).join(' '))) continue;
    courtesy=span(ts[i][2],ts[stop-1][3]);
    stop=i-1;
    break;
  }
  const question = stop<visible.length && visible[stop]==='?';
  const candidates = [];
  for (let start=0; start<Math.min(leadLimit,stop-3); start++) {
    const lead = visible.slice(0,start).filter(token => token !== ',').join(' ');
    if (lead && !worlds.literalGrammar.leads.has(lead) && !worlds.fillerPhrases.has(lead)) continue;
    if (question && !worlds.literalGrammar.leads.has(lead)) continue;
    for (let end=start+1; end<=Math.min(stop-3,start+predicateLimit); end++) {
      const head = visible.slice(start,end);
      if (!head.every(token => word.test(token))) break;
      const predicate = span(ts[start][2],ts[end-1][3]);
      for (const [role,act,mood] of worlds.lookup(head.join(' '))) {
        if (role !== 'act' || mood && mood !== 'do') continue;
        for (const pattern of worlds.argumentPatterns(act)) {
          const prefix = pattern.prefixes.find(prefix => matches(visible,end,prefix));
          const first = end + (prefix?.split(' ').length ?? 0);
          const separatorLength = pattern.separator.split(' ').length;
          for (let boundary=first+1; boundary+separatorLength<stop; boundary++) {
            if (!matches(visible,boundary,pattern.separator)) continue;
            const left = namedSpan(ts,visible,quotes,first,boundary,span,worlds);
            if (!left || (pattern.relation && !licensedNames?.get(pattern.family)?.has(left) &&
                !hasNameEvidence(ts,quotes,first,boundary,worlds,!licensedNames))) continue;
            const rightStart=boundary+separatorLength;
            const right = namedSpan(ts,visible,quotes,rightStart,stop,span,worlds);
            if (right && (!pattern.relation || hasNameEvidence(ts,quotes,rightStart,stop,worlds,true))) {
              const marker = span(ts[boundary][2],ts[boundary+separatorLength-1][3]);
              const candidate=proposal(predicate,act,pattern,[left,right],marker);
              if (courtesy) candidate.sop+='\n@f1 w.request.filler text='+JSON.stringify(courtesy);
              candidates.push(candidate);
            }
          }
        }
      }
    }
  }
  if (candidates.length && sequenceParts(text,ts,worlds.joiners,sequenceOptions).length) return [];
  return candidates;
}
