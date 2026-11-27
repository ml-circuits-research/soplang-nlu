# VSS

`vss` reads the syntactic structure of a message with a model learned from unannotated text. It needs no parser, no annotated circuits and no knowledge world. The reader is plain JavaScript with no file or network access, so the same code runs in Node.js and in a browser.

```js
import {createReader} from 'soplang-nlu'
import {vss} from 'soplang-nlu/strategies/vss'

const reader = await createReader({strategy: vss})
const {candidates} = await reader.propose('Move the blue box towards the yellow circle.')
```

```sop
@c1 syntax.clause form=imperative verb="Move" complement=$n1
@n1 syntax.nominal dependent="the" dependent="blue" head="box"
@r1 syntax.relation marker="towards" from=$c1 to=$n2
@n2 syntax.nominal dependent="the" dependent="yellow" head="circle"
```

The strategy writes one circuit per message in the [`syntax` schema](../syntax-schema.md). The common reader checks it with `lib/syntax.mjs`. No knowledge repository is read and `SOP_KNOWLEDGE_DIR` plays no part. On the fixed 1% sample, all 1,831 messages get a valid circuit, in about 0.5 ms each.

The reader first builds its own structure of clauses, things, relations and joined groups, with the tokens each value covers. `src/emit-syntax.mjs` gives every word its place in the syntax schema and the shared writer serialises the circuit. The sections below describe how that structure is found. They name its parts with the reader's internal words, which are those of the earlier `nlu` schema; the measurements in them were taken in that schema, before the move to `syntax`.

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
6. **Emit.** Every token lands in exactly one quoted slot. When a verb has two frames, the reader also returns the reading that takes the other one.

### What the reader leaves open

The reader sees one message and nothing else. It states what the words settle and marks the rest, so that a later layer with context completes the circuit and never has to undo a guess.

| Mark | When the reader uses it |
| --- | --- |
| `participant` on a clause | A second bare thing follows a verb that is not known to give, name or turn one thing into another ("move the cloud two hand-widths over"). |
| `attachment=open` on a relation | The clause and the things before the cue hold the phrase about equally well. The relation starts at the clause. |
| `kind=open` on a relation without a cue | A value stands right after a thing ("x 120"), a clause without a finite verb hangs on the clause before it, or a verb has a second completing clause. |
| `form=fragment` with `topic` | No word of the segment is shown to be an action ("pie radius smaller"). |

A cue listed with `link=belongs` ("of") starts at the thing right before it. A past form with no doer is a clause without a finite verb and never a command. A word that the routes place as a thing nearly everywhere, and that no fixed frame showed as a verb, is not read as an action.

## Training

```sh
node strategies/vss/train.mjs --dataset ../webmeet-dataset
```

Training on 183,497 messages (2.6 million tokens) takes about 30 seconds on one CPU core and writes a 3 MB model.

## Measurements

Two blind paired reviews used the 1,831 utterances of the earlier eight-strategy comparison. In each, three independent reviewers graded 240 utterances with the VSS and spaCy direct candidate sets shown anonymously.

| Review | VSS, every circuit acceptable | spaCy direct | Gap |
| --- | ---: | ---: | ---: |
| [First model](../../eval-results/2026-11-27-vss-frozen-one-percent/README.md) | 45.0% | 67.5% | 22.5 |
| [Model at `d98b426`](../../eval-results/2026-11-27-vss-frozen-one-percent-round3/README.md) | 50.8% | 63.8% | 13.0 |

VSS almost never leaves source unaccounted. Its failures are words read as the wrong kind of predicate or clause (L1) and wrong roles or attachments (L3). On the sample it returns a schema-valid reading for every utterance and accounts for every word in 1,828 of 1,831.

### Judged loop on the fixed 1% sample

`judged.mjs` reads the 1,831 texts of the fixed sample, compares every reading with the circuits the dataset already holds as accepted or rejected, and sends only unseen readings to a judge. The verdicts go back into the dataset under `annotations/nlu/v1/judged/`. Each run makes more readings comparable without a judge.

```sh
node strategies/vss/judged.mjs prepare <run-folder> --standard plausible   # packets for the judge
node strategies/vss/judged.mjs publish <run-folder> --standard plausible --tag <name>
```

