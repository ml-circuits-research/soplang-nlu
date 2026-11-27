# spaCy

`spacy` is the strategy that reads a message through spaCy's English dependency parser and writes one circuit of the [`syntax` schema](../syntax-schema.md). It reads no knowledge repository.

Three strategies used to do this: `neural-dependencies` wrote the parse as it stands, `spacy-direct` corrected the parse before writing it, and `spacy-beam` added the parser's beam to `spacy-direct`. `spacy-beam` held everything the other two did, so `spacy` is `spacy-beam` under one name. The older names stay registered; `spacy-direct` and `spacy-beam` share every correction below, and `neural-dependencies` shares the rules of the writer.

## Running it

The strategy needs a Python with spaCy 3.8 and an English pipeline with a parser. The measured configuration uses the transformer pipeline `en_core_web_trf` 3.8.0, about 60 ms per message on CPU.

```sh
export SOP_NLU_SYNTAX_PYTHON=/path/to/python
export SOP_NLU_SYNTAX_MODEL=/path/to/en_core_web_trf-3.8.0
```

```js
import {createReader} from 'soplang-nlu'
import {spacy} from './strategies/spacy/index.mjs' // from the root of soplang-nlu

const reader = await createReader({strategy: spacy})
try {
  const result = await reader.propose('book Room 1 for Planning on Friday')
  console.log(result.candidates[0].sop)
} finally {
  await reader.close()
}
```

## How a circuit is written

| Step | Code | What it does |
| --- | --- | --- |
| Parse | `strategies/neural-dependencies/index.mjs`, `worker.py` | The greedy parse and up to three parses of the beam, with their probabilities. Every parse has the same tokens and tags. |
| Units | `strategies/neural-dependencies/syntax-circuit.mjs`, `unitsOf` | One unit per word of `wordsOf(text)`; a quotation or a hyphenated compound is one unit. |
| Word classes | `strategies/spacy-direct/word-repairs.mjs` | Corrects a word class or an arc that the tagger got wrong (below). |
| Clause boundaries | `strategies/spacy-direct/clause-repairs.mjs` | Sets side by side the clauses that the parser hung on each other (below). |
| Wires | `strategies/neural-dependencies/syntax-circuit.mjs`, `wiresOf` | Gives every word one place in one wire by the relation the parser gave it, and decides the form of each clause. |
| Beam | `strategies/spacy-beam/index.mjs` | Falls back on a parse of the beam when the greedy one leaves words without a grammatical place; marks `attachment=ambiguous` where a quarter of the beam's probability starts a phrase elsewhere in the same clause. |

Every correction states a fact of English grammar or spelling and checks it on the parser's own tags and relations, on word order, punctuation, capitals and endings. A rule names no noun and no adjective. The words the rules name are function words ("of", "then", "else", pronouns, determiners) and "left", the past form of the common verb "leave".

### Corrections of word classes (`word-repairs.mjs`)

1. A capitalised base form of a verb, or adjective, inside a sentence that takes nothing a verb takes is a name: "from Start to Review", "make Valid? a rounded rectangle".
2. A command opens with its verb. The first word of a sentence, or of a clause after a comma, with no verb in it, standing before a determiner, a pronoun or a name, is the verb: "tint the Intro node orange", "dissolve Process", "clear everything". A word tagged as a base form of a verb opens a command whatever follows it.
3. A name or a number right after a noun that brings in a new thing names it (Rule 5.5): "add a person Hub Core". After a known thing ("name the object Findings") both stay complements of the verb.
4. A preposition between two numbers marks a relation from the first to the second: "180 by 90".
5. "of" completes the word right before it: "a boy just left of the woman". "left" before "of" is the word of direction, not the participle of "leave".
6. "me", "us", "him", "them" and the "'s" of "let's" are objects, never subjects: "let's go" has "'s" as the complement of "let".
7. "else" belongs to the pronoun before it: "everything else".
8. In "from now on" the preposition governs "now"; "on" grades it.
9. An adjective that the parser made the head of the nouns before it is said of them: "update a pipe neck tiny" has "neck" as head and "tiny" as a modifier of the clause.
10. A noun the parser made the subject of the noun after it forms one nominal with it when that noun is a subject or is followed by its adjective: "the marker borders should be thicker".

### Corrections of clause boundaries (`clause-repairs.mjs`)

1. A base form with no subject, set off by punctuation from the word it is hung on, is a command of its own.
2. A clause hung across a semicolon, colon, dash or full stop stands by itself.
3. A statement with its own subject in front of a command is no complement of it.
4. A clause with an auxiliary before its subject is a question, which only a main clause can be: "quick check — is anything overlapping the house?"
5. An auxiliary after its verb across a comma, with its own subject, is a question tag: "drop in a library, would you".
6. No comma stands between a subject and its verb: in "a small cat on the bench, then make the boat blue" the cat is a group of words of its own and "make" commands.
7. An adverb after a punctuation mark belongs to the clause or the group of words it opens; "then" opens the clause it stands before also with no comma.

### The form of a clause (`syntax-circuit.mjs`)

- An embedded question keeps the order of a statement and is no question: "tell me where Verify is". A question word with the order of a statement and no question mark opens a relative clause also when it stands by itself: "— right where the scene needs it".
- A question mark between a capitalised word and words that go on belongs to a name: "connect Valid? to it" is a command.
- A joined verb with "please" or another word to the listener in front of it is a command of its own: "I would like it back, so please reset it".
- A bare infinitive that completes a verb is nonfinite also with an auxiliary: "let limousines be parked".
- A word that grades a subordinator modifies the clause the relation starts at: "make it red exactly as I said". An adverb set off by a comma before a nominal modifies the clause ("instead, a yellow column"), and "then" before a nominal joins it to what stands before. A prepositional phrase set before a nominal by a comma belongs to the clause ("From now on, data labels on").

## What was measured

On the random 1% sample of the dataset (1,831 messages, `eval-results/2026-11-27-syntax-benchmark-random`), judges accepted 82.5% of the circuits of `spacy` before the corrections of word classes, the question tags, the inverted and comma-subject clause rules and the form rules above were added. Their effect, measured by writing the circuits again from the same parses:

| | Benchmark sample (1,831) | Round 1 (575) |
| --- | ---: | ---: |
| Accepted circuits unchanged | 1,418 of 1,511 | 497 of 514 |
| Accepted circuits changed | 93 | 17 |
| Rejected circuits changed | 118 of 320 | 30 of 61 |
| Changed rejected circuits now equal to the label or judged acceptable | 22 | 14 |

The changed accepted circuits follow forms that labels and judges accept: "'s"/"us" as the complement of "let" (53), embedded questions as declarative clauses (12), "everything else" whole (8), "exactly" in the clause of the subordinator's relation (6). The new circuits have not been judged.

## Known limits

- A first word that can be a noun or a verb, followed by a small-letter noun ("set box Onboarding", "plot sales by month", "book design review"), stays a noun: the parse shows no verb reading, and the beam varies only the arcs, not the tags.
- A colour word after a noun is tagged as a noun and becomes the head ("make Cake orange").
- A particle is read as a preposition ("drop in a box").
- A list item after a comma that the parser sets beside the first as an apposition ("two boxes, a circle and a triangle") stays tied to it; an apposition with a coordination ("two measures, total sales and total profit") has the same parse.

Tests: `env -u SOP_KNOWLEDGE_DIR node --test tests/spacy-syntax.test.mjs` replays recorded parses, one or more per correction.
