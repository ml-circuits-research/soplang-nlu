[Home](../README.md) › [How-to guides](README.md) › Judge a packet

# Judge a packet

This page: how to judge one packet of circuits correctly and pass the format check. Kind: How-to guide.

A judge decides, for each circuit of a packet, whether it is acceptable. In the work of 2026-11-27 the judges were language-model agents. Why the rules are what they are: [Judges and the judging rule](../evaluation/judging.md). Judged examples: [Read judged circuits](../evaluation/judged-examples.md).

## Start a judge

The tools prepare the packets but do not start judges: you hand each packet to one judge, a language-model agent or a person. `judge-prepare.mjs` ends by printing the instruction for a judge:

> A judge reads RULES.md and one packet, writes verdicts-&lt;k&gt;.jsonl beside it, and checks it with: node &lt;folder&gt;/check.mjs &lt;k&gt;

So give each judge the path of the `judging/` folder, the packet number `k`, and that instruction; ask it to run the check until it ends with "The format is right." Give one packet to one judge, and do not tell the judge which formalizer wrote anything (the packet does not say). The repository does not record the exact wording given to the agents on 2026-11-27, or how packets were shared among them.


## What you read

- `RULES.md` in the packet's folder: a copy of [tests/benchmark/syntax/rules.md](../../tests/benchmark/syntax/rules.md). Read it before every packet, and again in the middle of a long one.
- `packet-<k>.jsonl`: one [JSON](https://en.wikipedia.org/wiki/JSON) object per line, `{"n", "text", "sop"}`: the item number, the message, and one circuit in [normal form](../evaluation/normal-form.md). Nothing tells which formalizer wrote the circuit.

Judge each line by itself, by one question from the rules: *can the next layer continue from this circuit by completing it, or must it first undo a wrong statement?* The rules add: "If you cannot quote the words, the circuit is acceptable." Several circuits of one message can be acceptable. Never compare a circuit with the one you would have written.

## What you write

Write `verdicts-<k>.jsonl` in the same folder, one line for every line of the packet (lines copied from the rules):

```json
{"n": 12, "grade": "L8", "note": ""}
{"n": 13, "grade": "L3", "note": "'red' is held as a dependent of 'circle', but the words say 'the red box'"}
```

- `n` is the number of the packet line.
- `grade` is L8 for an acceptable circuit, or the first of L1 to L6 that applies.
- `note` is one sentence. For a rejection it quotes the words of the message in single quotes and names the wrong statement or the lost information. For L8 it may be empty.

The grades L1 to L6, and the order in which to check them, are listed once, in [Levels: Grades](../evaluation/levels.md#grades); the exact criteria are in the section "Grades" of `RULES.md`.

## Check the file

In the packet's folder:

```sh
node check.mjs <k>
```

`node check.mjs` with no number checks every packet of the folder. For each packet it prints the rows, how many are judged, accepted and rejected, how many are still to judge, and every problem. It ends with "The format is right." (exit code 0) or with "The verdict file has problems: correct the lines named above." (exit code 1).

| Problem | Does the line count? |
| --- | --- |
| Not JSON | No. |
| Extra key | Yes, but the problem is reported. |
| Unknown `n` | No: `n` is no line of the packet. |
| `n` twice | The first line counts, the second does not. |
| Bad grade | No: only L8 and L1 to L6. |
| Note not text | No. |
| No quote | No: a rejection must quote words of the message in single quotes. |

A line that does not count leaves its circuit "waiting". Any problem at all, even an extra key, blocks publication: `judge-publish.mjs` and `round.mjs write` publish nothing while a verdict file of the run has a problem.

## How the quote check works

- It looks only at single quote marks: the straight `'` and the curly `‘` and `’`. Double quotes do not count.
- Any two marks form a pair, and an apostrophe counts as a mark.
- It passes when the text between some pair, lower-cased with spaces evened out, occurs in the message and holds a letter or a digit.
- So it shows that the note points at words of the message. It does not show that the note is right.
- When the first line for an `n` fails the check, a second line for the same `n` is not reported as judged twice, and can count.

## When no circuit passes

In a conversion, a message whose circuits were all rejected gets its circuit written by a judge in the role of fixer: [Run a conversion round](conversion-round.md), step 5.

## What is standard here

| Piece | Kind |
| --- | --- |
| LLM judge | Standard idea: a [large language model](https://en.wikipedia.org/wiki/Large_language_model) as evaluator. |
| Rules, grades | New here: the judging question (proposed by an external reviewer and adopted by the owner) and the grades L1 to L8. |
| Settled cases | Particular: the section "Settled cases" of the rules, drawn from this dataset's messages. |

Each circuit is read by one judge; how often two judges agree ([inter-rater reliability](https://en.wikipedia.org/wiki/Inter-rater_reliability)) is not measured ([Limits of the measurements](../evaluation/validity.md)).

Next: [Refresh the status page](refresh-status.md) · Up: [How-to guides](README.md)
