[Home](../README.md) › [VSS in depth](README.md) › The stations

# The stations

This page: what a station of VSS is, the fields each one has, and the index of the 25 stations; the two stations of relations and coordinations are on this page, the others on two pages of their own. Kind: Reference.

## What a station is

A station is a hidden state of VSS's hidden Markov model ([Methods](methods.md)), and so a fine word class: the kind of position a word stands in. Choosing one station per word is [part-of-speech tagging](https://en.wikipedia.org/wiki/Part-of-speech_tagging) with a finer [set of classes](https://en.wikipedia.org/wiki/Part_of_speech) than usual: for example, a verb that opens its clause and a verb after its subject are two stations.

Each station is declared in the legend with `vss.station` ([The legend](legend.md)). Its fields:

- **Unit**: the kind of unit the chunker builds from it: entity (a nominal), clause, relation or coordination.
- **nlu key**: the slot of the earlier `nlu` schema it fills. Several stations can share a key. The key is a leftover of that schema ([VSS's own names](names.md)).
- **Flags**: the legend's attributes in short; "opens a clause" is `clause=opens`.

The list is as the VSS report gives it at commit `fa46cb7`; the stations have not changed since. The station's code name is in brackets.

## Shared emission rows

Two pairs of stations share one emission row, that is, the same probabilities of producing each word:

- the verb that opens its clause (`predicate`) and the verb after its subject (`following`);
- the attributive adjective (`modifier`) and the predicative adjective (`complement`).

Only the transitions tell each pair apart. `predicate` may come only after the stations in its `after` list, which makes "the box moves" decode "moves" as `following`.

## The 25 stations, by unit

- [Stations of nominals](stations-nominals.md), 9 stations: Determiner (`determiner`), Numeral (`quantity`), Degree adverb (`degree`), Attributive adjective (`modifier`), Common noun (`noun`), Proper noun (`name`), Pronoun (`pronoun`), Literal (`literal`), Possessive clitic (`possessive`).
- [Stations of clauses](stations-clauses.md), 14 stations: Interrogative word (`question`), Auxiliary (`auxiliary`), Negation (`negation`), Subordinating conjunction (`marker`), Infinitival "to" (`infinitive`), Relative pronoun (`relative`), Verb that opens its clause (`predicate`), Verb after its subject (`following`), Predicative adjective (`complement`), Adverb or particle (`adverb`), Interjection (`expression`), Filler (`filler`), Separator (`separator`), Terminator (`terminator`).
- Stations of relations and coordinations, 2 stations, below.

## Stations of relations and coordinations

### Preposition (`cue`)

| Field | Value |
| --- | --- |
| Unit | relation |
| nlu key | `cue` |
| Flags | closed |
| Term | preposition ([adposition](https://en.wikipedia.org/wiki/Adposition)) |

### Coordinating conjunction (`conjunction`)

| Field | Value |
| --- | --- |
| Unit | coordination |
| nlu key | `cue` |
| Flags | opens a clause, core, closed |
| Term | coordinating [conjunction](https://en.wikipedia.org/wiki/Conjunction_(grammar)) |

---

Next: [Stations of nominals](stations-nominals.md) · Up: [VSS in depth](README.md)
