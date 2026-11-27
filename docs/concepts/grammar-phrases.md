[Home](../README.md) › [Concepts](README.md) › Grammar: phrases

# Grammar: phrases, linking words, attachment

This page: the grammar terms about phrases, linking words, coordination and attachment that the schema
and the judges use, in plain words. Kind: Explanation.

## How to read this page

The layout is that of [Grammar: the clause](grammar-clause.md): one heading per term; in its table, the
first row gives the meaning, then an example, the Romanian term (where the schema's table of terms
gives one), where the term appears in the schema, and a Wikipedia article. All of it is standard grammar.

### Noun phrase

| Aspect | Noun phrase |
| --- | --- |
| Meaning | The group of words that describe one thing. |
| Example | "the two small red boxes" |
| In Romanian | grup nominal |
| In the schema | The wire type `syntax.nominal` (see Nominal, below). |
| Read more | [Noun phrase](https://en.wikipedia.org/wiki/Noun_phrase) |

### Head

| Aspect | Head |
| --- | --- |
| Meaning | The main word of a group, the one the others describe. Dependency grammar also calls it the governor. |
| Example | "boxes" in "the two small red boxes"; "box" in "the blue box". |
| In Romanian | centrul grupului |
| In the schema | The key `head` of a nominal. Every nominal has exactly one. |
| Read more | [Head (linguistics)](https://en.wikipedia.org/wiki/Head_(linguistics)) |

### Dependent

| Aspect | Dependent |
| --- | --- |
| Meaning | A word that depends on another word; in a group, a word that describes the head. |
| Example | "the", "two", "small" and "red" in "the two small red boxes": a determiner, a numeral and two adjectives. |
| In Romanian | determinant |
| In the schema | The key `dependent` of a nominal, one value per word. The schema does not say which kind each word is. |
| Read more | [Dependency grammar](https://en.wikipedia.org/wiki/Dependency_grammar), [Determiner](https://en.wikipedia.org/wiki/Determiner) |

### Nominal

| Aspect | Nominal |
| --- | --- |
| Meaning | A noun phrase, or a single word that stands where one could: a pronoun, a name, a number. This is the sense Universal Dependencies gives the word. |
| Example | "the two small red boxes", "it", "Ana", "120". |
| In Romanian | grup nominal |
| In the schema | The wire type `syntax.nominal`. "Nominal" was chosen over "noun phrase" because "it" and "120" are odd as phrases. A nominal does not say which object of a scene is meant. |
| Read more | [Universal Dependencies](https://en.wikipedia.org/wiki/Universal_Dependencies). Wikipedia's article "Nominal (linguistics)" uses the word in another sense (a noun or an adjective). |

### Modifier

| Aspect | Modifier |
| --- | --- |
| Meaning | A word that adds to the meaning of another without being required by it: how, how much, with what result, in which direction. |
| Example | "slowly" in "move it slowly"; "bigger" in "make it bigger"; "left" in "move it left"; "up" in "tidy up" (a verb particle: a small word that forms one verb with the verb before it). |
| In Romanian | circumstanțial, atribut |
| In the schema | The key `modifier` of a clause: words that are neither nominals nor markers. What a modifier says (manner, result, degree) is left to the meaning layer. |
| Read more | [Grammatical modifier](https://en.wikipedia.org/wiki/Grammatical_modifier), [Phrasal verb](https://en.wikipedia.org/wiki/Phrasal_verb) (verb particles) |

### Preposition

| Aspect | Preposition |
| --- | --- |
| Meaning | A linking word that ties a noun phrase to another word. The preposition with its noun phrase is a prepositional phrase. |
| Example | "on", "of", "by"; two words together: "next to". "on the table" is a prepositional phrase. |
| In Romanian | prepoziție |
| In the schema | The `marker` of a relation; the noun phrase is the nominal the relation ends at (`to`). |
| Read more | [Preposition and postposition](https://en.wikipedia.org/wiki/Preposition_and_postposition), [Prepositional phrase](https://en.wikipedia.org/wiki/Adpositional_phrase) |

### Subordinator

| Aspect | Subordinator |
| --- | --- |
| Meaning | A linking word that ties a clause to another clause. |
| Example | "if" in "move it if it fits"; "because". |
| In Romanian | conjuncție subordonatoare |
| In the schema | The `marker` of a relation between two clauses. |
| Read more | [Subordination](https://en.wikipedia.org/wiki/Subordination_(linguistics)), [Conjunction](https://en.wikipedia.org/wiki/Conjunction_(grammar)) |

### The infinitive "to"

| Aspect | The infinitive "to" |
| --- | --- |
| Meaning | The "to" before the bare form of a verb. |
| Example | "I want to delete it" |
| In the schema | The `marker` of the relation from the clause before it to the nonfinite clause (Rule 5 on [The five rules](../schema/rules.md)). Universal Dependencies also treats it as a marker, not as an auxiliary. |
| Read more | [Infinitive](https://en.wikipedia.org/wiki/Infinitive) |

### Marker

| Aspect | Marker |
| --- | --- |
| Meaning | The schema's name for the linking word of a relation: a preposition, the possessive "'s", a subordinator, or the infinitive "to". |
| Example | `marker="next to"`, `marker="of"`, `marker="if"`, `marker="to"` |
| In Romanian | prepoziție, conjuncție subordonatoare |
| In the schema | The key `marker` of `syntax.relation`. A relation without a marker ties two wires that stand together with no word saying how: "x 120". |
| Read more | [Marker (linguistics)](https://en.wikipedia.org/wiki/Marker_(linguistics)); in Universal Dependencies, the relations `case` and `mark`. |

### Coordination

| Aspect | Coordination |
| --- | --- |
| Meaning | Putting things side by side, as equals. |
| Example | "a blanket, a basket and a boy"; "move the box and make it red". |
| In Romanian | coordonare |
| In the schema | The wire type `syntax.coordination`. Its conjuncts are all nominals, all clauses or all relations. The commas are punctuation and stand in no wire. |
| Read more | [Coordination (linguistics)](https://en.wikipedia.org/wiki/Coordination_(linguistics)) |

### Conjunction

| Aspect | Conjunction |
| --- | --- |
| Meaning | The joining word of a coordination. |
| Example | "and", "or", "but", "then" |
| In Romanian | conjuncție coordonatoare |
| In the schema | The key `conjunction` of a coordination. |
| Read more | [Conjunction (grammar)](https://en.wikipedia.org/wiki/Conjunction_(grammar)) |

### Conjunct

| Aspect | Conjunct |
| --- | --- |
| Meaning | One of the things put side by side. |
| Example | "a blanket", "a basket" and "a boy" in "a blanket, a basket and a boy". |
| In Romanian | termen al coordonării |
| In the schema | The key `conjunct` of a coordination: a reference to a wire. A coordination has at least two. |
| Read more | [Coordination (linguistics)](https://en.wikipedia.org/wiki/Coordination_(linguistics)) |

### Function word and content word

| Aspect | Function word and content word |
| --- | --- |
| Meaning | Function words are the small, closed set of words that build the grammar. Content words carry the content: nouns, adjectives, most verbs. |
| Example | Function words: "the", "a", "to", "of", "and", "if", "it", "can". Content words: "box", "blue", "draw". |
| In the schema | No key. The distinction matters for the project rule below. |
| Read more | [Function word](https://en.wikipedia.org/wiki/Function_word), [Content word](https://en.wikipedia.org/wiki/Content_word) |

**The project rule.** Rules and word lists of a formalizer may name only function words (linking words,
conjunctions, auxiliaries, pronouns, determiners, numerals) and common verbs with their irregular forms;
never nouns, adjectives or anything particular to the dataset. The reason: a rule should be a statement
about English that would also hold on other English text. This is the owner's decision
[D5](../project/decisions.md#d5).

### Attachment ambiguity

| Aspect | Attachment ambiguity |
| --- | --- |
| Meaning | A phrase that the words allow to belong to more than one earlier word. The word it belongs to is its attachment site (its governor). |
| Example | In "put the box on the table by the door", "by the door" can attach to "put" (where to put the box) or to "table" (which table). |
| In Romanian | atașare ambiguă |
| In the schema | A relation starts (`from`) at its attachment site. When the formalizer leaves the choice open, the relation starts at the clause and carries `attachment=ambiguous` (Rule 2). |
| Read more | [Syntactic ambiguity](https://en.wikipedia.org/wiki/Syntactic_ambiguity), with "John saw the man on the mountain with a telescope". Wikipedia has no article of its own on prepositional-phrase attachment (checked 2026-11-27). |

## Where these terms appear in the schema

Relations, markers, attachment and coordination are specified on
[Relation and coordination wires](../schema/relation-and-coordination.md); nominals on
[Clause and nominal wires](../schema/clause-and-nominal.md).

---

Next: [How grammar is usually written down](grammar-notation.md) · Up: [Concepts](README.md)
