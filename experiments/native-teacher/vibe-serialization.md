## Output contract and worked examples

Write each result independently using only that row's text. For an unambiguous input emit one reading. Do not emit commentary outside the JSON object. Supply all four result fields even when ambiguity or reason is null.

Inside each SOP string, a wire declaration starts with @. Every reference inside a field value starts with $. For example, declare @clock and refer to it with direct_object=$clock. Never write direct_object=@clock, direct_object="clock", or direct_object=clock. Clause and entity IDs are local to one result. Use actual line breaks between SOP wires, encoded as \n in JSON. Escape quotes inside the JSON string. Only keys listed for that wire type are allowed. Use double-quoted exact source spans for the string keys, and bare atoms for enum and atom keys.

"Move the red lamp left. Thanks!" becomes these SOP wires.

```sop
@c1 nlu.clause form=imperative predicate="Move" direct_object=$lamp adverb="left" terminator="."
@lamp nlu.entity determiner="the" modifier="red" head="lamp"
@c2 nlu.clause form=fragment expression="Thanks" speech_act=gratitude terminator="!"
```

"Who points to Draft?" keeps the question word separate from the endpoint. Use a relation wire for the written link.

```sop
@c nlu.clause form=interrogative question="Who" predicate="points" terminator="?"
@name nlu.entity name="Draft"
@r nlu.relation kind=to from=$c to=$name cue="to"
```

"Set lamp 2 blue" uses the written number as part of the lookup, and blue as the result. A written identifier is distinct from a count or a measured value.

```sop
@c nlu.clause form=imperative predicate="Set" direct_object=$lamp result_complement="blue"
@lamp nlu.entity head="lamp" compound="2"
```

For embedded clauses, connect the bare or infinitival verb as a nonfinite clause and use clausal_complement where appropriate. For meaningful coordinated actions or a sequence, use one clause per action and a coordination wire with repeated member=$id keys. For dates, times, labels and durations, preserve the exact values in literal or name fields, and attach them to their correct clause or entity. Keep auxiliaries, negation, courtesy and punctuation in their own keys when applicable. A detached greeting or gratitude gets its own clause. Omit optional semantic atoms when the syntax is enough. Never add a guessed participant or normalize the original spelling.
