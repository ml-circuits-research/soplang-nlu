[Home](../README.md) › [How-to guides](README.md) › Find faults

# Find faults from judged rejections and check a change

This page: how to find a formalizer's faults in judged rejections, compare its circuits before and after a change, check the change on accepted circuits, and send the changed ones to judges. Kind: How-to guide.

The method is error analysis in the plain sense: read what the judges rejected, group the rejections by construction (the same kind of phrase or sentence pattern, such as a number after a noun), and fix the largest groups with general rules. On 2026-11-27 three analyses of the faults of hmm-rules, one per area of the dataset (calendar, diagram and document, drawing), each read a sample of hmm-rules circuits and proposed general rules.

## Step 1: find the rejections

Two places hold them ([Where everything is stored](../reference/storage.md)):

- **The registry**, `webmeet-dataset/annotations/syntax/v1/judged/<tag>.jsonl`: one line per circuit a judge read or wrote, `{text, sop, core, verdict, grade, note, judge, run, source}`. A rejection has `verdict` "rejected", a grade from L1 to L6, and a note that quotes the words. `source` names the formalizers that wrote the circuit, joined by `+`, or says `judge` for a circuit a judge wrote.
- **A run folder**: `key/items.jsonl` maps each item number `n` to the formalizers that wrote it (`sources`), and `judging/verdicts-<k>.jsonl` holds the verdicts by `n`.

To list the rejected circuits of one formalizer in a registry file (lines written before the rename of 2026-11-27 name hmm-rules by its old name, vss, so give both names):

```sh
node --input-type=module -e '
import {readFileSync} from "node:fs"
const [file, ...names] = process.argv.slice(1)
for (const line of readFileSync(file, "utf8").split("\n")) {
  if (!line) continue
  const row = JSON.parse(line)
  if (row.verdict !== "rejected") continue
  const sources = row.source.split("+")
  if (!sources.some(name => names.includes(name))) continue
  console.log(row.grade, row.text, "\n  " + row.note)
}
' ../webmeet-dataset/annotations/syntax/v1/judged/<tag>.jsonl \
  hmm-rules vss
```

## Step 2: pick cases fairly

Prefer rejections from the conversion folders, or analyses by area, over the benchmark. Rules drawn from the benchmark's own rejections make the benchmark overstate the formalizer: from the rule batch `dd562c3` of hmm-rules on, its rules were checked against the judged benchmark, so that sample is no longer unseen ([Limits of the measurements](../evaluation/validity.md)). Group the rejections by construction, and look for a statement about English that fixes a whole group, not one message.

## Step 3: compare circuits before and after the change

Run the formalizer on the same sample into two scratch folders, one before the change and one after:

```sh
S=eval-results/conversion/<tab>__<name>/sample.json
node tests/benchmark/syntax/run.mjs <scratch>/before \
  --only hmm-rules --sample $S
# … make the change (and retrain, if it needs it) …
node tests/benchmark/syntax/run.mjs <scratch>/after \
  --only hmm-rules --sample $S
```

Then list the messages whose circuit changed. `coreOf`, exported from the package (`lib/index.mjs`), gives a text that is equal for two circuits that say the same, whatever their wire names ([When two circuits are the same](../evaluation/normal-form.md)):

```sh
node --input-type=module -e '
import {readFileSync} from "node:fs"
import {coreOf} from "soplang-nlu"
const read = file => new Map(readFileSync(file, "utf8")
  .split("\n").filter(Boolean).map(line => JSON.parse(line))
  .map(row => [row.id, row]))
const [before, after] = process.argv.slice(1).map(read)
let changed = 0
for (const [id, row] of after) {
  const old = before.get(id)
  if (!old) continue
  const a = old.sop && coreOf(old.text, old.sop)
  const b = row.sop && coreOf(row.text, row.sop)
  if (a === b) continue
  changed++
  console.log(row.text + "\n- " + old.sop + "\n+ " + row.sop)
}
console.log(changed + " of " + after.size + " changed")
' <scratch>/before/hmm-rules.jsonl \
  <scratch>/after/hmm-rules.jsonl
```

