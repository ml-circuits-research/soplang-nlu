# Native NLU failure examples and independent source audit

This audit uses the frozen 1,861-message paired sample at library revision `957985c1180c881a9cb2f1f9d4d65eb3d7b2a963`. The cases illustrate role, scope and normalization differences. They do not estimate strategy-wide error rates.

Find a case by its ID in `sample.json.gz` and the corresponding strategy prediction file. Candidate indices are zero-based in the saved `candidates` arrays. Every example shows the full selected circuit. I compared the actual circuits to the utterance first. The annotations supply supporting evidence when they clarify a reading.

## Missing optional type atoms

**Row** `drawing/placement-08.csv#190`

**Source**

```text
Put the road to the right of the lake.
```

Both readings put the road to the right of the lake. Z3 supplies the source heads and the correct relation. The Prolog reading also populates the optional entity kind atoms for road and lake. The literal heads identify both entities in either circuit.

**z3, candidate 0**

```sop
@e1 nlu.entity determiner="the" head="road"
@e2 nlu.entity determiner="the" head="lake"
@rel1 nlu.relation kind=right_of from=$c1 to=$e2 cue="to the right of"
@c1 nlu.clause form=imperative predicate="Put" act=place polarity=positive terminator="." direct_object=$e1
```

**prolog-worlds, candidate 0**

```sop
@e1 nlu.entity head="road" determiner="the" kind=road
@e2 nlu.entity head="lake" determiner="the" kind=lake
@r1 nlu.relation kind=right_of from=$c1 to=$e2 cue="to the right of"
@c1 nlu.clause form=imperative predicate="Put" direct_object=$e1 terminator="." act=place
```

## The moved object and its anchor

**Row** `drawing/people-09.csv#197`

**Source**

```text
put a beanie on the avatar
```

The beanie is what the user wants put on the avatar. Z3 links both entities to their roles. Prolog retains the avatar as the anchor but leaves the beanie unresolved and supplies no direct object. The loss is an essential participant.

**z3, candidate 0**

```sop
@e1 nlu.entity determiner="a" head="beanie"
@e2 nlu.entity determiner="the" head="avatar"
@rel1 nlu.relation kind=on from=$c1 to=$e2 cue="on"
@c1 nlu.clause form=imperative predicate="put" act=place polarity=positive direct_object=$e1
```

**prolog-worlds, candidate 0**

```sop
@e1 nlu.entity head="avatar" determiner="the" kind=face
@r1 nlu.relation kind=on from=$c1 to=$e1 cue="on"
@c1 nlu.clause form=imperative predicate="put" act=place unresolved="a beanie"
```

## Two multiword endpoints

**Row** `diagram/diagrams-04.csv#2117`

**Source**

```text
Hey, connect Check billing to Refund approved?.
```

The source names two endpoints, “Check billing” and “Refund approved”. Prolog preserves both names and the imperative connection. The question mark can reasonably be treated as terminal punctuation in this noisy text. Z3 reads it as an interrogative and truncates both endpoints, losing material identity.

**z3, candidate 0**

```sop
@e1 nlu.entity head="billing"
@e2 nlu.entity name="Refund"
@rel1 nlu.relation kind=to from=$c1 to=$e2 cue="to"
@c1 nlu.clause form=interrogative predicate="connect" act=connect polarity=positive terminator="?" direct_object=$e1 filler="Hey" unresolved="," unresolved="Check" unresolved="approved" unresolved="."
```

**prolog-worlds, candidate 0**

```sop
@e1 nlu.entity name="Check billing"
@e2 nlu.entity name="Refund approved"
@r1 nlu.relation kind=to from=$c1 to=$e2 cue="to"
@c1 nlu.clause form=imperative predicate="connect" direct_object=$e1 terminator="?" act=connect filler="Hey" filler=","
@c2 nlu.clause form=fragment terminator="."
```

## An unresolved amount and a wrong target

**Row** `drawing/scenes-02.csv#177`

**Source**

```text
make his moustache thirty percent bigger
```

Z3 keeps the moustache as the target and “bigger” as the result, but leaves the required thirty-percent increment unread. Prolog has no unresolved words and makes “percent” the target head, with “moustache” as a modifier. The source specifies a change to the moustache.

**z3, candidate 0**

```sop
@e1 nlu.entity determiner="his" head="moustache"
@c1 nlu.clause form=imperative predicate="make" act=change polarity=positive direct_object=$e1 result_complement="bigger" unresolved="thirty" unresolved="percent"
```

**prolog-worlds, candidate 0**

```sop
@e1 nlu.entity head="percent" determiner="his" modifier="moustache" quantity="thirty"
@c1 nlu.clause form=imperative predicate="make" direct_object=$e1 result_complement="bigger"
```

## A complete quote inventory with a false relation

**Row** `diagram/charts-06.csv#894`

**Source**

```text
Please show the gridlines on Revenue by region.
```

