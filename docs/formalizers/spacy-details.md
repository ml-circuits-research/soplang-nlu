[Home](../README.md) › [Formalizers](README.md) › [spaCy](spacy.md) › How a circuit is written

# spaCy: how a circuit is written

This page: the exact facts of the spaCy formalizer: its Python transport, the steps that write a circuit, every repair, the repair rounds by commit, and the tests. Kind: Reference.

**This page describes the code at commit `fa4452c`**, the last commit that changed the writer, the repairs and the word lists (checked at `97a1b83`). Other agents change these files; the header comment of each file states its current rules.

The grammar terms used below (clause, nominal, complement, subordinator, marker, apposition and so on) are explained in [Grammar: the clause](../concepts/grammar-clause.md) and [Grammar: phrases](../concepts/grammar-phrases.md).

## The Python transport

The parser runs in Python; the strategy runs in Node.js. A persistent worker process connects them. It is shared with the retired strategies that read the same parse ([Retired formalizers](retired.md)).

| Item | Fact |
| --- | --- |
| Worker | `strategies/neural-dependencies/worker.py`, started once per reader. One JSON line per message in, one out. |
| Token fields | `i`, `text`, `start` and `end` (offsets in UTF-16 code units, as JavaScript counts), `pos`, `tag`, `lemma`, `dep`, `head` (the index of the head token). |
| Python | `SOP_NLU_SYNTAX_PYTHON`, or the option `python`. Default `python3`. |
| Model | `SOP_NLU_SYNTAX_MODEL`, or the option `model`: a pipeline package name or an installed model folder. Default `en_core_web_sm`. Loading never downloads files. |
| Measured | The measured configuration sets the model to `en_core_web_trf` 3.8.0 (spaCy 3.8). |
| Beam | Beam width 8. At most three distinct parses are kept, each with its score. They reuse the greedy parse's word classes. |
| Other parser | The option `syntaxModel` takes another provider: its `open(options)` returns `parse(text)`, `metadata` and `close()`. The strategy `spacy` also needs `parseBeam(text)`, with at most three alternatives. The adapter checks the token offsets and head indices of every provider. |

The pinned release wheel of the small model `en_core_web_sm` 3.8.0, used in development, has this SHA-256:

```
1932429db727d4bff3deed6b34cfc05df17794f4a52eeb26cf8928f7c1a0fb85
```

## How a circuit is written

1. **Parse** (`neural-dependencies/index.mjs`, `worker.py`): the greedy parse and up to three beam parses, with their probabilities.
2. **Units** (`syntax-circuit.mjs`, `unitsOf`): one unit per word of `wordsOf(text)`. A quotation or a hyphenated compound is one unit.
3. **Word classes** (`spacy-direct/word-repairs.mjs`): corrects a word class or an arc the tagger got wrong (list below).
4. **Clause boundaries** (`spacy-direct/clause-repairs.mjs`): sets side by side the clauses the parser hung on each other (list below).
5. **Wires** (`syntax-circuit.mjs`, `wiresOf`): gives every word one place in one wire, by the relation the parser gave it, and decides the form of each clause.
6. **Beam** (`spacy-beam/index.mjs`): steps 2 to 5 run on every parse. Of the results, the one that leaves the fewest words without a place is kept (the greedy one on a tie). Where beam parses holding at least 0.25 of the beam's total score start the relation of the same marker, in the same clause, at another wire, the relation starts at the clause with `attachment=ambiguous`.

Every repair states a fact of English grammar or spelling. It checks that fact on the parser's own tags and relations, word order, punctuation, capitals and endings. No rule names a noun or an adjective.

## Corrections of word classes

From `word-repairs.mjs`, numbered as in the code:

