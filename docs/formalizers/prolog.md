[Home](../README.md) › [Formalizers](README.md) › Prolog

# Prolog (parked)

This page: a description of the parked Prolog formalizer, a hand-written grammar over word classes, with the open-class words learned from the text. Kind: Explanation.

## What it is

A grammar of English written by hand in [Prolog](https://en.wikipedia.org/wiki/Prolog), a logic programming language long used for grammars. It runs in [SWI-Prolog](https://en.wikipedia.org/wiki/SWI-Prolog), called from Node.js.

- **The grammar**: `strategies/prolog/prolog/syntax.pl`. Every rule speaks of a word class, a word form or a position; no rule names a thing, an action or a phrase of a particular domain.
- **The word classes**: `strategies/prolog/src/english.mjs` lists by hand only function words (determiners, pronouns, auxiliaries, prepositions, conjunctions, numerals, a few adverbs, words said to the listener) and common verbs with their irregular forms. No noun and no adjective is listed.
- **The open-class words** (nouns, verbs, describing words) come from a small word model, `strategies/prolog/model/word-model.json`, learned from the dataset's raw text by `train-word-model.mjs`. A word found nowhere is taken as a noun.

## How it reads a message

As far as the code's comments record:

1. **Tokens and classes** (`src/syntax-input.mjs`). Each token is a word, a run of words written as one ("x-axis", "and/or"), or a punctuation mark. Each gets its possible classes from the hand lists, the word endings and the word model.
2. **Sentences.** A full stop, question mark, exclamation mark or semicolon ends one.
3. **Clauses.** The grammar finds where a clause begins: a subject and its verb, a verb with its auxiliary, an auxiliary before its subject, or a command that begins with the base form of a verb. The core (the verb with its auxiliaries, negation and subject) fixes the form of the clause. After the verb it reads complements, phrases with a marker, modifiers and dependent clauses.
4. **Joining clauses.** Clauses side by side form one coordination. A clause after a subordinator, and a part with no verb after a colon or a dash, are tied to their neighbour by a relation.
5. **Where a marked phrase starts.** A marked phrase is one opened by a linking word (a marker) such as "on", "with" or "of". A phrase with "of", a measure, and a phrase the grammar has fixed start where the grammar puts them. In a clause with no verb, a phrase starts at the nominal before it; after a list member that is not the last, at that member. Otherwise, after a nominal other than a pronoun, the phrase starts at the clause and is marked `attachment=ambiguous`: the words do not settle where it hangs ([Read your first circuit](../concepts/first-circuit.md)).
6. **Writing** (`src/write-wires.mjs`): the wires are written as a circuit with `lib/syntax.mjs`.

A persistent SWI-Prolog process (`prolog/syntax_worker.pl`) serves one message at a time.

The word model counts, in raw text, where each word stands next to function words: after a determiner at the end of its phrase, it is used as a noun; before a determiner or a pronoun, where a verb can stand, as a verb; before nouns, after a pronoun or "be" at the end of a clause, or after a degree word, as a modifier.

## Standard, new here, particular

| Label | In the Prolog formalizer |
| --- | --- |
| Standard | Writing a grammar as logic rules in Prolog. Prolog's classic notation for grammars is the [definite clause grammar](https://en.wikipedia.org/wiki/Definite_clause_grammar); this grammar uses ordinary Prolog rules. |
| New here | The grammar itself. |
| Particular | The word model is counted on this dataset's text. |

## Speed and cost

About a millisecond per message; it needs SWI-Prolog. Comparison: [Speed and cost](speed.md). Numbers: [STATUS](../STATUS.md#speed-and-cost-per-strategy).

## Known limits

- **Many open attachments.** It marks a large share of its accepted circuits `attachment=ambiguous`, by step 5 above. The judges let that pass, which makes its circuits easier to accept. The share is in [STATUS](../STATUS.md#the-benchmark-live).
- **No circuit for some messages.** Some messages get no valid circuit, level L0 ([Levels L0–L10 and GOAL](../evaluation/levels.md)).

## Why parked

Prolog is still measured, but not improved for now: the owner's decision. The owner keeps at most four strategies with different sources, and one hand-written grammar among them. Prolog and Z3 both stand for that place, and which one keeps it is open ([decision D10](../project/decisions.md#d10)).

## Run it

[Run a formalizer](../guides/run-a-formalizer.md). The SWI-Prolog program is the option `swipl`, else the variable `SWIPL`, else `swipl` on the path, else a copy in the sibling repository `prolog-formaliser` (`tools/swipl`).

## History

The old page `docs/strategies/prolog.md` described an earlier reader of the `nlu` schema. It read vocabulary and frames from the knowledge worlds and could build a second reading with a constituent chart. The folder `strategies/prolog/` still holds many files of that reader; the syntax strategy uses `index.mjs`, `src/english.mjs`, `src/syntax-input.mjs`, `src/write-wires.mjs`, `src/prolog-worker.mjs` and the two `.pl` files named above. See [Strategies of the nlu-schema period](../project/nlu-strategies.md).

---

Next: [Z3 (parked)](z3.md) · Up: [Formalizers](README.md)
