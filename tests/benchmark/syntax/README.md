# The benchmark of the `syntax` schema

A formalization strategy reads one English message and writes one circuit in the `syntax` schema (`docs/syntax-schema.md`). This benchmark runs every strategy over one sample of messages and says, for each strategy, how many of its circuits are acceptable.

A circuit is acceptable when a judge, a language model that follows `rules.md`, says so. A judge is slow and costs money, so every decision is kept in the dataset, each in one place:

- the **registry** `webmeet-dataset/annotations/syntax/v1/judged/` holds what a judge decided: every circuit a judge read, accepted or rejected, and every circuit a judge wrote;
- the **labels** are the circuits in the syntactic files `webmeet-dataset/syntactic/**/*.csv`: the row of a message holds its circuit (`sop`), who wrote it (`source`) and how it was accepted (`accepted_by`: `judge`, `written` or `agreement`). No other file holds labels.

A circuit that the registry already holds needs no judge again. Neither does a circuit that is the label of its message, also when formalizers agreed on it and no registry line records it.

All commands are run from the folder `soplang-nlu`. No tool here reads the knowledge repository or the `nlu` schema, except `convert-nlu.mjs`.

## The sample

A sample is a gzipped JSON array of `{id, text}`. Only the `id` and the `text` of a message are read.

| Sample | Messages | Use |
| --- | ---: | --- |
| `eval-results/2026-11-26-fresh-locked-one-percent/sample.json.gz` | 1,831 | The earlier fixed sample, 1% of the dataset. `run.mjs` takes it when no `--sample` is given. Strategies were tuned on it on 2026-11-27. |
| `eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz` | 1,831 | A fresh 1%, drawn with the seed "syntax-2026-11-27". It shares no message with the fixed sample. |

`sample.mjs` draws a new sample:

```sh
node tests/benchmark/syntax/sample.mjs eval-results/<folder>/sample.json.gz --share 0.01 --seed <text> \
  --exclude eval-results/2026-11-26-fresh-locked-one-percent/sample.json.gz eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz
```

It reads the `text` column of every CSV file under `semantic/` of the dataset as committed, keeps each distinct text once, puts the texts in a random order fixed by the seed, and takes the first share of them that stand in no excluded sample. The files under `syntactic/` hold the same messages and are never read as a source. Beside the sample it writes a `.lock.json` with the seed, the share, the dataset commit and the count. The same seed, share, commit and exclusions give the same sample. An existing sample file is never replaced by another one.

## One benchmark, from start to table

Choose a new run folder under `eval-results/`, for example `eval-results/2026-11-27-syntax-benchmark-a`. The steps below write only into that folder, until step 4 publishes the verdicts.

**1. Run the strategies.**

```sh
node tests/benchmark/syntax/run.mjs eval-results/2026-11-27-syntax-benchmark-a --sample eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz
```

Every strategy of `strategies.mjs` whose exported object declares `schema: 'syntax'` is run over the sample through the common reader `createReader({strategy})`, with no knowledge directory. A strategy without that declaration is reported as "not ported". Each strategy runs in a process of its own: when it throws, ends or hangs on a message, that message gets an error and the run goes on.

| Option | Use |
| --- | --- |
| `--sample <file>` | The sample to run. Without it, the earlier fixed sample. |
| `--only vss,z3` | Run these strategies only. The entries of the other strategies in `summary.json` stay as they are. |
| `--limit 50` | Take the first 50 messages only, for a quick trial. |
| `--reuse <folder>` | When `<folder>/<strategy>.jsonl` exists, take it instead of running the strategy. Every circuit of the file is checked again. |
| `--timeout 120` | Seconds a strategy may take for one message. |
| `--jobs 3` | Run three strategies at the same time. The times per message are then less exact. |
| `--options <file>` | A JSON file `{"<strategy>": {…}}` with what a strategy needs to open, such as the path of its model. A strategy also sees the environment variables it documents. |

**2. Prepare the packets for the judge.**

```sh
node tests/benchmark/syntax/judge-prepare.mjs eval-results/2026-11-27-syntax-benchmark-a --size 200
```