This snippet was run on two files of the benchmark folder (`first-run/vss.jsonl` and `vss.jsonl`, written when hmm-rules was called vss) when this page was written. The benchmark tools compare circuits by `coreOf` applied to the normal form (`normalForm` in `tests/benchmark/syntax/lib.mjs`), which also treats `marker="next to"` and `marker="next" marker="to"` as the same; for two runs of one formalizer, `coreOf` alone is usually enough.

## Step 4: check the change on accepted circuits

The hmm-rules rule batches of 2026-11-27 were checked on about 8,000 accepted circuits of the dataset. The script used then is not kept in the repository; the commands below do the same check with the tools that exist. They were run, with 400 messages, when this page was written.

1. Draw a repeatable sample of messages that have a label (an accepted circuit). The seed is any text; the same seed gives the same sample:

   ```sh
   S=<scratch>
   node --input-type=module -e '
   import {writeFileSync} from "node:fs"
   import {createHash} from "node:crypto"
   import {readLabels} from "./tests/benchmark/syntax/lib.mjs"
   const [out, size, seed] = process.argv.slice(1)
   const hash = text => createHash("sha256")
     .update(seed + "\0" + text).digest("hex")
   const labels = readLabels()
   const chosen = [...labels.keys()]
     .map(text => [hash(text), text]).sort()
     .slice(0, Number(size))
     .map(([, text], n) => ({id: `accepted#${n}`, text}))
   writeFileSync(out, JSON.stringify(chosen))
   ' $S/accepted.json 8000 rules
   ```

2. Run the formalizer on it before and after the change, as in step 3, with `--sample $S/accepted.json` and the folders `$S/before` and `$S/after`.
3. Count the circuits that were equal to their label before the change and are not after it, and print them:

   ```sh
   node --input-type=module -e '
   import {readFileSync} from "node:fs"
   import {readLabels, normalForm}
     from "./tests/benchmark/syntax/lib.mjs"
   const labels = readLabels()
   const read = file => readFileSync(file, "utf8").split("\n")
     .filter(Boolean).map(line => JSON.parse(line))
   const core = row => row.sop
     ? normalForm(row.text, row.sop)?.core ?? null : null
   const [before, after] = process.argv.slice(1).map(read)
   const old = new Map(before.map(row => [row.text, core(row)]))
   let was = 0, is = 0, lost = 0
   for (const row of after) {
     const label = labels.get(row.text)?.core
     const a = old.get(row.text), b = core(row)
     if (a === label) was++
     if (b === label) is++
     if (a !== label || b === label) continue
     lost++
     console.log(row.text + "\n  " + row.sop)
   }
   console.log(`equal to the label: ${was} before,` +
     ` ${is} after; ${lost} no longer equal`)
   ' $S/before/hmm-rules.jsonl $S/after/hmm-rules.jsonl
   ```

Run both from the repository's root, with `env -u SOP_KNOWLEDGE_DIR` in front if that variable is set. A circuit that is no longer equal to its label is not wrong by that alone, since several circuits can be right; step 5 says what to do with it.

## Step 5: read every changed circuit that was accepted before

A change that fixes rejected circuits can break accepted ones. Read each changed circuit whose old form was accepted (a label, or accepted in the registry) against the [judging rules](../../tests/benchmark/syntax/rules.md). Drop a rule whose changes to accepted circuits are not all acceptable. The commit message of the spaCy round `fa4452c` records two rules it dropped, each with the number of accepted circuits it changed.

## Step 6: send the changed circuits to judges

Run the formalizer again in the benchmark folder, after keeping the judged files in `first-run/`, then call `judge-prepare.mjs` again. It sends only the circuits that are neither in the registry nor equal to the label of their message, so only the changed circuits reach the judges. The rest is as in [Run the benchmark](run-benchmark.md), steps 2 to 6.

## Pitfalls

- **A judged rerun on the same benchmark is not an independent measure** once its rejections guided the change.
- **The run folder changes under you.** `run.mjs` overwrites `<name>.jsonl`; `table.mjs` counts the files that stand in the folder now.
- **Retraining moves unrelated readings.** For hmm-rules, compare before and after on accepted circuits after every retraining ([Retrain hmm-rules](retrain-hmm-rules.md)).

Next: [Add a rule to hmm-rules](add-hmm-rules-rule.md) · Up: [How-to guides](README.md)