1. A capitalised base form of a verb, or adjective, inside a sentence that takes nothing a verb takes, is a name: "from Start to Review". So is a capitalised participle where a nominal stands. Hyphenated words form a compound, never a verb with its particle.
2. A command opens with its verb. The first word of a verbless clause, before a determiner, a pronoun or a name, is the verb: "tint the Intro node orange". A word the raw text shows opening commands is the verb before a noun: "plot sales by month". A pair the raw text writes after a determiner stays one nominal.
3. A name or a number right after a noun that brings in a new thing names it: "add a person Hub Core" (schema Rule 5.5). After a known thing ("name the object Findings") both stay complements of the verb.
4. A preposition between two numbers marks a relation: "180 by 90". A preposition that governs an object marks a relation, whatever relation the parser gave it.
5. "of" completes the word right before it: "a boy just left of the woman". "left" before "of" is the direction word, not the verb. A word of motion read as a noun before "left" is the verb: "let the man face left".
6. "me", "us", "him", "them" and the "'s" of "let's" are objects, never subjects.
7. "else" belongs to the pronoun before it: "everything else".
8. In "from now on" the preposition governs "now". A word before ", not" is set against the negated word after it: "small, not big".
9. An adjective the parser made the head of the nouns before it is said of them: "a pipe neck tiny". Describing words learned from the raw text count as adjectives here.
10. A noun the parser made the subject of the next noun forms one nominal with it: "the marker borders should be thicker".
11. A verbless noun hung on a verb as its clause: the noun before it is the object, the last word what the object is made: "make Cake orange".
12. A bare singular noun right after an object says what the object is made: "change a raised eyebrow pink". A numeral opens the nominal of what it counts.
13. A nominal after a comma that brings in a new thing, after another such nominal, is the next item of a list, not an apposition. An item opened by "then" or "next" is the next thing the clause does.
14. An auxiliary agrees with its subject: "do" or "have" opening a sentence before a singular subject is the main verb: "do that swap again". Rule 14b: a word the raw text shows to open no commands, read as a verb at the head of its sentence with nothing after it that a verb takes, is a noun.
15. The auxiliaries are a closed class. Another word the parser made an auxiliary, first in its sentence, is said to the listener: "Please make …".
16. "in" at the head of a command, with no object before it, before a new thing, is a particle: "drop in a navy box".
17. A "to" governing an adverb after a bare noun is the "to" of an infinitive: "turn the man by the house to face left".
18. A participle after a noun describes it: "a diamond labelled Crop cycle".
19. A word the raw text writes far more often after a determiner than after "to", a pronoun or a modal is a noun. Read as a verb after a nominal's nouns, it ends that nominal.
20. A preposition followed by a conjunction governs nothing: it is an adverb of its verb.

## Corrections of clause boundaries

From `clause-repairs.mjs`, numbered as in the code:

0. "so" after a punctuation mark opens the clause right after it, and ties it to the clause before as its result.
1. A base form with no subject and no subordinating word, set off by punctuation, is a command of its own.
2. A clause hung across a semicolon, colon, dash or full stop stands by itself.
3. A finite clause with its own subject, set off by a comma before a command or an inverted question, is a statement of its own.
4. A clause with an auxiliary before its subject is a main question: "quick check — is anything overlapping the house?"
5. An auxiliary after its verb across a comma, with its own subject, is a question tag: "drop in a tree, would you".
6. No comma stands between a subject and its verb: "a small cat on the bench, then make the boat blue".
7. An adverb after a punctuation mark belongs to the clause it opens. "then" opens its clause also with no comma.
8. A question word after a pronoun or "to", opening an inverted question, starts the sentence again.
9. "to" opening a sentence after a word said to the listener ties that word to the infinitive.
10. A noun right after a subordinator, before a base form, is marked by it, and the verb commands.
11. A semicolon, colon or dash ends a clause also for its nominals; so does ", then" after a new thing.
12. A second root opened by ", and" joins the root before it.
13. Joined verbs share their form. A participle joined to a base form says how the command is done.
14. A clause opened by a subordinator or relative word after a punctuation mark depends on the clause before.

## Word lists learned from raw text

Both lists are counted over the text of the dataset's messages only: no label, no annotation, no parse. The only words the counting scripts name are function words.

| List | Fact |
| --- | --- |
| Openers | `learn-openers.mjs` writes `command-openers.mjs` (`730c906`). A word opens commands when, of at least 5 sentences it opens, a determiner or object pronoun follows it in at least half. |
| Describing | `learn-describing.mjs` writes `describing-words.mjs` (`fa4452c`). A word is an adjective when it stands before the noun in at least 9 of 10 uses after a determiner (of at least 5 such uses), has a plural in at most 1 of 20 uses, and stands alone after "it", "them" or "be" at least 3 times. |
| Rerun | `node strategies/spacy-direct/learn-describing.mjs`, and the same for `learn-openers.mjs`, each with an optional folder of syntactic files. |

