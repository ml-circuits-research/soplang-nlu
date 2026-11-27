# soplang-nlu: a guided tour

This page explains the project from zero, step by step, for a reader who has never seen it. Each idea is
introduced when it is first needed, with a small example. Established ideas link to Wikipedia. For every piece
the page says plainly whether it is:

- **Standard**: an established idea or tool, used as the field knows it;
- **New here**: something this project designed (a format, a combination, a procedure);
- **Particular**: something that holds only for this project's languages, data or setting.

In a hurry? The current numbers are in [STATUS.md](STATUS.md); using the code is in
[section 13](#13-using-the-library).

**Contents**

- Part 1, the big picture: [1. From a message to an action](#1-from-a-message-to-an-action)
- Part 2, the notation: [2. SOP Lang](#2-sop-lang-the-notation) ·
  [3. Writing SOP Lang](#3-writing-sop-lang-the-rules-of-the-notation) ·
  [4. Schemas](#4-schemas-which-wires-may-exist) ·
  [5. Syntax and semantics: the two layers](#5-syntax-and-semantics-the-two-layers) ·
  [6. Worlds: where meaning comes from](#6-worlds-where-meaning-comes-from)
- Part 3, the syntactic layer: [7. The grammar you need](#7-the-grammar-you-need) ·
  [8. How grammar is usually written down](#8-how-grammar-is-usually-written-down) ·
  [9. The syntax schema](#9-the-syntax-schema)
- Part 4, the work: [10. The formalizers](#10-the-formalizers) ·
  [11. Knowing whether a circuit is right](#11-knowing-whether-a-circuit-is-right) ·
  [12. The data](#12-the-data)
- Part 5, practical: [13. Using the library](#13-using-the-library) ·
  [14. What is new and what is particular](#14-what-is-new-and-what-is-particular-a-summary) ·
  [15. Further reading](#15-further-reading) · [16. Glossary](#16-glossary)

---

# Part 1. The big picture

## 1. From a message to an action

A person types a message into an application, for example into a calendar:

> schedule a meeting with Ana tomorrow

For the application to act, the message passes through three steps. This repository does the first one.

| Step | Question it answers | Who does it | Result for the example |
| --- | --- | --- | --- |
| 1. Syntax | How is the sentence built? | the **formalizers** of this repository | one command, verb "schedule", the thing scheduled "a meeting", tied by "with" to "Ana", and "tomorrow" says when |
| 2. Semantics | What is asked, in the terms of the application? | a later reader, with knowledge of the application | make a new thing of the kind *meeting*; its people include Ana; its day is tomorrow |
| 3. Action | Do it | the application | a meeting appears in the calendar |

Splitting understanding into a structural step and a meaning step is **standard** in
[natural language processing](https://en.wikipedia.org/wiki/Natural_language_processing): a
[parser](https://en.wikipedia.org/wiki/Parsing) finds the [syntax](https://en.wikipedia.org/wiki/Syntax)
(structure), and later components find the [semantics](https://en.wikipedia.org/wiki/Semantics) (meaning) and
the [pragmatics](https://en.wikipedia.org/wiki/Pragmatics) (meaning in context).

The rule for step 1 in this project: it uses **only the words of the message**. No dictionary of the
application's objects, no knowledge of calendars or drawings, no earlier messages. Whatever needs that
knowledge is left to step 2.

Both step 1 and step 2 write their result in the same notation, SOP Lang. The next part explains it.

# Part 2. The notation

## 2. SOP Lang, the notation

**SOP Lang** is a small declarative notation in which every statement is one line-like unit called a **wire**.
It is the common language of this project's repositories: the dataset's annotations, the knowledge used by
the applications, and the output of the formalizers are all written in it. It is **particular**: the project's
own notation, not a public standard. Its normative definition is in the sibling repository
`soplang-words-lib`, file `docs/language.md` ("SOP Lang v1.1").

Here is the result of step 1 for the example, a set of four wires:

```sop
@c1 syntax.clause form=imperative verb="schedule" modifier="tomorrow" complement=$n1
@n1 syntax.nominal dependent="a" head="meeting"
@r1 syntax.relation marker="with" from=$n1 to=$n2
@n2 syntax.nominal head="Ana"
```

The set of wires written for one message is called a **circuit**. The name comes from the picture: wires
point at each other (`$n1` points at the wire `@n1`), so a circuit is a small
[graph](https://en.wikipedia.org/wiki/Graph_(discrete_mathematics)) of facts.

Similar ideas exist and are **standard**: facts as subject–key–value statements, as in
[RDF](https://en.wikipedia.org/wiki/Resource_Description_Framework) and its
[Turtle](https://en.wikipedia.org/wiki/Turtle_(syntax)) notation, or facts in
[Prolog](https://en.wikipedia.org/wiki/Prolog). SOP Lang is simpler: no nesting, no lists, no operators.

## 3. Writing SOP Lang: the rules of the notation

A wire has this shape (the full grammar is in `soplang-words-lib/docs/language.md`):

```text
@id type key=value key=value …
```

| Part | Example | Meaning |
| --- | --- | --- |
| `@id` | `@n1` | starts a wire and gives it a name, unique in the circuit |
| `type` | `syntax.nominal` | what kind of fact this is; the part before the dot names the schema it comes from (section 4) |
| `key=value` | `head="meeting"` | one property; no spaces around `=` |

A value is one of four things:

| Value | Written | Example | Meaning |
| --- | --- | --- | --- |
| string | in double quotes | `verb="schedule"` | text; in this project, words copied from the message |
| atom | a bare word or number | `form=imperative` | a name from a fixed list, or a number |
| reference | `$` + an id | `complement=$n1` | points at another wire of the same circuit |
| variable | `?` + a name | `?x` | used only in rules and queries, never in a circuit |

Three more rules:

- **A key may repeat**: `dependent="the" dependent="blue"` means the key `dependent` has two values, in that
  order.
- A wire may span several lines; it ends where the next `@` starts. Indentation means nothing.
- `#` starts a comment, to the end of the line.

That is the whole notation. Order of wires does not matter; meaning comes from the types, the keys and the
references.

## 4. Schemas: which wires may exist

A notation alone allows any wire. A **schema** says which types exist, which keys each type may have, and what
kind of value each key takes. The idea is **standard**: compare a
[database schema](https://en.wikipedia.org/wiki/Database_schema) or
[XML Schema](https://en.wikipedia.org/wiki/XML_schema). A circuit that follows its schema can be checked by a
program.

In SOP Lang a schema is itself written in wires, with a few built-in types (**particular** to SOP Lang):

| Built-in type | Declares | Example |
| --- | --- | --- |
| `core.module` | a schema and what it exports | `@syntax core.module name=syntax version=3 exports=clause …` |
| `core.type` | a type of wire | `@syntax.nominal core.type of=syntax.nominal closed=true` |
| `core.slot` | one key of a type | `@syntax.nominal.head core.slot of=syntax.nominal key=head kind=string required=true` |

The keys of `core.slot` read naturally: `of` the type, `key` the key's name, `kind=string` (the value is a
quoted text) or `kind=ref type=…` (the value points at a wire of that type), `many=true` (the key may repeat),
`required=true present=true` (every wire of the type must have it), `enum=…` (the allowed atoms). `closed=true` on a type
means wires of that type accept only the declared keys.

For example, the `syntax` schema (in this repository, `schemas/syntax/schema.sop`) declares that a nominal must
have exactly one `head` (a word) and may have many `dependent`s (words), and that a clause's `form` is one of
`imperative`, `declarative`, `interrogative`, `fragment`, `nonfinite`.

## 5. Syntax and semantics: the two layers

The project writes two different circuits for the same message, with two different schemas. Here is the
example message in both, as they stand in the dataset:

**Syntactic circuit** (schema `syntax`, this repository; it records how the sentence is built):

```sop
@c1 syntax.clause form=imperative verb="schedule" modifier="tomorrow" complement=$n1
@n1 syntax.nominal dependent="a" head="meeting"
@r1 syntax.relation marker="with" from=$n1 to=$n2
@n2 syntax.nominal head="Ana"
```

**Semantic circuit** (schema `w.request`; it records what is asked, in the application's terms):

```sop
@r1 w.request.request act=make mood=do predicate=schedule
@r1.t w.request.target request=$r1 family=meeting mode=new determiner=indefinite sort=meeting
@r1.c1 w.request.constraint request=$r1 on=attribute attribute=meeting.people value=Ana operator=eq phase=result
@r1.c2 w.request.constraint request=$r1 on=attribute attribute=meeting.day value=tomorrow operator=eq phase=result
```

The difference:

| | Syntactic circuit | Semantic circuit |
| --- | --- | --- |
| Says | "schedule" is the verb; "a meeting" its complement; "with Ana" is tied to the meeting; "tomorrow" modifies the clause | the act is *make*; the target is a new *meeting*; its *people* include Ana; its *day* is tomorrow |
| Values are | the message's own words | names from the application's vocabulary (`make`, `meeting.people`) |
| Needs | only the words | knowledge of what a calendar is and what meetings have |
| Can be checked | mechanically: every word in exactly one place, and the schema's types and keys | only against the application's knowledge |
| Written by | the formalizers of this repository | a later reader (not part of this repository) |

Why first syntax, then meaning: the structure can be found from the words alone, for any application, and
checked by a program; the meaning layer then starts from a reliable structure instead of raw text. This
repository's goal is the syntactic layer only.

## 6. Worlds: where meaning comes from

The meaning layer needs knowledge, which the project keeps in **worlds**, written in SOP Lang (sibling
repository `sop-knowledge-worlds`; the library that runs them is `soplang-words-lib`, called *sopworld*). There
are three kinds (**particular**: the project's own organisation of knowledge):

| Kind | Holds | Example |
| --- | --- | --- |
| world schema (`w.*`) | what a kind of world is: its kinds of things, their attributes, the acts | `w.calendar` (meetings, people, days), `w.request` (the meaning of one request) |
| knowledge world (`k.*`) | facts true for everyone | `k.animals` ("a rabbit is a mammal"), `k.colours` |
| live world | one running instance in a session | the meetings a user has made today |

**The formalizers of this repository use no world at all.** They read the words with general knowledge of
English only; this keeps the syntactic layer independent of any application. (Before 2026-11-27 they wrote a
richer schema, `nlu`, that also used worlds; see [history/nlu-schema-period.md](history/nlu-schema-period.md).)

# Part 3. The syntactic layer

## 7. The grammar you need

All of this is **standard** grammar; the links explain each term.

- A [clause](https://en.wikipedia.org/wiki/Clause) is one verb with what belongs to it: "move the box" is
  one clause; "move the box and make it red" has two.
- The [verb](https://en.wikipedia.org/wiki/Verb) says what is done or what is the case ("move", "is").
  [Auxiliary verbs](https://en.wikipedia.org/wiki/Auxiliary_verb) help it ("can", "do", "was").
  A negation ("not", "never") says no.
- The [subject](https://en.wikipedia.org/wiki/Subject_(grammar)) is who or what the verb is said of ("the
  meeting starts"). A [complement](https://en.wikipedia.org/wiki/Complement_(linguistics)) is another thing the
  verb takes, such as its [object](https://en.wikipedia.org/wiki/Object_(grammar)) ("move **the box**").
- A clause has a type shown by its build: a command ("move it"), a statement ("it moved"), a question ("did
  it move?"). The three are called imperative, declarative and interrogative; the related property of the verb
  is its [mood](https://en.wikipedia.org/wiki/Grammatical_mood) (for example the
  [imperative](https://en.wikipedia.org/wiki/Imperative_mood)). A
  [nonfinite](https://en.wikipedia.org/wiki/Nonfinite_verb) verb form cannot make a sentence by itself ("facing
  left", "to delete").
- A [noun phrase](https://en.wikipedia.org/wiki/Noun_phrase) is the group of words that describe one thing:
  "the two small red boxes". Its main word is the [head](https://en.wikipedia.org/wiki/Head_(linguistics))
  ("boxes"); the other words are its dependents. Universal Dependencies (section 8) uses the word *nominal*
  for a noun phrase or for a pronoun, name or number that stands in its place.
- A [modifier](https://en.wikipedia.org/wiki/Grammatical_modifier) adds to the meaning of a word without being
  required by it, for example how, how much or with what result: "move it **slowly**", "make it **bigger**".
- A [preposition](https://en.wikipedia.org/wiki/Adposition) ties a phrase to something else:
  "next **to** the circle", "the level **of** Intro".
- [Coordination](https://en.wikipedia.org/wiki/Coordination_(linguistics)) puts things side by side with words
  like "and", "or", "but" (the *conjunction*); the things joined are the *conjuncts*.
- [Ellipsis](https://en.wikipedia.org/wiki/Ellipsis_(linguistics)): words are left out because they can be
  recovered from elsewhere. Here it is the case where a part of a sentence borrows a verb said elsewhere ("put
  the lamp left and the chair right": the second part borrows "put").
- [Discourse markers](https://en.wikipedia.org/wiki/Discourse_marker) are words said to the listener rather
  than part of the sentence's build: "please", "thanks", "ok".
- [Function words](https://en.wikipedia.org/wiki/Function_word) are the small closed set of words that build
  the grammar: "the", "a", "to", "of", "and", "if", "it", "can". The others (nouns, adjectives, most verbs) are
  content words. This distinction matters below: the project's rules may name function words, never content
  words.
- Some structure cannot be decided from the words alone. In "put the cat on the table", "on the table" may
  say where to put the cat, or which cat. This is
  [prepositional phrase attachment](https://en.wikipedia.org/wiki/Syntactic_ambiguity) ambiguity, a classic
  hard problem.

## 8. How grammar is usually written down

**Standard.** The most widely used way today is a
[dependency tree](https://en.wikipedia.org/wiki/Dependency_grammar): every word points to the word it depends
on, with a name for the kind of tie ("subject", "object", "determiner"…), called a dependency relation. The
common set of relation names for many languages is
[Universal Dependencies](https://en.wikipedia.org/wiki/Universal_Dependencies) (UD). Large collections of
sentences annotated by hand are called [treebanks](https://en.wikipedia.org/wiki/Treebank); parsers such as
[spaCy](https://en.wikipedia.org/wiki/SpaCy), a widely used NLP library, are trained on them. The older
alternative is the [constituency tree](https://en.wikipedia.org/wiki/Phrase_structure_grammar), which nests
phrases inside phrases. A lighter form, [shallow parsing or chunking](https://en.wikipedia.org/wiki/Shallow_parsing),
only groups words into flat phrases.

These formats are made for linguists and for training parsers. They give one reading per sentence, and they
record distinctions (dozens of relation names) that a program acting on a command rarely needs.

## 9. The syntax schema

This section looks at the syntactic circuit in detail. A second example, "move the blue box next to the red circle":

```sop
@c1 syntax.clause form=imperative verb="move" complement=$n1
@n1 syntax.nominal dependent="the" dependent="blue" head="box"
@n2 syntax.nominal dependent="the" dependent="red" head="circle"
@r1 syntax.relation from=$c1 to=$n2 marker="next to"
```

Read it line by line:

- `@c1` is a **clause**: a command (`form=imperative`) whose verb is "move" and whose complement (the thing
  moved) is the wire `n1`.
- `@n1` is a **nominal**: head "box", with the dependents "the" and "blue".
- `@n2` is the nominal "the red circle".
- `@r1` is a **relation**: the clause is tied to `n2` by the linking word (`marker`) "next to".

The set of wire types and keys is the **`syntax` schema** ([syntax-schema.md](syntax-schema.md)). It has four
wire types and 18 keys (17 names: `negation` serves both clauses and relations):

- `clause`: `form`, `verb`, `auxiliary`, `negation`, `subject`, `complement`, `modifier`, `discourse` (words
  said to the listener), `ellipsis` (the clause whose verb this one borrows);
- `nominal`: `head`, `dependent`;
- `relation`: `from`, `to`, `marker`, `negation`, `attachment`;
- `coordination`: `conjunct`, `conjunction`.

`form` is the clause type of section 7 (`imperative`, `declarative`, `interrogative`), or `nonfinite`, or
`fragment` for a group of words with no verb ("pie radius smaller"). The names are the established terms of
grammar and of UD; section 7 introduced them.

How it relates to the standard formats:

- **Standard parts.** It is a dependency analysis in the style of UD, coarsened to the level of a chunker:
  nominals are flat groups with a head, as in chunking; subject, complement, auxiliary and the markers of
  relations correspond to UD's relations (the schema document has a table, section "How the schema relates to
  the literature").
- **New here**, three choices, each built on a standard idea:
  1. *Every word has exactly one place* in the circuit, as in a dependency tree, but the circuit quotes the
     words as they appear in the message instead of numbering them. A person can read it, and a program
     (`lib/syntax.mjs`) can still check it mechanically against its message, with no annotator needed for
     that part.
  2. *Ambiguity is written, not guessed*: a relation whose start the words do not settle can carry
     `attachment=ambiguous` (it starts at the clause, and may belong to the verb or to a nominal of that
     clause). This applies a known idea,
     [underspecified representations](https://en.wikipedia.org/wiki/Underspecification) from semantics, to the
     output of a parser.
  3. *Several circuits can be right.* Where grammar honestly allows two analyses (which word heads a name such
     as "Room 3"; whether a number after a noun depends on it), the written rules that the judges follow
     (section 11: a language model that checks each circuit) accept both. This changes how quality must be
     measured.
- **What it leaves out on purpose**: everything that needs meaning: who receives, what a pronoun refers to,
  whether a question is really a request. Those belong to the later layer.

# Part 4. The work

## 10. The formalizers

Each formalizer reads a message from a different source of knowledge about English. That is deliberate: when
two formalizers that know English in different ways write the same circuit, this **agreement** is evidence
that the circuit is right (section 11). Five formalizers are measured today. Current scores and speeds are in
[STATUS.md](STATUS.md).

### VSS: the reader built in this project

**What it is.** A reader that learns from raw, unannotated text, in plain JavaScript with no dependencies;
about 0.4 ms per message (median, one CPU core). It is written so that it could run in a browser, but this is
not done yet: loading it still needs Node.js file access. "VSS" is the project's name for it (the repository
does not expand the letters).

**How it works**, in three layers:

1. *Word classes learned without labels* (**standard** technique). Each word gets a fine-grained
   [part-of-speech tag](https://en.wikipedia.org/wiki/Part-of-speech_tagging), here called a **station**
   (determiner, noun, verb that opens its clause, verb after its subject, preposition…; 25 in all). The
   stations are the hidden states of a [hidden Markov model](https://en.wikipedia.org/wiki/Hidden_Markov_model)
   (HMM): a model in which each word is produced by a hidden tag, with probabilities for which tag follows
   which and which word each tag produces. These probabilities are learned from the raw messages by
   [expectation–maximization](https://en.wikipedia.org/wiki/Expectation%E2%80%93maximization_algorithm) (EM:
   start from a guess, tag the text with it, re-estimate from those tags, repeat), in its form for HMMs, the
   [Baum–Welch algorithm](https://en.wikipedia.org/wiki/Baum%E2%80%93Welch_algorithm). A message is then tagged
   with the [Viterbi algorithm](https://en.wikipedia.org/wiki/Viterbi_algorithm), which finds the most likely
   sequence of tags. No annotated sentence is used
   ([unsupervised learning](https://en.wikipedia.org/wiki/Unsupervised_learning)). What is given by hand is
   written in the **legend** (`strategies/vss/legend.sop`): the list of stations, a starting guess of which
   station may follow which, the closed lists of function words and some word endings. A few adjustments to
   plain EM are the project's own; [vss-architecture.html](vss-architecture.html) describes them.
2. *Word habits learned from its own readings*: after tagging the whole dataset, VSS counts, for each word,
   how it behaves where the structure leaves no doubt (how often it is a verb, whether it takes a clause after
   it, which words it stands with), and uses these counts on the next reading. It also keeps word vectors
   built with the operations of
   [vector symbolic architectures](https://en.wikipedia.org/wiki/Hyperdimensional_computing), to compare words.
   Learning from one's own output is a **standard** idea
   ([self-training](https://en.wikipedia.org/wiki/Weak_supervision)); which habits are counted and how they
   feed the rules is **new here**.
3. *General rules of English* that build the circuit from the tags: where a noun phrase ends, which clause a
   relation starts from, what a coordination joins. Hand-written rules over tags are a **standard** approach
   (rule-based chunkers work this way); the rules themselves are **new here**, with one hard constraint set by
   the project owner: a rule may name only function words and a few common verbs, never a noun, an adjective
   or anything particular to the dataset, so that the rules stay true of English in general.

**Particular**: some thresholds of the rules were set on this dataset (for example, a word seen as a thing at
least 20 times); the choice of which constructions to cover followed the frequent faults on it (mostly commands
to a drawing application), and some rules were found by reading the rejected circuits of the benchmark
(section 11); a few borderline words remain in the legend ("left", "right", "today", "tomorrow", "thanks"). VSS
has not been tried on English outside this dataset. The steps planned to make it general are listed in
[../improvements-ideas.md](../improvements-ideas.md), "Making VSS reusable".

Details: [vss-architecture.html](vss-architecture.html) (the full design, every rule, the measurements) and
[strategies/vss.md](strategies/vss.md).

### spaCy

**Standard part**: [spaCy](https://en.wikipedia.org/wiki/SpaCy)'s English dependency parser (its transformer
model `en_core_web_trf`), trained by its authors on large treebanks. **New here**: the layer that turns
spaCy's dependency tree into a circuit, with general repairs for the parser's habits on short commands (for
example, the first word of a command read as a noun, as in "tint the Intro node orange"), and
`attachment=ambiguous` where the parser's alternative parses disagree on where a phrase starts.
**Particular**: the repairs follow the faults seen on this dataset, and were measured partly on the
benchmark's rejected circuits. The most accurate formalizer today; about 65 ms per message on a CPU (median);
needs Python and a 500 MB model. Page: [strategies/spacy.md](strategies/spacy.md).

### DistilBERT

**Standard part**: [DistilBERT](https://en.wikipedia.org/wiki/BERT_(language_model)), a small
[transformer](https://en.wikipedia.org/wiki/Transformer_(deep_learning)) language model pretrained
by its makers on English text, [fine-tuned](https://en.wikipedia.org/wiki/Fine-tuning_(deep_learning)) here
(adjusted on a new task) to predict, for each word, its place in the circuit, and the ties between wires.
**New here**: these targets, and the assembly of a circuit from the predictions; it is fine-tuned only on this
project's circuits (no treebank). **Particular**: its training labels (section 11) are this dataset's, and most
of them come from VSS and spaCy agreeing, so it is not fully independent of them. It is retrained as the labels
grow. Page: [strategies/distilbert.md](strategies/distilbert.md).

### Prolog and Z3 (parked)

Two hand-written symbolic formalizers: a grammar written as rules in
[Prolog](https://en.wikipedia.org/wiki/Prolog), a logic programming language long used for grammars (its
classic notation for them is the [definite clause grammar](https://en.wikipedia.org/wiki/Definite_clause_grammar);
this grammar uses ordinary Prolog rules), and a constraint model solved by the
[Z3 solver](https://en.wikipedia.org/wiki/Z3_Theorem_Prover): the possible analyses are written as logical
constraints, and the solver finds the one that satisfies them best
([satisfiability modulo theories](https://en.wikipedia.org/wiki/Satisfiability_modulo_theories)). Both are
**standard** techniques; the grammars are the project's own. They are measured but not improved for now: the
owner decided to work on VSS, spaCy and DistilBERT and to keep at most one hand-written grammar. Their pages
([prolog.md](strategies/prolog.md), [z3.md](strategies/z3.md)) still describe the earlier version, which wrote
the `nlu` schema, the project's earlier and more detailed format (section 15).

### Formalizers kept but not measured

`spacy-direct`, `spacy-beam`, `neural-dependencies`, `neuro-selector`, `selector-distilbert`, `neuro-prolog`,
`neuro-z3`, `prolog-example-transfer`: each writes nearly the same circuits as one of the five above (most read
the same parse as spaCy or choose among circuits written from it; `prolog-example-transfer` writes what
`prolog` writes), so their agreement with those five would not be independent evidence. The code stays and
still runs by name; their pages in [strategies/](strategies/) mostly describe the earlier `nlu` schema.

## 11. Knowing whether a circuit is right

The usual way to measure a parser is **standard**: compare its output with a hand-annotated gold tree, word by
word ([attachment scores](https://en.wikipedia.org/wiki/Syntactic_parsing_(computational_linguistics)#Evaluation)).
That does not work here, for two reasons: there was no annotated data for this schema, and several circuits can
be right for one message (section 9). The project therefore built its own procedure (**new here** as a whole;
its parts are standard ideas).

In machine learning, a [label](https://en.wikipedia.org/wiki/Labeled_data) is the right answer stored for an
example. Here, a **label** is the accepted circuit stored for a message in the dataset (section 12).

- **A judge reads circuits.** The judge is a
  [large language model](https://en.wikipedia.org/wiki/Large_language_model) instructed with written rules
  ([../tests/benchmark/syntax/rules.md](../tests/benchmark/syntax/rules.md); every case decided once is added
  to them). It does not know which formalizer wrote the circuit. It accepts a circuit, or rejects it with a grade
  and a quoted reason. The grade names the first fault found: L1 a wrong clause (its form or its verb), L2 a
  content word held as a discourse word, L3 words in the wrong wire or a wrong tie, L4 a statement the message
  does not make, L5 a clause not written, L6 something left untied. The rule of thumb: a circuit is accepted
  when it states nothing wrong and loses no information the words give. Using a language model as an evaluator
  is an established practice in recent NLP; writing down every settled case so that judgments stay consistent
  is the project's own discipline. **Not measured yet**: how often two judges, or a judge and a person, agree
  on this schema.
- **A benchmark measured fully.** 1,831 messages drawn
  [at random](https://en.wikipedia.org/wiki/Simple_random_sample) from the whole dataset (1%). Every circuit of
  every formalizer on them is either judged or identical to the message's label, so the score of a formalizer
  is simply the share of messages whose circuit is accepted. The levels: **L8** accepted by a judge; **L9**
  equal to the label the message already had (no judge needed); **L10** accepted and replacing the old label;
  L0 no valid circuit; L1 to L6 rejected, as above (L7 is not used). The project calls the score **GOAL**: the
  share of messages at L8, L9 or L10. The aim is over 99%.
- **Labels by agreement, checked by sampling.** Most labels come from agreement: two formalizers with
  different sources (mostly VSS and spaCy) wrote the same circuit, up to the differences the judges' rules
  allow either way. A judge reads a random 2% of these as a control, in the manner of
  [acceptance sampling](https://en.wikipedia.org/wiki/Acceptance_sampling) in quality control (the project
  calls it the audit); so far under 1% of the audited ones were rejected. The idea that independent views
  confirm each other is standard (compare [co-training](https://en.wikipedia.org/wiki/Co-training) and
  [inter-rater reliability](https://en.wikipedia.org/wiki/Inter-rater_reliability)); using it to label a
  dataset with an audit is the project's procedure.
- **Leakage.** The benchmark messages are kept out of every training on labels (DistilBERT, and the learned
  prototypes in `experiments/`), so that a score is not inflated by having seen the answer
  ([data leakage](https://en.wikipedia.org/wiki/Leakage_(machine_learning))). Two exceptions, stated openly:
  VSS learns its word classes and habits from the raw text of all messages, benchmark included, without any
  label; and some VSS rules and spaCy repairs were found or checked on the benchmark's rejected circuits, so
  their scores on it are likely somewhat higher than on messages nobody has looked at. A fresh sample is
  planned.

Details, commands and pitfalls: [syntax-evaluation-and-conversion.html](syntax-evaluation-and-conversion.html)
and [../tests/benchmark/syntax/README.md](../tests/benchmark/syntax/README.md).

## 12. The data

**Particular.** The messages come from the WebMeet dataset (sibling repository `webmeet-dataset`): about 183,500
English messages to four kinds of application: a calendar, a drawing canvas, a diagram and chart editor, a
document editor. Many are commands; many drawing messages are long scene descriptions ("a small girl on the
right facing the boy, then a dog…"); there are typos and messages made from templates. A formalizer tuned on
these may do worse on other English.

The dataset has two mirrored layers: `semantic/` (the semantic circuits of section 5, which say what was asked) and
`syntactic/` (the circuits of this schema): the same files with the same messages in the same order, at most
1,000 messages per file (a larger source is split into parts). A syntactic file has the columns `text`, `sop`
(the circuit, empty when there is none yet), `source` (which formalizers wrote it, or `judge`) and
`accepted_by` (`agreement`, `judge`, or `written` when a judge wrote it because no formalizer's circuit was
acceptable). How much is filled is shown in [STATUS.md](STATUS.md).

# Part 5. Practical

## 13. Using the library

```js
import {createReader} from 'soplang-nlu'
import {vss} from 'soplang-nlu/strategies/vss'

const reader = await createReader({strategy: vss})
try {
  const {candidates, error} = await reader.propose('move the blue box next to the red circle')
  if (error) console.error(error)
  for (const {sop} of candidates) console.log(sop)
} finally {
  await reader.close()
}
```

This prints the circuit of section 9 (the order of wires and keys may differ). The package is not published
(`"private": true` in package.json): run the code from a file inside a checkout of soplang-nlu, where a module
can import the package by its own name, or install the package from a local path.

The checker of the `syntax` schema is in this package: `lib/syntax.mjs` holds `validateSyntax(text, sop)`, which
checks a circuit against the schema and against its message, and `writeCircuit`, which writes a circuit from
wires and word positions. No other repository is read. (Some formalizers need an outside runtime: spaCy and
DistilBERT need Python, Prolog needs SWI-Prolog.) The reader checks the circuit a formalizer returns and returns
it in `candidates` only when it is valid; otherwise `candidates` is empty and `error` says why.

**Writing another formalizer.** Export `{name, schema: 'syntax', open(configuration)}`. `open` returns an
engine with `analyse(text)` and `close()`. `analyse` returns `{analyses: [{sop}]}` with one circuit, or an
empty array and `error`. Add it to `tests/benchmark/syntax/strategies.mjs` to measure it.

**Measuring speed.** `lib/measure-strategy.mjs` opens one reader, reads messages one after another and records
the time of every message, start-up time, median and 95th-percentile time per message, messages per second,
and total time. Benchmark runs (`tests/benchmark/syntax/run.mjs`) record the time of every message in each
formalizer's output file, and the start-up and median time in `summary.json`.

**Folders.** `lib/` the reader and the schema checker · `schemas/` the schemas (`syntax/` current, `nlu/`
earlier) · `strategies/` one folder per formalizer · `tests/benchmark/syntax/` evaluation and labelling tools ·
`eval-results/` every run with its sample, outputs and verdicts, so each number can be checked again ·
`experiments/` measured prototypes (`syntax-learned/`: two learned methods not adopted) · `docs/status/` the
generator of the status page (`node docs/status/build.mjs`) · `docs/history/` earlier documentation.

## 14. What is new and what is particular: a summary

| Piece | Standard | New here | Particular |
| --- | --- | --- | --- |
| Syntax before meaning | ✓ | | |
| SOP Lang notation, schemas as wires | facts as key–value statements (RDF, Prolog) | | the project's own notation |
| Worlds of knowledge | | | the project's organisation; not used by the formalizers |
| Syntactic circuits | dependency analysis | the format | |
| `syntax` schema | UD, chunking, underspecification | quoted words, several right readings | |
| VSS word classes | HMM, EM, Viterbi | small changes to EM | learned from this text |
| VSS habits, rules | self-training, rule-based chunking | rules naming only function words | some thresholds |
| spaCy | the parser | the circuit writer | repairs from this data |
| DistilBERT | fine-tuning | its targets | trained on this data's labels |
| Prolog, Z3 | ✓ | the grammars | |
| Judging | LLM as evaluator | the rules, levels L0–L10 | settled cases from this data |
| Labels by agreement | co-training, sample audit | the procedure | |
| WebMeet messages | | | ✓ |

## 15. Further reading

| To… | Read |
| --- | --- |
| see where the work stands: scores, speed, what runs now | [STATUS.md](STATUS.md) (same content: [status.html](status.html)) |
| read the schema's exact rules and its decisions | [syntax-schema.md](syntax-schema.md) |
| understand judging, labelling, the benchmark, the commands | [syntax-evaluation-and-conversion.html](syntax-evaluation-and-conversion.html) |
| study VSS in depth | [vss-architecture.html](vss-architecture.html) |
| know why things were decided as they are (2026-11-27) | [syntax-work-2026-11-27.html](syntax-work-2026-11-27.html) |
| follow the plan and the ideas not yet tried | [../improvements-ideas.md](../improvements-ideas.md) |
| see the two learned methods that were tried and set aside | [../experiments/syntax-learned/README.md](../experiments/syntax-learned/README.md) |
| read SOP Lang's full definition | `soplang-words-lib/docs/language.md` (sibling repository) |
| see the knowledge worlds | `sop-knowledge-worlds/README.md` (sibling repository) |
| read about the earlier `nlu` schema period (until 2026-11-26) | [history/nlu-schema-period.md](history/nlu-schema-period.md) |

A reading order for a reviewer: this page, STATUS.md, the schema's "Terms" and "Rules" sections, the
evaluation page, then the VSS architecture.

The HTML pages are self-contained files. GitHub shows HTML from a private repository only as source code: open
them from a local checkout in a browser. STATUS.md holds the same content as status.html and reads well in the
GitHub app on a phone.

## 16. Glossary

| Term | Meaning | Section |
| --- | --- | --- |
| agreement | two formalizers with different sources wrote the same circuit; such a circuit becomes a label, checked by a 2% audit | 11 |
| audit | a judge reads a random 2% of the circuits accepted by agreement | 11 |
| benchmark | 1,831 messages drawn at random (1% of the dataset), on which every circuit of every formalizer is judged | 11 |
| circuit | the set of wires written for one message | 2 |
| clause, nominal, relation, coordination | the four wire types of the `syntax` schema | 9 |
| formalizer (strategy, reader) | a program that reads one message and writes its circuit | 1 |
| GOAL | the score: share of benchmark messages whose circuit is accepted (L8 + L9 + L10) | 11 |
| judge | a language model that accepts or rejects a circuit by written rules | 11 |
| label | the accepted circuit stored for a message in the dataset | 11 |
| L0–L10 | the levels: L0 no valid circuit, L1–L6 rejected (by fault), L8 accepted, L9 equal to the label, L10 accepted and replacing the label | 11 |
| legend | VSS's hand-given file: its stations, function-word lists, word endings | 10 |
| schema | the declaration of which wire types and keys may exist | 4 |
| semantic circuit | a circuit that says what was asked, in the application's terms (`w.request`) | 5 |
| SOP Lang | the project's notation: one fact per wire | 2, 3 |
| station | one of VSS's 25 learned word tags | 10 |
| `syntax` schema | the schema of syntactic circuits: four wire types, 18 keys | 9 |
| wire | one statement of SOP Lang: `@id type key=value …` | 3 |
| world | a body of knowledge in SOP Lang: world schema, knowledge world, live world | 6 |