“Revenue by region” can reasonably denote the chart name in this command. Both displayed circuits assert a near relation from “by”, which supplies neither a chart-title grouping nor a spatial placement. Z3 has accounted for every word but adds an explicit relation that changes the meaning. Prolog also leaves the gridlines unresolved.

**z3, candidate 0**

```sop
@e1 nlu.entity determiner="the" head="gridlines"
@e2 nlu.entity name="Revenue"
@e3 nlu.entity head="region"
@rel1 nlu.relation kind=on from=$c1 to=$e2 cue="on"
@rel2 nlu.relation kind=near from=$e2 to=$e3 cue="by"
@c1 nlu.clause form=imperative predicate="show" polarity=positive terminator="." direct_object=$e1 filler="Please"
```

**prolog-worlds, candidate 0**

```sop
@e1 nlu.entity name="Revenue"
@r1 nlu.relation kind=on from=$c1 to=$e1 cue="on"
@e2 nlu.entity head="region"
@r2 nlu.relation kind=near from=$c1 to=$e2 cue="by"
@c1 nlu.clause form=imperative predicate="show" terminator="." act=change filler="Please" unresolved="the gridlines"
```

## An explicit sequence treated as filler

**Row** `drawing/objects-01.csv#685`

**Source**

```text
Actually a shorter crop, then put a scarf on the avatar.
```

The utterance starts with a corrective hair-style fragment, then asks to put a scarf on the avatar. Prolog preserves the topic, scarf placement and sequence. Z3 preserves both parts and both placement entities but treats “then” as filler, leaving the order implicit. The example-transfer strategy emits this same Prolog reading.

**z3, candidate 0**

```sop
@e1 nlu.entity determiner="a" modifier="shorter" head="crop"
@e2 nlu.entity determiner="a" head="scarf"
@e3 nlu.entity determiner="the" head="avatar"
@rel1 nlu.relation kind=on from=$c2 to=$e3 cue="on"
@coord1 nlu.coordination kind=additive member=$c1 member=$c2 cue=","
@c1 nlu.clause form=fragment topic=$e1 filler="Actually"
@c2 nlu.clause form=imperative predicate="put" act=place polarity=positive terminator="." direct_object=$e2 filler="then"
```

**prolog-worlds, candidate 0**

```sop
@e1 nlu.entity head="crop" determiner="a" modifier="shorter"
@c1 nlu.clause form=fragment topic=$e1 filler="Actually"
@e2 nlu.entity head="scarf" determiner="a"
@e3 nlu.entity head="avatar" determiner="the" kind=face
@r1 nlu.relation kind=on from=$c2 to=$e3 cue="on"
@g1 nlu.coordination kind=sequence member=$c1 member=$c2 cue=", then"
@c2 nlu.clause form=imperative predicate="put" direct_object=$e2 terminator="." act=place
```

## An optional action atom can introduce a contradiction

**Row** `drawing/scenes-17.csv#786`

**Source**

```text
make Mia yellow.
```

The named Mia is to become yellow. The worlds-only candidate leaves the action atom unstated while retaining the target and colour change. Example-transfer candidate 1 adds a creation action, which the quoted predicate does not license in this construction. Candidate 2 supplies the supported change action. This illustrates an overloaded lexical entry in one candidate, while the complete candidate set still contains a reasonable reading.

**prolog-worlds, candidate 0**

```sop
@e1 nlu.entity name="Mia"
@c1 nlu.clause form=imperative predicate="make" direct_object=$e1 result_complement="yellow" terminator="." result_color=yellow
```

**prolog-example-transfer, candidate 1**

```sop
@e1 nlu.entity name="Mia"
@c1 nlu.clause form=imperative predicate="make" direct_object=$e1 result_complement="yellow" terminator="." result_color=yellow act=make
```

**prolog-example-transfer, candidate 2**

```sop
@e1 nlu.entity name="Mia"
@c1 nlu.clause form=imperative predicate="make" direct_object=$e1 result_complement="yellow" terminator="." result_color=yellow act=change
```

## Review disagreement over a polite request

**Row** `drawing/objects-06.csv#115`

**Source**

```text
can you make Box much tinier
```

In an early primary–independent review overlap, the primary reviewer selected Z3 candidate 1 and treated the missing “much” as the essential omission. The other reviewer preferred candidate 0 and treated the declarative label as a wrong main intent. Candidate 0 preserves “can you”, the target Box and the full result “much tinier”. The frozen review treats its incorrect top-level form as L1. That label and the primary L7 assessment concern different candidate witnesses. Prolog makes “Box much tinier” the name, losing the requested degree as an applied change.

**z3, candidate 0**

```sop
@e1 nlu.entity pronoun="you"
@e2 nlu.entity name="Box"
@c1 nlu.clause form=declarative predicate="make" act=change auxiliary="can" polarity=positive subject=$e1 direct_object=$e2 result_complement="much tinier"
```

