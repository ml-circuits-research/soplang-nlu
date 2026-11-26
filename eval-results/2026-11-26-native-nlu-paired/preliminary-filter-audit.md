# Preliminary source filter audit

This audit rechecks the 1,861 frozen messages using the original saved circuits, including circuits rejected on emission. It does not regenerate inference or grade the model-reviewed cases. The source gate checks typed circuit structure and assigns exact source occurrences to quotes. It cannot decide whether an assigned word plays the right role. In this report, a *review-eligible* row has at least one candidate that can be sent to the semantic reviewer.

## Exact offline replay

| Strategy | Saved attempts | Source-valid before | Source-valid after | Eligible attempts before | Eligible attempts after | Eligible rows before | Eligible rows after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| z3 | 5,101 | 5,071 | 4,947 | 549 | 642 | 324 | 389 |
| prolog-worlds | 2,249 | 2,249 | 2,174 | 441 | 441 | 338 | 338 |
| prolog-example-transfer | 2,788 | 2,788 | 2,705 | 585 | 585 | 338 | 338 |

The original filter excluded 76 Z3 rows and one row per Prolog strategy whose best source coverage left only characters from the audited punctuation set of comma, period, semicolon, colon, question mark, exclamation mark, em dash and en dash. Of the Z3 rows, 63 had comma-only residue. These are mechanical counts. Some punctuation fixes clause boundaries or marks question force, and some circuits also had role errors.

The revised filter requires valid and fully accounted source. It permits explicitly unresolved nonnumeric commas and a final full stop. It still rejects uncovered occurrences, question marks, semicolons, interior periods, and lexical gaps. This opened 65 Z3 rows and 93 Z3 candidate attempts to semantic review. The new eligibility rule lost no rows or candidate attempts that had been eligible for review.

Atomic decimal and clock tokens invalidate 124 Z3, 75 Prolog-worlds, and 83 example-transfer attempts formerly accepted by the source validator. The same 56 source rows lose their final valid candidate in each strategy. Fifty contain clock readings and six contain decimals. None was eligible for semantic review under the prior strict coverage gate. Reporting this difference as a change in semantic quality would conflate the gate with the engines' output.

The original 30 Z3 rejects span 15 source rows. Fourteen rows had no other candidate survive. Inspection found a forced overlap between a relation cue and an entity head in 15 attempts, a cue and a particle in 10, and a cue and a clause predicate in five. All 30 remain invalid under the revised check. The two Prolog strategies had no original rejects. No source-quote allocation-budget failure appeared in the frozen rejects.

## Source examples

Each block shows a complete saved circuit using its zero-based index in the strategy's prediction array. The rejected example is indexed in the separate rejected array.

### Incidental comma excluded a complete reading

`drawing/scenes-17.csv#987` · z3 · candidates index 0

```text
Hey, make fox green.
```

The target fox and requested green result are both present. The only unresolved occurrence is the greeting comma. The original rule excludes this reading. The revised rule sends it to semantic review.

```sop
@e1 nlu.entity head="fox"
@c1 nlu.clause form=imperative predicate="make" act=change polarity=positive terminator="." direct_object=$e1 result_complement="green" result_color=green filler="Hey" unresolved=","
```

### A genuine shared-occurrence rejection

`drawing/scenes-22.csv#135` · z3 · rejected index 0

```text
take the circle out of the picture
```

There is one occurrence of “out”. The candidate uses it as a separate particle and again inside the relation cue “out of”. No assignment can give both quotes distinct source occurrences. The solver emission is at fault.

```sop
@e1 nlu.entity determiner="the" head="circle" kind=circle
@e2 nlu.entity determiner="the" head="picture"
@rel1 nlu.relation kind=from from=$c1 to=$e2 cue="out of"
@c1 nlu.clause form=imperative predicate="take" act=remove polarity=positive direct_object=$e1 particle="out"
```

### A decimal point passed as a clause terminator

`diagram/nodes-13.csv#610` · z3 · candidates index 0

```text
I need g1 scaled by 1.2
```

The old validator split 1.2 into three tokens and allowed the internal point to terminate a clause. The revised validator keeps the decimal literal whole. The quote fragments fail grounding. Both Prolog strategies also split the same literal across unresolved fields.

