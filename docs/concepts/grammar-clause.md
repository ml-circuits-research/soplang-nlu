[Home](../README.md) › [Concepts](README.md) › Grammar: the clause

# Grammar: the clause

This page: the grammar terms about the clause that the schema and the judges use, in plain words, with
examples and Wikipedia links. Kind: Explanation.

## How to read this page

Each term has a heading and a small table. Its first row says what the term means in plain
words. Then come an example, the Romanian term (where the schema's own table of terms gives one), where
the term appears in the syntax schema, and a Wikipedia article. All of this is standard grammar.

### Clause

| Aspect | Clause |
| --- | --- |
| Meaning | One verb with everything that belongs to it: one command, statement or question. |
| Example | "move the box" is one clause; "move the box and make it red" has two. |
| In Romanian | propoziție |
| In the schema | The wire type `syntax.clause`. A group of words with no verb is also written as a clause (a fragment, below). |
| Read more | [Clause](https://en.wikipedia.org/wiki/Clause) |

### Verb

| Aspect | Verb |
| --- | --- |
| Meaning | The word that says what is done or what is the case. |
| Example | "delete" in "delete the last row"; "is" in "the title is too long", where it names no action. |
| In Romanian | verb, predicat |
| In the schema | The key `verb` of a clause. |
| Read more | [Verb](https://en.wikipedia.org/wiki/Verb) |

### Auxiliary

| Aspect | Auxiliary |
| --- | --- |
| Meaning | A helping verb that goes with the main verb. |
| Example | "can", "do", "was", "would"; "Could" in "Could you move it?" |
| In Romanian | verb auxiliar |
| In the schema | The key `auxiliary` of a clause. |
| Read more | [Auxiliary verb](https://en.wikipedia.org/wiki/Auxiliary_verb) |

### Negation

| Aspect | Negation |
| --- | --- |
| Meaning | The word that says no. |
| Example | "not", "n't", "never": "do not move it". It can negate one phrase only: "not" in "near Ben but not behind Jo". |
| In Romanian | negație |
| In the schema | The key `negation`, on a clause, or on a relation when it negates that phrase alone. |
| Read more | [Affirmation and negation](https://en.wikipedia.org/wiki/Affirmation_and_negation) |

### Subject

| Aspect | Subject |
| --- | --- |
| Meaning | Who or what the verb is said of, as the words show it. It is not always the one who acts. |
| Example | In "the box was moved by Ana" the subject is "the box"; Ana, who acted, is tied to the clause by "by". |
| In Romanian | subiect |
| In the schema | The key `subject` of a clause: a reference to a nominal (or to a coordination of nominals). |
| Read more | [Subject (grammar)](https://en.wikipedia.org/wiki/Subject_(grammar)) |

### Complement and object

| Aspect | Complement and object |
| --- | --- |
| Meaning | The other things a verb takes. Its object is what it acts on; a predicative complement says what the subject is. |
| Example | "the last row" in "delete the last row" (an object); "a square" in "the box is a square" (a predicative complement). In "give the avatar a hat" both are complements. |
| In Romanian | complement, nume predicativ |
| In the schema | The key `complement` of a clause. It holds both kinds and does not say what each is to the verb: who receives and what is given is left to the meaning layer. |
| Read more | [Complement](https://en.wikipedia.org/wiki/Complement_(linguistics)), [Object](https://en.wikipedia.org/wiki/Object_(grammar)), [Predicative expression](https://en.wikipedia.org/wiki/Predicative_expression) |

### Clause type and mood

| Aspect | Clause type and mood |
| --- | --- |
| Meaning | The kind of sentence by its build: a command (imperative), a statement (declarative) or a question (interrogative). The related property of the verb is its mood. |
| Example | "move it" (imperative), "it moved" (declarative), "did it move?" (interrogative). "Could you move it?" is interrogative by its build, even when it is meant as a request. |
| In Romanian | tipul propoziției |
| In the schema | The key `form`, with the values `imperative`, `declarative`, `interrogative`, and two more below. |
| Read more | [Sentence: by function](https://en.wikipedia.org/wiki/Sentence_(linguistics)#By_function_or_speech_act), [Grammatical mood](https://en.wikipedia.org/wiki/Grammatical_mood), [Imperative mood](https://en.wikipedia.org/wiki/Imperative_mood), [Interrogative](https://en.wikipedia.org/wiki/Interrogative) |

### Fragment

| Aspect | Fragment |
| --- | --- |
| Meaning | A group of words with no verb that stands as a sentence. |
| Example | "pie radius smaller"; "a fireplace"; "Thanks" alone. |
| In the schema | `form=fragment`. A fragment has no `verb`; every nominal in it that is not the end of a relation is listed as `complement`. |
| Read more | [Major and minor sentences](https://en.wikipedia.org/wiki/Sentence_(linguistics)#Major_and_minor_sentences) (Wikipedia's "minor sentence"). The name follows the `FRAG` label of the [Penn Treebank](https://en.wikipedia.org/wiki/Penn_Treebank). |

### Nonfinite verb form

| Aspect | Nonfinite verb form |
| --- | --- |
| Meaning | A verb form that cannot make a sentence by itself. |
| Example | "facing left" in "a bird facing left"; "delete it" after "to" in "I want to delete it". |
| In the schema | `form=nonfinite`, on a clause of its own, tied by a relation to the wire it belongs to. |
| Read more | [Nonfinite verb](https://en.wikipedia.org/wiki/Nonfinite_verb) |

### Ellipsis and gapping

| Aspect | Ellipsis and gapping |
| --- | --- |
| Meaning | Ellipsis: words left out because they can be recovered from elsewhere. Gapping: a later part of a coordination leaves out its verb and borrows the verb of the first part. |
| Example | "make A blue and B green": "B green" borrows "make". In "move the box, and thanks" nothing is borrowed. |
| In Romanian | elipsă |
| In the schema | The key `ellipsis` on a fragment names the clause whose verb it shares (Rule 3 on [The five rules](../schema/rules.md)). |
| Read more | [Ellipsis](https://en.wikipedia.org/wiki/Ellipsis_(linguistics)), [Gapping](https://en.wikipedia.org/wiki/Gapping) |

### Discourse marker

| Aspect | Discourse marker |
| --- | --- |
| Meaning | A word said to the listener, outside the build of the sentence. |
| Example | "please", "hey", "thanks"; "And", "Then" or "So" at the start of a message, with nothing before it to join. |
| In Romanian | cuvânt incident |
| In the schema | The key `discourse` of a clause. |
| Read more | [Discourse marker](https://en.wikipedia.org/wiki/Discourse_marker) |

## Several terms in one clause

Two examples from the schema specification:

```sop
# Could you move it?
@c1 syntax.clause form=interrogative verb="move" auxiliary="Could" subject=$n1 complement=$n2
@n1 syntax.nominal head="you"
@n2 syntax.nominal head="it"

# do not move it, please
@c1 syntax.clause form=imperative verb="move" auxiliary="do" negation="not" complement=$n1 discourse="please"
@n1 syntax.nominal head="it"
```

The first is a question by its build, with an auxiliary, a subject and a complement. The second is a
command with an auxiliary, a negation, a complement and a discourse word. The comma is punctuation and
stands in no wire.

## Where these terms appear in the schema

The clause wire and all its keys are specified on
[Clause and nominal wires](../schema/clause-and-nominal.md). Terms about phrases come next.

---

Next: [Grammar: phrases, linking words, attachment](grammar-phrases.md) · Up: [Concepts](README.md)
