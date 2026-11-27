# Prolog example transfer

This strategy writes one circuit of the `syntax` schema for a message (see `docs/syntax-schema.md`). It has no grammar of its own. It matches a whole message against templates learned from examples and writes the circuit of the template over the words of the new message. A message that no template takes is read by the grammar of the Prolog strategy.

An example is a message with one trusted `syntax` circuit: `{text, sop}`. `trainSyntaxTransfer(rows)` returns the model; save it as JSON and pass it as `modelPath`, or pass the object as `model`. The trainer reads no knowledge world. It turns the words that can change without changing the build of the message into slots: a number, the words of a quotation, a name written with a capital letter. All other words are literal. A template is kept when a slot was seen with two different fillers, or when it has at least three literal words. The matcher (`syntax-match.pl`) unifies all the words of a message with a template in SWI-Prolog.

Without a model there are no templates, and every message is read by the grammar of the Prolog strategy. No set of trusted `syntax` examples exists yet, so none is shipped.

Not used any more, kept in place: `train.mjs` and `match.pl`, which learned from `w.request` circuits and needed a knowledge repository.
