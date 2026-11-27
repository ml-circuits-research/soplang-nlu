[Home](../README.md) › How-to guides

# How-to guides

This page: the tasks this section explains step by step, and what every guide assumes. Kind: Explanation.

A [how-to guide](https://diataxis.fr/how-to-guides/) takes one task from start to end. It shows only the command lines the task needs and ends with the task's pitfalls. It does not explain why things are done this way: the ideas are in [Concepts](../concepts/README.md) and [Evaluation and labels](../evaluation/README.md), and the option tables are in [Reference](../reference/README.md). Unfamiliar words are in the [Glossary](../reference/glossary.md).

Four words appear on every page:

- A [formalizer](../formalizers/README.md) is a program that reads one English message and writes its [circuit](../concepts/first-circuit.md): the grammar of the message, written in SOP Lang. The code calls a formalizer a *strategy*.
- A [judge](../evaluation/judging.md) is a language-model agent that accepts or rejects a circuit by written rules.
- A [label](../evaluation/dataset.md) is the accepted circuit of a message, kept in the dataset.

## Before you start

- **Node.js.** Every tool is a Node.js script. The Z3 formalizer's own package asks for Node.js 20 or later (`strategies/z3/package.json`).
- **Two checkouts side by side.** A checkout of `soplang-nlu` with `webmeet-dataset` next to it, in the same parent folder. The tools look for the dataset at `../webmeet-dataset`, counted from the `soplang-nlu` folder.
- **Outside runtimes, for some formalizers.** spaCy needs Python with spaCy, DistilBERT needs Python with PyTorch, Prolog needs SWI-Prolog. hmm-rules needs only Node.js. Z3 needs Node.js and its own npm package, installed with one command. The set-up of each is in [Run a formalizer](run-a-formalizer.md).
- **Code runs inside the checkout.** The package is private (`"private": true` in `package.json`), so a script imports it by its name `soplang-nlu` only from inside the checkout.

## Conventions

- Commands run from the `soplang-nlu` folder. A step that runs in `webmeet-dataset` says so.
- No tool commits anything. The owner asked for a commit after each step ([decision D14](../project/decisions.md#d14)), so every guide says where to commit.
- Words in angle brackets are yours to fill in: `<run>` a new folder under `eval-results/`, `<k>` a packet number (a [packet](../reference/glossary.md) is one file of circuits for one judge), `<tag>` the name of a new file in the [registry](../reference/storage.md) of judge decisions, `<model>` the name of the judge's model, `<scratch>` any folder outside the repository.
- Tests and tools run with the environment variable `SOP_KNOWLEDGE_DIR` unset: no formalizer of the syntax schema reads the knowledge repository ([decision D4](../project/decisions.md#d4)).
- A guide shows command lines. Every option of a tool is listed in [Reference](../reference/README.md).

## Using the formalizers

- [Run a formalizer](run-a-formalizer.md): set one up, then read one message or a whole sample.
- [Run the tests](run-tests.md): run the package's tests, and know what each key test file checks.

## Measuring and judging

- [Run the benchmark](run-benchmark.md): run the formalizers on the benchmark sample, send their circuits to judges, publish, read the table.
- [Judge a packet](judge-a-packet.md): judge one packet of circuits and pass the format check.
- [Refresh the status page](refresh-status.md): rebuild the generated status page after a measurement, and check the documentation.

## Converting the dataset

- [Convert in batch](batch-conversion.md): fill the empty cells of the syntactic files across many files at once. This is the current route.
- [Run a conversion round](conversion-round.md): convert a set of files with the round tool, and use its rewrite step for messages no formalizer got right.

## Improving formalizers

- [Find faults](find-faults.md): find faults in judged rejections, compare circuits before and after a change, send the changed ones to judges.
- [Add a rule to hmm-rules](add-hmm-rules-rule.md): add a general rule of English to hmm-rules.
- [Add a spaCy repair](add-spacy-repair.md): add a general repair to the spaCy formalizer.
- [Retrain hmm-rules](retrain-hmm-rules.md): train the hmm-rules model again after a change to its legend or its training code.
- [Retrain DistilBERT](retrain-distilbert.md): train DistilBERT again on the current labels, with the benchmark held out.
- [Write a formalizer](write-a-formalizer.md): write a new formalizer that the reader accepts and the benchmark can measure.

## A typical cycle

Most work on a formalizer follows the same loop. Each step is one guide:

1. [Find faults](find-faults.md) in circuits that judges rejected.
2. Change the formalizer: [a rule of hmm-rules](add-hmm-rules-rule.md) or [a spaCy repair](add-spacy-repair.md).
3. [Retrain hmm-rules](retrain-hmm-rules.md), only when the change needs it.
4. [Run the tests](run-tests.md), and compare the circuits before and after the change.
5. Run the formalizer on the benchmark again and have the changed circuits judged ([Run the benchmark](run-benchmark.md), [Judge a packet](judge-a-packet.md)).
6. Record the result and [refresh the status page](refresh-status.md).
7. Commit.

A measurement repeated on the same benchmark after rules were drawn from its rejections is not an independent measure: see [Limits of the measurements](../evaluation/validity.md).

Next: [Run a formalizer](run-a-formalizer.md) · Up: [Home](../README.md)
