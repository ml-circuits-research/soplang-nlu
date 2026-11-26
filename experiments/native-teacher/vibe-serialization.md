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

Preserve closing and opening delimiters in the literal itself. For the exact text `Replace Caption with "Good morning.".`, write the following.

```sop
@c nlu.clause form=imperative predicate="Replace" direct_object=$target terminator="."
@target nlu.entity name="Caption"
@new nlu.entity literal="\"Good morning.\""
@r nlu.relation kind=with from=$c to=$new cue="with"
```

The escaped quotation marks in the SOP literal are part of the source evidence. When the SOP is inside the result JSON string, escape again as JSON requires. For words that describe a result, retain the exact written adjective in `result_complement`. A bare semantic atom such as `result_color=teal` does not cover the source word `teal`.

For quantified lookups, attach restrictions to the entity. In "Italicise every diamond in sight", `every` quantifies `diamond` and the phrase `in sight` restricts which diamonds to select. Keep the phrase on the entity lookup, not as an adverb of italicising. A location stated as an instruction's destination can instead attach to the action. Keep the difference between selection and requested change.

For "Let us book Lab", preserve `Let` as the imperative predicate and `book` as the nonfinite predicate with its own object. The reference to the single written `us` can supply the embedded subject. Treat an unquoted multiword title in a title slot as one written name when it names a single item. An ordinary modifier and noun in a lookup remain separate.

An entity needs one grounded anchor of its own. Use `head` for a noun, `name` for a name, `pronoun` for a standalone pronoun, and `literal` for a standalone number or ordinal. `quantity` alone is not an anchor. In "Draw three circles", quote "three" in the circle entity's quantity. In "Choose two and four", use `literal="two"` and `literal="four"` on two entities. A demonstrative used alone, as in "Move those", is a pronoun. When it introduces a noun it is a determiner.

"4 wide and 3 tall" can use a fragment pointing to a coordination of two numeric entities.

```sop
@c nlu.clause form=fragment topic=$group
@w nlu.entity literal="4" modifier="wide"
@h nlu.entity literal="3" modifier="tall"
@group nlu.coordination kind=additive member=$w member=$h cue="and"
```

All members of a coordination must have the same wire type. A clause's direct object, indirect object, subject, topic and predicative entity point to entities or entity coordinations. A coordinated clause complement uses clausal_complement. Quote a single occurrence of "then" as either the sequence cue or the clause connective. Quote a single occurrence of "not" once, even when it both contrasts and negates a qualifier. Include nonfinite markers and every determiner written in the source.

"Open Notes, then save it" has two clauses and one written sequence cue.

```sop
@open nlu.clause form=imperative predicate="Open" direct_object=$notes separator=","
@notes nlu.entity name="Notes"
@save nlu.clause form=imperative predicate="save" direct_object=$it
@it nlu.entity pronoun="it"
@steps nlu.coordination kind=sequence member=$open member=$save cue="then"
```

The two clauses do not repeat `then` as their connective. Use the same rule for `and`, `or` and `but` when coordination represents them. Do not add an implied auxiliary, repeated noun, pronoun or predicate as a source quote. For ellipsis, connect the explicit portion as a fragment or reuse an existing grounded reference only when that one mention supplies the shared role.

An identifier after a singular object noun selects one item rather than counting items. In "box two", retain `head="box" compound="two"` or use a name if the complete written expression is a name. A number before a plural noun can instead be its `quantity`. When several identified items receive different properties, keep one linked value for each item.

For naming and labelling, ground both the thing being named and the exact label with a relation or a predicative entity. A word such as "next", "open" or "retry" can be the written label when it follows "label" or "labelled". Preserve it as a name in that role. With "Draft to Review, label retry", the initial endpoints narrowly identify the existing connection. Preserve that qualification and point the label action to the connection, even though the noun "arrow" is absent. A fragment that supplies a target must connect to the action using that target.