```sop
@e1 nlu.entity pronoun="I"
@e2 nlu.entity head="scaled"
@c1 nlu.clause form=declarative predicate="need" polarity=positive terminator="." subject=$e1 direct_object=$e2 result_complement="by" unresolved="g1" unresolved="1"
@c2 nlu.clause form=fragment unresolved="2"
```

### A clock separator passed as sentence punctuation

`calendar/meetings-08.csv#121` · z3 · candidates index 0

```text
Review should be moved to 2026-11-18 at 10:00 UTC
```

The old check accepted the colon in 10:00 as a terminator and 00 as a quantity. The revised boundary check rejects those source claims. Preserving the entire clock literal as one unresolved quote would keep the circuit grounded while acknowledging the remaining interpretation gap.

```sop
@e1 nlu.entity head="Review"
@e2 nlu.entity quantity="00" name="UTC"
@c1 nlu.clause form=declarative predicate="moved" act=place auxiliary="should" auxiliary="be" polarity=positive terminator=":" subject=$e1 unresolved="to" unresolved="2026-11-18" unresolved="at" unresolved="10"
@c2 nlu.clause form=fragment topic=$e2
```

### Complete accounting can hide meaning in filler

`drawing/objects-01.csv#685` · z3 · candidates index 0

```text
Actually a shorter crop, then put a scarf on the avatar.
```

The solver puts “then” in filler and uses additive coordination. The text explicitly orders the two pieces. This grounded circuit passes the source gate, while the semantic reviewer must assess the missing sequence. Z3 had 12 review-eligible rows with at least one candidate using “then” as filler. The count identifies cases for inspection and does not establish 12 semantic errors.

```sop
@e1 nlu.entity determiner="a" modifier="shorter" head="crop"
@e2 nlu.entity determiner="a" head="scarf"
@e3 nlu.entity determiner="the" head="avatar"
@rel1 nlu.relation kind=on from=$c2 to=$e3 cue="on"
@coord1 nlu.coordination kind=additive member=$c1 member=$c2 cue=","
@c1 nlu.clause form=fragment topic=$e1 filler="Actually"
@c2 nlu.clause form=imperative predicate="put" act=place polarity=positive terminator="." direct_object=$e2 filler="then"
```

### An available reading with a grammatical residue

`diagram/charts-03.csv#3599` · z3 · candidates index 0

```text
where is the revenue the largest?
```

The question, revenue subject and superlative “largest” are recoverable. The second occurrence of “the” remains unresolved. The current gate retains the exclusion because this is a lexical token. This is another case where the static result should be read as an eligibility decision.

```sop
@e1 nlu.entity determiner="the" head="revenue"
@c1 nlu.clause form=interrogative predicate="is" polarity=positive question="where" terminator="?" subject=$e1 result_complement="largest" unresolved="the"
```

### A semantic omission and a wrong target

`drawing/scenes-02.csv#177` · z3 · candidates index 0

```text
make his moustache thirty percent bigger
```

The Z3 circuit attaches the change to the moustache and leaves the required percentage increment unresolved. This is a substantive omission, unlike an isolated courtesy comma. The Prolog circuit is source-complete but makes “percent” its direct object. Its valid quotes do not rescue the wrong role.

```sop
@e1 nlu.entity determiner="his" head="moustache"
@c1 nlu.clause form=imperative predicate="make" act=change polarity=positive direct_object=$e1 result_complement="bigger" unresolved="thirty" unresolved="percent"
```

## Reproduction

Read source text from [sample.json.gz](sample.json.gz). For each strategy, combine the original candidate array and its saved checks with the saved rejected circuits and checks. Count old eligibility from the saved structural and source validity, complete source accounting, and zero unresolved occurrences. To obtain the revised counts, pass the exact row text and each original circuit to the validator at revision `af96914`, then count `hasCompleteSource` at candidate and row levels. The canonical semantic-review packet preparer independently applies the same function. See the [validator regression tests](../../tests/check-analysis.test.mjs) for whole decimal and clock quotes, the punctuation exception, and the examples that must remain excluded.