Every circuit is looked up in the registry and compared with the label of its message. The circuits that the registry does not hold, and that are not the label, are written once each into `judging/packet-<k>.jsonl`, 200 to a packet, however many strategies wrote them. A packet line holds a number, the message and the circuit. It does not say which strategy wrote the circuit. The labels that the messages of the run have at this moment are kept in the run folder, as the labels before the run.

**3. Judge.** A judge reads `judging/RULES.md` and one packet, and writes `judging/verdicts-<k>.jsonl`: one line `{"n", "grade", "note"}` for each packet line. The grade is L8 for an acceptable circuit, or L1 to L6 for a rejected one. A rejection quotes the words of the message in single quotes. The judge then checks the file:

```sh
node eval-results/2026-11-27-syntax-benchmark-a/judging/check.mjs 3
```

It reports format problems and how many lines are judged. A line with a format problem does not count until it is corrected. The benchmark tools do not start judges.

**4. Publish the verdicts into the dataset.**

```sh
node tests/benchmark/syntax/judge-publish.mjs eval-results/2026-11-27-syntax-benchmark-a --tag 2026-11-27-syntax-benchmark-a --judge <model>
```

This writes one new file `<tag>.jsonl` into the registry; an existing file is never overwritten. It also sets the labels, in the syntactic files: every circuit accepted in this run becomes the label of its message, whatever the row held before, also a circuit settled by agreement. The cells `sop`, `source` and `accepted_by` ("judge") of the message's row are set. Only the files that change are written, and in them only the rows of these messages, so `node tools/layers.mjs check` in the dataset still passes. Nothing is committed: committing the dataset is a separate decision.

**5. Print the table.**

```sh
node tests/benchmark/syntax/table.mjs eval-results/2026-11-27-syntax-benchmark-a
node tests/benchmark/syntax/agree.mjs eval-results/2026-11-27-syntax-benchmark-a
```

`table.mjs` can be called at any time, also before any judge has worked: the circuits not yet judged stand in the column "waiting".

## A conversion round

The dataset keeps its messages in `webmeet-dataset/semantic/<tab>/<file>.csv`. A conversion round gives one or more of these files their counterpart in `webmeet-dataset/syntactic/`, with the syntax circuit of every message. The round is also a test of the formalizers: its report has the same table of levels. Testing and converting are one activity.

`round.mjs` has one sub-command for each step. `<round>` is a new folder under `eval-results/`.

**0. See what the next rounds would take.** This writes nothing.

```sh
node tests/benchmark/syntax/round.mjs plan --rounds 3
```

**1. Start the round.**

```sh
node tests/benchmark/syntax/round.mjs start <round> [--min-messages 500] [--order size|name] [--files drawing/style-01.csv,…]
```

It takes the next source file that has no syntactic file and belongs to no round in progress: the file with the fewest messages first, or the first by name with `--order name`. A round that caught a small file takes another one, until it has at least 500 messages. `--files` names the files instead. The source files are read as they are on disk. It writes `files.json` and `sample.json`: every distinct text of a file once, in the order of the file, with the id `<tab>/<file>#<record number>`.

**2. Run the formalizers** on the sample of the round, as in any benchmark.

```sh
node tests/benchmark/syntax/run.mjs <round> --sample <round>/sample.json
```

**3. Settle what needs no judge, and prepare the rest for the judge.**

```sh
node tests/benchmark/syntax/round.mjs settle <round> [--audit 0.05]
```

For every message the circuits of the formalizers are grouped by their core.

- A circuit that the registry already holds keeps its verdict, accepted or rejected.
- A circuit that is the label of its message is accepted already, by a judge or by agreement, and is not settled or judged again.
- A circuit that formalizers of at least three different families wrote alike is settled by agreement: it counts as accepted, and no judge reads it (`settle --families <n>` changes the number). A family is the source of the analysis, declared in `strategies.mjs`: vss; parser (spacy-direct, spacy-beam, neural-dependencies, and also neuro-prolog, neuro-z3, neuro-selector and selector-distilbert, which read the same dependency parse or choose among circuits written from it); prolog (prolog, prolog-example-transfer); z3; distilbert. Formalizers of one family read a message from the same source, so their agreement settles nothing. Three families, not two: on the first judged sample a judge rejected 14 of 39 circuits that only VSS and Prolog wrote alike, and 3 of 427 that three or four of the earlier families wrote alike.
- Every other circuit goes into `judging/packet-<k>.jsonl`, as in a benchmark.
- A random share of the agreed circuits, 5% unless `--audit` says otherwise, goes to the judge as well. The judge does not see which they are. Their verdicts show how often agreement is right. When the judge rejects such a circuit, the judge's word counts.

