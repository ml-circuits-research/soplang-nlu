# Rules for judging a circuit (re-read before every second chunk)

A circuit formalizes the SYNTAX of one message in the `nlu` schema. `nlu.clause` is an action, question, statement or fragment. `nlu.entity` is a described thing: a lookup, never resolved. `nlu.relation` links two wires, usually with a cue word (where, with what, of what). `nlu.coordination` joins things or clauses. Wires refer to each other with `$id`.

The circuit comes from a reader that sees one message and nothing else: no context, no knowledge of the world, no common sense. A later reasoning layer will read the circuit with context. Judge the circuit by one question:

**Can the next layer continue from this circuit by completing it, or must it first undo a wrong statement?**

## What a circuit may leave open

A reader that cannot settle something from the words alone may say so. These marks are legitimate:

| Mark | Meaning |
| --- | --- |
| `form=fragment` with `topic=$e` | Things are named and no word is shown to be the action ("a fireplace"). |
| `participant=$e` on a clause | The thing takes part in the clause. Its role is not settled. |
| `attachment=open` on a relation | The phrase belongs to this clause. It may place the action or describe one of the clause's things. |
| `kind=open` on a relation with no cue | Two wires stand together and no word says how ("x 120"). |
| `unresolved="…"` on a clause or entity | The word belongs here and could not be placed (a misspelling, a stray word). |

## Acceptable (L8)

A circuit is acceptable when all of these hold:

1. Every word of the message stands in a wire, in the right unit: the words of one described thing are in one entity, and the words of the verb group are on its clause.
2. Whatever the circuit states is supported by the words: the action, who or what holds each role, where each relation starts and ends, what is joined with what.
3. Whatever it leaves open is marked as above, and the words alone really leave it open.
4. Every wire is tied to the rest of its sentence. Separate sentences need no tie.

A partial but faithful circuit is acceptable. Two readings of one message can both be acceptable.

## Not acceptable

Use the first grade that applies. **The note must quote the words and name the wrong statement, or name the explicit information that was lost.** If you cannot quote one, the circuit is acceptable.

| Grade | When |
| --- | --- |
| L1 | A wrong action or clause is stated. A word that the words show is not the action is made a predicate. A clear action is made a thing or a description. A clear question, command or statement gets another form. Words of two statements are mixed into one clause. |
| L2 | Material words are missing from every wire, or stand in `unresolved` although their place is clear. |
| L3 | A wrong role, endpoint or grouping is stated. Who does and what is done to are swapped. A relation starts or ends at a wire it clearly does not belong to. The words of one thing are split between wires, or two things are merged, so that an explicit pairing is lost. Example: "520 across and 410 down" as one group of numbers and one of directions. |
| L4 | The circuit states something the message does not say. |
| L5 | A clear clause or action is dropped. |
| L6 | Explicit information is lost by leaving it open or untied: a clear action, a clear object or a clear pairing is marked open, or a wire hangs on nothing. Example: a raw fragment holding "move the box near the door", where the action, its object and the place phrase were all identifiable. |

Tolerance covers the uncertain part only. Everything the words make clear must be stated.

## Do not reject for

- A choice a careful reader could make either way from the words alone: an attachment that can go to the action or to a thing, taken either way or marked open; a second thing after a verb held as `participant` when its role is not plain.
- What only context or knowledge of the world would settle. Do not ask the reader for common sense.
- Representation: `modifier` or `compound` for a word before the head; a possessive word as `determiner` or as `possessor`; a participle as a nonfinite clause or as the cue of a relation; a name as `name` or as `head`; a compound cue ("to the left of") as one cue or as a thing with its own relation; `polarity=positive` present or absent; different `kind` atoms for the same cue; punctuation as `separator`, `terminator` or coordination `cue`.
- Absent optional atoms: `act`, `kind` and `color` on entities, `speech_act`.
- Whether the request makes sense.

## Settled cases (apply them the same way to every row)

- An independent clause such as "That would help" or "I appreciate it" is a clause with its predicate. As a fixed expression it is L1.
- A form of "be" that is the only verb of its clause is the predicate. As an auxiliary with no predicate it is L1.
- "Could you …" or "can you …" with a verb is one interrogative clause with the helping verb as `auxiliary`.
- A participle or subordinate clause tied to nothing is L6. A tie with `kind=open`, or a shared subject, is enough.
- Fixed adverbial phrases ("while you're there", "when you get a chance") may be a clause with a marker or an adverbial.
- A fragment that carries `direct_object`, `result_complement` or relations and is coordinated with a full clause shares that clause's verb ("make A blue and B green").
- A measure with its direction on the same entity (`literal="520" adverb="across"`) is acceptable.
- "of" after a thing says what that thing is of. A relation with cue "of" that starts at the clause instead is L3, unless it is marked `attachment=open`.
- A verbless message or segment ("pie radius smaller", "legend on the right") is a fragment. A noun made its imperative predicate is L1.
- A phrase tied to the thing right before it passes when grammar allows it, even where knowledge of the world would choose another host ("for 45 seconds with mode temporary"). It fails only when the words themselves rule that host out.
- A conjunction may join the thing after it with any earlier thing of the same clause that grammar allows ("profit by ship mode and customer segment": with "ship mode" or with "profit"). It fails when it joins a thing with a word that is not a thing, or reaches into another clause.
- Two things separated only by a comma may be held as a coordination. Whether the second renames or describes the first is for the next layer.
- A word that says how a thing is, kept inside that thing's entity as a `modifier`, passes ("pie radius smaller" as one entity). The grouping is kept.
- Inside one entity, which word is the `head` and which are `compound` or `modifier` is representation. It fails only when a word of another thing or of the action is pulled into the entity.
- `attachment=open` passes on any place, time or description phrase whose host could be the action or a thing of the same clause, also inside a list.
- "make sure X …" may hold X as `direct_object` and as the subject of the clause that follows.

## Writing a circuit yourself

Write one only when no circuit of the row is acceptable. Quoted values are exact substrings of the message. Every word and punctuation mark is claimed by exactly one quoted slot. Do not resolve pronouns. Add no optional atoms. Put one wire per line. Make the smallest change from the best candidate, and state everything the words make clear: write the full reading a careful reader would give, without open marks unless the words leave it open.
