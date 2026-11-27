[Home](../README.md) › [Syntax schema](README.md) › Decisions 1–5

# Decisions 1–5: the first review

This page: the schema's design decisions 1 to 5, each with the problem the first review raised, the decision and its reason, and the points of that review adopted without change. Kind: Explanation.

How to read: one heading per decision. Each has a small two-column table: the problem the review raised, the decision, and the alternative considered and not adopted (for decision 1, an extension; for decision 5, one table per distinction). The text is the specification's.

## Where version 1 stood

Version 1 called a clause a `fact` and a nominal a `thing`. Its keys were `kind` (with the values command, statement, question, mention, dependent), `action`, `helper`, `doer`, `thing`, `how`, `asks` and `word` on a fact; `head` and `describing` on a thing; `kind`, `from`, `to` and `cue` on a link; `member` and `cue` on a list. It had no rule for alignment or for ambiguous attachment. A review of version 1 raised five points. Decisions 1 to 5 answer them. [Decision 6](decisions-names.md) is the later choice of names.

## Decision 1: names that ask for a meaning

| Part | Text |
| --- | --- |
| Problem | The review said that `doer` asks for an interpretation: in "the box was moved by Ana" the subject is the box. It also said that the forms should be named imperative, declarative and interrogative, because "Could you move it?" is interrogative in form even when it is used as a request. |
| Decision | Adopted. `doer` became `subject`. `kind` became `form`, with the values `imperative`, `declarative`, `interrogative`, `fragment` and `nonfinite`. |
| Extension | Not asked for by the review: `action` became `verb`. The same test applies. In "the title is too long" the word "is" names no action. |

## Decision 2: "every word exactly once" was undefined

| Part | Text |
| --- | --- |
| Problem | The review asked what the phrase means when a group repeats ("put the box on the box") and when one value covers two words ("next to"). It suggested solving this in the alignment convention, without a new wire type. |
| Decision | Adopted as suggested. [Rule 1](rules.md#rule-1-alignment-every-word-exactly-once) defines it. |
| Not adopted | Considered: a key that gives the position of each value in the message. It would make circuits exact in every case. It was rejected because every wire would carry numbers that a person cannot check by eye. The simple rule fails only for crossing claims, which are expected to be rare. This expectation has not been checked on the sample. |

Later, crossing claims were measured: see the known limit of [Rule 1](rules.md#rule-1-alignment-every-word-exactly-once).

## Decision 3: an unsettled attachment could not be told from a settled one

| Part | Text |
| --- | --- |
| Problem | The review said that when a relation starts at the verb, the next layer cannot know whether the formalizer chose that or left it open. It asked for an explicit decision between one reading with an open attachment and two distinct readings. |
| Decision | One circuit, with `attachment=ambiguous` on the relation (Rule 2). |
| Not adopted | Returning two circuits. A message with three ambiguous phrases has eight combinations of attachments. One circuit with three marks states them all. A list of alternative circuits either omits combinations or grows with every ambiguous phrase. Two lists of circuits are also harder to compare than two circuits. |

See [Rule 2](rules.md#rule-2-ambiguous-attachment).

## Decision 4: groupings that must stay visible

The review named two cases and asked that they be written with the existing types first.

### The measure in "two inches from the edge"

| Part | Text |
| --- | --- |
| Problem | The review noted that the measure qualifies the relation "from", and that a relation cannot start at another relation. |
| Decision | No relation from a relation. The measure is a nominal and the relation "from" starts at it (Rule 4). The pairing of "two inches" with "from the edge" is kept, and the four types stay as they are. |
| Not adopted | Letting `from` and `to` name another relation. It would keep the measure as a qualifier of the relation, which is closer to the grammar. It was rejected because relations would then form a second level of structure, and every formalizer and every comparison would have to handle relations whose ends are relations. The simpler form loses nothing the words give. |

### The shared verb in "make A blue and B green"

| Part | Text |
| --- | --- |
| Problem | The review noted that a separate wire for "B green" keeps the pair and loses the common verb. |
| Decision | The second conjunct is a fragment, the coordination holds both, and Rule 3 says that such a fragment shares the verb. The sharing is read from the structure. |
| Not adopted | Writing "make" as a clause of its own, completed by a coordination of two verbless clauses, "A blue" and "B green". It states the sharing as a wire. It was rejected because the first conjunct would then have another shape than in "make A blue" alone. A formalizer would have to rebuild what it already wrote when it meets "and", and two formalizers could differ on the simple case. |

The second review later replaced "the sharing is read from the structure" by the key `ellipsis` ([decision 8](decisions-names.md#decision-8-the-second-review)).

## Decision 5: the document asked for more than the evaluation checked

The review noted that the document defined a head while the evaluation accepted any choice of head, and defined three kinds of relation without a marker while the evaluation accepted any of them. It asked for a decision on each such distinction, and saw a chance to simplify wherever any variant was good.

### The kind of a relation

| Part | Text |
| --- | --- |
| Decision | Dropped |
| Reason | Any kind was accepted. Whether a relation has a marker is visible from the `marker` key, and the types of the two ends tell the remaining cases apart. |

### The head of a nominal

| Part | Text |
| --- | --- |
| Decision | Kept and now required |
| Reason | In English the head of a nominal is visible in the words: it is usually the last noun. The next layer needs it to look the nominal up. Without it that layer would have to analyse the group again. The cost is stated under "[Weak points](related-work.md#weak-points-still-open)". |

### A verb particle as part of the verb group or as a modifier

| Part | Text |
| --- | --- |
| Decision | Fixed by Rule 5 |
| Reason | Either was accepted, so formalizers could differ for no reason. |

### A word after a nominal as a modifier of the clause or as a dependent of the nominal

| Part | Text |
| --- | --- |
| Decision | Fixed by Rule 5 |
| Reason | The same. |

### Which clause holds a discourse word

| Part | Text |
| --- | --- |
| Decision | Declared as not compared |
| Reason | It carries no structure. |

### Which clause holds a punctuation mark

| Part | Text |
| --- | --- |
| Decision | Dropped: no wire holds punctuation |
| Reason | See [decision 7](decisions-names.md#decision-7-punctuation-is-not-covered). |

The review's suggestion to simplify was followed for the kind of a relation. It was not followed for the head, for the reason given.

## Points of the first review adopted without change

- Formalizers write `syntax` circuits directly from the text, without knowledge worlds and without passing through the `nlu` schema.
- Semantic roles such as beneficiary, destination or result are not reintroduced.
- Examples fix the limit between visible syntax and what is decided later. See "[Boundary examples](correctness.md#boundary-examples)".

Why the project left the `nlu` schema at all is the owner's decision D3: see [Decisions of the owner](../project/decisions.md#d3).

---

Next: [Decisions 6–8: names, punctuation, second review](decisions-names.md) · Up: [The syntax schema](README.md)