`--key` says what "wrote alike" means: `core` (the default) the same core; `relaxed` (also `--relaxed`) the same core up to the start of every relation with a marker; `variants` also up to the other choices that the judges' rules let pass either way (see "Written alike up to what the rules let pass" below). With `relaxed` or `variants` the circuit of the first strategy of `--prefer` stands for the circuits counted alike. `batch-settle.sh` settles the conversion folders with `--key relaxed` unless it is given `--key variants`, and `agreed.mjs` takes the same `--key`.

It writes `settle.json` with the counts (and the key) and `key/agreement.jsonl` with the agreed circuits. Judges then work as in step 3 of a benchmark.

**4. Have the missing circuits written.**

```sh
node tests/benchmark/syntax/round.mjs rewrite-prepare <round>
```

A message whose circuits were all rejected, or for which no formalizer wrote a valid circuit, has no accepted circuit. These messages go into `rewriting/packet-<k>.jsonl`, each with its rejected circuits and the judge's reasons. A judge reads `rewriting/REWRITE.md`, writes the correct circuit of each message into `rewriting/written-<k>.jsonl` as lines `{"n", "sop"}`, and runs `node check.mjs <k>` in that folder. The checker tests every written circuit against the schema and the message and says in words what to correct. A message that still has a circuit waiting for a judge is left out; call the command again after the judging.

**5. Write the syntactic files.**

```sh
node tests/benchmark/syntax/round.mjs write <round> --tag <name> --judge <model>
```

It publishes into the registry file `<tag>.jsonl` what the judge decided, and nothing else:

| What | `verdict` | `judge` | `source` |
| --- | --- | --- | --- |
| A circuit the judge read, also an agreed one read for the audit | accepted or rejected | the model | the formalizers that wrote it |
| A circuit the judge wrote | accepted | the model | `judge` |

A circuit settled by agreement that no judge read gets no registry line. It is written into the syntactic file, with `accepted_by` "agreement", and that is its only record. A round in which no judge decided anything writes no registry file.

Then each syntactic file of the round is written: every message of the source file once, in order, with the columns `text`, `sop`, `source` and `accepted_by` (`agreement`, `judge` or `written`). The circuit of a message is the one accepted in this round, most formalizers first; a message for which the round accepted nothing new keeps its label.

The command writes nothing at all, and lists the messages, while a message of the round has no circuit. `--allow-open` writes the files with empty cells for those messages. A file that exists already is completed: its empty cells are filled, and it is left as it is when the round would change a circuit that is already there.

**6. Report.**

```sh
node tests/benchmark/syntax/round.mjs report <round>
```

It can be called at any time. It says how the messages of the round are settled (by agreement, accepted by a judge, written by a judge, still open), how many of the agreed circuits sent to the judge were accepted, and gives the table of levels per formalizer. A circuit settled by agreement counts as accepted for the formalizers that wrote it: L8, or L9 or L10 against the label the message had before the round.

## The labels

A label is the accepted circuit of a message. The labels are the syntactic files of the dataset, and only they: `webmeet-dataset/syntactic/<tab>/<file>.csv` has one row per message with the columns `text`, `sop`, `source` and `accepted_by`. A message whose `sop` cell is empty has no label.

`readLabels` in `lib.mjs` reads them. It gives, for a message, its circuit, its `source` and its `accepted_by`. The core of the circuit, by which circuits are compared, is computed the first time it is asked for, so a tool that looks up the messages of one run computes the cores of those messages only.

`judge-publish.mjs` writes the labels of a benchmark run and `round.mjs write` those of a conversion round. A message has one label. When several circuits of one message were accepted in one run, the label is the one most strategies wrote, and among equals the first by its number in the packets. The other circuits a judge accepted stay accepted in the registry.

