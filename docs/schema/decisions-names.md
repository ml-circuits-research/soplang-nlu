[Home](../README.md) › [Syntax schema](README.md) › Decisions 6–8

# Decisions 6–8: names, punctuation, second review

This page: the schema's design decisions 6 to 8 with their reasons and sources, and the reviewer suggestions that were not adopted. Kind: Explanation.

Decisions 1 to 5 are on [Decisions 1–5: the first review](decisions-review-1.md).

## Decision 6: established names

| Part | Text |
| --- | --- |
| Problem | Version 1 used names of its own, such as `fact`, `thing`, `doer` and `how` ([Where version 1 stood](decisions-review-1.md#where-version-1-stood)). Between version 2 and this one, an intermediate draft used everyday words: `main` for the head, `via` for the marker, `other` for the remaining words, `start=open` for the ambiguity. |
| Decision | Principle: where grammar or dependency syntax has an established term, the schema uses it. No name is a metaphor or a coinage. |
| Reason | The owner of the project asked for established terms instead, since such terms exist and everyday words read as metaphors. |

### The names, one by one

Each line: the name in version 1 → the name now. The established term and where it comes from. Short names in code font such as `nsubj` or `cc` are relation labels of Universal Dependencies (UD); they are spelled out in [UD labels used here](related-work.md#ud-labels-used-here).

- `syntax.fact` → `syntax.clause`. Clause: a verb with what belongs to it. Every descriptive grammar. ([Clause](https://en.wikipedia.org/wiki/Clause))
- `syntax.thing` → `syntax.nominal`. Nominal: UD's term for noun phrases and for the pronouns, proper names and numerals that stand in their place. ([Universal Dependencies](https://en.wikipedia.org/wiki/Universal_Dependencies))
- `syntax.link` → `syntax.relation`. Dependency relation: the tie between two units in dependency grammar (Tesnière 1959; Mel'čuk 1988). ([Dependency grammar](https://en.wikipedia.org/wiki/Dependency_grammar), [Lucien Tesnière](https://en.wikipedia.org/wiki/Lucien_Tesni%C3%A8re), [Igor Mel'čuk](https://en.wikipedia.org/wiki/Igor_Mel%27%C4%8Duk))
- `syntax.list` → `syntax.coordination`. Coordination, with its conjuncts and its conjunction. UD `conj` and `cc`. ([Coordination](https://en.wikipedia.org/wiki/Coordination_(linguistics)))
- `kind` → `form`. Clause types of grammar (imperative, declarative, interrogative), finite against nonfinite verb forms, and "fragment" as in the `FRAG` label of the Penn Treebank (Marcus et al. 1993). ([Nonfinite verb](https://en.wikipedia.org/wiki/Nonfinite_verb), [Treebank](https://en.wikipedia.org/wiki/Treebank))
- `action` → `verb`. Traditional grammar.
- `helper` → `auxiliary`, `negation`. Auxiliary verb: UD `aux`. Negation is a category of its own in every grammar. ([Auxiliary verb](https://en.wikipedia.org/wiki/Auxiliary_verb))
- `doer` → `subject`. Traditional grammar. UD `nsubj`. ([Subject](https://en.wikipedia.org/wiki/Subject_(grammar)))
- `thing` (the key) → `complement`. Complement of the verb: objects and predicative complements together (Huddleston and Pullum 2002). ([Complement](https://en.wikipedia.org/wiki/Complement_(linguistics)), [The Cambridge Grammar of the English Language](https://en.wikipedia.org/wiki/The_Cambridge_Grammar_of_the_English_Language))
- `how` → `modifier`. Modifier: the dependent that is not required by its head. UD `advmod`, `amod`. ([Grammatical modifier](https://en.wikipedia.org/wiki/Grammatical_modifier))
- `asks` → no key. See below.
- `word` → `discourse`. UD `discourse`. Punctuation is no longer held by any wire: see decision 7. ([Discourse marker](https://en.wikipedia.org/wiki/Discourse_marker))
- `head` → `head`. Head: the word the others depend on. Dependency grammar. ([Head](https://en.wikipedia.org/wiki/Head_(linguistics)))
- `describing` → `dependent`. Dependent: a word that depends on a head. Dependency grammar.
- `cue` → `marker`. Marker: the word that marks how a unit is related. UD `case` for prepositions and `mark` for subordinators.
- `member` → `conjunct`. Coordination.
- `cue` of a list → `conjunction`. Coordination. UD `cc`.
- no mark → `attachment=ambiguous`. Attachment ambiguity (Hindle and Rooth 1993). ([Syntactic ambiguity](https://en.wikipedia.org/wiki/Syntactic_ambiguity))

Not renamed: `from` and `to`. Dependency grammar says governor and dependent. `dependent` is already the key of a nominal, and `from` and `to` are exact and plain.

### Four changes beyond the names

Using the established terms changed four things beyond the names. Each follows from how grammar already analyses the case.

- **No key for the question word (`asks` is gone).** Grammar has no separate place for it. "what" in "what colour" is a dependent of "colour". A key of its own would split that nominal. The form `interrogative` marks the question, and the word stays where its grammar puts it.
- **`negation` is a key of its own.** "not" is no auxiliary verb. The next layer needs to see a negation at once.
- **The "to" of an infinitive is the marker of a relation.** UD treats it as a marker of the dependent clause, like "if" or "because". It is no auxiliary.
- **`discourse` holds the words said to the listener; commas do not stand in a coordination.** "please" is a discourse word and a comma is punctuation. Neither is a conjunction.

## Decision 7: punctuation is not covered

| Part | Text |
| --- | --- |
| Problem | Version 2 asked that every punctuation mark stand in a wire. |
| Decision | This version asks it of words only. |
| Reason | Which clause holds a comma was already declared as not compared, so the marks carried no structure. They did carry a cost. A clause would claim commas far apart in the message, with other wires claiming the commas between them, and under Rule 1 no order of the wires can align such crossing claims. Without the marks the case is rare. What punctuation shows about the build of a sentence is already stated: a question mark by `form=interrogative`, a comma between two clauses by their coordination or relation. |

## Decision 8: the second review

The second review approved the four types and asked for two cases to be fixed in the specification and in the tests, and for a way of starting the work.

### A shared verb, or an independent part

| Part | Text |
| --- | --- |
| Point | In "make A blue and B green" the verb applies to both pairs. In "move the box, and thanks" the second part is independent. Being in a list is not enough to tell that a verb is shared. |
| Decision | Adopted. The key `ellipsis` on a fragment names the clause whose verb it shares (Rule 3). |
| Reason | The earlier rule read the sharing from the coordination. It would have given "thanks" the verb "move". A statement in the circuit cannot be misread. |

### A list that groups relations

| Part | Text |
| --- | --- |
| Point | A list should be able to group relations. "near Ben but not behind Jo" must show that "but" joins the two phrases and that "not" belongs to the second only. |
| Decision | Adopted. A coordination may have relations as conjuncts, and a relation has a `negation` key. |
| Reason | Both are visible in the words and neither could be written before. |

### How to start the work

| Part | Text |
| --- | --- |
| Point | Start with the schema, a local checker and one strategy end to end through the common reader. Test with no knowledge repository present. Check that a correct circuit passes and that one which omits a word is rejected. |
| Decision | Adopted. |
| Reason | The common reader used to skip the check when no knowledge repository was configured, so a returned result proved nothing. A strategy that declares `schema: 'syntax'` is now always checked by `lib/syntax.mjs`. |

### Write syntax directly

| Part | Text |
| --- | --- |
| Point | Each strategy reads the text and writes one `syntax` circuit directly, without building an `nlu` circuit first and without loading knowledge worlds. |
| Decision | Adopted. |
| Reason | It is the purpose of this schema. |

### Keep the rewriting of old references apart

| Part | Text |
| --- | --- |
| Point | The rewriting of older `nlu` references stays a separate tool for evaluation. |
| Decision | Adopted. |
| Reason | Formalizers must not depend on it. |

## Suggestions not adopted

The first four are given in full, with their reasons, on [Decisions 1–5](decisions-review-1.md). The short reasons below are from the report of 2026-11-27 ([The full reports](../project/reports.md)).

### A key giving each value's position

Rejected: numbers on every wire that a person cannot check by eye ([decision 2](decisions-review-1.md#decision-2-every-word-exactly-once-was-undefined)).

### Two circuits for one ambiguous attachment

Rejected: three ambiguous phrases make eight circuits ([decision 3](decisions-review-1.md#decision-3-an-unsettled-attachment-could-not-be-told-from-a-settled-one)).

### A relation that starts at another relation

Rejected: a second level of structure for every tool; the measure is a nominal and the relation starts at it ([decision 4](decisions-review-1.md#decision-4-groupings-that-must-stay-visible)).

### "make" as a clause of its own

Rejected: the first conjunct would look different from "make A blue" alone ([decision 4](decisions-review-1.md#decision-4-groupings-that-must-stay-visible)).

### The names `object` and `noun_phrase`

Considered and not adopted: `object` for the key `complement`. It is the school word for what a verb acts on. It was rejected because the key also holds what is no object: "a square" in "the box is a square".

Considered and not adopted: `noun_phrase` for `nominal`. It is the older and better known term. It was rejected because "it" and "120" are nominals and are odd as phrases, and because UD already uses "nominal" for exactly this set.

## The versions

How the schema went from version 1 to version 3, with the commits, is on [History in brief](../project/history.md).

---

Next: [Related work, weak points, open questions](related-work.md) · Up: [The syntax schema](README.md)