Two standards are recorded. `strict` asks for the full reading a careful reader gives. `plausible` follows [the judging rules](../../strategies/vss/judging-rules.md): a faithful partial reading passes when it marks what it leaves open, and a rejection must quote the words and the wrong statement about them.

| Run | Standard | L1 | L2 | L3 | L6 | L7 | L8 | L9 | L10 | L8 + L9 + L10 | Complete |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Model at `03f9abe`, six Opus judges | strict | 317 | 5 | 501 | 6 | 33 | 893 | 0 | 76 | 52.9% | 52.9% |
| Model at `346876e` with open marks, four Opus judges on the 912 texts not yet accepted | plausible | 287 | 0 | 425 | 18 | 3 | 164 | 919 | 15 | 60.0% | 55.3% |

L9 counts the texts whose every reading has the same graph as a circuit the dataset already held as accepted. Complete counts the texts at L8 or better whose readings leave nothing open.

The judges also graded 747 circuits the dataset held for these texts: 588 were acceptable and 159 were not. They wrote 589 circuits for texts where nothing was acceptable. Every text of the sample now has an accepted circuit in the dataset.

The judges' corrections show where the faults lie. Of the rejected first readings that have an accepted circuit to compare with, the accepted graph is among the 40 most probable station paths for 6%. Choosing another station path cannot repair the reader: the cut and the linking must change.

### Comparison with the saved circuits

`evaluate.mjs` compares the reader with the native circuits saved in the dataset. Those circuits are fallible and no learning step reads them. On the 11,138 reviewed texts, the current model returns a valid circuit for all, accounts for every word in 99.4%, gives the same graph as a reference for 17.7%, places 86.5% of the tokens in the reference's slot and finds 83.9% F1 of the entities and 64.6% F1 of the links with their role.

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
| Occurrence prototypes as a second opinion on stations | 64.4 | 64.6 |

Three experiments asked where a relation should start, on the same 10,085 relations and the same two candidates (the clause, or the thing before the cue). The start agreed with a saved circuit for 39.8% when the clause always held it, 43.5% when the thing always held it, 50.8% with the role-filler memory alone, 52.4% with counts from the sure cases alone, 59.4% with the counts settled over the whole text and 60.3% with counts and memory together. For 16.7% of the relations the saved start was neither candidate, so the reader now lets every thing in the chain compete.

A register in the decoder that allows one verb per clause (`--budget on`) moved 119 texts closer to a saved circuit and 169 further. It is off.

Four experiments measured worse and are off by default: letting a rare word borrow the habits of its neighbours in the semantic space; attaching a participle to the action when the memory shows no thing it is said of; doubting a clause-opening verb never seen as a verb beyond doubt; and pulling each word towards the kind that frames fixed by the legend show (`train.mjs --anchoring 1`).

Each reading carries `flags`: symptoms read off the circuit without any reference, such as a second bare thing the verb is not known to take, an open word in an adverb slot, a thing with no role or a clause attached to nothing. On 500 judged readings of an earlier model, 51.2% were acceptable overall and 62.8% of the 58% that carried no flag.

`triage.mjs` sorts saved proposals by how far the VSS reading agrees with them. Of 66,360 texts with a drafted circuit, an earlier model gave the same graph for 11.1%, the same slots and links for 6.6% and a different structure for 62.0%; 18.0% of the drafts failed the static check and 2.3% were empty.

## Where the design stands

An independent review of the code and the judged failures found that most lost acceptance comes from the station of a word, not from linking, and that the cause is structural: one committed station path from a one-step model decides the cut and the roles, the linker is a single pass of fixed policy, and habits are counted on the reader's own readings. It estimated 60 to 65% acceptance as the ceiling of this design, 70 to 78% for a design that keeps a lattice of stations and assembles whole circuits from constructions declared in the legend, and 83 to 88% if the factors of that design were trained on the drafted circuits. Readings identical to an accepted circuit were themselves accepted 93% of the time, so no design can measure near 99%.

## Limits

- A verb that the routes learned as a thing stays a thing: "the two lines differ" reads `differ` as a head.
- A clause that completes "make sure" is emitted without a finite form, and its subject also stands as the object of "make sure".
- A noun that also names an action can be read as an imperative when it opens a clause.
- The vector space earns about one point of link F1 so far. The larger gains come from the routes, the counted habits and the structural mechanisms.
- The reader resolves no pronoun and uses no context.
