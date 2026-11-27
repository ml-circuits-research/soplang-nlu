[Home](../README.md) › [hmm-rules in depth](README.md) › Follow one message

# Follow one message through hmm-rules

This page: a hands-on trace of one message through every stage of hmm-rules, then a second message in which a doubt changes the reading. Kind: Tutorial.

## Before you start

You need a checkout of `soplang-nlu` and Node.js. The model file `strategies/hmm-rules/model/model.json` is in the repository; reading needs no dataset. Run every command from the folder `soplang-nlu`.

The output below was produced at commit `97a1b83`, with Node.js 22. Its hmm-rules code is that of `85de0bb`, and its model was trained at `71f0dd2`. Stations and confidences change when the model is retrained, so your numbers may differ; rerun the commands and compare.

The message: **a small grey cat sitting in the bottom left corner**.

## Step 1: stations

Each word gets one station, a fine word class ([The stations](stations.md)). Print them with the reader's result:

```sh
node --input-type=module -e "
import {readFileSync} from 'node:fs'
import {createHmmRulesReader}
  from './strategies/hmm-rules/src/reader.mjs'
const path = 'strategies/hmm-rules/model/model.json'
const model = JSON.parse(readFileSync(path, 'utf8'))
const reader = createHmmRulesReader(model, {schema: 'syntax'})
const r = reader.analyse(process.argv[1])
r.tokens.forEach((t, i) =>
  console.log(t.word, r.stations[i], r.confidence[i].toFixed(2)))
" 'a small grey cat sitting in the bottom left corner'
```

Output, as word, station and confidence:

| Word | Station, confidence |
| --- | --- |
| a | determiner, 1.00 |
| small | modifier, 1.00 |
| grey | modifier, 1.00 |
| cat | noun, 1.00 |
| sitting | following, 1.00 |
| in | cue, 1.00 |
| the | determiner, 1.00 |
| bottom | modifier, 0.76 |
| left | noun, 0.60 |
| corner | noun, 0.99 |

`modifier` is the station of a describing word, `following` of a verb after its subject, `cue` of a preposition. The confidence is the posterior probability of the station ([Methods](methods.md)). It is low for "bottom" and "left": the model is less sure of them. The architecture report printed the same stations at `fa46cb7`, with 0.59 for "left".

## Step 2: units

The chunker cuts the tagged words into units ([Reading](reading.md)). The reader has no option that prints units. A short script that calls `buildUnits` on these stations (checked at `97a1b83`) gives the same cut as the report gave at `fa46cb7` (one line, wrapped here):

```text
entity[a small grey cat] verb[sitting] cue[in]
entity[the bottom left corner]
```

A run of nominal stations becomes an entity. Its last noun, "corner", is the head; the words before it become dependents.

## Step 3: internal wires

The linker writes internal wires with the slot names of the earlier `nlu` schema ([Linking](linking.md)). The `nlu` mode of the reader still prints them; leave out the `schema` option:

```sh
node --input-type=module -e "
import {readFileSync} from 'node:fs'
import {createHmmRulesReader}
  from './strategies/hmm-rules/src/reader.mjs'
const path = 'strategies/hmm-rules/model/model.json'
const model = JSON.parse(readFileSync(path, 'utf8'))
const reader = createHmmRulesReader(model)
console.log(reader.analyse(process.argv[1]).analyses[0].sop)
" 'a small grey cat sitting in the bottom left corner'
```

```sop
@c1 nlu.clause form=fragment topic=$e1
@e1 nlu.entity determiner="a" modifier="small" modifier="grey" head="cat"
@c2 nlu.clause form=nonfinite predicate="sitting"
@e2 nlu.entity determiner="the" compound="bottom" compound="left" head="corner"
@r1 nlu.relation kind=in from=$c2 to=$e2 cue="in"
@r2 nlu.relation kind=nominal_clause from=$e1 to=$c2
```

- `c1` is a clause with no verb (a fragment); the cat is its topic.
- `c2` is a nonfinite clause: "sitting" is a verb form that cannot make a sentence alone.
- `r1` ties the sitting to the corner by "in"; `r2` ties the cat to the clause that describes it.

