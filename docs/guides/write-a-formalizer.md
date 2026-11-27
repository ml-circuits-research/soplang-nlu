[Home](../README.md) › [How-to guides](README.md) › Write a formalizer

# Write a new formalizer

This page: how to write a new formalizer that the common reader accepts and the benchmark can measure. Kind: How-to guide.

Everything a formalizer needs from the package is exported from its root, `lib/index.mjs`: `wordsOf`, `writeCircuit`, `validateSyntax`, `coreOf` and `createReader`. They are described in [Library API](../reference/library.md). No other repository is read.

## Step 1: follow the contract

A formalizer is an object `{name, schema: 'syntax', open(configuration)}`. `open` returns an engine with two methods:

- `analyse(text)` returns `{analyses: [{sop}]}` with one circuit, or `{analyses: [], error}`;
- `close()` frees what `open` started, such as a worker process.

The common reader `createReader({strategy})` keeps only the first circuit, checks it with `validateSyntax`, and returns it in `candidates` only when it is valid. A toy that reads every message as one nominal, to show the contract (not a reading anyone should use):

```js
import {wordsOf, writeCircuit} from 'soplang-nlu'

export const oneNominal = {
  name: 'one-nominal',
  schema: 'syntax',
  async open(configuration = {}) {
    return {
      async analyse(text) {
        try {
          const last = wordsOf(text).length - 1
          const slots = []
          for (let i = 0; i < last; i++)
            slots.push({key: 'dependent', span: [i, i]})
          slots.push({key: 'head', span: [last, last]})
          const sop = writeCircuit(text, [
            {id: 'n1', type: 'syntax.nominal', slots},
            {id: 'c1', type: 'syntax.clause', slots: [
              {key: 'form', value: 'fragment'},
              {key: 'complement', ref: 'n1'}]}])
          return {analyses: [{sop}]}
        } catch (error) {
          return {analyses: [], error: error.message}
        }
      },
      async close() {}
    }
  }
}
```

Through `createReader`, "the red box" gives:

```text
@n1 syntax.nominal dependent="the" dependent="red" head="box"
@c1 syntax.clause form=fragment complement=$n1
```

## Step 2: write the wires with word spans

- `wordsOf(text)` gives the words of the message in order, with their positions; punctuation marks are left out. Every formalizer must use these positions.
- A wire is `{id, type, slots}`. A slot holds words as a span of word positions (`{key, span: [first, last]}`), a reference to another wire (`{key, ref: id}`), or a value (`{key, value: atom}`).
- `writeCircuit(text, wires)` writes the circuit. It orders the wires so that each quoted value gets its own words back ([Rule 1](../schema/rules.md)), and it refuses a circuit that leaves a word out or claims one twice.

Which wires and keys exist: [The syntax schema in brief](../schema/overview.md).

## Step 3: check the circuit

`validateSyntax(text, sop)` returns `{valid, findings, placements, words}`. Each finding has a `code`; for example, a clause `verb="move"` alone for the message "move it" gives `uncovered-words` with the word "it". Run it in your own tests on circuits you write by hand, too.

## Step 4: keep within the boundaries

- **No knowledge repository** and no old `nlu` annotations ([decision D4](../project/decisions.md#d4)). `run.mjs` removes `SOP_KNOWLEDGE_DIR` and drops a `knowledgeDir` option before a formalizer loads.
- **No benchmark labels in training.** Exclude the benchmark's messages from any training on labels ([Limits of the measurements](../evaluation/validity.md)).
- **Rules and word lists name only function words** and common verbs ([decision D5](../project/decisions.md#d5)).

## Step 5: register it

Add it to `tests/benchmark/syntax/strategies.mjs`, with the path of its module relative to that file and the name of its export:

```js
'one-nominal': ['../../../strategies/one-nominal/index.mjs',
  'oneNominal'],
```

- `strategyModules` lists the formalizers every benchmark runs; `retiredModules` lists those that run only when `run.mjs --only <name>` names them. The owner keeps at most four formalizers with different sources of analysis in the benchmark ([decision D10](../project/decisions.md#d10)), so which list a new one joins is the owner's decision.
- `families` declares the source of each formalizer's analysis. A name no family lists is a family of its own. Formalizers of one family settle nothing by agreeing with each other ([Agreement between formalizers](../evaluation/agreement.md)), so declare the family honestly: a formalizer that reads the dependency parse belongs to `parser`.
- For a trial without touching the registry file, `run.mjs --strategies <file>` takes another file of the same form; its module paths are relative to that file.

## Step 6: add a test

A test file in `tests/`, run with `SOP_KNOWLEDGE_DIR` unset, as the other formalizers have:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {createReader} from '../lib/index.mjs'
import {oneNominal} from '../strategies/one-nominal/index.mjs'

test('one-nominal writes one valid circuit', async () => {
  const reader = await createReader({strategy: oneNominal})
  try {
    const result = await reader.propose('the red box')
    assert.equal(result.error, null)
    assert.equal(result.candidates.length, 1)
  } finally {
    await reader.close()
  }
})
```

## Step 7: tune, then measure

Tune on the earlier fixed sample: `run.mjs` without `--sample` runs it. Then measure once on the benchmark and have the circuits judged ([Run the benchmark](run-benchmark.md)). Do not tune on the benchmark's rejections ([Limits of the measurements](../evaluation/validity.md)).

## Step 8: document it

Add a page in `docs/formalizers/` with the headings the other formalizer pages share: "What it is", "How it reads a message", "Standard, new here, particular", "Speed and cost", "Known limits", "Run it", and "Details" or "History" where they apply. Link it from [Formalizers](../formalizers/README.md).

## What is standard here

| Piece | Kind |
| --- | --- |
| Word positions | Standard: [word segmentation](https://en.wikipedia.org/wiki/Text_segmentation) into words with their offsets. |
| The contract | New here: `open`, `analyse`, `close`, one circuit, checked by the reader. |
| `writeCircuit` | New here: it orders the wires so that the circuit's quoted words align with the message. |

## Pitfalls

- **Only the first circuit counts.** The reader keeps one circuit per message.
- **An invalid circuit is no answer.** It lands in `rejected`, and the message counts as L0 in the table.
- **Repeated words.** When the same words appear twice and cross between wires, `writeCircuit` may give two wires each other's occurrence, or throw.

Next: [Reference](../reference/README.md) · Up: [How-to guides](README.md)