Nothing repeats the labels. Until 2026-11-27 a file `labels.jsonl` did, and so did registry lines with the judge "agreement". `drop-duplicates.mjs` removed them, after checking each against the syntactic files; it reports before it changes anything, and changes nothing without `--apply`.

## The table

One row per strategy. Each message is at one level.

| Level | Meaning |
| --- | --- |
| L0 | The strategy returned no valid circuit. |
| L1 to L6 | The circuit is rejected, by a judge of this run or already in the registry. The level is the judge's grade: L1 a wrong clause, L2 a word with content held as a discourse word, L3 words in the wrong wire or a wrong tie, L4 a statement the message does not make, L5 a missing clause, L6 something left untied. `rules.md` defines them. |
| L7 | Unused. In the earlier legend it meant one good and one bad circuit; a strategy now returns one circuit. |
| L8 | The circuit is accepted and is not the label the message had. Either a judge accepted it in this run and the message had no label, or the registry already held it as accepted, so no judge was needed. |
| L9 | The circuit is equal to the label the message had before the run. No judge was needed. |
| L10 | A judge accepted the circuit in this run and the message had another label before. The label is replaced. |
| waiting | No judge has read the circuit yet. |

"Before the run" means the labels that the messages of the run had when `judge-prepare.mjs` (or `round.mjs settle`) was first called for the run. They are kept in `key/labels-before.jsonl`, one line `{"text", "label", "source", "accepted_by"}` for each message of the run that had a label, so the table of a run does not change when later runs replace labels. The file is written once and not changed after that.

**GOAL** is the share of all messages at L8, L9 or L10. A waiting message is not counted in GOAL, so GOAL can only rise while circuits wait. Below the table stands, per strategy, how many accepted circuits leave an attachment open with `attachment=ambiguous`.

`agree.mjs` groups, for every message, the strategies by their circuit. It reports how often all strategies wrote the same circuit, how often more than half did, and the same for each pair. Where the shared circuit has a verdict, it says how often that verdict is "accepted". This figure shows whether agreement between strategies can later stand in for a judge.

## When two circuits are the same

Two circuits of one message are the same when their core is equal. The core comes from `coreOf` of `lib/syntax.mjs`, applied to the normal form of the circuit.

The normal form (`normalForm` in `lib.mjs`) is needed for two reasons. The judge must not see who wrote a circuit, and wire names such as `@x1` would tell. And `coreOf` alone tells apart circuits that say the same: `marker="next to"` against `marker="next" marker="to"`, and `from=$a to=$b` against `to=$b from=$a`. In the normal form:

- wires are named `c`, `n`, `r`, `k` with a number, in the order of their first word;
- `dependent`, `modifier`, `auxiliary`, `negation` and `discourse` hold one word per value;
- `marker` and `conjunction` hold neighbouring words as one value;
- a clause lists its subject, then its complements; a relation `from`, then `to`.

The packets, the registry and the syntactic files hold circuits in this form.

## Written alike up to what the rules let pass

For settling by agreement, two circuits can count as written alike although their cores differ. `relaxedCore` leaves out the start of every relation with a marker, since the judges accept several starts. `agreementKey` goes further: it rewrites the circuit into one way for each choice that `rules.md` names as passing either way, and then takes the core with the starts left out. Under the key `variants`, two circuits are alike when their `relaxedCore` or their `agreementKey` is equal, so `variants` never counts fewer circuits alike than `relaxed`.