## The form of a clause

From `syntax-circuit.mjs`:

- An embedded question keeps the order of a statement and is no question: "tell me where Verify is".
- A question word with statement order and no question mark opens a relative clause: "— right where the scene needs it".
- A question mark between a capitalised word and words that go on belongs to a name: "connect Valid? to it".
- A joined verb with "please" before it is a command of its own: "…, so please reset it".
- A bare infinitive that completes a verb is nonfinite also with an auxiliary: "let limousines be parked".
- A word that grades a subordinator modifies the clause: "make it red exactly as I said".
- With no subject, a base form commands ("move it"); a modal or tensed form states ("would love a tree").

## Repair rounds by commit

Each round was checked by rewriting circuits from cached parses, then judged on the benchmark. Results are in [STATUS](../STATUS.md#the-benchmark-live).

### a55e33f: first round

| Item | Fact |
| --- | --- |
| Added | Word repairs 1–10; inverted clauses as questions, tags, embedded questions, "please" before a verb, fronted phrases. |
| Checked | Benchmark: 118 of 320 rejected circuits change (22 now equal a label or accepted circuit); 93 of 1,511 accepted change. |
| Judged | Packets 36–42 (`5c87955`). |

### 0a7bb62: second round

| Item | Fact |
| --- | --- |
| Added | Grading words before markers; verbless nouns hung as clauses; hyphenated names; question words that restart; "then"/"next" fragments sharing a verb; "so" linking clauses; ", not big". |
| Checked | Of 1,590 accepted benchmark circuits 36 change; of 241 rejected 68 change; 3,000 other labelled messages: 17 change. |
| Judged | Packet 47 (`08fc191`). |

### 730c906: third round

| Item | Fact |
| --- | --- |
| Added | Command openers learned from raw text; list items after a comma; stranded prepositions; joined verbs share their form; "blue, not green". |
| Dropped | Tag probabilities; beam alternatives for colour words; list items after a colon or dash. |
| Checked | Of 191 rejected benchmark circuits 51 change; 15 accepted change; 3,000 wide messages: 20 change. |
| Judged | Packet 52 (`730cccc`). |

### fa4452c: fourth round

| Item | Fact |
| --- | --- |
| Added | Describing words learned from raw text; "do"/"have" as main verbs; the closed class of auxiliaries; "drop in"; participle clauses; dependent clauses after a subordinator. |
| Dropped | Openers as nouns on single counts; the noun rule on -s, -ing, -ed forms. |
| Checked | Of 150 rejected benchmark circuits 31 change; 15 accepted change; 3,000 wide messages: 7 change. |
| Judged | Packet 54 (`95cb2a4`). |

## Tests

```sh
env -u SOP_KNOWLEDGE_DIR \
  node --test tests/spacy-syntax.test.mjs
```

The test replays parses recorded once from the parser, so it needs neither Python nor a model. With `SOP_NLU_SYNTAX_PYTHON` and `SOP_NLU_SYNTAX_MODEL` set, its last test also runs the parser.

## Known limits

Still open at `fa4452c`: the beam keeps the greedy word classes; "book design review" stays a noun phrase; "two measures, total sales and total profit" stays an apposition ([spaCy](spacy.md#known-limits)).

Recorded as limits at `a55e33f` and addressed by later rules, whose judged effect is in the packets named above: "plot sales by month" (rule 2 with the openers, `730c906`); "make Cake orange" (rule 11, `0a7bb62`; rule 9 with describing words, `fa4452c`); "drop in a box" (rule 16, `fa4452c`); "two boxes, a circle and a triangle" (rule 13, `730c906`).

## Measurements

The first judged results are in [Results as first measured](../project/first-results.md); the current ones only in [STATUS](../STATUS.md#the-benchmark-live). The old page `docs/strategies/spacy.md` says its new circuits "have not been judged"; that is outdated.

---

Next: [DistilBERT](distilbert.md) · Up: [Formalizers](README.md)