**z3, candidate 1**

```sop
@e1 nlu.entity pronoun="you"
@e2 nlu.entity name="Box"
@c1 nlu.clause form=declarative predicate="make" act=change auxiliary="can" polarity=positive subject=$e1 direct_object=$e2 result_complement="tinier" unresolved="much"
```

**prolog-worlds, candidate 0**

```sop
@e1 nlu.entity pronoun="you"
@e2 nlu.entity name="Box much tinier"
@c1 nlu.clause form=declarative predicate="make" subject=$e1 direct_object=$e2 auxiliary="can"
```

## A reviewer missed relations present in the chosen circuit

**Row** `drawing/scenes-07.csv#1085`

**Source**

```text
tkae the boy in the blue jacket back toward the center of the scene
```

The primary reviewer gave the same Z3 witness L6 for omitting the jacket and destination. Both are explicit. The first relation attaches the blue jacket to the boy. The next two attach the destination to the movement and the center to the scene. “Back” is present as the complement. The independent L8 assessment fits this full source reading and preserves the original misspelling “tkae”.

**z3, candidate 2**

```sop
@e1 nlu.entity determiner="the" head="boy"
@e2 nlu.entity determiner="the" modifier="blue" color=blue head="jacket"
@e3 nlu.entity determiner="the" head="center"
@e4 nlu.entity determiner="the" head="scene"
@rel1 nlu.relation kind=in from=$e1 to=$e2 cue="in"
@rel2 nlu.relation kind=to from=$c1 to=$e3 cue="toward"
@rel3 nlu.relation kind=of from=$e3 to=$e4 cue="of"
@c1 nlu.clause form=imperative predicate="tkae" polarity=positive direct_object=$e1 result_complement="back"
```

**prolog-worlds, candidate 0**

```sop
@c1 nlu.clause form=fragment unresolved="tkae the boy in the blue jacket back toward the center of the scene"
```

## A reviewer mistook a modifier for the direct object

**Row** `diagram/nodes-04.csv#696`

**Source**

```text
can you make the message arrows solid for calls, dashed for returns?
```

The primary reviewer described message arrows as the direct object in the selected example-transfer circuit. The object wire actually assigns “solid” as the head and “arrows” as a modifier. The independent L2 assessment identifies the wrong target. Z3 separately recognises “solid” as a result, but its target is headed by “message” and both “arrows” and “dashed” remain unread. Neither displayed circuit keeps the two style assignments.

**prolog-example-transfer, candidate 0**

```sop
@e1 nlu.entity pronoun="you"
@e2 nlu.entity head="solid" determiner="the" modifier="message" modifier="arrows"
@e3 nlu.entity head="calls"
@r1 nlu.relation kind=for from=$c1 to=$e3 cue="for"
@e4 nlu.entity head="returns"
@r2 nlu.relation kind=for from=$c1 to=$e4 cue="for"
@c1 nlu.clause form=interrogative predicate="make" subject=$e1 direct_object=$e2 auxiliary="can" terminator="?" filler="," unresolved="dashed"
```

**z3, candidate 0**

```sop
@e1 nlu.entity pronoun="you"
@e2 nlu.entity determiner="the" head="message"
@e3 nlu.entity head="calls"
@e4 nlu.entity head="returns"
@rel1 nlu.relation kind=for from=$c1 to=$e3 cue="for"
@rel2 nlu.relation kind=for from=$c1 to=$e4 cue="for"
@c1 nlu.clause form=interrogative predicate="make" act=change auxiliary="can" polarity=positive terminator="?" subject=$e1 direct_object=$e2 result_complement="solid" unresolved="arrows" unresolved="," unresolved="dashed"
```

## A literal pronoun with its result missing

**Row** `drawing/scenes-16.csv#952`

**Source**

```text
add a orange star and call it hill.
```

The second instruction names the new star “hill”. The Z3 alternative shown preserves the literal pronoun as the object but leaves the new name unread. Prolog recognises the second predicate but leaves both its object and the new name unresolved.

**z3, candidate 1**

```sop
@e1 nlu.entity determiner="a" modifier="orange" color=orange head="star" kind=star
@e2 nlu.entity pronoun="it"
@coord1 nlu.coordination kind=additive member=$c1 member=$c2 cue="and"
@c1 nlu.clause form=imperative predicate="add" act=make polarity=positive direct_object=$e1
@c2 nlu.clause form=imperative predicate="call" act=change polarity=positive terminator="." direct_object=$e2 unresolved="hill"
```

**prolog-worlds, candidate 0**

```sop
@e1 nlu.entity head="star" determiner="a" modifier="orange" kind=star color=orange
@c1 nlu.clause form=imperative predicate="add" direct_object=$e1 act=make
@g1 nlu.coordination kind=conjunctive member=$c1 member=$c2 cue="and"
@c2 nlu.clause form=imperative predicate="call" terminator="." act=change unresolved="it hill"
```

