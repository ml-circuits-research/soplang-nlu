# VSS

`vss` reads the syntactic structure of a message with a model learned from unannotated text. It needs no parser, no annotated circuits and no knowledge world. The reader is plain JavaScript with no file or network access, so the same code runs in Node.js and in a browser.

```js
import {createReader} from 'soplang-nlu'
import {vss} from 'soplang-nlu/strategies/vss'

const reader = await createReader({strategy: vss, knowledgeDir: process.env.SOP_KNOWLEDGE_DIR})
const {candidates} = await reader.propose('Move the blue box towards the yellow circle.')
```

```sop
@c1 nlu.clause form=imperative predicate="Move" direct_object=$e1 terminator="."
@e1 nlu.entity determiner="the" modifier="blue" head="box"
@e2 nlu.entity determiner="the" modifier="yellow" head="circle"
@r1 nlu.relation kind=towards from=$c1 to=$e2 cue="towards"
```

For use without the adapter, `createVssReader(model).analyse(text)` returns the same circuits from the parsed `model/model.json`.

## What is given and what is learned

The [legend](../../strategies/vss/legend.sop) is one generic world for every text, written in SOP Lang. It declares the stations (the quoted slots of the `nlu` schema a word can stand in), what usually follows each station, the grammar words of English whose station the language fixes, a few endings that relate the forms of a word, and how cues name the kind of a coordination or relation. The reader holds no word list of its own.

Everything else comes from the message texts of the dataset. Training reads only the `text` column.

| Learned | From | Used for |
| --- | --- | --- |
| Routes: which words stand at each station and which station follows which | expectation maximisation over all sentences | the station of every word |
| Word forms | forms built from another word of the text inherit part of what is learned about it | participles, plurals, comparatives |
| Things and qualities | whether a word's plural heads entities, or the word says what something is like | `compound` or `modifier` before a head |
| Verb habits | verbs seen where the structure leaves no doubt: with a bare verb after a pronoun object, with a quality after a plain object, with a person and then a thing, with a question, with a word that moves with them | clausal complements, result complements, indirect objects, asked clauses, particles |
| Attachment | cues after a verb, cues after an ungoverned entity, then the doubtful cases by expectation maximisation | whether a relation starts at the clause or at the entity before the cue |
| Meanings | a vector per frequent word: the bundle of its neighbours, each bound to its side | how alike two heads are |
| Role-filler memory | a vector per governing word: the bundle of each role bound to the meaning of what filled it | whether a target suits a relation of the verb or of the thing; which thing a participle is said of |

## How a message is read

1. **Observe.** The message is split into the validator's tokens. A quoted passage, a hyphenated word, a number pair and a compound of the legend each count as one observation.
2. **Route.** Each sentence gets its most probable station sequence. The posterior of each choice is kept as its confidence.
3. **Cut.** Consecutive tokens whose stations belong together form a unit: an entity, a verb group, a cue. The cut falls where the next station cannot continue the unit. A measure and the direction after it stay together.
4. **Link.** A verb opens a clause and takes its subject from the left and its objects from the right. A cue opens a relation to the entity after it and starts at the clause or at the entity before it, by the learned attachment and the memory. A conjunction joins entities, clauses, or segments built alike: a segment that repeats the build of the one before it becomes a clause that shares its verb. A participle after an entity opens a clause about the thing it is said of. An opening clause with a marker hangs on the clause that follows it.
5. **Reconsider.** A verb that the structure cannot place, or a verb form that closes an entity after its noun, was probably misread. The sentence is routed again with that word kept off those stations.
6. **Emit.** Every token lands in exactly one quoted slot. When the least certain decision is doubtful (an attachment, or a verb with two frames), the reader also returns the reading that takes it the other way.

## Training

```sh
node strategies/vss/train.mjs --dataset ../webmeet-dataset
```

Training on 183,497 messages (2.6 million tokens) takes about 30 seconds on one CPU core and writes a 3 MB model.

## Measurements

The [frozen one-percent run](../../eval-results/2026-11-27-vss-frozen-one-percent/README.md) used the 1,831 utterances of the earlier eight-strategy comparison. VSS returned a schema-valid reading for all of them and accounted for every word in 1,828. Median latency was 0.13 ms. In a blind paired review of 240 of those utterances, three independent reviewers accepted every returned circuit of that first model for 45.0% and every spaCy direct circuit for 67.5%. The model has changed since and has not been reviewed again on that sample.

`evaluate.mjs` compares the reader with the native circuits saved in the dataset. Those circuits are fallible and no learning step reads them. On the 11,138 reviewed texts, the current model returns a valid circuit for all, accounts for every word in 99.4%, gives the same graph as a reference for 17.5%, places 86.2% of the tokens in the reference's slot and finds 83.7% F1 of the entities and 64.0% F1 of the links with their role.

```sh
node strategies/vss/evaluate.mjs --part all --brief 1
node strategies/vss/evaluate.mjs --part all --brief 1 --against gapping     # what one mechanism wins and breaks
```

| Mechanism | Link F1 without | Link F1 with |
| --- | ---: | ---: |
| Learned attachment (earlier model, development tenth) | 55.2 | 59.1 |
| Listed entity joins the one introduced alike, not the nearest | 62.1 | 63.1 |
| The same, with meaning vectors | 63.1 | 63.5 |
| The same, with the build of each entity as a vector | 63.5 | 63.8 |
| Role-filler memory in attachment | 63.8 | 64.0 |

Two experiments measured worse and are off: letting a rare word borrow the habits of its neighbours in the semantic space, and attaching a participle to the action when the memory shows no thing it is said of.

`triage.mjs` sorts saved proposals by how far the VSS reading agrees with them. Of 66,360 texts with a drafted circuit, an earlier model gave the same graph for 11.1%, the same slots and links for 6.6% and a different structure for 62.0%; 18.0% of the drafts failed the static check and 2.3% were empty.

## Limits

- Irregular verb forms (`done`, `made`, `drawn`) are not related to their base word, so they can be read as names or things.
- A noun that also names an action can be read as an imperative when it opens a clause.
- The vector space earns about one point of link F1 so far. The larger gains come from the routes, the counted habits and the structural mechanisms.
- The reader resolves no pronoun and uses no context.
