# Rules for judging a syntactic reading (re-read before every second chunk)

A reading formalizes the SYNTAX of one message in the small `syntax` schema:

| Wire | What it is | Keys |
| --- | --- | --- |
| `syntax.fact` | a command, a statement, a question, a mention (things named, no action) or a dependent fact (a verb form that describes, such as "facing left") | `kind`, `action`, `helper`, `doer`, `thing`, `how`, `asks`, `word` |
| `syntax.thing` | the words that characterise one thing | `head`, `describing` |
| `syntax.link` | a tie between two wires; `cue` holds the linking words | `kind`, `from`, `to`, `cue` |
| `syntax.list` | wires put side by side | `member`, `cue` |

Wires refer to each other with `$id`. The reading comes from a reader that sees one message and nothing else: no context, no knowledge of the world, no common sense. A later layer reads these wires with context and decides what they mean. Judge by one question:

**Can the next layer continue from this reading by completing it, or must it first undo a wrong statement?**

## What a reading must get right

1. **Facts.** The message is split into the right facts. Each fact has the right kind and, unless it is a mention, the right action word.
2. **Words.** Every word stands in the right wire and in the right place: `action`, `helper`, `how`, `asks` or `word` in a fact; `head` or `describing` in a thing; `cue` in a link or a list.
3. **Ties.** Wires are tied to the right wires: the doer and the things of a fact, the two ends of a link, the members of a list.

## What it need not get right

Do not reject for any of these. They are left to the next layer on purpose.

- What a thing is to the action. Every thing a fact involves is a `thing`: what is acted on, who receives, what something becomes, a measure, a value. Only the `doer` is told apart, and only when the words show it.
- What a `how` word says: manner, result, degree or direction.
- Which word of a thing is the `head`, as long as the words of one thing are together in one wire.
- A word that says how a thing is, held as `describing` in the thing next to it or as `how` on the fact.
- Where a cue link starts, when it starts at the fact or at any thing of that fact that grammar allows. Which earlier thing a list joins, when grammar allows it. Two things separated by a comma held as a list.
- The kind of a link without a cue (`completes`, `describes`, `open`).
- Where small words and punctuation stand (`word`, the `cue` of a list), and whether a particle is a `helper` or a `how`.
- A misspelt or unknown word held where it stands, when the words do not settle what it is.
- Whether the request makes sense, and anything only context or knowledge of the world would settle.

## Not acceptable

Use the first grade that applies. **The note must quote the words and name the wrong statement, or the explicit information that was lost.** If you cannot quote one, the reading is acceptable (L8).

| Grade | When |
| --- | --- |
| L1 | A fact is wrong. A word that the words show is not an action is made an `action`. A clear action is made a thing, a `how` or a `describing` word, or a `cue`. A clear question is made a command or a statement, or the reverse. The words of two facts are mixed into one, or one fact is cut in two. |
| L2 | A material word stands in no wire. |
| L3 | Words stand in the wrong wire or a tie is wrong. The words of one thing are split between wires, or two things are merged into one, so that a pairing the words give is lost. The doer and a thing are swapped. A link or a list ties a wire to one the words rule out, such as a thing of another fact. |
| L4 | The reading states something the message does not say. |
| L5 | A clear fact is dropped. |
| L6 | A wire is tied to nothing inside its sentence, or a pairing the words give is left untied ("x 120" with 120 tied to nothing). Separate sentences need no tie. |

## Settled cases

- "That would help" or "I appreciate it" is a fact with its action.
- A form of "be" that is the only verb of its fact is the `action`.
- "Could you …" with a verb is one question: the helping verb is a `helper`, "you" the doer.
- A verbless message or segment ("pie radius smaller", "legend on the right") is a mention. A noun made its action is L1.
- "of" after a thing says what that thing is of: the link starts at that thing or at its fact, never at another thing.
- A measure with its direction in one thing ("520 across") is acceptable. Numbers in one wire and their directions in another is L3.
- A participle or subordinate fact tied to nothing is L6. A tie of any kind to its fact or to the thing it describes is enough.
- An elliptical tag ("would you", "if you can") may be its own fact with the helping verb as `action`.