## Step 4: the syntax circuit

This is what the formalizer returns, through the public strategy:

```sh
node --input-type=module -e "
import {hmmRules} from './strategies/hmm-rules/index.mjs'
const engine = await hmmRules.open()
const m = 'a small grey cat sitting in the bottom left corner'
const r = await engine.analyse(m)
console.log(r.analyses[0].sop)"
```

```sop
@n1 syntax.nominal dependent="a" dependent="small" dependent="grey" head="cat"
@c2 syntax.clause form=nonfinite verb="sitting"
@r1 syntax.relation marker="in" from=$c2 to=$n2
@n2 syntax.nominal dependent="the" dependent="bottom" dependent="left" head="corner"
@c1 syntax.clause form=fragment complement=$n1
@r2 syntax.relation from=$n1 to=$c2
```

Why it looks like this:

- **A fragment.** No verb opens the message, so the noun group stands in a fragment clause, as its `complement`.
- **A nonfinite clause.** "sitting" is a bare verb form right after a nominal, so it opens a clause that describes the cat. The tie `r2` has no linking word, so it has no `marker`.
- **Renamed keys.** `topic` became `complement`, `predicate` became `verb`, `cue` became `marker`, and `kind` was dropped ([Writing](writing.md)).
- **The order of the lines** is the one `writeCircuit` chose so that every quoted word gets its own place in the message.

## Step 5: a doubt in action

The message: **can I get a cinnamon stick?** Turn on the `trace` option. It prints the stations and the doubts of the first reading, and again at the start of each re-reading round:

```sh
node --input-type=module -e "
import {readFileSync} from 'node:fs'
import {createHmmRulesReader}
  from './strategies/hmm-rules/src/reader.mjs'
const path = 'strategies/hmm-rules/model/model.json'
const model = JSON.parse(readFileSync(path, 'utf8'))
const options = {schema: 'syntax', trace: true}
const reader = createHmmRulesReader(model, options)
const r = reader.analyse(process.argv[1])
console.log('final', r.stations.join(' '))
console.log(r.analyses[0].sop)
" 'can I get a cinnamon stick?'
```

Output. The first two lines are long, so each is wrapped here; an indented part continues the line above it.

```text
first stations can/auxiliary i/pronoun get/predicate
  a/determiner cinnamon/noun stick/following ?/terminator
  | doubts [{"position":5,"not":"verb"}]
stations can/auxiliary i/pronoun get/predicate
  a/determiner cinnamon/noun stick/following ?/terminator
  | doubts [{"position":5,"not":"verb"}]
final auxiliary pronoun predicate determiner noun noun terminator
@c1 syntax.clause form=interrogative auxiliary="can" verb="get" subject=$n1 complement=$n2
@n1 syntax.nominal head="I"
@n2 syntax.nominal dependent="a" dependent="cinnamon" head="stick"
```

What happened:

1. The first decoding made "stick" (position 5, counting from 0) a verb after its subject (`following`).
2. A doubt `not: verb` was raised for it. At `fa46cb7` the report traced this doubt to the linker: a bare verb right after a noun group that a verb already holds, while "stick" was seen as a thing at least 3 times in fixed frames.
3. The line that starts with `stations` is printed at the start of the next round: it repeats the stations of the reading before and the doubt that starts the round. The sentence is then decoded again with the verb stations banned for "stick".
4. The final stations make "stick" a noun, and the circuit has one nominal "a cinnamon stick".

The same doubt appeared at `fa46cb7` and still appears at `97a1b83`.

## What you saw

A message passes through stations, units, internal wires and the syntax circuit, and a doubt can send it back to the decoder. [Reading](reading.md) explains each step; the options used here are in [hmm-rules commands and options](options.md); running other formalizers is in [Run a formalizer](../guides/run-a-formalizer.md).

---

Next: [The legend](legend.md) · Up: [hmm-rules in depth](README.md)
