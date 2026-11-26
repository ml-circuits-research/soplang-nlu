# Why the selector training pool missed whole readings

The reviewed TRAIN split contains 500 texts. The four-provider pool had an accepted whole reading on 369 and missed 131. Of those 131 misses, **45 had no source-complete proposal** and **86 had at least one source-complete proposal that reviewers rejected**. These counts use the saved whole-pool votes.

I examined the saved circuits and adjudication reasons on 40 of the 131 misses. Twelve sampled misses had no eligible proposal and 28 had eligible proposals that failed review. I assigned one main bottleneck per text.

| Main bottleneck in the saved traces | Sample count | Share of 40 |
|---|---:|---:|
| Typed property, value, or frame role within a locally identifiable action | 17 | 42.5% |
| Other local syntax, such as predicate identity, attachment, or inherited scope | 11 | 27.5% |
| Both boundary and local projection problems | 9 | 22.5% |
| Most plausibly recoverable by reparsing source-preserving spans | 3 | 7.5% |

The 28 primarily local failures give more evidence for role and frame projection as the larger source of loss. The three segmentation candidates have recognizable boundaries and mostly intact local content. The nine mixed cases could benefit from better boundary recovery and still require local repairs. **These are hand-coded observations about saved misses, not measured rescue rates.** No spans were reparsed. A reparse would also need to recover exact source coverage and preserve the connections between spans.

## Representative traces

**Plausible segmentation** · `drawing/placement-02.csv#3254`

> instead, a small dog down at the bottom, next please clear every block without red, then leave the red blocks and the layout exactly as they are — keep the rest as it is

The base-beam graph preserved clear, leave and keep, including the block qualifier and the dog's location. It made the introductory dog an adjunct of the final keep clause.

```sop
@n4 nlu.clause form=imperative predicate="keep" polarity=positive direct_object=$n12
@n16 nlu.entity head="dog" adverb="instead" determiner="a" modifier="small"
@n17 nlu.relation kind=nominal_adjunct from=$n4 to=$n16
@n20 nlu.entity head="bottom" determiner="the"
@n21 nlu.relation kind=at from=$n16 to=$n20 cue="at" adverb="down"
```

Separating the initial nominal stretch at “next” could give the dog its own placement fragment. “Next,” “then,” and the final preservation request still need the correct sequence. The compact graph retained the dog but reviewers rejected its placement of “then.”

**Typed result properties** · `diagram/charts-04.csv#2163`

> make the grid lines thick solid grey

The complete base beam gives “thick” and “solid” to “grey” as nominal modifiers. The adapted beam preserves “grey” as a result and explicitly leaves the other two properties unresolved. The action and target are already identifiable in both. There is no independent shorter action to split off.

```sop
@n1 nlu.clause form=imperative predicate="make" polarity=positive direct_object=$n2 predicative_entity=$n3
@n2 nlu.entity head="lines" determiner="the" compound="grid"
@n3 nlu.entity head="grey" modifier="thick" modifier="solid"
```

```sop
@n1 nlu.clause form=imperative predicate="make" polarity=positive direct_object=$n2 result_complement="grey" unresolved="thick" unresolved="solid"
```

**Typed numeric roles** · `drawing/scenes-21.csv#183`

> arrange o1 and o2 in 240 by 160 at 300,200

The base beam found both named objects and the two prepositional attachments. It represented one size component as the other's quantity and captured only the first coordinate. Neuro-Prolog retained the exact string “300,200” as a single head and still left “by” unresolved. Both numeric pairs belong to the same arrange action.

```sop
@n1 nlu.clause form=imperative predicate="arrange" polarity=positive direct_object=$n4 unresolved="by" unresolved="," unresolved="200"
@n5 nlu.entity literal="160" quantity="240"
@n6 nlu.relation kind=in from=$n1 to=$n5 cue="in"
@n7 nlu.entity literal="300"
@n8 nlu.relation kind=at from=$n1 to=$n7 cue="at"
```

**Mixed boundary and attachment** · `drawing/scenes-11.csv#4006`

> can you dismiss the one who stayed put last turn out of the line, then leave the rest of the line as it is

The base beam put “leave” inside the relative clause modifying “the one,” and attached “out of the line” to “last turn.” Cutting at “then” can prevent the first error. It leaves the second attachment to resolve in the first segment. The adapted compact reading had already separated “leave” and still attached “out of the line” to staying.

```sop
@n10 nlu.coordination kind=sequence member=$n2 member=$n3 cue="," cue="then"
@n11 nlu.entity head="turn" modifier="last"
@n13 nlu.relation kind=subject_relative from=$n6 to=$n10 cue="who"
@n17 nlu.relation kind=out_of from=$n11 to=$n16 cue="out of"
```

## Sample definition

Use only `trainIds` from the archived [training split](../2026-11-26-neuro-selector-proposal-pools/train/split.json), its [pool](../2026-11-26-neuro-selector-proposal-pools/train/pool.jsonl.gz), and its [settled votes](../2026-11-26-neuro-selector-proposal-pools/train/votes.jsonl.gz). Keep misses with no accepted eligible `(id, SOP)` pair. Sort by SHA-256 of the UTF-8 string `train-500-failure-trace-v1` plus a NUL byte plus the ID, ascending. Take the first 40. The lists below are positions in this ordering, starting at one.

- Typed: 1, 2, 5, 8, 11, 12, 17, 18, 20, 21, 24, 25, 33, 34, 36, 37, 38.
- Other local syntax: 3, 13, 14, 15, 16, 19, 26, 29, 30, 39, 40.
- Mixed: 4, 7, 10, 22, 23, 27, 28, 31, 35.
- Plausible segmentation: 6, 9, 32.

The assignment is an exploratory review. Some categories overlap, especially property roles and attachment. No validation, diagnostic, or fresh text was inspected.
