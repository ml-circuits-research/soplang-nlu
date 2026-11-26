# Agreement between symbolic Z3 and Prolog

On the 1,861-message frozen sample, 98 messages received an acceptable source-first reading from both strategies. The selected circuits shared the same syntax-focused graph on 63 of those messages (64.3%). The other 35 were independently acceptable under the rubric and differed in their graphs. That difference can be a defensible attachment or choice of role representation.

| Comparison | Paired messages | Strict graph match | Syntax-focused graph match |
| --- | ---: | ---: | ---: |
| At least one matching pair among all complete candidates | 213 | 0 (0.0%) | 106 (49.8%) |
| The witnesses selected for the 98 jointly accepted messages | 98 | 0 (0.0%) | 63 (64.3%) |
| At least one matching pair among all complete candidates for those same 98 messages | 98 | 0 (0.0%) | 70 (71.4%) |

Z3 supplied a complete candidate for 389 messages and achieved L8 on 193. Symbolic Prolog supplied a complete candidate for 338 messages and achieved L8 on 181. The 98 jointly accepted messages represent 5.3% of the full cohort. Another 95 were accepted only for Z3, and 83 only for symbolic Prolog. The complete-candidate comparison uses the post-audit source gate. A graph shared by unselected candidates has no separate acceptance judgment.

## What the comparison means

Each circuit is a directed labelled graph. Nodes are typed wires. Source strings and atoms are node attributes, and references are directed, role-labelled edges. Exact isomorphism ignores local IDs, wire order, and slot order. Sequence and contrast member order is preserved. Quoted case and Unicode stay exact.

Strict comparison keeps every field. Syntax-focused comparison omits optional clause action and result-colour atoms and optional entity kind and colour atoms. It treats an unmarked explicit positive polarity as the default and normalizes additive and disjunctive coordination aliases. Clause form, source quotes, result complements, negation, attachment and relation kinds, relation direction, and punctuation and filler roles stay in the graph.

Strict comparison can differ because one circuit adds an explicit default or optional normalization. The absence of a strict match therefore says little about whether both readings convey the same instruction. The syntax-focused comparison can still differ when both circuits assign a compatible interpretation. A match cannot prove either reading is correct, since both can make the same error. The L8 judgments use the original text and the native rubric. The cohort has no independently authored native gold, so these measurements do not establish complete semantic equivalence.

## Frozen examples

The circuits below are the complete witnesses selected in the final review. Indices refer to the original saved candidate arrays.

### Same placement graph

`drawing/placement-04.csv#501`

```text
move mill to the left of Reference.
```

Both circuits place the mill to the left of Reference. They share a directed syntax graph. The strict difference here is the explicit positive polarity in Z3.

**z3, candidate 0, L8**

```sop
@e1 nlu.entity head="mill"
@e2 nlu.entity name="Reference"
@rel1 nlu.relation kind=left_of from=$c1 to=$e2 cue="to the left of"
@c1 nlu.clause form=imperative predicate="move" act=place polarity=positive terminator="." direct_object=$e1
```

**prolog-worlds, candidate 0, L8**

```sop
@e1 nlu.entity head="mill"
@e2 nlu.entity name="Reference"
@r1 nlu.relation kind=left_of from=$c1 to=$e2 cue="to the left of"
@c1 nlu.clause form=imperative predicate="move" direct_object=$e1 terminator="." act=place
```

### Same reading with optional enrichment

`drawing/placement-08.csv#190`

```text
Put the road to the right of the lake.
```

Both put the road to the right of the lake. Prolog supplies normalized kinds for the two entities. The literal heads, the placement action and the direction already identify the instruction.

**z3, candidate 0, L8**

```sop
@e1 nlu.entity determiner="the" head="road"
@e2 nlu.entity determiner="the" head="lake"
@rel1 nlu.relation kind=right_of from=$c1 to=$e2 cue="to the right of"
@c1 nlu.clause form=imperative predicate="Put" act=place polarity=positive terminator="." direct_object=$e1
```

