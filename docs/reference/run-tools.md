[Home](../README.md) › [Reference](README.md) › Benchmark tools: sample, run, judge, table

# Benchmark tools: sample, run, judge, table

This page: the command-line tools of `tests/benchmark/syntax/` that draw a sample, run the strategies, prepare and check the judging, publish the verdicts and print the table, with every option. Kind: Reference.

> `tests/benchmark/syntax/README.md` describes the same tools (wide tables; best read on a computer). Where it and the code differ, the code wins. This page follows the usage header and the option parsing of each file.

All commands run from the `soplang-nlu` folder. The order of the steps: [Run the benchmark](../guides/run-benchmark.md). Judging: [Judge a packet](../guides/judge-a-packet.md). A worked example: [Measure hmm-rules on 20 messages](../evaluation/first-measurement.md). Terms: [Glossary](glossary.md#project-terms).

**Standard, New here, Particular.** A sample drawn at random with a fixed seed is a standard [simple random sample](https://en.wikipedia.org/wiki/Simple_random_sample), and packets that hide which strategy wrote a circuit are standard [blind evaluation](https://en.wikipedia.org/wiki/Blinded_experiment). New here: one packet line per distinct circuit, the labels frozen before the run, and the [levels](../evaluation/levels.md). Particular: the default paths point at this project's dataset and samples.

## The tools, in the order of use

### sample.mjs

Draws a random sample of the dataset's messages.

```sh
node tests/benchmark/syntax/sample.mjs <out-file> [options]
```

| Option | Meaning |
| --- | --- |
| `<out-file>` | where the gzipped JSON array of `{id, text}` goes |
| `--share` | the share of the distinct texts; default 0.01 |
| `--seed` | any text; default 12 random bytes in hex |
| `--exclude` | sample files whose texts may not be drawn; several allowed |
| `--dataset` | the dataset; default `../webmeet-dataset` beside the package |
| `--revision` | the dataset commit to read; default `HEAD` |

- It reads the `text` column of every CSV file under `semantic/`, as committed at the revision (through git), and never `syntactic/`.
- It keeps each distinct text once, under the id `<tab>/<file>#<record>` of its first record.
- It orders the texts by `sha256(seed + "\0" + text)` and takes the first `round(share × distinct texts)` that stand in no excluded sample.
- Beside the sample it writes `<name>.lock.json`: the seed, the share, the count, the dataset commit and its counts, the exclusions, the hash of the sample and the method.
- An existing sample file is never replaced by another sample.

### run.mjs

Runs every strategy of `strategyModules` (spacy, and the experimental hmm-rules, distilbert, prolog and z3) over a sample and writes one file per strategy.

```sh
node tests/benchmark/syntax/run.mjs <run-folder> [options]
```

| Option | Meaning |
| --- | --- |
| `--sample` | a JSON array of `{id, text}`, gzipped or not. Default: the earlier fixed sample, `eval-results/2026-11-26-fresh-locked-one-percent/sample.json.gz` |
| `--only` | `hmm-rules,z3`: run only these; a retired strategy runs when named here |
| `--limit` | `50`: only the first 50 messages |
| `--reuse` | a folder: take `<folder>/<strategy>.jsonl` when it exists, and check every circuit again. Name the run folder itself to continue a run |
| `--timeout` | seconds per message; default 120 |
| `--jobs` | strategies run at the same time; default 1. Above 1 the times are less exact |
| `--options` | a JSON file `{"<strategy>": {…}}`, passed to `open`, such as the path of a model |
| `--strategies` | another strategies file; default `strategies.mjs` |

- A strategy takes part when its exported object declares `schema: 'syntax'`; the others are reported as "not ported".
- Each strategy runs in a process of its own, through `createReader`. A crash or a timeout costs one message; the process restarts after it, up to 20 times. A strategy has 900 seconds, or the timeout if longer, to start.
- `SOP_KNOWLEDGE_DIR` is removed, and a `knowledgeDir` option dropped, before a strategy loads.
- Output: `<strategy>.jsonl` with one line `{id, text, sop, error, ms}` per message, `summary.json`, and `logs/<strategy>.log`. An error starts with its kind: `invalid circuit`, `no circuit`, `crash` or `timeout`.
- `summary.json` records per strategy the status, the start-up time, the restarts, the messages, the valid circuits, the errors by kind and the median milliseconds. It records no model path and no options. The entries of strategies not run this time stay as they were.

### judge-prepare.mjs

Prepares the circuits of a run for a judge.

```sh
node tests/benchmark/syntax/judge-prepare.mjs <run-folder> [options]
```

| Option | Meaning |
| --- | --- |
| `--size` | lines per packet; default 200 |
| `--registry` | another registry, for a trial ([below](#trial-runs)) |
| `--syntactic` | another folder of syntactic files, for a trial |

- Every circuit is looked up by its message and its core. A circuit the registry holds, or that equals the label of its message, is settled.
- The others go once per message and core, however many strategies wrote them, into `judging/packet-<k>.jsonl`. A line is `{n, text, sop}` and does not say which strategy wrote the circuit.
- It also writes `judging/RULES.md` (a copy of `rules.md`), `judging/check.mjs`, `key/items.jsonl` (which strategies wrote item `n`; not for the judge) and, the first time only, `key/labels-before.jsonl`.
- Called again, it keeps the numbers already given and puts new circuits into new packets. Every call copies `rules.md` over `RULES.md` again.

### check.mjs

Checks a judge's verdict file. `judge-prepare.mjs` copies it into the judging folder; it needs nothing but Node.

```sh
node eval-results/<run>/judging/check.mjs [k]
```

- With `k` it checks `verdicts-<k>.jsonl` against `packet-<k>.jsonl`; without, every packet of the folder.
- A verdict line is `{"n", "grade", "note"}`. The grade is `L8`, or `L1` to `L6`; the note of a rejection must quote words of the message in single quotes.
- It prints how many lines are judged and every problem, and exits with 1 when there is a problem. A line that is no JSON object, names no line of the packet, repeats a number, has a wrong grade, has no note, or rejects without quoting the message does not count. An unknown extra key is reported, but the line still counts. Any problem blocks publication.
- Which lines still count in each case: [Judges and the judging rule](../evaluation/judging.md).

### judge-publish.mjs

Publishes the verdicts of a run into the dataset: the registry and the labels.

```sh
node tests/benchmark/syntax/judge-publish.mjs <run> --tag <name>
```

| Option | Meaning |
| --- | --- |
| `--tag` | required; letters, digits, `.`, `_` and `-`; names the new registry file `<tag>.jsonl` |
| `--judge` | the model that judged; default `unknown`, with a printed note |
| `--registry` | another registry, for a trial |
| `--syntactic` | another folder of syntactic files, for a trial |

- It refuses a tag whose file exists, and publishes nothing while any verdict file of the run has a problem.
- Registry: one line `{text, sop, core, verdict, grade, note, judge, run, source}` per circuit judged in the run. A circuit the registry already holds is left as it is.
- Labels: every circuit accepted in the run becomes the label of its message, whatever the row held, also an agreement label. One label per message: the circuit most strategies wrote, then the lowest item number. Only changed files are written, and in them only the cells `sop`, `source` and `accepted_by` (`judge`).
- An agreement label that it replaces, and that the registry does not hold, is kept as an accepted line with judge `agreement` in `<tag>-replaced-agreement.jsonl`.
- Nothing is committed: committing the dataset is a separate step.

### table.mjs

Prints the table of levels of a run.

```sh
node tests/benchmark/syntax/table.mjs <run-folder> [options]
```

| Option | Meaning |
| --- | --- |
| `--registry` | another registry, for a trial |
| `--syntactic` | another folder of syntactic files, for a trial |

- It prints the table and writes `table.md` and `table.json`: one row per strategy, the levels L0 to L10, waiting, GOAL, and the accepted circuits that carry `attachment=ambiguous`.
- The labels before the run come from `key/labels-before.jsonl`. A run without that file is compared with the labels of now.
- A verdict line with a format problem is not counted: its circuit stands under waiting, and the table says how many such lines there are.
- It can run at any time, also before any judge has worked.

## Trial runs

| Tool | Takes |
| --- | --- |
| judge-prepare | `--registry`, `--syntactic` |
| judge-publish | `--registry`, `--syntactic` |
| table | `--registry`, `--syntactic` |
| agree | `--registry` only |
| round.mjs | `--registry`, `--dataset` |

- `--registry <folder>` makes a tool use another registry instead of `webmeet-dataset/annotations/syntax/v1/judged/`.
- The labels then come from the folder `syntactic` beside that registry, unless `--syntactic` names another folder. A registry at `<dataset>/annotations/syntax/v1/judged` goes with `<dataset>/syntactic` (`syntacticDirOf` in `lib.mjs`).
- So a trial never reads or writes the labels of the dataset. Round options: [Conversion tools](conversion-tools.md).

Next: [Benchmark tools: agreement, conversion of old circuits, the library](analysis-tools.md) · Up: [Reference](README.md)
