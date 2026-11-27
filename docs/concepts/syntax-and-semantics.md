[Home](../README.md) › [Concepts](README.md) › Syntax and semantics

# Syntax and semantics: the two layers

This page: the same message in both layers, the syntactic circuit and the semantic circuit, and why
syntax comes first. Kind: Explanation.

## Two circuits for each message

The project writes two different circuits for one message, each with its own schema:

- the **syntactic circuit**, schema `syntax`: how the sentence is built. This repository writes it.
- the **semantic circuit**, schema `w.request`: what the message asks of the application. It is written
  outside this repository.

## One message in both layers

The message "schedule a meeting with Ana tomorrow", as both circuits stand in the WebMeet dataset (file
`calendar/meetings-07.csv` of each layer).

**Syntactic circuit.** Settled by agreement of the formalizers spacy, spacy-direct and hmm-rules:

```sop
@c1 syntax.clause form=imperative verb="schedule" modifier="tomorrow" complement=$n1
@n1 syntax.nominal dependent="a" head="meeting"
@r1 syntax.relation marker="with" from=$n1 to=$n2
@n2 syntax.nominal head="Ana"
```

**Semantic circuit:**

```sop
@r1 w.request.request act=make mood=do predicate=schedule
@r1.t w.request.target request=$r1 family=meeting mode=new determiner=indefinite sort=meeting
@r1.c1 w.request.constraint request=$r1 on=attribute attribute=meeting.people value=Ana operator=eq phase=result
@r1.c2 w.request.constraint request=$r1 on=attribute attribute=meeting.day value=tomorrow operator=eq phase=result
```

## How the two layers differ

### The syntactic circuit

| Aspect | Syntactic circuit |
| --- | --- |
| Says | "schedule" is the verb of a command; "a meeting" is its complement; "with" ties "Ana" to the meeting; "tomorrow" modifies the clause. |
| Values | The message's own words, in quotes. |
| Checked | By a program, from the words alone: every word in exactly one place, and the schema's types and keys. |
| Written by | The formalizers of this repository. |

### The semantic circuit

| Aspect | Semantic circuit |
| --- | --- |
| Says | The act is *make*; the target is a new *meeting*; its *people* include Ana; its *day* is tomorrow. |
| Values | Names from the application's vocabulary: `make`, `meeting.people`, `meeting.day`. |
| Checked | Against the `w.request` schema by the dataset's checker. Whether the meaning is right needs knowledge of the application. |
| Written by | A later reader that knows the application; not part of this repository. |

## Why syntax first

The structure can be found from the words alone, for any application, and a program can check it. The
meaning layer can then start from a checked structure instead of raw text. This repository's goal is the
syntactic layer only: the owner's decision [D4](../project/decisions.md#d4) has every formalizer write
the syntax circuit directly, with no knowledge repository.

## The semantic schema in brief

`w.request` is declared in the sibling repository `sop-knowledge-worlds`, file
`docs/worlds/w.request/schema.sop`. Its main wire types (the full names start with `w.request.`):

| Wire type | What it holds |
| --- | --- |
| `request` | One request of the message: its act (make, change, remove, place …), its mood (do, ask, check, propose) and the verb as said (`predicate`). A message can hold several. |
| `target` | What the request acts on: its family (meeting, drawn, chart, …), whether it is new, existing, or bound (made or named by an earlier request), and its kind. |
| `constraint` | A condition: an attribute such as `meeting.day` with its value, and whether it picks the target or is the result wanted (`phase`). |
| `lookup` | Something the request needs that the text does not say, to be found in the context. |
| `unread` | A content word that no constraint took. |
| `filler` | Words that carry no part of a request: "please", "thank you", hedges. |

Two rules of that schema matter for comparing the layers:

- **No word is dropped silently.** Every content word (a noun, an adjective, a verb …) is the evidence of
  some wire (the request's verb, the words of a target or of a constraint, an unread wire) or is filler.
  Grammar words such as "the" or "with" need no wire of their own: the structure expresses them, for
  example `determiner=indefinite` for "a".
- **A lookup instead of a variable.** A fact cannot hold a variable such as `?x` (see
  [SOP Lang](sop-lang.md#the-values)), so a circuit states what is missing with a lookup wire. The
  application then looks it up in its context: the page, the previous messages, the preferences.

An example from `webmeet-dataset/README.md`, for "please switch to the robot preset", where the text does
not say which face is meant:

```sop
@f1 w.request.filler text=please
@r1 w.request.request act=change mood=do predicate=switch
@r1.t w.request.target request=$r1 family=face mode=existing determiner=definite fill=context
@r1.l1 w.request.lookup request=$r1 target=$r1.t key=thing from=page
@r1.c1 w.request.constraint request=$r1 on=attribute attribute=face.preset value=robot operator=eq phase=result key_words=preset
```

## The two layers in the dataset

The dataset keeps the layers in two mirrored folders, `semantic/` and `syntactic/`: the same files, the
same messages in the same order, only the circuits differ. See
[The WebMeet dataset and its labels](../evaluation/dataset.md).

## Standard, new here, particular

**Standard.** Separating [syntax](https://en.wikipedia.org/wiki/Syntax) (structure) from
[semantics](https://en.wikipedia.org/wiki/Semantics) (meaning).

**New here.** Both layers written as SOP Lang circuits over the same messages, each checked against a
schema written in that same notation.

**Particular.** The vocabulary inside the semantic circuits (families such as `meeting` or `drawn`,
attributes such as `meeting.day`) is that of WebMeet's four areas, although the schema file calls
`w.request` a reusable world.

---

Next: [Worlds of knowledge](worlds.md) · Up: [Concepts](README.md)
