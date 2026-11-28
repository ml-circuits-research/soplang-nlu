# Rules for judging a syntax circuit

Read these rules before every packet, and again in the middle of a long one.

Each line of a packet holds one message (`text`) and one circuit written for it (`sop`) in the `syntax` schema, version 3. The circuit comes from a formalizer that saw the message and nothing else: no context, no knowledge of the world. A next layer reads the circuit later, with context, and decides what the message means.

Judge each line by one question:

**Can the next layer continue from this circuit by completing it, or must it first undo a wrong statement?**

If it can continue, the circuit is acceptable: grade L8. If it must undo a statement, or if something the words give is lost, reject it. A rejection must quote the words and name the wrong statement or the lost information. **If you cannot quote the words, the circuit is acceptable.**

Judge each line by itself. The same message can stand in several lines with different circuits, and several of them can be acceptable. Do not compare a circuit with the one you would have written.

## The schema

| Wire | What it is | Keys |
| --- | --- | --- |
| `syntax.clause` | one verb with what belongs to it, or a group of words with no verb | `form`, `verb`, `auxiliary`, `negation`, `subject`, `complement`, `modifier`, `discourse`, `ellipsis` |
| `syntax.nominal` | the words that describe one thing | `head`, `dependent` |
| `syntax.relation` | a tie between two wires | `from`, `to`, `marker`, `negation`, `attachment` |
| `syntax.coordination` | wires put side by side | `conjunct`, `conjunction` |

`form` is `imperative`, `declarative`, `interrogative`, `fragment` (the clause has no verb) or `nonfinite` (a verb form that cannot make a sentence by itself: "facing left", "delete it" after "to"). `complement` holds the nominals the verb takes, whatever they are to it. `modifier` holds words that are neither nominals nor markers: "red", "slightly", "up". `discourse` holds words said to the listener: "please", "hey", "thanks". `marker` is the linking word: a preposition, "'s", "if", the "to" of an infinitive. `attachment=ambiguous` says that the relation belongs to the clause it starts at and that the formalizer did not settle whether it attaches to the verb or to a nominal of that clause. `ellipsis` on a fragment names the clause whose verb it shares.

A program has already checked that every word of the message stands in exactly one value. Punctuation stands in no wire.

## What must be right

1. The split into clauses, and the `form` of each clause.
2. The `verb` of each clause, or that it has none. Its `auxiliary` and `negation` words.
3. Whether a fragment shares the verb of another clause (`ellipsis`).
4. Which words form each nominal, and which word is its `head`.
5. The `subject`, when the words show one. Which nominals are complements of which clause.
6. The end of every relation, its `marker`, and its start when the words settle it.
7. The conjuncts of every coordination.

## Where several readings pass

- The start of a relation with a marker: the clause, or any nominal of that clause that grammar allows, with or without `attachment=ambiguous`.
- Which earlier wire a coordination joins, when grammar allows several: "profit by ship mode and customer segment".
- A word that grammar allows as a noun or as a verb: "make y axis scale linear".
- A misspelt or unknown word, held where it stands, when the words do not settle what it is.

## What is not judged

- What a complement is to the verb (who receives, what is given), and what a modifier says (manner, result, degree, direction).
- Which clause holds a `discourse` word. The order and the names of the wires.
- Whether a question is meant as a request. What a pronoun refers to.
- Whether the request makes sense, and anything only context or knowledge of the world would settle.

## Grades

Give L8, or the first of L1 to L6 that applies.

| Grade | When |
| --- | --- |
| L8 | Acceptable. |
| L1 | A clause that the circuit writes is wrong. Its `form` is wrong: a clear question written as `imperative` or `declarative`, or the reverse; a clause with a verb written as `fragment`. Its `verb` is a word that is no verb here, or an auxiliary while the main verb stands elsewhere. An `auxiliary` or `negation` word is held in another place, or negates the wrong clause. Words of one written clause are held in another. A fragment that clearly shares a verb ("make A blue and B green") has no `ellipsis`, or names the wrong clause. |
| L2 | A word with content is held in `discourse`, so its place in the sentence is lost. |
| L3 | Words stand in the wrong wire, or a tie is wrong. The words of one nominal are split between wires, or two nominals are merged. The `head` is wrong. The `subject` is wrong, or subject and complement are swapped. A nominal is the complement of the wrong clause. A relation has the wrong end, a `marker` that is no linking word, or a start the words rule out, such as a nominal of another clause. A linking word is held as a modifier or a dependent. A coordination has a wrong conjunct. |
| L4 | The circuit states what the message does not say: `ellipsis` on a fragment that shares no verb ("move the box, and thanks"); a `subject` the words do not show; a relation or a coordination between wires that the message does not relate. |
| L5 | A clause of the message is not written: its verb is held as a modifier, a dependent, a head or a discourse word, and no clause has it as `verb`. |
| L6 | Something is left untied. A clause or a nominal is tied to nothing inside its sentence. A pairing the words give is not written: "x 120" with "120" in another wire and tied to nothing, a measure not tied to the relation it measures. Punctuation does not decide where the tree of a message ends: a semicolon, a dash, a colon or a comma never makes a separate sentence by itself. Parts that the local meaning relates (the next step, a reason, a result, a condition, a comment on what was asked) must be tied by a coordination or a relation, whatever mark stands between them; left untied, L6. Only parts that say unrelated things may stand apart; a full stop, a question mark or an exclamation mark usually shows that, but the meaning of the words around decides, not the mark. |

