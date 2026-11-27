[Home](../README.md) › [How-to guides](README.md) › Add a rule to hmm-rules

# Add a rule to hmm-rules

This page: how to add a general rule of English to hmm-rules, with the checks and records the project expects. Kind: How-to guide.

hmm-rules is the project's own formalizer ([hmm-rules in depth](../hmm-rules/README.md)). It learns word classes, called [stations](../hmm-rules/stations.md), from raw text. Hand-written rules then group the words into units (chunks such as a nominal) and link the units into the wires of the circuit. The [legend](../hmm-rules/legend.md) is its hand-written file of stations and word lists. The existing rules are listed in [The rule catalogue](../hmm-rules/rules.md).

## The constraint first

The owner's [decision D5](../project/decisions.md#d5):

- Rules and word lists may name only [function words](https://en.wikipedia.org/wiki/Function_word): markers (prepositions, subordinators), coordinating conjunctions, auxiliaries, pronouns, determiners and numerals, and common verbs with their irregular forms.
- They never name nouns, adjectives, or anything particular to the dataset.
- Training on the dataset (its text and its accepted circuits) is allowed; hard-coding its cases is not.
- Word sets live in `strategies/hmm-rules/legend.sop` as lists with a `link=` mark, never in JavaScript.

A rule states something about English that would hold on other English text. An example of a word set with its mark, from the legend (added in commit `59066d1`). It is shortened and wrapped here; in the file the comment and the wire are one line each:

```text
# link=needsbare: a helping verb that is followed by the bare
# form of a verb ("does it fit", "could Main work").
@w.needsbare vss.words station=auxiliary open=true
  link=needsbare word="does" word="did" word="can" …
```

## Step 1: find the fault

Find a group of rejections that one statement about English would fix: [Find faults](find-faults.md).

## Step 2: decide where the rule lives

| Place | What it holds |
| --- | --- |
| `legend.sop` | Word sets. A new set becomes a new open list (`open=true`) with a `link=` mark. An open list adds a station to its words and takes none away: they keep every use the text shows. |
| `src/units.mjs` | The chunker: units built from the stations of the words, merges, and doubts. Its code also runs during training. |
| `src/links.mjs` | The linker: clauses, roles, relations, coordinations. |
| `src/reader.mjs` | Opens the model, builds the lexicon and the linker's context, runs the reading loop. Its `openModel` part runs during training. |
| `src/emit-syntax.mjs` | The writer: turns the internal wires into syntax wires and calls `writeCircuit`. |

All files are under `strategies/hmm-rules/`. In code, a rule asks for a mark through the context, for example `context.tagged(word, 'needsbare')` or `context.linkOf(word) === 'perfect'` in `links.mjs`, or `lexicon.linkOf(word)` in `units.mjs`.

If the rule needs a threshold, make it a named constant with a comment that gives the counts it was chosen from, as `SURELY_A_THING`, `SURELY_A_VERB` and `UNLIKE` do. The catalogue marks such rules T.

## Step 3: retrain, only if needed

- A change to `legend.sop`, `train.mjs`, or a module whose code runs during training needs a new model: [Retrain hmm-rules](retrain-hmm-rules.md). The reader takes the legend from the copy inside `model.json`, so a legend edit has no effect until the model is trained again.
- A change to `links.mjs`, `emit-syntax.mjs` or the `createHmmRulesReader` part of `reader.mjs` does not change the model.
- A change to `units.mjs` that touches only rules guarded by `lexicon.leans`, `lexicon.linkOf` or a rule letter does not change the model either: those lookups are absent during training.
- Giving a mark, through a new open list, to words that are already listed leaves the learned parts of the model unchanged (recorded in the message of commit `fa46cb7`).

## Step 4: check

1. Run the hmm-rules tests ([Run the tests](run-tests.md)):

   ```sh
   env -u SOP_KNOWLEDGE_DIR node --test \
     tests/hmm-rules-syntax.test.mjs tests/hmm-rules.test.mjs
   ```

2. Compare the circuits before and after, and read every changed circuit that was accepted before ([Find faults](find-faults.md), steps 3 to 5).
3. Send the changed circuits to judges ([Find faults](find-faults.md), step 6).

To see which rule acts on a message, trace it, and switch the lettered rules off one at a time with `without` ([Run a formalizer](run-a-formalizer.md)).

## Step 5: record

- One commit per rule batch ([decision D14](../project/decisions.md#d14)), with the checks in the message.
- A line in the journal, [improvements-ideas.md](../../improvements-ideas.md), under the rules added to hmm-rules (to read it on a phone: [The journal, as lists](../status/journal.md)).

## What is standard here

| Piece | Kind |
| --- | --- |
| Rule-based chunks | Standard: [shallow parsing](https://en.wikipedia.org/wiki/Shallow_parsing) by rules over word classes. |
| Function-word rules | New here: the legend's marked lists, and the owner's constraint that rules name only function words. |
| Thresholds | Particular: some are chosen from counts in this dataset (marked T). |

## Pitfalls

- **Retraining shifts unrelated readings.** The model is estimated from scratch at every training. Relating "goes" to "go" in the stem rule was dropped because the retrained model shifted unrelated readings (the journal, "Measured and dropped"). The practice: add marks as new open lists, retrain once, check at once.
- **Rule order matters.** The comment of the serial-list rule in `links.mjs` cites "a boy with a kite, a dog on the grass, and a girl", but at commit `fa46cb7` the [gapping](https://en.wikipedia.org/wiki/Gapping) rule catches that message first and writes three clauses that share "draw". Trace the messages a rule is meant for.
- **`tests/hmm-rules.test.mjs` can pass with a stale model**, since it reads `legend.sop` directly.
- **Others may be changing hmm-rules at the same time.** Work runs in parallel ([decision D14](../project/decisions.md#d14)): look at `git status` before editing, and commit each batch on its own.

Next: [Add a spaCy repair](add-spacy-repair.md) · Up: [How-to guides](README.md)
