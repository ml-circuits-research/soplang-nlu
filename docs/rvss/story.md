[Home](../README.md) › [rVSS](README.md) › The story

# The story: stars, keys and constellations

This page: how rvss reads a message, told in the words of the book of the original reader (stars, keys, constellations, the route book, the pilot, the atlas), with "move the blue box next to the red circle" built step by step. Kind: Explanation.

The words come from the book ["Meaning as a Path"](https://scriptahub.com/books/meaning/as/a/path/bk-85adcf86fc264f11/en/full_content.html), because the design is written in them. Each one gets its technical name once; the formulas are on [Mechanics](mechanics.md).

## The sky and its stars

- **The sky** is a space of vectors, each a list of about a thousand angles (the book's dials). A **star** is one point of the sky.
- **A word's star** is computed from its letters: from the whole word and from its groups of three letters. It is fixed, never learned. "boxes" lands near "box", and a word never seen before still has a star.
- **A named star** stands for one question of the legend. In rvss the questions are the keys of the [syntax schema](../schema/overview.md): `verb`, `subject`, `complement`, `head`, `dependent`, `marker`, `to`, `conjunct` and the others. They are declared, not learned ([Legend, values and kinds](legend-and-kinds.md)).
- **A key** moves a star to a new place in the sky; the inverse key moves it back. "The word 'box' at the key `head`" is one star: the word's star moved by the named star of `head`. The technical name is [binding](https://en.wikipedia.org/wiki/Hyperdimensional_computing).
- **A constellation** (the book's chart) is the sum of the stars drawn. It is like a hologram: you can test whether a star is in it, but you cannot list what it holds without a list of candidates.

## One constellation per wire

In the book, a whole sentence is one chart, and "the honest range of a chart is a single event". rvss gives every wire of the circuit a constellation of its own. The nominal "the blue box" is a constellation of three stars: "the" at `dependent`, "blue" at `dependent`, "box" at `head`. Each star also carries its position counted from the wire's origin (the position of the first word of the wire or of anything it holds), so the order inside a key is kept and the wire looks the same wherever it stands in the message.

## Condensing, and the atlas

When a wire is finished, its constellation is **condensed** into one star: brought back to the size of a word's star and turned by a fixed shuffle of its angles, so that its inner stars cannot meet the stars of its parent by accident. That star is placed in the parent's constellation at a key, exactly as a word would be. The clause "move the blue box" holds "move" at `verb` and the condensed star of "the blue box" at `complement`.

A copy of every condensed star goes into the **atlas**, tagged with the place where its wire starts. The book's atlas kept recent charts for pronouns; here it is the memory from which every wire can be unfolded again. The message star, the condensed stars and the atlas together are a tree of small constellations shaped like the circuit graph: constellations of constellations.

## The pilot and the route book

The **pilot** walks the words. At every word it asks three questions:

1. Do the open constellations close before this word? It asks from the innermost outwards. These are the **close gates**.
2. Does this word open a new constellation in the one that stays open, and of which type? This is the **open gate**.
3. At which key does the word land? The **route book** answers.

The route book holds learned keys indexed by the **kind** of a word: one set of keys counted from the word that opened the constellation, one per pair of neighbouring kinds, one along the path of the walk, and one backwards for stars held aside. Each gives a guess of the word's place; the guesses vote; the vote is compared with the named stars, and the nearest named star is the key. These are the book's "three drawings", plus the backward one. A kind is what the pilot needs to know: not "this is the word *blue*" but "this is a word like *blue*, after a word like *the*". Kinds are learned from a word's letters and its neighbours ([Legend, values and kinds](legend-and-kinds.md#where-the-word-kinds-come-from)).

## Held aside, and other moves of stars

Sometimes the holder of a star has not opened yet. In "the title is too long", "the title" is finished before "is" opens the clause. The pilot **holds it aside**, and the clause **claims** it as its `subject` when it opens. This is the book's mechanism. rvss adds three more moves: a coordination **gathers** the conjuncts already built when its "and" comes; a closed constellation is **reopened** when a late word belongs to it; a key can **point** at a star placed elsewhere, as when one nominal is the object of one verb and the subject of the next. In each move a known star is taken out of one constellation and put into another.

## The example, step by step

The message "move the blue box next to the red circle", words at positions 0 to 8. Its circuit, as on [The syntax schema in brief](../schema/overview.md#one-message-line-by-line):

```sop
@c1 syntax.clause form=imperative verb="move" complement=$n1
@n1 syntax.nominal dependent="the" dependent="blue" head="box"
@n2 syntax.nominal dependent="the" dependent="red" head="circle"
@r1 syntax.relation from=$c1 to=$n2 marker="next to"
```

| Word | What the pilot does |
| --- | --- |
| move (0) | The open gate fires: a clause opens in the message, starting at 0. "move" lands at `verb`. |
| the (1) | A nominal opens inside the clause, starting at 1. "the" lands at `dependent`, offset 0. |
| blue (2) | Stays in the nominal: `dependent`, offset 1. |
| box (3) | Stays in the nominal: `head`, offset 2. |
| next (4) | The close gate fires for the nominal: it is condensed, kept in the atlas, and its star lands in the clause at `complement`, offset 1. "next" opens a relation in the clause, starting at 4, and lands at `marker`. |
| to (5) | Stays in the relation: `marker`, offset 1. Adjacent words at one key are joined when written: "next to". |
| the (6) | A nominal opens inside the relation, starting at 6: `dependent`. |
| red (7) | `dependent`, offset 1. |
| circle (8) | `head`, offset 2. |
| end | The nominal closes into the relation at `to`, offset 2. The relation closes into the clause at the key `rel` (the schema's `from`, written as holding), offset 4; where it lands (the clause, or "box") is a choice with a margin. The clause closes into the message star. |

The result, as a tree of constellations:

```text
message star
└─ clause c1, imperative, starts at 0
   ├─ verb: move (0)
   ├─ complement: star of n1 (+1)
   │    dependent: the (0), blue (1); head: box (2)
   └─ rel: star of r1 (+4)
        marker: next (0), to (1); to: star of n2 (+2)
          dependent: the (0), red (1); head: circle (2)
```

No constellation here holds more than three stars. In the labels, a wire holds at most 12 terms in 88,101 of 88,106 messages, however long the message ([DESIGN.md](../../strategies/rvss/DESIGN.md), section 4). A longer message makes a deeper or wider tree of small constellations, not a bigger vector.

## Reading top-down

The circuit is not taken from the pilot's notes; it is **read back from the stars**. Start at the message star and ask each named star "who is here?": move the constellation back by that key and compare the result with every word of the message and every star of the atlas. Whatever is clearly closer than chance (a threshold fixed in advance) is accepted. A wire found this way is unfolded from its clean copy in the atlas and read in turn, one level at a time, so errors do not pile up with depth. The pilot's own list of what it built is written beside it as a check, and every disagreement is counted.

## Margin and remainder

- **The margin** of a choice is the best score minus the second best. The book: "The margin is where 'I'm not sure' lives." When the relation's place (the clause or "box") has a small margin, rvss writes `attachment=ambiguous` ([Rule 2](../schema/rules.md#rule-2-ambiguous-attachment)).
- **The remainder** is what a constellation holds that the reading does not explain: rebuild the constellation from what was read and compare it with the one the pilot built. A large remainder marks a doubtful wire. In the book, the direction of the remainder pointed to a question missing from the legend; [Legend, values and kinds](legend-and-kinds.md#what-the-remainder-can-say-about-the-schema) says what that can and cannot mean here.

## What the book did not have

- A chart per wire, instead of one chart per sentence shifted to a new origin for each inner sentence.
- Condensing into one star, with the atlas to unfold it again.
- Moves of stars: claim, gather, reopen, point.
- Kinds learned from letters and neighbours, instead of categories given by a dictionary or a tagger.

---

Next: [Legend, values and kinds](legend-and-kinds.md) · Up: [rVSS](README.md)
