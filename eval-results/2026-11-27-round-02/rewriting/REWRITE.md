# Writing the circuit of a message

For the messages of these packets no formalizer wrote an acceptable circuit. Your task is to write the correct circuit of each message in the `syntax` schema.

## Read first

1. `RULES.md` in this folder: the rules by which a judge accepts or rejects a circuit. The circuit you write must be one that these rules accept.
2. The schema: `/home/salboaie/work/sopworlds/soplang-nlu/schemas/syntax/schema.sop`. Its 4 wire types and 18 keys are all there is.
3. The specification with its rules and examples: `/home/salboaie/work/sopworlds/soplang-nlu/docs/syntax-schema.md`. Read at least "The wires and their keys", Rules 1 to 5 and "Boundary examples".

## What a packet holds

Each line of `packet-<k>.jsonl` is one message:

```json
{"n": 12, "text": "make the box red and the circle blue", "rejected": [{"sop": "…", "note": "…"}]}
```

`rejected` holds the circuits that were rejected for this message, each with the judge's reason. They show what went wrong. Do not write one of them again.

## How to write a circuit

- One wire per line: `@c1 syntax.clause form=imperative verb="move" complement=$n1`. Name clauses `c1, c2…`, nominals `n1…`, relations `r1…`, coordinations `k1…`.
- A quoted value holds words of the message, written as in the message. Every word of the message stands in exactly one value. Punctuation stands in no value.
- When a word occurs twice in the message, values take its occurrences in the order the circuit is written, top to bottom and left to right. So write the wires in the order of the message.
- `dependent`, `modifier`, `auxiliary`, `negation` and `discourse` hold one word per value: `dependent="the" dependent="red"`. A `marker` of several words is one value: `marker="next to"`.
- Every clause has a `form`. A clause with no verb is `form=fragment` and has no `verb` key.
- Write what the words show, with no knowledge of the world and no context. When the words leave open whether a phrase attaches to the verb or to a nominal, start the relation at the clause and add `attachment=ambiguous`.
- When a word is misspelt or unknown, keep it where it stands.

## What you write

For `packet-<k>.jsonl` write `written-<k>.jsonl` in this folder, one line for each message:

```json
{"n": 12, "sop": "@c1 syntax.clause form=imperative verb=\"make\" modifier=\"red\" complement=$n1\n@n1 syntax.nominal dependent=\"the\" head=\"box\"\n@c2 syntax.clause form=fragment modifier=\"blue\" complement=$n2 ellipsis=$c1\n@n2 syntax.nominal dependent=\"the\" head=\"circle\"\n@k1 syntax.coordination conjunction=\"and\" conjunct=$c1 conjunct=$c2"}
```

`n` is the number of the packet line. `sop` is the whole circuit as one text, the wires separated by `\n`.

Then run `node check.mjs <k>` in this folder. It checks every circuit against the schema and against its message, and says in words what is wrong: a word that stands in no value, a key the schema does not have, a wire that is named and missing. Correct the line and run it again until it reports no problem. A line with a problem does not count.

If you cannot write a correct circuit for a message, leave its line out. The message then stays open and is reported as such.