**prolog-worlds, candidate 0, L8**

```sop
@e1 nlu.entity head="road" determiner="the" kind=road
@e2 nlu.entity head="lake" determiner="the" kind=lake
@r1 nlu.relation kind=right_of from=$c1 to=$e2 cue="to the right of"
@c1 nlu.clause form=imperative predicate="Put" direct_object=$e1 terminator="." act=place
```

### Different attachments with comparable meaning

`diagram/nodes-01.csv#1070`

```text
place a star beside the title
```

Z3 attaches “beside the title” to the placement clause. Prolog attaches it to the star. Both witnesses are acceptable and both describe the requested location. The source-to-target role edges differ, so these witnesses do not match under the syntax projection. Another complete candidate does match on this row.

**z3, candidate 0, L8**

```sop
@e1 nlu.entity determiner="a" head="star" kind=star
@e2 nlu.entity determiner="the" head="title"
@rel1 nlu.relation kind=near from=$c1 to=$e2 cue="beside"
@c1 nlu.clause form=imperative predicate="place" act=place polarity=positive direct_object=$e1
```

**prolog-worlds, candidate 1, L8**

```sop
@e1 nlu.entity head="star" determiner="a" kind=star
@e2 nlu.entity head="title" determiner="the"
@r1 nlu.relation kind=near from=$e1 to=$e2 cue="beside"
@c1 nlu.clause form=imperative predicate="place" direct_object=$e1 act=place
```

### Different roles carrying the same quantity

`document/text-03.csv#1351`

```text
erase one document
```

Both witnesses ask to erase one document. Z3 gives “one” the determiner slot. Prolog gives it the quantity slot. Both keep the quantity in the surface analysis. Neither complete candidate set has a syntax-isomorphic match for this row.

**z3, candidate 0, L8**

```sop
@e1 nlu.entity determiner="one" head="document" kind=document
@c1 nlu.clause form=imperative predicate="erase" act=remove polarity=positive direct_object=$e1
```

**prolog-worlds, candidate 0, L8**

```sop
@e1 nlu.entity head="document" quantity="one" kind=document
@c1 nlu.clause form=imperative predicate="erase" direct_object=$e1 act=remove
```

### Agreement on a form error

`diagram/charts-07.csv#1141`

```text
would you show the values on the graph
```

The selected circuits share a syntax-focused graph and both received L1. The modal “would you” introduces an interrogative form. Both mark the clause declarative. The Prolog witness additionally supplies optional class and action atoms.

**z3, candidate 1, L1**

```sop
@e1 nlu.entity pronoun="you"
@e2 nlu.entity determiner="the" head="values"
@e3 nlu.entity determiner="the" head="graph"
@rel1 nlu.relation kind=on from=$c1 to=$e3 cue="on"
@c1 nlu.clause form=declarative predicate="show" auxiliary="would" polarity=positive subject=$e1 direct_object=$e2
```

**prolog-worlds, candidate 0, L1**

```sop
@e1 nlu.entity pronoun="you"
@e2 nlu.entity head="values" determiner="the" kind=chart
@e3 nlu.entity head="graph" determiner="the" kind=chart
@r1 nlu.relation kind=on from=$c1 to=$e3 cue="on"
@c1 nlu.clause form=declarative predicate="show" subject=$e1 direct_object=$e2 auxiliary="would" act=change
```

## Reproduction

The [measurement](symbolic-agreement.json) includes row IDs and per-row verdicts. From the library repository, run the following with the finalized judgments from this cohort.

```bash
node tests/benchmark/meaning-review/compare-symbolic-graphs.mjs \
  eval-results/2026-11-26-native-nlu-paired ../sop-knowledge-worlds \
  /tmp/symbolic-agreement.json path/to/native-judgments.jsonl.gz
```
