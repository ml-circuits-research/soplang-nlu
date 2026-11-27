# The `syntax` schema

Status: version 3, in use. Version 1 was reviewed once. Version 2 answered that review. Version 3 uses the established terms of grammar and of dependency syntax and answers a second review. The section "Decisions and their reasons" records every decision, including the suggestions that were not adopted.

The schema is implemented in `soplang-nlu`: the declaration in `schemas/syntax/schema.sop`, the checker and the writer in `lib/syntax.mjs`, the tests in `tests/syntax-contract.test.mjs`. They read nothing outside that package.

This document is self-contained. It defines the schema, the rules a formalizer follows, the examples that fix its limits, and the reasons behind each choice.

## Terms

| Term | Meaning |
| --- | --- |
| Message | One text written by a user, for example "move the blue box next to the red circle". |
| Wire | One line of SOP Lang: `@id type key=value key=value`. |
| Circuit | The wires written for one message. |
| Formalizer | A program that reads a message and writes its circuit. Also called a reader or a strategy. |
| Next layer | Whatever reads the circuit afterwards, with context and knowledge, to decide what the message means. |
| `nlu` schema | The earlier, detailed schema for syntactic circuits, in `soplang-nlu/schemas/nlu/schema.sop`. It has more than 50 keys. |
| UD | Universal Dependencies, the most widely used scheme for annotating syntax (Nivre et al. 2016; de Marneffe et al. 2021). |

## The terms in plain words

The keys and wire types carry the established terms. This table says each in everyday words.

| Term | In plain words | In Romanian grammar |
| --- | --- | --- |
| clause | one verb with everything that belongs to it; one command, statement or question | propoziție |
| nominal | the words that describe one thing | grup nominal |
| relation | a tie between two wires | relație |
| coordination | things or clauses put side by side | coordonare |
| `form` | what kind of sentence it is by its build | tipul propoziției |
| `verb` | the word that says what is done or what is the case | verb, predicat |
| `auxiliary` | a helping verb: "can", "do", "was" | verb auxiliar |
| `negation` | the word that says no: "not", "never" | negație |
| `subject` | who or what the verb is said of | subiect |
| `complement` | the other things the verb takes | complement, nume predicativ |
| `modifier` | a word that says how, how much or with what result | circumstanțial, atribut |
| `discourse` | a word said to the listener, outside the sentence: "please", "thanks" | cuvânt incident |
| `ellipsis` | the clause whose verb this verbless part borrows | elipsă |
| `head` | the main word of the group, the one the others describe | centrul grupului |
| `dependent` | a word that describes the main word | determinant |
| `marker` | the linking word: "on", "next to", "of", "if", "to" | prepoziție, conjuncție subordonatoare |
| `attachment=ambiguous` | the words do not say where the phrase hangs | atașare ambiguă |
| `conjunct` | one of the things put side by side | termen al coordonării |
| `conjunction` | the joining word: "and", "or", "but" | conjuncție coordonatoare |

## Purpose

A formalizer sees one message and nothing else. It has no context and uses no knowledge worlds. It writes a `syntax` circuit directly from the text. The circuit does three things:

1. It splits the message into clauses and nominals.
2. It gives every word one place in one wire.
3. It ties the wires.

Everything that needs the meaning of the words is left to the next layer: who receives, what is the result, what a pronoun refers to, whether a question is really a request.

The schema is good enough when two authors of formalizers can take the same examples and tell, from this document alone, what structure must be kept and where several readings are allowed.

## The wires and their keys

There are four wire types and 18 keys. A quoted value holds words of the message. `$id` refers to another wire of the same circuit.

### `syntax.nominal`: one nominal

A noun with the words that depend on it, or a word that stands where a noun could: a pronoun, a name, a number. In phrase-structure grammar this is a noun phrase. A nominal is a lookup: it does not say which object of a scene is meant.

| Key | Holds |
| --- | --- |
| `head` | The word the others depend on: "boxes" in "the two small red boxes". |
| `dependent` | Every other word of the nominal, one value per word: determiners, numerals, adjectives, nouns that modify the head. |

```sop
# the two small red boxes
@n1 syntax.nominal dependent="the" dependent="two" dependent="small" dependent="red" head="boxes"

# it
@n1 syntax.nominal head="it"
```

### `syntax.clause`: one clause

A verb with what belongs to it, or a group of words that has no verb.

