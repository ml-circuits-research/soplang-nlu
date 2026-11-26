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

### Preserve every role in imperfect text

Do a quick internal pass over each sentence before emitting it. Check the speaker's words, auxiliaries, subjects, verbs, complement markers, objects, written values, and detached expressions against the graph. In particular, a separate `to` before a bare verb is the nonfinite clause's `marker="to"`. A clause can point to the already declared participant that supplies its subject. Quote that participant only at its one entity wire.

"I need you to open it." becomes these wires.

```sop
@c1 nlu.clause form=declarative subject=$speaker predicate="need" direct_object=$recipient clausal_complement=$c2
@speaker nlu.entity pronoun="I"
@recipient nlu.entity pronoun="you"
@c2 nlu.clause form=nonfinite marker="to" predicate="open" subject=$recipient direct_object=$target terminator="."
@target nlu.entity pronoun="it"
```

Utterances sometimes interrupt one construction and start another. Represent the incomplete construction with `completion=interrupted`. Keep the next complete clause separate. Preserve the exact words of the interrupted preface without inventing a missing verb or forcing a false dependency.

"Could you — which meetings are on Work 5?" becomes these wires.

```sop
@c1 nlu.clause form=interrogative completion=interrupted auxiliary="Could" subject=$recipient separator="—"
@recipient nlu.entity pronoun="you"
@c2 nlu.clause form=interrogative predicate="are" subject=$requested terminator="?"
@requested nlu.entity determiner="which" head="meetings"
@name nlu.entity name="Work 5"
@r nlu.relation kind=on from=$c2 to=$name cue="on"
```

### Repeated mentions and multiword relations

Keep one entity wire per overt occurrence. In "I will call. I will wait.", quote the two written occurrences of "I" on two separate entity wires. Link each subject slot to its own mention. A shared reference is appropriate only when the source supplies one mention for both roles, as with "you" in the nonfinite example above. Check repeated dates, names, punctuation and short words by occurrence count.

Treat a meaningful multiword relation as one semantic direction. In "Put the chair just left of the desk", use a relation with `kind=left_of cue="left of" adverb="just"`, directed from the placed chair to the desk. A generic `kind=of` would lose the placement. Apply the same distinction to `right_of`, `in_front_of`, `next_to` and similar phrases. Attach location and time to the event or entity it actually qualifies. Before retaining a draft, check its role and direction against the words, even when the draft already contains every token.

Punctuation present in a literal belongs to that literal. In `Replace Caption with "Good morning.".`, the period inside the quotation belongs to the replacement text and the period after the closing quotation ends the sentence. In `I need you to open it.`, only the clause nearest the written sentence ending should carry the terminator. The outer control clause has no separate period to quote. For punctuation between coordinated clauses, use a cue or separator on one wire.
