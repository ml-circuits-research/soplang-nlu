# Neuro-Prolog

Neuro-Prolog writes one circuit of the `syntax` schema for a message (see `docs/syntax-schema.md`).

A dependency parser gives every word a head, a relation to it, a part of speech and a tag. The default parser is an English spaCy model; a caller can pass another one as `syntaxModel`. A persistent SWI-Prolog worker (`prolog/syntax_projection.pl`) turns each relation of the parse into a place in a clause, a nominal, a relation or a coordination. `index.mjs` maps the tokens of the parser to the words of `wordsOf(text)` and writes the circuit with `writeCircuit`.

No knowledge world is read, and the symbolic Prolog strategy takes no part. The attachment of every phrase is the one the parser chose, so no relation carries `attachment=ambiguous`.

Options and environment: `python` and `model` (or `SOP_NLU_SYNTAX_PYTHON` and `SOP_NLU_SYNTAX_MODEL`) name the Python with spaCy and the model; `swipl` (or `SWIPL`) names SWI-Prolog.

The projection rules name word classes, tags and dependency relations only. The only words they name are function words and words said to the listener. A parse can be wrong; the circuit then is wrong in the same place.

Not used any more, kept in place: `prolog/dependencies.pl`, `prolog/normalization.pl` and `prolog/worker.pl`, which wrote the `nlu` schema.