| The choice | The rule in `rules.md` | The way the key keeps |
| --- | --- | --- |
| Which clause holds a discourse word; "Thanks!" as a fragment of its own | What is not judged: "Which clause holds a `discourse` word" | No clause; the fragment left empty is dropped |
| A number or a name right after a noun | "may be a `dependent` in that noun's nominal, or a nominal of its own tied to the noun by a relation without a marker" | A dependent. Not when the noun is a capitalised word and the name is not a number ("Core Hub" cut in two), and not when the name's nominal is tied to anything else, such as the start of a relation with a marker |
| A name of several words | "may stand whole in `head`, or with its last word as `head` and the others as `dependent`" | The run of words as the head, also with a number or a name after a one-word head. A head of several words is not extended to the right ("meeting Intro" + "Main" stays apart) |
| "a bit", "a little" | "`modifier` words of the clause ...; "a bit" or "a little" may also stand as a nominal of its own (a measure)" | Modifiers of the clause, when the measure is a complement of it |
| A naming participle: "called", "named", "titled", "entitled", "labelled" | "is the `verb` of a nonfinite clause tied to the thing. Written as the `marker` of a relation between the thing and its name, it also passes" | The marker; the start of that relation, the thing named, is compared |
| A quantity phrase before a noun: "a pair of", "a couple of", "all of", "every one of" (the rule's examples only) | "may be held as `dependent` words of that noun" | Dependents of the noun |
| "let's", "let us" | ""let" is the `verb`; "'s" or "us" ... may be the `subject` of the nonfinite clause ... Holding "let's" or "let us" as `discourse` words of an imperative clause of "add" also passes" | Discourse words of the imperative clause |
| "left of", "right of"; a word that grades a place marker: "just above", "right behind", "up above" | ""left of" may be one `marker`, or "left" a nominal or a clause `modifier`"; "A word that grades a linking word ... may be a `modifier` of the clause the relation belongs to" | The word as a modifier of the clause; the relation marked "of" then starts at the clause |
| The start of a relation with a marker | "the clause, or any nominal of that clause that grammar allows" | Left out, as `relaxedCore`; the order of coordinated relations does not depend on it. Kept for "of", which "starts at that nominal or at its clause, never at another nominal", and for the marker of a naming participle |

Not rewritten, although judges accepted both ways in some messages, because `rules.md` does not name the choice: a word held as `modifier` or as `discourse`; a word after a nominal as its dependent or as a clause modifier; the nominal of "make X look Y" as a complement of "make" or not; the start of a relation without a marker that ends at a participle; two bare nouns with either as head (tried: judges rejected the first word as head in "Quarterly revenue", "order quantity", "Weekly review"); a noun before a name or a number held as its dependent (tried: judges rejected "120" as head of "a triangle 120").

Measured on 2026-11-27 with judges' verdicts only (the registry without the lines of the judge "agreement", and the judging folders of the runs below), on the circuits as they stood at 18:23 and on the first runs that were judged in full:

| Run | VSS and spaCy alike: `relaxed` → `variants` | Of the pairs added, both accepted / one accepted and one rejected / both rejected / not judged | All pairs of strategies: added, both accepted / one accepted and one rejected / both rejected |
| --- | --- | --- | --- |
| 1% benchmark | 624 → 807 of 1,831 | 182 / 0 / 1 / 0 | 800 / 1 / 21 |
| 1% benchmark, first run | 575 → 708 | 132 / 0 / 1 / 0 | 733 / 0 / 28 |
| round 01 | 354 → 388 of 575 | 34 / 0 / 0 / 0 | 684 / 24 / 28 |
| round 01, first run of VSS | 319 → 356 | 34 / 0 / 3 / 0 | 289 / 7 / 11 |
| round 02 | 287 → 343 of 590 | 30 / 0 / 0 / 26 | 371 / 0 / 0 (976 not judged) |
| VSS lever trials | (VSS only) | | 16 / 0 / 0 |

Every pair added with one circuit accepted and the other rejected was read. They come from seven messages: in five the rejection names a part that both circuits share ("set the Results heading level 3", "write a article titled Q3 results about the team offsite", two messages "add Planning ..., ID planning", "make the eyes scale 1.5"); one is a verdict given before the rule on naming participles existed ("create a heading named Overview"); one is a start of a relation with a marker that the words settle, which `relaxedCore` leaves out as well ("turn code on for characters 4 to 9 of Body"). The pairs where both circuits were rejected share the error the judge named; in three of them ("Bench flush", "Barn close", "r1 kind") both circuits put a word that is no part of the name into it, one as the head and one inside a whole head. Over all judged pairs of circuits of one message in the registry, one accepted and one rejected (9,415), `relaxedCore` makes 70 alike and `variants` 78; the eight added are the seven messages above and one more whose rejection names a part both circuits share ("I want the line drawn right to left ... while you're at it"). On the 217 conversion folders (182,324 messages, the first runs of VSS and spacy-direct), VSS and spaCy write alike 57,739 messages (31.7%) under `relaxed` and 70,834 (38.9%) under `variants`: calendar 10.6% → 56.0%, document 15.8% → 42.9%, diagram 28.3% → 33.4%, drawing 37.6% → 42.1%. Of the 13,095 messages added there, the registry holds a verdict on VSS's circuit for 694: 686 accepted, 8 rejected; seven of the eight are quantity phrases held as dependents ("a pair of trees"), rejected on the fixed sample before the rule that lets them pass was written, and one shares the error of spaCy's circuit.

## The files of a run folder

| File | Written by | Content |
| --- | --- | --- |
| `<strategy>.jsonl` | `run.mjs` | One line per message: `{"id", "text", "sop", "error", "ms"}`. `sop` is the circuit or null. `error` starts with its kind: `invalid circuit`, `no circuit`, `crash` or `timeout`. |
| `summary.json` | `run.mjs` | The sample, and per strategy: status, messages, valid circuits, errors by kind, median milliseconds per message. |
| `logs/<strategy>.log` | `run.mjs` | What the strategy printed. |
| `judging/packet-<k>.jsonl`, `RULES.md`, `check.mjs` | `judge-prepare.mjs` | What a judge needs. |
| `judging/verdicts-<k>.jsonl` | a judge | The verdicts. |
| `key/items.jsonl` | `judge-prepare.mjs` | Which strategies wrote circuit `n`. Not for the judge. |
| `key/labels-before.jsonl` | `judge-prepare.mjs` | The labels that the messages of the run had before the run. |
| `table.md`, `table.json` | `table.mjs` | The levels. |
| `agreement.md`, `agreement.json` | `agree.mjs` | The agreement between strategies. |

A conversion round adds:

| File | Written by | Content |
| --- | --- | --- |
| `files.json`, `sample.json` | `round.mjs start` | The source files of the round and their messages. |
| `settle.json`, `key/agreement.jsonl` | `round.mjs settle` | The counts, and the circuits settled by agreement. |
| `rewriting/packet-<k>.jsonl`, `REWRITE.md`, `RULES.md`, `check.mjs` | `round.mjs rewrite-prepare` | What a judge needs to write the missing circuits. |
| `rewriting/written-<k>.jsonl` | a judge | The written circuits. |
| `key/rewrite-items.jsonl` | `round.mjs rewrite-prepare` | The messages sent for writing. |
| `written.json` | `round.mjs write` | What was published and which syntactic files were written. |
| `report.md`, `report.json` | `round.mjs report` | How the messages were settled, and the levels. |

`judge-prepare.mjs` can be called again after more strategies were run into the same folder: the numbers already given stay, and new circuits go into new packets.

For a trial, `--registry <folder>` makes `judge-prepare.mjs`, `judge-publish.mjs`, `table.mjs` and `agree.mjs` use another registry. The labels are then the syntactic files in the folder `syntactic` beside it (or the folder `--syntactic` names), so a trial never reads or writes the labels of the dataset. A registry at `<dataset>/annotations/syntax/v1/judged` goes with `<dataset>/syntactic`.

## Reference circuits from the `nlu` schema

Before this schema, judges accepted and rejected circuits written in the `nlu` schema. `convert-nlu.mjs` rewrites the accepted ones into `syntax` circuits, by the table "How it relates to the `nlu` schema" of `docs/syntax-schema.md`, into `webmeet-dataset/annotations/syntax/v1/reference/reference-nlu-v1.jsonl`. It rewrites a circuit only when the rules settle every word, and reports the others with the reason. It is the one tool that uses the old checker and the knowledge repository, to find the position of each quoted value. No strategy may depend on it.

No judge has read these circuits in the `syntax` schema. They are not in the registry, they are no labels, and no level counts them. The file is kept for comparison.

## Tests

```sh
env -u SOP_KNOWLEDGE_DIR node --test tests/syntax-benchmark.test.mjs
```
