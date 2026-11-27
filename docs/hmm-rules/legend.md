[Home](../README.md) › [hmm-rules in depth](README.md) › The legend

# The legend

This page: the format and content of `strategies/hmm-rules/legend.sop`: the stations' attributes, the word lists, the forms, the paired linking words and the kinds, and how the legend depends on the code. Kind: Reference.

At commit `fa46cb7` unless marked. Why the legend is designed this way is explained once, in [How hmm-rules works](how-it-works.md#why-the-legend-is-the-only-word-list).

## What it is

The legend is the one hand-written file of English knowledge that hmm-rules reads. It is written in [SOP Lang](../concepts/sop-lang.md), one wire per line: an id such as `@st.noun`, a type such as `vss.station`, then `key=value` pairs. It is not read by the SOP Lang toolchain: `parseWires` in `src/legend.mjs` parses it with a regular expression. Its header line:

```sop
@vss.legend core.module name=vss.legend version=1 language=en schema=nlu
```

`core.module` is explained in [SOP Lang: exact rules](../reference/sop-lang.md). `schema=nlu` is accurate: the `key` of each station is a slot name of the earlier `nlu` schema, a leftover of that period, and the linker writes its internal wires with those names ([Writing](writing.md)).

The training copies the legend into the model. An edit to `legend.sop` changes no reading until the model is trained again ([The model file](model-file.md)).

## Stations (`vss.station`)

A station is a hidden state of the HMM: a fine word class. There are 25; each is described on [The stations](stations.md). Their attributes, as the legend's comments define them:

| Attribute | Meaning |
| --- | --- |
| `follows` | The stations that usually come next: the prior before any text is seen. |
| `core` | A unit can end here. A station that is not core should be followed by one of its `follows`. |
| `closed` | Only listed words stand here. |
| `like` | The station shares the words (the emission row) of another station. |
| `shape` | Surface shapes admitted by form alone (number, date, clock, code, mark, quote) or preferred before learning (capital, upper). |
| `suffix` | An ending that admits an unlisted word at a closed station. |
| `opens=false` | Never begins a sentence. |
| `after` | The only stations it may come after; `start` is the beginning of a sentence. |
| `ends` | Closes a sentence. |
| `as` | The unit kind, when it is not the station's name. |
| `clause=opens` | A word here begins a new clause. |

Three real lines:

```sop
@st.pronoun vss.station unit=entity key=pronoun core=true closed=true
@st.following vss.station unit=clause key=predicate core=true like=predicate
@st.complement vss.station unit=clause key=result_complement core=true like=modifier
```

## Word lists (`vss.words`)

A word list names a station and its words.

- **Confining list.** A list without `open=true` confines its words: they may stand only at the stations whose lists name them.
- **Open list.** A list with `open=true` adds a station and confines nothing: its words keep every other use the text shows.
- **Mark.** A list may carry `link=`, a mark that rules consult by name ([The legend's marks](legend-marks.md)). A word keeps the first mark it is given as its main mark (`legend.links`) and every mark in `legend.tags`.
- **Compound.** A listed entry with a space is a compound, joined into one observation when its words stand together ("next to", "in front of").

Two real lines:

```sop
@w.subject vss.words station=pronoun link=subject word="i" word="we" word="they" word="he" word="she"
@w.cue.belongs vss.words station=cue open=true link=belongs word="of"
```

## Endings, forms and irregular pairs

```sop
@forms vss.endings ending=s ending=es ending=ed ending=ing ending=er ending=est
@forms.past vss.forms station=predicate also=modifier confine=true ending=ed
@forms.progressive vss.forms station=predicate ending=ing
@forms.graded vss.forms station=modifier ending=er ending=est
@forms.plural vss.forms station=noun ending=s ending=es
```

Irregular pairs follow, such as `pair="draw drawn"` and `pair="go gone"`.

A form belongs to a family when stripping a listed ending leaves a word that the text also uses. `stemsOf` in `src/forms.mjs` also tries the stem with an added "e", without a doubled consonant, and with "i" turned into "y". The form rules decide where such a form starts out in training, whether it is confined (past forms are), and what the lexicon reports: `formOf` (past or progressive), `gradedForm`, `sForm` (a verb in -s), `pluralThing`.

## Paired linking words and kinds

```sop
@pair.range vss.pair first="from" second="to"
@pair.span vss.pair first="between" second="and"
@k.contrast vss.kind unit=coordination kind=contrast joins=clause cue="but"
@k.condition vss.kind unit=relation kind=condition cue="if" cue="unless" cue="whether"
```

A **pair** says that the second linking word starts where the first did ("from A to B"). The pair `between … and` never fires: a pair applies only when its second word is the cue of a relation, and "and" is confined to the conjunction station.

**Kinds** name coordinations (additive, alternative, contrast, sequence), relations between clauses (purpose, condition, cause, time, label, nominal_clause) and detached expressions (gratitude, greeting, apology, acknowledgment, rejection, hesitation). The syntax schema has no kinds, so no kind is written. The reader still uses them in five ways:

1. **Which words coordinate.** The cue lists of the four coordination kinds decide it: ",", ";", "&", "and", "or", "nor", "but", "then" and "so" coordinate; a colon or a dash does not.
2. **Clause joiners.** `joins=clause` on "but", "then" and "so" makes what follows a clause of its own.
3. **Condition.** The cues of `condition` define the learned `asks` habit, and "if" after a verb that asks is what is asked ("tell me if it fits").
4. **Label.** `label` marks naming participles for the writer ("a group called g2").
5. **Relation kinds by cue.** The other kinds only name internal relations, which the syntax output drops.

## Changes after `fa46cb7`

- `83fce90`: "versus" and "vs" as prepositions, "whenever" and "wherever" as markers, "whichever" as a determiner.
- `71f0dd2`: open lists with the marks `singular` and `plural` (grammatical number), and `substitute` ("one", "ones") ([The legend's marks](legend-marks.md)).

## The legend is not independent of the code

The header of `src/legend.mjs` says the reader holds "no word list and no slot name of its own". That holds for English words, not for names. `src/units.mjs`, `src/links.mjs`, `src/reader.mjs` and `src/emit-syntax.mjs` hard-code the station names (`'noun'`, `'predicate'`, …), the mark names (`'needsbare'`, `'finite'`, …) and the `nlu` slot names (`'direct_object'`, …). Renaming a station or a mark in the legend breaks the code. Adding words to a list is done as in [Add a rule to hmm-rules](../guides/add-hmm-rules-rule.md).

## Standard, new here, particular

| Label | For the legend |
| --- | --- |
| Standard | A closed list of [function words](https://en.wikipedia.org/wiki/Function_word), the small fixed classes of a language. |
| New here | One file that is both the HMM's prior and the only word list of the reader; its marks, which let rules name a word set without listing words in code. |
| Particular | Borderline entries shaped by the dataset: left/right as direction adverbs, today/tomorrow, thanks. |

---

Next: [The legend's marks](legend-marks.md) · Up: [hmm-rules in depth](README.md)