| Key | Holds |
| --- | --- |
| `form` | `imperative`, `declarative`, `interrogative`, `fragment` (the clause has no verb) or `nonfinite` (the verb form cannot make a sentence by itself: "facing left", "delete it" after "to"). |
| `verb` | The verb. |
| `auxiliary` | Auxiliary verbs: "can", "do", "was", "would". |
| `negation` | The words that negate the clause: "not", "n't", "never". |
| `subject` | The grammatical subject, when the words show one. |
| `complement` | The other nominals the verb takes: its objects and its predicative complement. There can be several. |
| `modifier` | Words that modify the clause and are neither nominals nor markers: "red", "slightly", "up", "again". |
| `discourse` | Words addressed to the listener that are outside the grammar of the clause: "please", "hey", "thanks". |
| `ellipsis` | On a fragment: the clause whose verb, auxiliaries and negation it shares. See Rule 3. |

```sop
# delete the last row
@c1 syntax.clause form=imperative verb="delete" complement=$n1
@n1 syntax.nominal dependent="the" dependent="last" head="row"

# the title is too long
@c1 syntax.clause form=declarative verb="is" subject=$n1 modifier="too" modifier="long"
@n1 syntax.nominal dependent="the" head="title"

# Could you move it?
@c1 syntax.clause form=interrogative verb="move" auxiliary="Could" subject=$n1 complement=$n2
@n1 syntax.nominal head="you"
@n2 syntax.nominal head="it"

# do not move it, please
@c1 syntax.clause form=imperative verb="move" auxiliary="do" negation="not" complement=$n1 discourse="please"
@n1 syntax.nominal head="it"

# the box was moved by Ana
@c1 syntax.clause form=declarative verb="moved" auxiliary="was" subject=$n1
@n1 syntax.nominal dependent="the" head="box"
@n2 syntax.nominal head="Ana"
@r1 syntax.relation from=$c1 to=$n2 marker="by"

# what colour is the castle?
@c1 syntax.clause form=interrogative verb="is" complement=$n1 subject=$n2
@n1 syntax.nominal dependent="what" head="colour"
@n2 syntax.nominal dependent="the" head="castle"

# pie radius smaller
@c1 syntax.clause form=fragment complement=$n1 modifier="smaller"
@n1 syntax.nominal dependent="pie" head="radius"
```

`form` is what the words show. "Could you move it?" is interrogative in form. That the speaker uses it as a request is for the next layer.

`subject` is the grammatical subject. In "the box was moved by Ana" it is the box.

`complement` does not say what the nominal is to the verb. In "give the avatar a hat" the avatar and the hat are both `complement`. Who receives and what is given is for the next layer. In a fragment, which has no verb, every nominal that is not the end of a relation is listed as `complement`.

A question word stands where its grammar puts it. In "what colour" it is a dependent of "colour". In "what is this?" it is the head of a nominal. In "where is it?" it is a modifier of the clause.

### `syntax.relation`: a relation between two wires

| Key | Holds |
| --- | --- |
| `from`, `to` | The two wires. Each is a clause, a nominal or a coordination. |
| `marker` | The word that marks the relation, when there is one: a preposition ("on", "next to", "of"), the possessive "'s", a subordinator ("if", "because"), or the "to" of an infinitive. |
| `negation` | The word that negates this relation alone: "not" in "not behind Jo". |
| `attachment` | The value `ambiguous`, when the formalizer does not settle where the relation starts. See Rule 2. |

A relation has no kind. With a marker, the marker says how the wires are related. Without a marker, the two wires stand together and no word says how. The types of the two ends tell the cases apart.

```sop
# the level of Intro                 nominal to nominal, with a marker
@n1 syntax.nominal dependent="the" head="level"
@n2 syntax.nominal head="Intro"
@r1 syntax.relation from=$n1 to=$n2 marker="of"

# move it if it fits                 clause to clause, with a marker
@r1 syntax.relation from=$c1 to=$c2 marker="if"

# I want to delete it                clause to clause: "to" marks the infinitive
@c1 syntax.clause form=declarative verb="want" subject=$n1
@c2 syntax.clause form=nonfinite verb="delete" complement=$n2
@r1 syntax.relation from=$c1 to=$c2 marker="to"

# a bird facing left                 nominal to clause, no marker
@c1 syntax.clause form=fragment complement=$n1
@n1 syntax.nominal dependent="a" head="bird"
@c2 syntax.clause form=nonfinite verb="facing" modifier="left"
@r1 syntax.relation from=$n1 to=$c2

# x 120                              nominal to nominal, no marker
@r1 syntax.relation from=$n1 to=$n2
```

### `syntax.coordination`: wires joined side by side

| Key | Holds |
| --- | --- |
| `conjunct` | The joined wires: nominals, clauses or relations. All conjuncts of one coordination have the same type. |
| `conjunction` | The words that join them: "and", "or", "but", "then". |