## Settled cases

- "Could you move it?" is one `interrogative` clause: "Could" is an `auxiliary`, "you" the `subject`.
- A form of "be" that is the only verb of its clause is the `verb`.
- "That would help" and "I appreciate it" are clauses with their verb, not discourse words. "Thanks" or "Hey" alone is a fragment with the word in `discourse`.
- A message or a part with no verb ("pie radius smaller", "legend on the right", "a fireplace") is a `fragment`. Its nominals that are not the end of a relation are its `complement`. A noun made its `verb` is L1.
- An elliptical tag ("would you", "if you can") may be a clause of its own with the auxiliary as `verb`.
- A word after the verb that is neither a nominal nor a marker is a `modifier`: "tidy up", "move it left".
- "make the box red": "red" is a `modifier` of the clause, since "the box" is a complement. "with outline gold": "gold" is a `dependent` of "outline", since "outline" ends a relation with a marker.
- The "to" of an infinitive is the `marker` of the relation that ends at the nonfinite clause. When nothing stands before it ("to fix the details, edit the members"), the relation starts at the main clause.
- "two inches from the edge": the measure is a nominal, and the relation marked "from" starts at it.
- "of" after a nominal: the relation starts at that nominal or at its clause, never at another nominal.
- A question word stands where grammar puts it: a `dependent` in "what colour", the `head` of a nominal in "what is this?", a `modifier` in "where is it?".
- A name of several words ("Team lunch", "Sales 3") may stand whole in `head`, or with its last word as `head` and the others as `dependent`.
- A participle or a subordinate clause tied to nothing is L6. Any relation to its clause or to the nominal it describes is enough.
- A number or a name right after a noun ("block 2", "x 120", "the node Intro") may be a `dependent` in that noun's nominal, or a nominal of its own tied to the noun by a relation without a marker. Both pass. Left tied to nothing, it is L6.
- A word that grades a linking word ("right behind", "just above") may be a `modifier` of the clause the relation belongs to.
- "And", "Then" or "So" at the start of a message, with nothing before it to join, is a `discourse` word. So is a conjunction between two `modifier` words of one clause ("flat and dry"): the schema has no wire for that pair.
- A quantity phrase before a noun ("a pair of trees", "a couple of boxes", "all of the cushions", "every one of the clouds") may be held as `dependent` words of that noun.
- Two bare nouns side by side after a marker ("with id neck", "type radar"): either may be the `head`.
- A fixed phrase of time or manner ("from now on", "after that", "for now", "side by side", "at once") may be held whole as a `modifier`.
- A participle that names or describes ("a group called g2", "a bird facing left") is the `verb` of a nonfinite clause tied to the thing. Written as the `marker` of a relation between the thing and its name, it also passes.
- A command needs its verb. When the first word of a message with no other verb can be a noun or a verb ("book design review", "schedule the kickoff"), it is the `verb`; held as a noun in a fragment, the command is lost: L1.
- Words that grade a graded word ("a bit longer", "way shorter", "a little smaller") are `modifier` words of the clause, as one run or word by word; "a bit" or "a little" may also stand as a nominal of its own (a measure). A nominal whose `head` is the graded word ("a bit longer" with head "longer") or the lone grading word ("way") fails: L3.
- Words said to the listener that are mentioned as content ("a paragraph saying Thank you", "add the paragraph Please review") are that content: a nominal, or a clause tied to the word of saying. Held as `discourse`, the content is lost: L2.
- A day, an hour or a length of time set off by commas after a phrase with a marker ("book the sync at 16:00, Friday, for 60 minutes") belongs to the clause: a relation from the clause with no marker passes, and so does a coordination with the time before it. A coordination with what the verb acts on states a second thing acted on: L3.
- "left of the hill", "right of the road": "left of" may be one `marker`, or "left" a nominal or a clause `modifier` with the relation marked "of" starting at the clause or at "left". A relation marked "of" that starts at the thing placed ("a gazelle of the hill") fails: L3.
- A clause that opens with a question word after a verb of telling or asking ("tell me which events are scheduled") must be tied to that verb's clause; any relation is enough. Untied it is L6.
- "let's add a box", "let us put it there": "let" is the `verb`; "'s" or "us" is a nominal that is its `complement`, and may be the `subject` of the nonfinite clause of "add", tied to the clause of "let". Holding "let's" or "let us" as `discourse` words of an imperative clause of "add" also passes. "'s" or "us" as the `subject` of "let", or "add" written as a declarative clause, fails: L1.
- "everything else", "something else", "anyone else": one nominal, with "else" a `dependent` of the pronoun. "else" held as a `modifier` of a clause splits the nominal: L3.
- A clause that opens with a question word inside another clause ("tell me where it is", "show what I said", "how the picture goes" after a verb) states: its form is `declarative`, and it is tied to the clause it belongs to. Written as `interrogative` it is L1. A clause that asks, at the start of a sentence ("where is it?"), is `interrogative`.
- "the Gate box should go right under Path, and align their tops", "the Q3 title should be Arial and keep everything inside the page margins": a verb after "and" or "then" that follows a clause with a `subject` and an `auxiliary`, in the form that auxiliary takes, may share them: a clause with no subject of its own, `declarative` or `nonfinite`. Written as a command, `imperative`, it passes too. Grammar allows both readings; which one is meant is for the next layer.
- A word of place after a nominal ("near the lake there", "the one above") may be a `dependent` of that nominal or a `modifier` of the clause: grammar lets it describe either. A word of time or order cannot describe a noun from where it stands ("orders by week first", "beside the sun next", "the shed walls too", "now a second wooden boat"): it is a `modifier` of the clause; held as a `dependent`, it fails: L3.
- A word after a nominal that is a `complement` of its clause and says how the thing should be is a `modifier` of the clause, also in a part with no verb: "font bigger", "bar gap small", "line thinner", "pie radius smaller". So is the word after a measure: "move block 6 two spaces left", "the dog a size bigger", with "two spaces" and "a size" nominals of their own. Held as a `dependent` of the nominal, the word becomes part of the description by which the thing is found: L3.
- A word that grades a linking word says nothing about the thing before it. It may be a `modifier` of the clause the relation belongs to (the clause that holds the start of the relation, not a participle clause that only stands near it), or stand in the `marker` with the linking word ("right on"). Held as a `dependent` of a nominal ("a small girl with a smiling face right on the swing" with "right" in the nominal of "face" or of "girl"), it fails: L3.
- "And", "Then" or "So" at the start of a later sentence ("sweep the two yellow blocks from the board. And after that, build two red blocks") may be a `discourse` word, as at the start of a message, or the `conjunction` of a coordination of the clauses of the two sentences. "Now" at the start of a message or a sentence ("now lean the lamp to the left") may be a `discourse` word or a `modifier` of its clause. Each way passes.
- "Have the legend switched on.": a message that opens with "have", a nominal and a participle, with no question mark, is a command. "Have" is the `verb` of an `imperative` clause, "the legend" its `complement`, and the participle the `verb` of a `nonfinite` clause tied to that clause or to "the legend". Written as an `interrogative` clause with "Have" as `auxiliary`, it fails: L1.
- A clause with a marker that stands between two clauses, after a dash, a semicolon or a full stop and before a comma, opens the clause after the comma: in "flip the slice labels over to a medium distance — while you're at it, give it the title Where the money goes" the relation marked "while" starts at the clause of "give" or at a nominal of it. Started at the clause before the dash, it fails: L3.
- A clause that ends a relation with a marker ("so it sits under the table", "if you build two purple blocks") stands inside the clause where the relation starts. A command or a question cannot stand inside another clause, so a coordination that joins an `imperative` or `interrogative` clause with such a clause has a wrong conjunct: L3. In "move the star so it sits under the table, then give it a thin outline", "then" joins "give" with "move". Two clauses inside one relation may be joined ("so each layer can be told apart and every colour is explained").
- The earlier wire a coordination joins is the wire that ends right before the conjunction, or a wire that holds it. A coordination with a clause between two of its conjuncts that belongs to none of them fails: L3. In "I walked the team through Sales …; … so as a first pass make the matrix colour scale transparent green to blue, then we revisit next week, and give it the title …", "and" cannot join "give" with "I walked" across "make".
- The quantity phrase of the case "a pair of trees" may be any word of quantity, a number among them, before "of" and a nominal: "any of my meetings", "each of the flowers", "one of the birds", "all of them". Held as `dependent` words of the nominal after "of", or as a nominal of its own with the relation marked "of" starting at it, both pass.

## What you write

For `packet-<k>.jsonl` write `verdicts-<k>.jsonl` in the same folder, one line for every line of the packet:

```json
{"n": 12, "grade": "L8", "note": ""}
{"n": 13, "grade": "L3", "note": "'red' is held as a dependent of 'circle', but the words say 'the red box'"}
```

`n` is the number of the packet line. `grade` is L8, or one of L1 to L6. `note` is one sentence; for a rejection it quotes the words of the message in single quotes and names the wrong statement or the lost information. Then run `node check.mjs <k>` in that folder: it checks the format and says how many lines are judged.
