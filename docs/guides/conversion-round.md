[Home](../README.md) › [How-to guides](README.md) › Run a conversion round

# Run a conversion round

This page: how to give syntactic circuits to a set of semantic files with `round.mjs`, measuring the formalizers on the way, and how to use its rewrite step for the fixer. Kind: How-to guide.

A conversion round takes one or more files of `webmeet-dataset/semantic/` and writes their counterparts in `syntactic/`, with the circuit of every message. Its report has the same table of [levels](../evaluation/levels.md) as the benchmark: testing and converting are one activity. Why: [Converting the dataset](../evaluation/conversion.md).

**Note.** Every semantic file now has its syntactic file, so `round.mjs plan` reports "No source file is left for a round", and `start --files` refuses a file that has one. A round is for new source files. The rewrite step (step 5) and the write step (step 6) also serve the folders of the [batch conversion](batch-conversion.md).

`<round>` below is a new folder under `eval-results/`, for example `eval-results/<date>-round-03`. All options: [Conversion tools](../reference/conversion-tools.md).

## Step 1: plan and start

```sh
node tests/benchmark/syntax/round.mjs plan --rounds 3
node tests/benchmark/syntax/round.mjs start <round>
```

`plan` shows which files the next rounds would take and writes nothing. `start` takes the source file with the fewest messages that has no syntactic file and belongs to no round in progress, and adds more files until the round has at least 500 messages (`--min-messages`). `--order name` takes them by name; `--files a.csv,b.csv` names them. It writes `files.json`, with a SHA-256 of each source file, and `sample.json`, with every distinct message once.

## Step 2: run the formalizers

```sh
node tests/benchmark/syntax/run.mjs <round> \
  --sample <round>/sample.json
```

As in any benchmark ([Run the benchmark](run-benchmark.md), step 1).

## Step 3: settle what needs no judge

```sh
node tests/benchmark/syntax/round.mjs settle <round> \
  --judge needed --focus hmm-rules
```

For every message, the circuits are grouped by their [core](../evaluation/normal-form.md):

- a circuit the registry holds keeps its verdict;
- a circuit equal to the message's label is accepted already;
- a circuit that formalizers of at least three [families](../evaluation/agreement.md) wrote alike is settled by agreement (`--families` changes the number);
- a random share of the agreed circuits still goes to a judge, mixed with the others ([audit](../evaluation/audit.md); `--audit`, 0.05 by default);
- the other circuits go to packets, according to `--judge`.

`--judge all`, the default, sends every circuit not yet decided, as a benchmark does. `--judge needed` sends, for each message with no accepted circuit, only one circuit: the one most families wrote, then most formalizers, then the first formalizer named by `--prefer`. When it is rejected, the next call of `settle` sends the next one. This is the owner's rule of one judge per message ([decision D9](../project/decisions.md#d9)). `--focus vss` still sends every circuit of hmm-rules, so hmm-rules gets a level on every message.

It writes `settle.json` (the counts) and `key/agreement.jsonl` (the agreed circuits).

## Step 4: have the packets judged

Judges write `judging/verdicts-<k>.jsonl` and check them with `node <round>/judging/check.mjs <k>`: [Judge a packet](judge-a-packet.md).

## Step 5: let the fixer write the missing circuits

```sh
node tests/benchmark/syntax/round.mjs rewrite-prepare <round> --now
```

- A message whose circuits were all rejected, or that no formalizer wrote a valid circuit for, goes into `rewriting/packet-<k>.jsonl`, 100 to a packet by default (`--size`). Each line is `{"n", "text", "rejected": [{"sop", "note"}]}`, so the fixer sees what went wrong.
- The fixer, a judge in that role, reads `rewriting/REWRITE.md`, `RULES.md` and the schema, and writes `rewriting/written-<k>.jsonl`, one line `{"n", "sop"}` per message.
- The fixer runs `node check.mjs <k>` in `rewriting/`. It tests every written circuit against the schema and the message, says in plain words what to correct ("these words of the message stand in no value: …"), and refuses a circuit equal to one already rejected for that message.
- Without `--now`, a message that still has a circuit waiting for a judge is left out, since that circuit may yet be accepted. After `--judge needed` the other circuits are never sent, so `--now` is needed.

A written circuit is accepted with no second judge.

## Step 6: write the syntactic files

```sh
node tests/benchmark/syntax/round.mjs write <round> \
  --tag <tag> --judge <model>
```

- Into the registry file `<tag>.jsonl` it publishes only what a judge decided: each circuit a judge read and each circuit a judge wrote. A circuit settled by agreement gets no registry line; its record is its row, with `accepted_by` "agreement".
- It then writes each syntactic file: every message of the source file once, in order, with the columns `text`, `sop`, `source` and `accepted_by`.
- While a message of a new file has no circuit, it writes nothing and lists the messages. `--allow-open` writes empty cells for them instead.
- In an existing file it fills only the empty cells. A circuit already there stays, also when the round accepted another one: a round never replaces a label (the benchmark publication does).

## Step 7: report and commit

```sh
node tests/benchmark/syntax/round.mjs report <round>
```

It says how the messages were settled (by agreement, accepted by a judge, written by a judge, still open), how many audited agreed circuits the judge accepted, and gives the table of levels per formalizer. Then commit the round folder in `soplang-nlu` and the files it wrote in `webmeet-dataset`.

## What is standard here

| Piece | Kind |
| --- | --- |
| Agreement | Standard idea: trust a label where independent readers agree (compare [co-training](https://en.wikipedia.org/wiki/Co-training)). The families, and three of them by default, are New here. |
| Audit | Standard: a random share of the settled items is checked by a judge. |
| The fixer | New here: a judge writes the circuit when every circuit was rejected; it is accepted with no second judge. |
| The files | Particular: the WebMeet dataset's semantic and syntactic files. |

## Pitfalls

- **`write` without `--judge`** writes "unknown" as the judge of the registry lines, with no warning.
- **`report.md` is a snapshot** of the moment it was called. `written.json` is the record of what was published.
- **An earlier `settle` stays settled.** What it settled by agreement stays so, even after a formalizer runs again in the folder and writes other circuits. Keep the first files in `first-run/`, as rounds 1 and 2 did.
- **A source file can change after `start`.** `write` compares the SHA-256 and says so in its table.
- **Rules drawn from a round's own files raise that round's score.** Only files no rule was drawn from measure a formalizer ([Limits of the measurements](../evaluation/validity.md)).

Next: [Find faults](find-faults.md) · Up: [How-to guides](README.md)