```sop
# a blanket, a basket and a boy
@k1 syntax.coordination conjunct=$n1 conjunct=$n2 conjunct=$n3 conjunction="and"
```

The commas of a coordination are punctuation. No wire holds them.

```sop
# put it near Ben but not behind Jo
@c1 syntax.clause form=imperative verb="put" complement=$n1
@n1 syntax.nominal head="it"
@r1 syntax.relation from=$c1 to=$n2 marker="near"
@n2 syntax.nominal head="Ben"
@r2 syntax.relation from=$c1 to=$n3 marker="behind" negation="not"
@n3 syntax.nominal head="Jo"
@k1 syntax.coordination conjunct=$r1 conjunct=$r2 conjunction="but"
```

"but" joins the two relations. "not" belongs to the second one only.

### A whole message

```sop
# move the blue box next to the red circle and make it bigger
@c1 syntax.clause form=imperative verb="move" complement=$n1
@n1 syntax.nominal dependent="the" dependent="blue" head="box"
@r1 syntax.relation from=$c1 to=$n2 marker="next to" attachment=ambiguous
@n2 syntax.nominal dependent="the" dependent="red" head="circle"
@c2 syntax.clause form=imperative verb="make" complement=$n3 modifier="bigger"
@n3 syntax.nominal head="it"
@k1 syntax.coordination conjunct=$c1 conjunct=$c2 conjunction="and"
```

## Rule 1. Alignment: every word exactly once

1. A quoted value is one word of the message, or a run of words that stand next to each other, written as in the message: `marker="next to"`.
2. Every word of the message is covered by exactly one value. Punctuation marks are not words and no value covers them. The marks are: `. , ; : ! ? ( ) [ ] { } " ' — – - … / \` and the curly quotes. Every other sign is a word: "%", "&", "+", "=". A mark inside a value is ignored when the value is matched, so "x-axis" covers the words "x" and "axis".
3. When the same run of words occurs more than once in the message, values claim occurrences in the order the circuit is written, top to bottom and left to right. Each value takes the earliest occurrence whose words are all still free.

A formalizer therefore writes repeated words in the order of the message. It does not have to work the order out by hand: `writeCircuit` in `lib/syntax.mjs` takes the wires with the position of each value and writes them in an order that satisfies the rule.

```sop
# put the box on the box
@c1 syntax.clause form=imperative verb="put" complement=$n1
@n1 syntax.nominal dependent="the" head="box"
@r1 syntax.relation from=$c1 to=$n2 marker="on" attachment=ambiguous
@n2 syntax.nominal dependent="the" head="box"
```

`@n1` is written first, so it claims the first "the" and the first "box". Writing `@n2` before `@n1` would swap which box is the complement of "put".

Known limit. Suppose one coordination holds the first and the third "and" of a message and another holds the second. No order of the two wires gives each value its own occurrence, because a value always takes the earliest free one. The circuit cannot say which "and" belongs to which wire, and it does not need to: two values that hold the same word are the same in the circuit. `writeCircuit` then writes the wires in the order of the message; the rule gives the first wire the first and the second "and" and the other wire the third. Every word is still covered once, and the circuit is valid. It refuses a circuit only when even this order leaves a word uncovered. Measured: this happens in 2 to 8 of 1,831 messages, depending on the formalizer, mostly with "and", "then" and "right".

## Rule 2. Ambiguous attachment

In "put the cat on the table" the words allow two starts for "on the table": the verb, or the cat. This is the attachment ambiguity of prepositional phrases. A formalizer does one of two things, and the circuit shows which.

| The formalizer | The relation | What the next layer may conclude |
| --- | --- | --- |
| settles the attachment | starts at the clause or at the nominal, with no mark | This is the formalizer's reading. |
| leaves it unsettled | starts at the clause and carries `attachment=ambiguous` | The phrase belongs to this clause. It attaches to the verb or to one of the clause's nominals. |

```sop
# settled: the phrase attaches to the verb
@r1 syntax.relation from=$c1 to=$n2 marker="on"

# settled: the phrase attaches to the cat
@r1 syntax.relation from=$n1 to=$n2 marker="on"

