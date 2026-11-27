[Home](../README.md) › [Evaluation and labels](README.md) › Measure hmm-rules on 20 messages

# Measure hmm-rules on 20 messages

This page: run hmm-rules on 20 benchmark messages in a scratch folder, prepare the packets for a judge,
and read the table, without writing to the dataset or the registry. Kind: Tutorial.

## What you will do

Three commands, and a check, with [hmm-rules](../formalizers/hmm-rules.md), the project's own formalizer.
Everything is written into a scratch *run folder*. You will not publish anything, because publishing
writes labels into the dataset; the tutorial stops before it. The terms *label*, *registry* and
*packet* are in the [glossary](../reference/glossary.md#project-terms).

Two options make a trial:

| Option | Effect |
| --- | --- |
| `--registry <dir>` | judge decisions are read from this folder instead of the dataset's registry |
| `--syntactic <dir>` | labels are read from this folder |

`judge-prepare.mjs` and `table.mjs` only read the registry and the labels; they write into the run
folder only. Here the registry is an empty scratch folder, so no earlier verdict counts, and the
labels are the dataset's own, read only.

## Before you start

- A checkout of soplang-nlu with webmeet-dataset next to it (`../webmeet-dataset`), and Node.js
  (hmm-rules needs nothing else). Run every command from the soplang-nlu folder.
- Set four names (the trial registry folder need not exist):

```sh
RUN=/tmp/try/hmm-rules-20
TRIAL=/tmp/try/registry
DATA=../webmeet-dataset/syntactic
SAMPLE=eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz
```

## Step 1: run hmm-rules

```sh
node tests/benchmark/syntax/run.mjs $RUN --only hmm-rules \
  --sample $SAMPLE --limit 20
```

The output begins (the third line is wrapped here):

```
hmm-rules: started
hmm-rules: ran
Run hmm-rules-20: 20 messages of
eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz
```

Then comes a table with one row per formalizer, and a line that names the written file. The row
for hmm-rules, as a list of columns:

| Column | hmm-rules |
| --- | --- |
| Status | ran |
| Messages | 20 |
| Valid circuits | 20 |
| Errors by kind | (empty: no errors) |
| Median ms | 1.334 |

The first 20 messages of the sample were taken. Look into `$RUN`:

- `hmm-rules.jsonl` holds one line per message: `{id, text, sop, error, ms}`. Its first line is the
  message `diagram/charts-01.csv#232`, "make a bar chart of the projects by name please", with hmm-rules'
  circuit in `sop`.
- `summary.json` holds, per formalizer, its status, the time to start (`startupMs`, here 50), the
  messages, the valid circuits and the median milliseconds per message. Times depend on the machine
  and its load ([measured speeds](../STATUS.md#speed-and-cost-per-strategy)).

## Step 2: prepare the packets

```sh
node tests/benchmark/syntax/judge-prepare.mjs $RUN --size 10 \
  --registry $TRIAL --syntactic $DATA
```

The output begins and ends with these lines (wrapped here, the folder path left out):

```
Registry: 0 judged circuits of 0 messages, in 0 files.
19 of the 20 messages of this run have a label.
…
15 distinct circuits need a judge in this run:
0 were prepared before, 15 are new.
New packets: packet-1.jsonl (10), packet-2.jsonl (5)
```

Between them stands a table; its one row, for hmm-rules:

| Column | hmm-rules |
| --- | --- |
| Messages | 20 |
| No valid circuit | 0 |
| Equal to the label | 5 |
| Already accepted | 0 |
| Already rejected | 0 |
| Needs a judge | 15 |

What was written into `$RUN`:

- `judging/RULES.md` and `judging/check.mjs`: the rules a judge follows and the checker;
- `judging/packet-1.jsonl` (10 lines) and `packet-2.jsonl` (5): lines `{n, text, sop}`, with
  nothing that tells which formalizer wrote a circuit;
- `key/items.jsonl`: which formalizer wrote circuit n (not for the judge);
- `key/labels-before.jsonl`: 19 lines, one per message that had a label.

The first packet line is the circuit of hmm-rules for "make a bar chart of the projects by name please". It
starts "by name" at "projects", while the label starts it at the clause with
`attachment=ambiguous`. The cores differ, so the circuit needs a judge.

## Step 3: the table

```sh
node tests/benchmark/syntax/table.mjs $RUN \
  --registry $TRIAL --syntactic $DATA
```

Its row for hmm-rules, as a list of columns:

| Column | hmm-rules |
| --- | --- |
| Messages | 20 |
| L0 to L8 | 0 each |
| L9 | 5 |
| L10 | 0 |
| waiting | 15 |
| GOAL | 25.0% |
| If all accepted | 100.0% |

The tool says: "Circuits are still waiting for a judge, so GOAL is not final. It can only rise". It
also writes `table.md` and `table.json` into `$RUN`.

## Step 4: check that nothing else changed

```sh
git -C ../webmeet-dataset status --short
```

It prints nothing: the dataset is unchanged.

## Optional: the same packets with the dataset's registry

Copy the two files of step 1 into a new run folder and prepare it without the trial options. It
still writes only into its run folder; the dataset's registry and labels are only read.

```sh
mkdir -p /tmp/try/hmm-rules-20-real
cp $RUN/hmm-rules.jsonl $RUN/summary.json /tmp/try/hmm-rules-20-real/
node tests/benchmark/syntax/judge-prepare.mjs \
  /tmp/try/hmm-rules-20-real --size 10
```

In the run shown here, its row for hmm-rules read: 5 equal to the label, 9 already accepted, 3 already
rejected, 3 need a judge. Earlier judging had already read most of these circuits.

## What you learned

- A circuit equal to the label is L9 with no judge.
- A circuit nobody has judged is *waiting*. GOAL counts it as not accepted: 25.0% is a lower bound.
- The registry saves judging: a circuit read once is never sent again.

## Stop here

The next steps of a real benchmark are judging and publishing. Publishing (`judge-publish.mjs`)
writes labels into the folder that `--syntactic` names, here the dataset itself, so this tutorial
stops. The real procedure: [Run the benchmark](../guides/run-benchmark.md) and
[Judge a packet](../guides/judge-a-packet.md). Every option: [Benchmark tools](../reference/run-tools.md).
How the levels are decided: [Levels](levels.md).

## The run shown

Run on 2026-11-27 at soplang-nlu commit `97a1b83` (with uncommitted hmm-rules work of another session in
the working tree), webmeet-dataset at `596ff1d`. Your numbers will differ as hmm-rules and labels change.

Next: [Agreement between formalizers](agreement.md) · Up: [Evaluation and labels](README.md)
