[Home](../README.md) › [How-to guides](README.md) › Add a spaCy repair

# Add a repair to the spaCy formalizer

This page: how to add a general repair to the spaCy formalizer's word classes or clause boundaries, and check it. Kind: How-to guide.

The `spacy` formalizer reads a message through spaCy's English [dependency parser](https://en.wikipedia.org/wiki/Dependency_grammar) and writes a circuit from the parse. The parser is not trained by the project; the project's part is the layer that repairs the parse and writes the circuit ([spaCy: how a circuit is written](../formalizers/spacy-details.md)).

Three words of the parser are used below. A *tag* is the word class the parser gives a word ([part-of-speech tagging](https://en.wikipedia.org/wiki/Part-of-speech_tagging)). An *arc* links a word to the word it depends on. The *beam* gives up to three other parses of the same words, each with its probability ([beam search](https://en.wikipedia.org/wiki/Beam_search)).

## The constraint

- Every repair states a fact of English grammar or spelling and checks it on the parser's own tags and relations, on word order, punctuation, capitals and endings.
- A repair names no noun and no adjective. The words the repairs name are function words ("of", "then", "else", pronouns, determiners) and "left", the past form of the common verb "leave" ([spaCy: how a circuit is written](../formalizers/spacy-details.md)).
- Lists of words with a particular use are learned from the raw text, not written by hand: the describing words by `learn-describing.mjs` (commit `fa4452c`) and the words that open commands by `learn-openers.mjs` (commit `730c906`).

This follows the owner's [decision D5](../project/decisions.md#d5).

## Step 1: find the fault

Find a group of rejections that one statement about English would fix: [Find faults](find-faults.md). The known limits of the spaCy formalizer are listed in [spaCy](../formalizers/spacy.md); some cannot be repaired in this layer, since the parser's beam varies only the arcs, not the tags.

## Step 2: decide where the repair lives

Checked in the code at commit `97a1b83`:

| File | What it holds |
| --- | --- |
| word-repairs.mjs | Corrections of word classes and of arcs the tagger got wrong: `strategies/spacy-direct/word-repairs.mjs`. |
| clause-repairs.mjs | Corrections of clause boundaries: clauses the parser hung on each other are set side by side. `strategies/spacy-direct/clause-repairs.mjs`. |
| syntax-circuit.mjs | The writer: one unit per word, one place for each word in one wire, and the form of each clause. `strategies/neural-dependencies/syntax-circuit.mjs`. |

The beam (falling back on another parse, and marking `attachment=ambiguous`) is in `strategies/spacy-beam/index.mjs`.

## Step 3: refresh a learned list, if it must change

The two learners count over the raw text of the messages, with no label, no annotation and no parse, and write a file that the repairs read:

```sh
node strategies/spacy-direct/learn-describing.mjs
node strategies/spacy-direct/learn-openers.mjs
```

They write `describing-words.mjs` and `command-openers.mjs` beside them; both files say "do not edit". Each learner takes an optional folder of syntactic files as its argument and reads only the text of their messages.

## Step 4: check

1. Run the replayed parses:

   ```sh
   env -u SOP_KNOWLEDGE_DIR node --test tests/spacy-syntax.test.mjs
   ```

   The test file holds parses recorded once from the pretrained parser (spaCy 3.8.16, `en_core_web_trf` 3.8.0), one or more per repair, so it needs neither Python nor the model. The form of a recorded parse is described at the top of the test file; how to record a new one is not documented.
2. Compare the circuits before and after the change on a sample, and read every changed circuit that was accepted before ([Find faults](find-faults.md), steps 3 to 5). The message of commit `fa4452c` reports its checks on cached parses (rejected and accepted benchmark circuits, and 3,000 other messages); the tool that cached the parses is not recorded in the repository.
3. Send the changed circuits to judges ([Find faults](find-faults.md), step 6).

## Step 5: record

- One commit per round of repairs ([decision D14](../project/decisions.md#d14)), with the checks and the rules dropped in the message.
- A line in the journal, [improvements-ideas.md](../../improvements-ideas.md) (to read it on a phone: [The journal, as lists](../status/journal.md)).

## What is standard here

| Piece | Kind |
| --- | --- |
| The parser | Standard: [spaCy](https://en.wikipedia.org/wiki/SpaCy)'s pretrained English pipeline. |
| The circuit writer | New here. |
| The repairs | New here as code; drawn from the faults seen in this dataset. |

## Pitfalls

- **spaCy is slow.** It is the slowest step of every rerun over the whole dataset ([speed and cost per strategy](../STATUS.md#speed-and-cost-per-strategy)). Try a change on a small sample first (`run.mjs --limit`).
- **The repair files are shared.** `spacy` is `spacy-beam` under one name; `spacy-direct` and `spacy-beam` share every repair, and `neural-dependencies` shares the writer. A repair changes the circuits of the retired names too.
- **Others may be changing the same files.** Work runs in parallel ([decision D14](../project/decisions.md#d14)): look at `git status` before editing.

Next: [Retrain hmm-rules](retrain-hmm-rules.md) · Up: [How-to guides](README.md)
