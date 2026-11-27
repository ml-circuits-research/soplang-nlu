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
| Verb habits | verbs seen with a pronoun object followed by a bare verb, or by a quality | clausal complements, result complements |
| Attachment | cues after a verb, cues after an ungoverned entity, then the doubtful cases by expectation maximisation | whether a relation starts at the clause or at the entity before the cue |
| Meanings | a vector per head word: the bundle of its neighbours, each bound to its side | choosing which earlier entity a listed one joins |

## How a message is read

1. **Observe.** The message is split into the validator's tokens. A quoted passage, a hyphenated word, a number pair and a compound of the legend each count as one observation.
2. **Route.** Each sentence gets its most probable station sequence. The posterior of each choice is kept as its confidence.
3. **Cut.** Consecutive tokens whose stations belong together form a unit: an entity, a verb group, a cue. The cut falls where the next station cannot continue the unit.
4. **Link.** A verb opens a clause and takes its subject from the left and its objects from the right. A cue opens a relation to the entity after it and starts at the clause or at the entity before it, by the learned attachment. A conjunction joins entities or clauses. A participle after an entity opens a clause about that entity.
5. **Emit.** Every token lands in exactly one quoted slot. When the least certain attachment is doubtful, the reader also returns the reading that attaches it the other way.

## Training

```sh
node strategies/vss/train.mjs --dataset ../webmeet-dataset
```

Training on 183,497 messages (2.6 million tokens) takes about 30 seconds on one CPU core and writes a 1.6 MB model.

## Measurements

The [frozen one-percent run](../../eval-results/2026-11-27-vss-frozen-one-percent/README.md) used the 1,831 utterances of the earlier eight-strategy comparison. VSS returned a schema-valid reading for all of them, accounted for every word in 1,828 and placed every word in a typed role in 1,805. Median latency was 0.13 ms.

In a blind paired review of 240 of those utterances, three independent reviewers accepted every returned VSS circuit for 45.0% and every spaCy direct circuit for 67.5%. VSS almost never left source unaccounted. Its failures were wrong roles or attachments (36% of the reviewed utterances) and words read as the wrong kind of predicate or clause (16%).

`evaluate.mjs` compares the reader with the native circuits saved in the dataset. Those circuits are fallible and no learning step reads them. On the tenth of the 11,138 reviewed texts used during development, the first reading was the same graph as a reference for 15.8%, placed 85.3% of the tokens in the reference's slot and found 82.9% F1 of the entities and 60.6% F1 of the links with their role.

```sh
node strategies/vss/evaluate.mjs --part test
node strategies/vss/evaluate.mjs --part dev --without attachment
```

Reading every relation from the clause instead of using the learned attachment lowers the link F1 from 59.1 to 55.2 on the development part. Removing the meaning vectors changes it by 0.1, so the semantic space does not yet earn its place in the coordination choice.

`triage.mjs` sorts saved proposals by how far the VSS reading agrees with them: the same graph, the same slots and links, a structural difference, or a proposal that fails the static check.

## Limits

- Irregular verb forms (`done`, `made`, `drawn`) are not related to their base word, so they can be read as names or things.
- A noun that also names an action can be read as an imperative when it opens a clause.
- A second bare entity after an object is read as a predicative entity unless the first is a personal pronoun.
- The reader resolves no pronoun and uses no context.
