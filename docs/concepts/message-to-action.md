[Home](../README.md) › [Concepts](README.md) › From a message to an action

# From a message to an action

This page: what the project does, the three steps from a typed message to an application's action, which
step this repository does, and what it produces. Kind: Explanation.

## An example

A person types a message into the calendar of an application. Here the application is WebMeet, whose
messages this project works on:

> schedule a meeting with Ana tomorrow

Before the application can act, the message passes through three steps. This repository does the first.

## The three steps

### Step 1. Syntax

| Question | How is the sentence built? |
| --- | --- |
| Who | The **formalizers** of this repository: programs that read a message and write its structure. The code calls them strategies. |
| Result | One command whose verb is "schedule". The thing scheduled is "a meeting". The linking word "with" ties "Ana" to the meeting. "tomorrow" is a modifier of the command (a word that adds to its meaning); that it names a day is left to step 2. |

### Step 2. Semantics

| Question | What is asked, in the terms of the application? |
| --- | --- |
| Who | A later reader that knows the application. It is not part of this repository. |
| Result | Make a new thing of the kind *meeting*; its people include Ana; its day is tomorrow. |

### Step 3. Action

| Question | Do it. |
| --- | --- |
| Who | The application. |
| Result | A meeting appears in the calendar. |

## The rule of step 1: only the words

A formalizer sees one message and nothing else. It uses **only the words of the message**:

- no dictionary of the application's objects;
- no knowledge of calendars, drawings or charts;
- no earlier messages, and no other context.

Whatever needs that knowledge is left to step 2: who receives something, what the result of an act is,
what a pronoun such as "it" refers to, and whether a question is really a request. (Source: the schema's
purpose, [The syntax schema in brief](../schema/overview.md).)

## One notation for both steps

Step 1 and step 2 write their results in the same notation, **SOP Lang**. The result of step 1 for one
message is called a **circuit**. The next page, [SOP Lang: the notation](sop-lang.md), shows how to read
one; [Syntax and semantics](syntax-and-semantics.md) shows the example above written in both steps.

## What this repository produces

- For every message, one **circuit** that records how the sentence is built. A program checks that it
  follows the syntax schema (the list of allowed wire types and keys) and that every word of the message
  stands in it exactly once.
- Several formalizers, each built from a different source of knowledge about English, write circuits for
  the same messages.
- A circuit that is accepted (by a judge, or because formalizers from different sources wrote the same one)
  becomes the **label** of its message in the WebMeet dataset: the stored right answer.
- The aim: a formalizer's circuit is accepted for over 99% of messages.

How circuits are accepted and measured is on
[How circuits are written, judged and measured](making-and-judging.md). The current figures are only on
the status page, [STATUS.md](../STATUS.md).

## Standard, new here, particular

**Standard.** Splitting language understanding into a structural step and a meaning step is the usual way
in [natural language processing](https://en.wikipedia.org/wiki/Natural_language_processing). A
[parser](https://en.wikipedia.org/wiki/Parsing) finds the [syntax](https://en.wikipedia.org/wiki/Syntax)
(the structure); later components find the [semantics](https://en.wikipedia.org/wiki/Semantics) (the
meaning) and the [pragmatics](https://en.wikipedia.org/wiki/Pragmatics) (the meaning in context).

**New here.** The result of the syntactic step is a SOP Lang circuit in which every word of the message
stands in exactly one place, quoted as written.

**Particular.** The messages are those of the WebMeet application, which has four areas: drawing, diagram
(with charts), document and calendar. The dataset calls each area a tab.

Terms on this page: [Glossary](../reference/glossary.md).

---

Next: [SOP Lang: the notation](sop-lang.md) · Up: [Concepts](README.md)