# unsettled
@r1 syntax.relation from=$c1 to=$n2 marker="on" attachment=ambiguous
```

The formalizer returns one circuit for a message.

## Rule 3. A shared verb

In "make A blue and B green" the second conjunct has no verb of its own. Grammar calls this gapping, a kind of ellipsis. The fragment names the clause whose verb it shares.

```sop
# make A blue and B green
@c1 syntax.clause form=imperative verb="make" complement=$n1 modifier="blue"
@n1 syntax.nominal head="A"
@c2 syntax.clause form=fragment complement=$n2 modifier="green" ellipsis=$c1
@n2 syntax.nominal head="B"
@k1 syntax.coordination conjunct=$c1 conjunct=$c2 conjunction="and"
```

Both pairs are kept: A with blue, B with green. `ellipsis=$c1` says that "make", with its auxiliaries and its negation, applies to the second pair too.

A fragment without `ellipsis` shares nothing, also when it stands in a coordination:

```sop
# move the box, and thanks
@c1 syntax.clause form=imperative verb="move" complement=$n1
@n1 syntax.nominal dependent="the" head="box"
@c2 syntax.clause form=fragment discourse="thanks"
@k1 syntax.coordination conjunct=$c1 conjunct=$c2 conjunction="and"
```

## Rule 4. A measure before a marker

In "put the lamp two inches from the edge" the measure belongs with "from the edge". The measure is a nominal, and the relation starts at it.

```sop
@c1 syntax.clause form=imperative verb="put" complement=$n1 complement=$n2
@n1 syntax.nominal dependent="the" head="lamp"
@n2 syntax.nominal dependent="two" head="inches"
@r1 syntax.relation from=$n2 to=$n3 marker="from"
@n3 syntax.nominal dependent="the" head="edge"
```

## Rule 5. Places fixed by position

These rules make formalizers agree where a free choice would make their circuits differ for no reason.

1. **A word after the verb that is neither a nominal nor a marker is a `modifier`.** This includes verb particles and directions: "tidy up", "move it left".
2. **A word that says how a nominal is, standing after that nominal.** If the nominal is the subject or a complement of the clause, the word is a `modifier` of that clause: "make the box red". If the nominal is the end of a relation with a marker, the word is a `dependent` of that nominal: "with outline gold".
3. **A greeting or thanks alone.** "Hey" or "Thanks" forms a fragment with the word in `discourse`.
4. **The "to" of an infinitive is the marker of a relation.** It marks the relation from the clause before it to the nonfinite clause. When nothing stands before it, as in "to fix the details, edit the members", the relation starts at the main clause.
5. **A number or a name right after a noun.** "block 2", "x 120", "the node Intro": the number or name is a `dependent` in the noun's nominal, or a nominal of its own tied to the noun by a relation without a marker. Both are accepted; neither may leave it tied to nothing.
6. **A word that grades a linking word.** "right behind", "just above": the word is a `modifier` of the clause the relation belongs to. A relation has no key for it.
7. **"And", "Then" or "So" at the start of a message.** With nothing before it to join, the word is a `discourse` word.

## What a formalizer must get right

| Must be right | Several readings pass | Not compared |
| --- | --- | --- |
| The split into clauses | Where a relation with a marker starts, among the clause and the nominals of that clause that grammar allows; or marked `attachment=ambiguous` | Which clause holds a discourse word |
| The form of each clause | Which earlier wire a coordination joins, when grammar allows several: "profit by ship mode and customer segment" | The order of wires, beyond Rule 1 |
| The verb of each clause, or that it has none | A word that grammar allows as a noun or as a verb: "make y axis scale linear" | |
| Its auxiliaries and its negation | | |
| Whether a fragment shares the verb of another clause (`ellipsis`) | | |
| Which words form each nominal, and which is its head | | |
| The subject, when the words show one | | |
| Which nominals are complements of which clause | | |
| The end of every relation, its marker, and its start when the words settle it | | |
| The conjuncts of every coordination | | |

## Boundary examples

Each row says what the circuit states and what it leaves for the next layer.

| Message | The circuit states | Left for the next layer |
| --- | --- | --- |
| give the avatar a hat | One imperative clause with two complements | Which one receives and which is given |
| make it red | "red" is a modifier of the clause | That red is the result |
| move it slowly | "slowly" is a modifier of the clause | That slowly is the manner |
| Could you move it? | An interrogative clause | That it is a request |
| a fireplace | A fragment with one nominal | What should be done with it |
| put the cat on the table | A relation marked "on" that ends at the table | Whether it attaches to the verb or to the cat, unless the formalizer settles it |
| the box was moved by Ana | The subject is the box; a relation marked "by" ends at Ana | That Ana did it |
| it | A nominal with the head "it" | What it refers to |
| do not move it | The clause carries the negation "not" | What follows from the negation |

Semantic roles such as recipient, goal or result are not part of this schema.

## Decisions and their reasons

Version 1 called a clause a `fact` and a nominal a `thing`. Its keys were `kind` (with the values command, statement, question, mention, dependent), `action`, `helper`, `doer`, `thing`, `how`, `asks` and `word` on a fact; `head` and `describing` on a thing; `kind`, `from`, `to` and `cue` on a link; `member` and `cue` on a list. It had no rule for alignment or for ambiguous attachment. A review of version 1 raised five points. Decisions 1 to 5 answer them. Decision 6 is the later choice of names.

### 1. Names that ask for a meaning

The review said that `doer` asks for an interpretation: in "the box was moved by Ana" the subject is the box. It also said that the forms should be named imperative, declarative and interrogative, because "Could you move it?" is interrogative in form even when it is used as a request.

Decision: adopted. `doer` became `subject`. `kind` became `form`, with the values `imperative`, `declarative`, `interrogative`, `fragment` and `nonfinite`.

Extension, not asked for by the review: `action` became `verb`. The same test applies. In "the title is too long" the word "is" names no action.

### 2. "Every word exactly once" was undefined

The review asked what the phrase means when a group repeats ("put the box on the box") and when one value covers two words ("next to"). It suggested solving this in the alignment convention, without a new wire type.

Decision: adopted as suggested. Rule 1 defines it.

Considered and not adopted: a key that gives the position of each value in the message. It would make circuits exact in every case. It was rejected because every wire would carry numbers that a person cannot check by eye. The simple rule fails only for crossing claims, which are expected to be rare. This expectation has not been checked on the sample.

### 3. An unsettled attachment could not be told from a settled one

The review said that when a relation starts at the verb, the next layer cannot know whether the formalizer chose that or left it open. It asked for an explicit decision between one reading with an open attachment and two distinct readings.

Decision: one circuit, with `attachment=ambiguous` on the relation (Rule 2).

Not adopted: returning two circuits. A message with three ambiguous phrases has eight combinations of attachments. One circuit with three marks states them all. A list of alternative circuits either omits combinations or grows with every ambiguous phrase. Two lists of circuits are also harder to compare than two circuits.

### 4. Groupings that must stay visible

The review named two cases and asked that they be written with the existing types first.

**The measure in "two inches from the edge".** The review noted that the measure qualifies the relation "from", and that a relation cannot start at another relation.

Decision: no relation from a relation. The measure is a nominal and the relation "from" starts at it (Rule 4). The pairing of "two inches" with "from the edge" is kept, and the four types stay as they are.

Not adopted: letting `from` and `to` name another relation. It would keep the measure as a qualifier of the relation, which is closer to the grammar. It was rejected because relations would then form a second level of structure, and every formalizer and every comparison would have to handle relations whose ends are relations. The simpler form loses nothing the words give.

**The shared verb in "make A blue and B green".** The review noted that a separate wire for "B green" keeps the pair and loses the common verb.

Decision: the second conjunct is a fragment, the coordination holds both, and Rule 3 says that such a fragment shares the verb. The sharing is read from the structure.

Not adopted: writing "make" as a clause of its own, completed by a coordination of two verbless clauses, "A blue" and "B green". It states the sharing as a wire. It was rejected because the first conjunct would then have another shape than in "make A blue" alone. A formalizer would have to rebuild what it already wrote when it meets "and", and two formalizers could differ on the simple case.

### 5. The document asked for more than the evaluation checked

The review noted that the document defined a head while the evaluation accepted any choice of head, and defined three kinds of relation without a marker while the evaluation accepted any of them. It asked for a decision on each such distinction, and saw a chance to simplify wherever any variant was good.

| Distinction | Decision | Reason |
| --- | --- | --- |
| The kind of a relation | Dropped | Any kind was accepted. Whether a relation has a marker is visible from the `marker` key, and the types of the two ends tell the remaining cases apart. |
| The head of a nominal | Kept and now required | In English the head of a nominal is visible in the words: it is usually the last noun. The next layer needs it to look the nominal up. Without it that layer would have to analyse the group again. The cost is stated under "Weak points". |
| A verb particle as part of the verb group or as a modifier | Fixed by Rule 5 | Either was accepted, so formalizers could differ for no reason. |
| A word after a nominal as a modifier of the clause or as a dependent of the nominal | Fixed by Rule 5 | The same. |
| Which clause holds a discourse word | Declared as not compared | It carries no structure. |
| Which clause holds a punctuation mark | Dropped: no wire holds punctuation | See decision 7. |

The review's suggestion to simplify was followed for the kind of a relation. It was not followed for the head, for the reason given.

### 6. Established names

Principle: where grammar or dependency syntax has an established term, the schema uses it. No name is a metaphor or a coinage.

| Version 1 | Now | The established term and where it comes from |
| --- | --- | --- |
| `syntax.fact` | `syntax.clause` | Clause: a verb with what belongs to it. Every descriptive grammar. |
| `syntax.thing` | `syntax.nominal` | Nominal: UD's term for noun phrases and for the pronouns, proper names and numerals that stand in their place. |
| `syntax.link` | `syntax.relation` | Dependency relation: the tie between two units in dependency grammar (Tesnière 1959; Mel'čuk 1988). |
| `syntax.list` | `syntax.coordination` | Coordination, with its conjuncts and its conjunction. UD `conj` and `cc`. |
| `kind` | `form` | Clause types of grammar (imperative, declarative, interrogative), finite against nonfinite verb forms, and "fragment" as in the `FRAG` label of the Penn Treebank (Marcus et al. 1993). |
| `action` | `verb` | Traditional grammar. |
| `helper` | `auxiliary`, `negation` | Auxiliary verb: UD `aux`. Negation is a category of its own in every grammar. |
| `doer` | `subject` | Traditional grammar. UD `nsubj`. |
| `thing` (the key) | `complement` | Complement of the verb: objects and predicative complements together (Huddleston and Pullum 2002). |
| `how` | `modifier` | Modifier: the dependent that is not required by its head. UD `advmod`, `amod`. |
| `asks` | no key | See below. |
| `word` | `discourse` | UD `discourse`. Punctuation is no longer held by any wire: see decision 7. |
| `head` | `head` | Head: the word the others depend on. Dependency grammar. |
| `describing` | `dependent` | Dependent: a word that depends on a head. Dependency grammar. |
| `cue` | `marker` | Marker: the word that marks how a unit is related. UD `case` for prepositions and `mark` for subordinators. |
| `member` | `conjunct` | Coordination. |
| `cue` of a list | `conjunction` | Coordination. UD `cc`. |
| no mark | `attachment=ambiguous` | Attachment ambiguity (Hindle and Rooth 1993). |

Not renamed: `from` and `to`. Dependency grammar says governor and dependent. `dependent` is already the key of a nominal, and `from` and `to` are exact and plain.

Between version 2 and this one, an intermediate draft used everyday words: `main` for the head, `via` for the marker, `other` for the remaining words, `start=open` for the ambiguity. The owner of the project asked for established terms instead, since such terms exist and everyday words read as metaphors.

Using the established terms changed four things beyond the names. Each follows from how grammar already analyses the case.

| Change | Reason |
| --- | --- |
| No key for the question word (`asks` is gone) | Grammar has no separate place for it. "what" in "what colour" is a dependent of "colour". A key of its own would split that nominal. The form `interrogative` marks the question, and the word stays where its grammar puts it. |
| `negation` is a key of its own | "not" is no auxiliary verb. The next layer needs to see a negation at once. |
| The "to" of an infinitive is the marker of a relation | UD treats it as a marker of the dependent clause, like "if" or "because". It is no auxiliary. |
| `discourse` holds the words said to the listener; commas do not stand in a coordination | "please" is a discourse word and a comma is punctuation. Neither is a conjunction. |

Considered and not adopted: `object` for the key `complement`. It is the school word for what a verb acts on. It was rejected because the key also holds what is no object: "a square" in "the box is a square".

Considered and not adopted: `noun_phrase` for `nominal`. It is the older and better known term. It was rejected because "it" and "120" are nominals and are odd as phrases, and because UD already uses "nominal" for exactly this set.

### 7. Punctuation is not covered

Version 2 asked that every punctuation mark stand in a wire. This version asks it of words only.

Reason: which clause holds a comma was already declared as not compared, so the marks carried no structure. They did carry a cost. A clause would claim commas far apart in the message, with other wires claiming the commas between them, and under Rule 1 no order of the wires can align such crossing claims. Without the marks the case is rare. What punctuation shows about the build of a sentence is already stated: a question mark by `form=interrogative`, a comma between two clauses by their coordination or relation.

### 8. The second review

The second review approved the four types and asked for two cases to be fixed in the specification and in the tests, and for a way of starting the work.

| Point of the review | Decision | Reason |
| --- | --- | --- |
| In "make A blue and B green" the verb applies to both pairs. In "move the box, and thanks" the second part is independent. Being in a list is not enough to tell that a verb is shared. | Adopted. The key `ellipsis` on a fragment names the clause whose verb it shares (Rule 3). | The earlier rule read the sharing from the coordination. It would have given "thanks" the verb "move". A statement in the circuit cannot be misread. |
| A list should be able to group relations. "near Ben but not behind Jo" must show that "but" joins the two phrases and that "not" belongs to the second only. | Adopted. A coordination may have relations as conjuncts, and a relation has a `negation` key. | Both are visible in the words and neither could be written before. |
| Start with the schema, a local checker and one strategy end to end through the common reader. Test with no knowledge repository present. Check that a correct circuit passes and that one which omits a word is rejected. | Adopted. | The common reader used to skip the check when no knowledge repository was configured, so a returned result proved nothing. A strategy that declares `schema: 'syntax'` is now always checked by `lib/syntax.mjs`. |
| Each strategy reads the text and writes one `syntax` circuit directly, without building an `nlu` circuit first and without loading knowledge worlds. | Adopted. | It is the purpose of this schema. |
| The rewriting of older `nlu` references stays a separate tool for evaluation. | Adopted. | Formalizers must not depend on it. |

### Points of the first review adopted without change

- Formalizers write `syntax` circuits directly from the text, without knowledge worlds and without passing through the `nlu` schema.
- Semantic roles such as beneficiary, destination or result are not reintroduced.
- Examples fix the limit between visible syntax and what is decided later. See "Boundary examples".

## How the schema relates to the literature

| Choice | Related work | How it relates |
| --- | --- | --- |
| Nominals as flat groups with a head | Chunking, or partial parsing: Abney, "Parsing by Chunks" (1991); the CoNLL-2000 shared task | A nominal is a base noun phrase. Chunkers find these reliably without a full parse. |
| `verb`, `auxiliary`, `negation` | The verb group of chunking; `aux` in UD | The verb with its auxiliaries and negation forms one unit. |
| `subject`, `complement` | `nsubj`, `obj`, `iobj`, `xcomp` in UD | UD separates object, indirect object and predicative. This schema keeps only subject against the other complements. |
| No semantic roles | Semantic role labelling: PropBank (Palmer, Gildea and Kingsbury 2005); proto-roles (Dowty 1991) | Who receives and what is affected is the task of role labelling, a separate layer above syntax. |
| `modifier` | `advmod` and adjectival `xcomp` in UD; secondary predication | Manner, degree and result differ in meaning. Their syntax is close: a word that modifies the predicate. |
| `dependent` | `det`, `nummod`, `amod`, `compound` in UD | All are dependents of the noun. This schema does not tell them apart. |
| Relations with a marker, starting at the clause or at a nominal | `case` and `mark` in UD, with `obl` against `nmod`; Hindle and Rooth (1993) | UD attaches a prepositional phrase to the predicate or to a noun. The choice is a known hard ambiguity. |
| Relations without a marker | `acl`, `appos` in UD | A clause or a nominal that stands with a nominal. |
| `coordination` | `conj` and `cc` in UD | A fragment that shares a verb is gapping. |
| One wire per clause | Clause-based open information extraction: ClausIE (Del Corro and Gemulla 2013) | A sentence is split into clauses and each clause yields one proposition. |
| `attachment=ambiguous` | Underspecified representations, for example Minimal Recursion Semantics (Copestake et al. 2005) | One representation stands for several readings until more information settles them. |

In short: the schema is a dependency analysis in the style of UD, coarsened to the level of a chunker, with the ambiguities that syntax cannot settle marked.

## Weak points still open

1. **`complement` merges object and predicative complement.** "the box is a square" and "the box hits a square" get the same shape. Only the verb differs.
2. **Punctuation is in no wire.** A layer that needs the marks must read them from the message.
3. **`complement` in a fragment.** A fragment has no verb, so its nominals are complements of nothing. The key is used there to avoid one more key.
4. **`modifier` merges adverbs and adjectives.** "make it red" and "move it slowly" look alike.
5. **`dependent` merges determiners, numerals and adjectives.** A layer that needs the count must find it among the dependents.
6. **The scope of a coordination has no mark for ambiguity.** A formalizer must choose which earlier wire the coordination joins. Attachment has a mark and coordination scope has none.
7. **Rule 1 cannot say which occurrence of a repeated word a value holds when claims cross.** The circuit stays valid and the two values are the same word; see the known limit of Rule 1.
8. **A required head costs acceptance.** Earlier judging let any choice of head pass when the group was right. Under this version a wrong head is an error. Measured by identity with an accepted circuit, comparing the head changes the result for 4 of the 1,831 messages. The effect on judged acceptance is not known.
9. **The question word has no key.** The next layer finds it by the word itself.

## How it relates to the `nlu` schema

Every `nlu` circuit can be rewritten into this schema by rule. The circuits of the dataset that were already accepted therefore stay usable. Formalizers written for this schema do not need `nlu`.

| `nlu` | `syntax` |
| --- | --- |
| `nlu.clause` with its `form` | `syntax.clause` with the same `form` |
| `predicate` | `verb` |
| `auxiliary` | `auxiliary` |
| `negation` | `negation` |
| `subject` | `subject` |
| `direct_object`, `indirect_object`, `predicative_entity`, `topic`, `participant` | `complement` |
| `adverb`, `particle`, `result_complement`, `degree` | `modifier` |
| `question` | A dependent or the head of a nominal, or a `modifier` of the clause |
| `filler`, `expression` | `discourse` |
| `separator`, `terminator` | Not covered |
| `connective`; the `cue` of a coordination that is a word | `conjunction` of a coordination |
| `marker` | `marker` of a relation between the two clauses |
| `nlu.entity`: `head`, `name`, `pronoun`, `literal` | `syntax.nominal`: `head` |
| `nlu.entity`: every other quoted key | `syntax.nominal`: `dependent` |
| `nlu.relation` with a `cue`; `attachment=open` | `syntax.relation` with `marker`; `attachment=ambiguous` |
| `clausal_complement`; a relation without a `cue` | `syntax.relation` without `marker`, or with the marker "to" |
| `nlu.relation` with a `measure` | The measure is a nominal and the relation starts at it |
| `nlu.coordination` | `syntax.coordination`; a comma among its cues is not covered |
| A fragment that shares the verb of another clause | The fragment with `ellipsis` |

## What was measured

The figures come from one fixed sample: 1,831 messages, 1% of the messages of `webmeet-dataset`. They were taken with version 1 of the schema. Versions 2 and 3 have not been measured.

**How readings are graded.** A judge, a language model, reads the message and the circuits a formalizer returned for it and gives one level from L0 to L10. L0 to L7 mean that at least one returned circuit is wrong. For example, L1 is a wrong clause or verb, L3 a wrong relation or grouping, L6 lost information, and L7 one good circuit beside a wrong one. L8, L9 and L10 mean that every returned circuit is acceptable. The figure that matters is the share of messages at L8, L9 or L10.

**The formalizer measured.** VSS is the reader in `soplang-nlu/strategies/vss`. It learns from the text of the dataset without annotations.

| Measurement | Result |
| --- | ---: |
| VSS, judged in the `nlu` schema: share of messages at L8, L9 or L10 | 63.2% |

The next table shows how much the smaller schema changes by itself. It counts the VSS readings that are identical to a circuit already accepted in the dataset, at each level of detail.

| Compared | Identical to an accepted circuit |
| --- | ---: |
| Full `nlu` circuit | 61.8% |
| Version 1 of this schema | 62.2% |
| The same, head of a nominal not compared | 62.4% |
| The same, and a relation may start at the clause | 64.8% |

The smaller schema alone explains between 0.4 and 3 points. Most rejected readings fail on what this schema still asks for: which word is the verb, which words form one nominal, and which wire a phrase is related to.

Readings written in this schema have not been judged yet.

## How a formalizer uses the schema

Everything a formalizer needs is in `soplang-nlu/lib/syntax.mjs`, exported from the package root.

| Function | Use |
| --- | --- |
| `wordsOf(text)` | The words of a message, in order, with their positions. Punctuation marks are left out. Every formalizer must use these positions. |
| `writeCircuit(text, wires)` | Writes the circuit from wires whose quoted values are given as spans of words. It orders the wires for Rule 1 and refuses a circuit that leaves a word out or claims one twice. |
| `validateSyntax(text, circuit)` | Checks a circuit against the schema and against the message. Returns the findings and the position of every value. |
| `coreOf(text, circuit)` | A text that is equal for two circuits that say the same, whatever their wire names. Used to compare readings. |

A strategy declares `schema: 'syntax'`. Its `analyse(text)` returns `{analyses: [{sop}]}` with one circuit. The common reader `createReader({strategy})` checks that circuit with `validateSyntax` and returns it only when it is valid. No knowledge repository is read, and the environment variable `SOP_KNOWLEDGE_DIR` plays no part.

## Questions for the reviewer

1. Is `attachment=ambiguous` on one circuit the right way to deliver an unsettled attachment?
2. Is a required head the right decision, given that it lowers acceptance?
4. Should the scope of a coordination get a mark for ambiguity as well?
5. Is Rule 1 acceptable with its known limit?
6. Is it right to drop the key for the question word and leave the word where its grammar puts it?
7. Is `complement` acceptable for the nominals of a fragment, or should fragments have a key of their own?
