# strict-vss: a message as a constellation of constellations

Status: design, 2026-11-27. Nothing is trained yet. This replaces the flat design (one vector for
the whole message), which is kept unchanged in `DESIGN-flat.md`; its first measurements stay in
`m0/`. The measurements quoted here were made for this design; the scripts and their outputs are
in `hierarchy-checks/`.

## The owner's direction

> "ideea nu e să pui tot textul într-o singură reprezentare, ci să faci reprezentări de
> reprezentări, cum e și graful unui circuit SOP Lang, acolo e focusul, să învețe cum se pun
> stelele în spațiu, cum să le miște ca să se formeze constelație de constelații."

The idea is not to put the whole text into one representation, but to build representations of
representations, like the graph of a SOP Lang circuit. That is the focus: learn how the stars are
placed in the space and how to move them so that a constellation of constellations forms.

## In short

- **One constellation per wire.** Every wire of the circuit (clause, nominal, relation,
  coordination) is a constellation of its own few terms: its words, each bound to the named star of
  the key it fills, and the stars of the wires it holds. In 81,867 of the 81,870 labels outside the
  benchmark no wire has more than 12 terms (the largest has 24), whatever the length of the message.
- **Condensing.** A finished constellation is condensed into one star (a reduced description in the
  sense of Hinton 1990, a chunk in the sense of Plate 2003) and that star is placed in the
  constellation that holds the wire. The message star holds the top wires. Long messages make
  deeper or wider trees; no vector grows. The atlas (the book's store of constellations, Plate's
  clean-up memory) keeps every condensed star of the message so that it can be expanded again.
- **Measured, with the label's grouping given and nothing learned** (`hierarchy-checks/m1probe.py`,
  7,705 labels including all 1,440 of 25 words or more): the whole circuit is read back from the
  message star and the atlas exactly for 99.30% of the messages at D = 256 and 99.99% at D = 512
  and at D = 1024 (threshold 6σ, section 9); of the 427 messages of 40 words or more, 427 and 426 come back at
  D = 512 and 1024. The flat chart of `DESIGN-flat.md`, with its answers given in the same way, read
  63.1%, 83.0% and 96.0% at D = 256, 512 and 1024, and none of the 427 at D = 512. Without the atlas
  only 19% come back at D = 1024: the clean-up memory is what makes representations of
  representations work.
- **Splitting the text into wires is learned.** The pilot walks the words. At each word it chooses
  moves on stars: open a new constellation (an opener), place the word at a key, close and condense
  a constellation, hold a constellation aside until its opener comes and let the opener claim it,
  open a coordination that takes the previous constellation as its first conjunct, reopen a closed
  star to add a late part, refer to a star already placed elsewhere. Every choice is a cleanup of
  the probe's view against learned prototypes. A static oracle derives these moves from 99.87% of
  the labels, and the moves, executed without the label, write back the identical circuit.
- **Learning.** The legend (named stars, keys, positions) is fixed, as the book says ("declared,
  not learned"). The route book is learned: a memory of word kinds, a memory of moves and pointer
  stars, about 0.4 M phases (0.9 M with an optional situation memory). Training uses deep
  supervision: every node of the label's tree gives a target constellation and the moves that build
  it.
- **Reading out.** The tree of constellations is explicit, so each constellation becomes one wire.
  With the spans the pilot knows, `writeCircuit` gives back 100% of the labels.

## 1. The book's words and the field's words

The book is "Meaning as a Path" (digest: `…/scratchpad/strict-vss/book-digest.md`); the original
code is `vsa-semantic-space` (studied in the workflow journal, label `study:original`).

| The book | Vector symbolic architectures and grammar | In this design |
| --- | --- | --- |
| sky, dial | the space of D complex phasors; one component | FHRR, D = 1024 (512 is enough in M1) |
| word star `f[w]` | atomic hypervector of a word (item vector) | fixed, from the form and its letter trigrams |
| named star `R[r]`, legend | role vector, role codebook | one fixed star per key of the schema (`head`, `verb`, `to`, …) and per type |
| key, shift / inverse key | binding `⊗` / unbinding with the conjugate | a word or a star placed at a key and a relative position |
| constellation, chart | bundle (superposition), the state | one per wire, a few terms |
| (new) condensing | reduced description (Hinton 1990), chunk (Plate 2003) | `c(X) = ρ_c(phase(C_X))` |
| atlas | item memory, clean-up memory | every condensed star of this message |
| level, reported origin | nesting by a power of `R_reported` | a new constellation with its own origin; nesting by condensing |
| domain | the region `{R[r] ⊗ f[w]}` of one role | the keys a wire type has in the schema |
| probe, pilot | the reader's current position; the encoder | the pilot walks the words with a stack of open constellations |
| route book | learned code vectors | kind memory, move memory, pointer stars |
| gate, opener | learned number per category: does the word open a frame? | the choice open / place / close at each word |
| beacon | an expectation placed by a word, taken by a later one | an open constellation's expected keys, erased when filled |
| held aside | a word kept off the chart until a beacon for its kind appears | a constellation kept aside until its opener comes; the opener claims it |
| three drawings that vote | redundant placements | the probe's view holds the current, the parent and the held constellations |
| scanner, cleanup | nearest item after unbinding | nearest item of a codebook |
| margin | best minus second best | where `attachment=ambiguous` and the confidence come from |
| remainder | residual `‖S − Ŝ‖ / ‖S‖` | the belief that the chosen reading leaves out, per constellation |

## 2. The circuit as a tree of wires

A circuit is a graph: a wire refers to other wires by `$id`. To build constellations of
constellations every wire needs one parent, the wire whose constellation holds its star.

| Reference in the circuit | Parent in the tree |
| --- | --- |
| `subject`, `complement` of a clause; `to` of a relation; `conjunct` of a coordination | the wire that refers |
| `from` of a relation | the relation is held by its `from` wire (the clause or the nominal it starts at) |
| a coordination of relations | held by the common `from` of its relations (true for all 158) |
| a second reference to an already held wire, `ellipsis` | re-entrance: the second key refers to the star without holding it |

In 4,242 labels some wire is referred to twice: a nominal that is the complement of one clause and
the subject of the next ("Let us put Review …", 4,212 wires), two coordinations sharing a conjunct
(27), a clause that is both the `to` of a relation and a conjunct (5). `ellipsis` refers in 55 more.
The wire that opens first holds; the later reference points (re-entrance, as in feature structures).

**What the labels look like as trees** (`hierarchy-checks/holding.mjs`, 81,870 labels):

| Measure | Distribution |
| --- | --- |
| top wires (held by the message) | 1: 89.0%, 2: 10.9% (two sentences: "Hey, book …", "… That would help."), 3 or more: 52 |
| depth of the tree (wires on the longest path) | 1: 0.3%, 2: 26.6%, 3: 20.0%, 4: 21.4%, 5: 13.1%, 6: 10.7%, 7: 4.2%, 8: 3.0%, 9 or more: 0.8% |
| terms of a nominal (type term + words + held stars) | 2–5: 96.6%, at most 8: 99.99%, largest 24 |
| terms of a clause | at most 8: 99.8%, largest 12 |
| terms of a relation / a coordination | at most 6 / at most 10 |
| largest constellation of a message | at most 8: 99.60%, at most 12: 99.996% |

The flat design had to hold 21–60 terms in one vector for 24% of the messages and over 60 for 423.
Here the number of terms per constellation does not depend on the length of the message.

**Constructions checked against real labels** (every label outside the benchmark goes through the
tree, the moves of section 4 and back; examples from the labels):

| Construction | Example | Fits as |
| --- | --- | --- |
| relation from a clause to a nominal | put Review **on the Work 6 calendar** | relation held by the clause, nominal at `to` |
| relation from a nominal | the title **of Weekly review** | relation held by the nominal |
| relation to a clause, no marker | a room **called Board Room 2** | nominal holds the relation, the nonfinite clause at `to` |
| relation to a clause with "to" | I need you **to put Review …** | clause holds the relation, nonfinite clause at `to` |
| subordinate clause before its main clause | **if Grace isn't in the people list yet**, add her please | the relation is held aside until "add" opens the main clause and claims it |
| possessive | can you make **the man's** glasses yellow | the relation "'s" (to "the man") is held aside until "glasses" opens the nominal that claims it |
| relation before a verbless fragment | **near the tent**: a big yellow balloon | the relation is held aside; at the end the fragment wraps the nominal and claims the relation |
| relation to a coordination | a meeting with **Ana and Lee** | the coordination takes "Ana" from `to` and stands there |
| coordination of relations | to Quarterly plan **and** on Monday | the coordination takes the relation "to …" from the clause and stands at its place |
| ellipsis | set the label … to Review and **the location to second floor** | the fragment refers to the first clause's star at `ellipsis` |
| fragments | **Hey**, book …; a fireplace; pie radius smaller | a fragment clause opens at its own word, or wraps what was held when its words end |
| nonfinite clauses | a bird **facing left**; **to fix the details**, edit … | clause of form `nonfinite`, usually at the `to` of a relation |
| complement that is also a subject | Let **us** put Review | held by "Let"; "put" refers to the same star at `subject` |
| negation of a relation | at 100, **not** from zero | "not" opens the relation and is placed at its `negation` |
| `attachment=ambiguous` | 5,704 relations | a value star in the relation, learned or decided by the margin |
| several words in one value | `head="Board Room 2"`, `marker="next to"` | each word placed at the same key, adjacent positions; joined when written |

## 3. The representation: levels, condensing, atlas

### 3.1 The space

Fourier holographic reduced representations (FHRR; [Plate 1995](https://doi.org/10.1109/72.377968),
Plate 2003), as in the original: vectors of D complex numbers of modulus 1.
- Binding `x ⊗ y` is the elementwise product; unbinding multiplies by the conjugate.
- Bundling is the sum. `phase(x)` sets every component back to modulus 1 (the normalisation of FHRR,
  like the clipping of MAP vectors, [Gayler 2003](https://arxiv.org/abs/cs/0412059)).
- Similarity `sim(x, y) = Re⟨x, y⟩ / D`. Cleanup: the nearest item of a codebook.
- `ρ_c` is one fixed random permutation of the components (protection, Gayler 2003;
  [Kanerva 2009](https://doi.org/10.1007/s12559-009-9009-8)).
- Positions by fractional power encoding: `Z^d = exp(i·d·φ)`, φ uniform per component;
  `Z^d ⊗ Z^e = Z^(d+e)`, so a whole constellation is shifted by one product
  ([Komer et al. 2019](https://cogsci.mindmodeling.org/2019/papers/0156/index.html);
  [Frady et al. 2021](https://arxiv.org/abs/2109.03429)).
- Default D = 1024. Capacity at one level: a term of a phase-normalised bundle of k terms keeps a
  similarity of about 0.886/√k with the bundle, while unrelated vectors scatter with standard
  deviation 1/√(2D). At D = 1024 and k = 12 that is 0.256 against 0.022 (11 standard deviations);
  at k = 24, 8. The book's "a few dozen terms sit cleanly at about 1000 dials" and the original's
  32 clean terms say the same.

### 3.2 Level 0: word stars (fixed)

    f(w) = phase( h("id:" + w) + (1/√t) Σ_{g ∈ trigrams(#w#)} h("tri:" + g) )

`h(s)` is a phasor vector seeded from sha256 of the string (the original's
`"sop-stars-v1:id:<word>"`). The form keeps every word distinct; the letter trigrams make "boxes"
close to "box" and a misspelling close to its word (letter n-grams as in Joshi, Halseth and
Kanerva 2016). No word list is involved, and an unseen word has a star.

### 3.3 Order inside a wire: relative positions

Every constellation has an **origin** `a_X`: the position of the first word of the wire or of
anything it holds. A word at position p is placed at `Z^(p − a_X)`; a held star with origin `a_Y`
at `Z^(a_Y − a_X)`. This gives the order inside a key ("the two small red boxes"), separates two
occurrences of the same word, and gives back the exact span of every value, which the writer needs.
Since the positions are relative, a wire has the same constellation wherever it stands in the
message.

Measured alternative: without positions (the order of values by a permutation ρ^j and the wires
written in the order of the tree) the writer gives back 98.85% of the labels; with positions 100%
(`hierarchy-checks/holding.out`). Positions are kept.

### 3.4 The constellations, level by level

The schema's whole message, with positions:
`move0 the1 blue2 box3 next4 to5 the6 red7 circle8 and9 make10 it11 bigger12`.

**Level 1, a wire that holds only words** (nominal n1, origin 1):

    C_n1 = R_type ⊗ T_nominal + R_dependent ⊗ Z^0 ⊗ f(the) + R_dependent ⊗ Z^1 ⊗ f(blue) + R_head ⊗ Z^2 ⊗ f(box)

**Level 2, a wire that holds words and condensed stars** (relation r1, origin 4; clause c1, origin 0):

    C_r1 = R_type ⊗ T_relation + R_marker ⊗ Z^0 ⊗ f(next) + R_marker ⊗ Z^1 ⊗ f(to) + R_to ⊗ Z^2 ⊗ c(n2) + R_attachment ⊗ V_ambiguous
    C_c1 = R_type ⊗ T_imperative + R_verb ⊗ Z^0 ⊗ f(move) + R_complement ⊗ Z^1 ⊗ c(n1) + R_rel ⊗ Z^4 ⊗ c(r1)

The relation's `from` is not a term: it is the constellation that holds the relation.

**Level 3, a coordination** (k1, origin 0) and the message:

    C_c2 = R_type ⊗ T_imperative + R_verb ⊗ Z^0 ⊗ f(make) + R_complement ⊗ Z^1 ⊗ c(n3) + R_modifier ⊗ Z^2 ⊗ f(bigger)
    C_k1 = R_type ⊗ T_coordination + R_conjunct ⊗ Z^0 ⊗ c(c1) + R_conjunction ⊗ Z^9 ⊗ f(and) + R_conjunct ⊗ Z^10 ⊗ c(c2)
    C_M  = R_top ⊗ Z^0 ⊗ c(k1)

General form, for a wire X of type t:

    C_X = R_type ⊗ T_t
        + Σ_{own words p, key κ}         R_κ ⊗ Z^(p − a_X) ⊗ f(w_p)
        + Σ_{held wires Y, key κ}        R_κ ⊗ Z^(a_Y − a_X) ⊗ c(Y)
        + Σ_{re-entrant references Y, κ} R_κ ⊗ Z^(a_Y − a_X) ⊗ c(Y)      (offset may be negative)
        + [R_attachment ⊗ V_ambiguous]

- `T_t` is one of 8 fixed type stars: nominal, relation, coordination and clause in its five forms
  (the form is part of the clause's type star, so it costs no extra term).
- The coordination's conjuncts are ordered by their positions, so no `R_next^i` is needed; the
  ordinal powers of the outline remain an ablation.
- Keys a type has (its domain, from the schema): nominal `head`, `dependent`, `rel`; relation
  `marker`, `negation`, `to`; coordination `conjunct`, `conjunction`, `rel`; clause `verb`,
  `auxiliary`, `negation`, `modifier`, `discourse`, `subject`, `complement`, `rel`, `ellipsis`.

### 3.5 Condensing

    c(X) = ρ_c( phase(C_X) )

- `phase` keeps a unit-modulus star; the condensed star is a point of the same sky as a word star,
  so it can be placed in a parent exactly like a word.
- `ρ_c` protects the star: its own terms cannot meet the parent's terms by accident (Gayler 2003).
  Expanding again is `ρ_c⁻¹`: the constellation's terms are read from it by unbinding.
- This is Hinton's reduced description (1990): a pattern of the size of one constituent that stands
  for a whole structure and can be expanded into it. In Plate's terms (2003, chapter 3) it is a
  chunk: noisy when unbound from its parent, made exact again by cleanup against the clean-up memory.
- Learned variant (M2): `c(X) = ρ_c(K_t ⊗ phase(C_X))` with one learned star `K_t` per type: still
  exactly invertible, 4 × D phases. A learned compression like Pollack's RAAM (1990) is not used:
  it loses the exact inverse.

Why condense instead of nesting the sums, as the original `Compiler` did
(`vsa-semantic-space/tool/sop/world.py`: the inner sum is added under its role without
normalisation): there every leaf term ends up in the top vector, bound with the product of the keys
on its path. The message then holds all its terms (21–60 for a quarter of the messages), and products
of keys commute, so two paths with the same keys in another order collide (the book's "a grid, not
a tree"). With condensing each level holds only its own terms, and the path is recovered by one
cleanup per level.

### 3.6 The atlas (item memory of the message)

Every condensed star of the message is kept in the atlas, together with its constellation (so that
a move can edit it exactly). Reading a child: unbind its key and offset from the parent, clean up
over the atlas, and continue from the exact star. Errors do not add up with depth, because each
level is cleaned. Identical wires (two "it" nominals) have identical stars; they are one item, which
loses nothing, since the circuit holds the same words for both.

The atlas grows with the number of wires: what stays fixed is the size of each vector and the number
of terms in each constellation. Any structured representation must grow with the structure; here it
grows by one star per wire.

### 3.7 Two tracks: words and kinds

The constellations above use word stars: they are the targets, the readout and the equivalence.
The pilot's decisions need what kind of word stands where, not which word. Every open constellation
therefore has a second constellation built the same way with the learned kind stars `κ_p`
(section 4.5) instead of `f(w_p)`, and with the condensed kind stars of its children. The book makes
the same split: the chart is written with word identities, the route is learned per category.

## 4. Splitting the text into wires: the pilot and its moves

### 4.1 Tokens and state

The pilot walks the words of `wordsOf(text)`, the punctuation marks between them, and an end
token. Punctuation can trigger closing and opening, but is never placed (the schema covers words
only).

The state at token k:
- the stack of open constellations `[M, X_1, …, X_m]` (the frontier; `X_m` is the current one), each
  with its word constellation, its kind constellation, its link to the wire below (held at a key, or
  held aside) and its list of items held aside;
- the atlas of closed stars;
- the probe at position k.

### 4.2 The moves

| Move | The book | Vector operation | Labels that need it |
| --- | --- | --- | --- |
| **open** a constellation of type t at key κ of the current one | an opener starts a new origin | push an empty constellation with origin k | all |
| **open aside** | held aside: the holder's opener has not come | push; when it closes, its star goes into the held list of the wire below | 25,552 (31%) |
| **claim** | the held item is placed when the beacon for it appears | at an open, a held star is bound at a key of the new constellation and removed from the list | 25,552 |
| **place** a word at key κ | the word's star at the probe's position | `C_X += R_κ ⊗ Z^k ⊗ f(w_k)` (kind track: `κ_k`) | all |
| **close** | the chart ends; the region becomes a point | `c(X) = ρ_c(phase(Z^(−a_X) ⊗ C_X))`, then `C_parent += R_κ ⊗ Z^(a_X) ⊗ c(X)` | all |
| **coordinate** | moving a star | a coordination opens and takes the last closed child (or held item) as conjunct 1: its term is subtracted from the holder and bound again in the coordination; in 279 labels the first conjunct is not the last child and is chosen among the closed children | 15,606 |
| **reopen** a closed star | expanding a condensed star again | the star's constellation comes back from the atlas onto the stack, its term subtracted from its holder; chosen among the closed stars under the open constellations | about 3,000 (3.7%) |
| **refer** at key κ | a pointer into the atlas | `C_X += R_κ ⊗ Z^(a_Y − a_X) ⊗ c(Y)` for a star Y already placed | 4,252 |
| **form**, **ambiguous** at close | a question of the legend answered at the end | the clause's type star, the relation's `attachment` star | all clauses, 5,704 relations |

Building with absolute positions and shifting at close (`Z^(−a_X) ⊗ C_X`) is one product, because
every term holds exactly one power of Z.

"Move the stars" is literal: coordinate, claim and reopen take an exactly known term out of one
constellation and bind it into another. They are the steps by which the constellation of
constellations is rearranged while the words are read.

### 4.3 Does every label fit? The static oracle

`hierarchy-checks/oracle.mjs` derives the moves from each label: a wire opens at its first own word;
a relation at its marker or at the start of its `to`; a coordination at its conjunction or at the
start of its second conjunct; a verbless fragment wraps what was held at the token after its words.
These opening times only describe the labels for training; the pilot learns when to open.
The moves are then executed without the label, the circuit is written with `writeCircuit`, and its
core (`coreOf`) is compared with the label's.

| Result (81,870 labels outside the benchmark) | |
| --- | --- |
| derived, and written back with the identical core | 81,761 (99.87%) |
| a coordination whose first conjunct is buried under other constellations | 52 |
| a clause closed while a constellation is still held aside in it | 44 |
| other (a held wire to reopen, a cycle in the references) | 13 |
| moves per word | 2.33 |
| open constellations at once (with the message) | at most 5 in 70.5%; 10 or more in 447 |

The per-word tree of `DESIGN-flat.md` round-tripped 99.93% with its fix; this tree of constellations
keeps 99.87% and needs no special encoding of coordinated relations.

### 4.4 Held aside, in detail

- "the title is too long": "the title" opens aside in the message; "is" opens the clause, which
  claims the held nominal at `subject`.
- "if Grace isn't in the people list yet, add her please": "if" opens a relation aside; its clause
  is built inside it; "add" opens the main clause, which claims the relation at `rel`.
- "Chapter and its entire contents removed": "Chapter" opens aside; "and" opens a coordination that
  takes it as conjunct 1 and is itself aside; "removed" opens the clause, which claims the
  coordination at `subject`.
- "a fireplace": the nominal is held aside; at the end token a fragment clause opens and claims it.

### 4.5 How a decision is computed from the state

**Kind star of token k** (learned; replaces the book's given categories):

    x_k = phase( Σ_{d=−3..3} λ_d ρ^d(f(w_{k+d}))  +  μ_1 R_first ⊗ f(w_1)  +  μ_2 R_end ⊗ f(last mark) )
    κ_k = Σ_c softmax_c( β · sim(x_k, K_c) ) · K_c                      (C = 256 learned kind stars)

The window terms are permutation-coded context (BEAGLE, [Jones and Mewhort 2007](https://doi.org/10.1037/0033-295X.114.1.1);
Sahlgren, Holst and Kanerva 2008); the kind is a soft cleanup against a learned memory, the same
in training and reading. It looks three words ahead.

**The probe's view** (the query; the open sky seen from position k):

    Ŝ_X = Z^(−k) ⊗ K_X                                         (kind constellation of open X, shifted to the probe)
    q_k = phase( R_w ⊗ κ_k
               + R_cur ⊗ Ŝ_{X_m} + R_cur,w ⊗ κ_k ⊗ Ŝ_{X_m}
               + R_par ⊗ Ŝ_{X_m−1} + R_par,w ⊗ κ_k ⊗ Ŝ_{X_m−1}
               + R_held ⊗ Ĥ + R_held,w ⊗ κ_k ⊗ Ĥ
               + R_last ⊗ L̂ )

- `Ĥ = Σ_items Z^(a_Y − k) ⊗ s(Y)` bundles the items held aside in the current constellation (s is
  a condensed kind star; a held item has no key yet); `L̂ = R_κ ⊗ Z^(a_Y − k) ⊗ s(Y)` is the last
  closed child Y with its key κ and offset.
- The terms bound with `κ_k` hold pairwise features (this word's kind × a placed kind × its key ×
  its offset): the book's relative keys per pair of kinds, in one vector.
- **Beacons.** When a constellation of type t opens, its kind constellation gets
  `Σ_κ b_{t,κ} R_κ ⊗ E` (learned weights b, one fixed star E); when key κ is filled, that term is
  subtracted. An expected key that is still empty is thus present in the state, as the book's
  beacon, and it is erased when taken.

**Moves** are a cleanup of `q_k` against a learned move memory, restricted to the moves the current
type allows (its domain):

    score(m) = (1/β) log Σ_{j=1..P} exp( β · sim(q_k, P_{m,j}) ),   P = 4 prototypes per move

The move memory holds close, coordinate, reopen, 12 opens (type at key, or aside), 9 places (one
per word key) and skip for punctuation. Option (M2): a situation memory first,
`r_k = Σ_i softmax_i(β sim(q_k, M_i)) M_i` with M = 512 learned stars, and moves scored from
`q_k + r_k`: an associative memory step (Kanerva 1988; [Ramsauer et al. 2021](https://arxiv.org/abs/2008.02217))
that gives the decisions more than a linear reading of the view.

**Choices among stars** (which held item to claim, which closed star to reopen or to coordinate,
which star to refer to) are cleanups over the candidates:

    score(Y) = sim( q_k ⊗ G_choice,  s(Y) ⊗ Z^(a_Y − k) ⊗ R_{key of Y} )

with one learned star `G_choice` per kind of choice: the view bound with a learned star is compared
with each candidate at its place.

**Attachment** of a relation is one such choice: among the open constellations of the stack and the
closed nominals of the current clause (a closed one is reopened). This is the decision of Rule 2,
and its margin is where `attachment=ambiguous` comes from.

**Form and ambiguity at close**: cleanup of the closed kind star against 5 form prototypes (P = 4
each) and of the relation's against 2.

**Gates and openers.** The book's gate per category becomes the open / place / close choice above,
read from the state. Beacons, held items and the current constellation are all in the view.

### 4.6 What the pilot cannot do, and the second pass

Reading left to right, a decision cannot use words that come more than three tokens later (the
book's limit: "structure announced afterwards"). Two answers, both in M3:
- a beam of 4 over the moves, ranked by the sum of log scores;
- a re-placement pass after the end token: each closed star is tested against the other possible
  holders (`score(Y)` as above) and moved when another holder fits better by a margin. This is the
  book's "the copies vote", done on stars.

## 5. Learning

### 5.1 What is learned and what is fixed

| Part | Size at D = 1024 | Learned? |
| --- | --- | --- |
| word stars, letter trigrams, key stars, type stars, `V_ambiguous`, Z, permutations, view keys | seeded, not stored | fixed (the legend) |
| kind memory `K_1..K_256` | 262,144 phases | learned |
| context weights λ, μ, temperatures β | about 15 scalars | learned |
| move memory: 25 moves × 4 prototypes | 102,400 phases | learned |
| form, ambiguity and claim-key prototypes: 12 × 4 | 49,152 phases | learned |
| choice stars `G` (attach / reopen, coordinate, claim, refer to subject, refer to ellipsis) | 5,120 phases | learned |
| beacon weights b | about 40 scalars | learned |
| situation memory (option) | 524,288 phases | learned |
| condensing stars `K_t` (option) | 4,096 phases | learned |

Total about 0.42 M phases (1.7 MB as float32), 0.95 M with both options. The original's route
book was 12.6 M phases at 32 categories; the flat design about 0.3 M.

### 5.2 Targets at every node

The label's circuit → its tree of wires → (a) the moves of the static oracle, (b) the target word
constellation `C*_X` and star `c*(X)` of every wire, compiled bottom-up with the same fixed stars, as
the original `Compiler` did, but with condensing.

### 5.3 Losses

    L =  Σ_steps        w · CE(move)
       + Σ_choices      w · CE(choice)                      claim key, claimed item, reopened star, coordinated star, referred star, attachment
       + Σ_closes       w · CE(form or ambiguity)
       + λ_c · Σ_wires  w · (1 − sim(phase(C̃_X), phase(C*_X)))
       + λ_M ·          w · (1 − sim(c̃(M), c*(M)))
       + λ_neg ·        hinge terms from rejected circuits

- `C̃_X` is the word constellation built from the pilot's beliefs: a word is placed with its key
  distribution, `Σ_κ p(κ) R_κ ⊗ Z^(p−a) ⊗ f(w)`; a child star with its key distribution; the type term
  as `Σ_t p(t) T_t`; the held stars are the pilot's own `c̃(Y)`, so a wrong choice deep in the tree
  lowers the similarity at every level above it. This is deep supervision (Lee et al. 2015) with
  the original's own objective, `−cos(S, S*)`, applied at every node, and it weighs a mistake by how
  much it changes the constellation.
- Weights w: judge and written labels ×3, agreement labels ×1. Accepted circuits of the registry
  outside the benchmark (5,110) are used as labels where the dataset has none.
- Rejected circuits outside the benchmark (1,431; 389 messages also have an accepted one): a margin
  between the gold move and the rejected circuit's move at the first step where they part, and a
  hinge `sim(c̃(M), c*_accepted(M)) − sim(c̃(M), c*_rejected(M)) ≥ δ`.
- Benchmark texts are removed (lowercased, spaces collapsed; 1,749 labels), and their registry lines
  are never used.

### 5.4 Training procedure and cost

- **Teacher forcing.** Under the oracle's moves every state is a function of the kind stars and of
  the label's tree, so all views of a batch are built in parallel (scatter-adds of terms); the
  constellation losses are computed bottom-up, one depth level at a time. M3 adds scheduled
  sampling (Bengio et al. 2015): part of the steps continue from the pilot's own moves, with the
  oracle moves recomputed from that state where the label allows. A dynamic oracle for this move set
  is not available; this is stated, not hidden.
- **Splits**, as in the flat design: dev-B = whole CSV files whose stem has sha1 mod 10 = 0 (9,721
  texts, 8.8% with a training text one substitution away), dev-A = sha1 of the text mod 10 = 0 of the
  rest, train = the rest (about 65,000).
- **Optimisation.** Adam, learning rate 0.02 for phases (the original's), 0.005 for scalars; phases
  start uniform; batches grouped by length; early stop on dev-B exact core.
- **Cost.** About 2.4 steps per token, about 1.9 M steps per epoch; one step costs up to a thousand
  products of D = 1024 complex numbers (view, move memory, optional situation memory; the kinds are
  one matrix product per message): a few tens of TFLOP per epoch with the backward pass, minutes on
  the GB10. Reading is sequential: a few ms per message in numpy (`vss` 0.44 ms, distilbert 3.9 ms,
  spaCy 49 ms), in a Python worker on the pattern of `strategies/distilbert/syntax_worker.py`.

## 6. Reading out the circuit

1. **From the tree of constellations** (the strategy). Each closed constellation becomes one wire:
   the type and form from its type star; each placed word at its key, with its position, adjacent
   words of the same `head`, `verb`, `marker` or `conjunction` joined into one value; each held star
   as `$id` at its key; a relation's `from` is its holder (for a coordination of relations, the
   coordination's holder); references as `$id`; `attachment=ambiguous` from the ambiguity choice.
   `writeCircuit` orders the wires (Rule 1) and `validateSyntax` checks them. Given the spans the
   pilot knows, the writer gives back 100% of the labels (`hierarchy-checks/holding.out`).
2. **From the message star** (the check, and the comparison of analyses). The M1 decoder: unbind
   `R_type` and clean up the type; for every reference key and offset, unbind and clean up over the
   atlas, keeping the best star of each slot above a threshold; every word goes to the (constellation,
   key) where its star scores highest, so every word has exactly one place (the schema's Rule 1; the
   original's later decoder did the same over the sentence's words).
3. **Margins and remainder.** Each choice has a margin (best minus second). `attachment=ambiguous` is
   written either from the learned ambiguity star or when the attachment margin between the clause
   and one of its nominals is below τ (fitted on dev-B); both variants are reported. The remainder
   of a constellation is `1 − sim(phase(C̃_X), phase(C_X))` between the beliefs and the chosen
   reading; the message's confidence is its smallest margin and its largest remainder, reported with
   calibration curves. A missing circuit counts as rejected, so neither suppresses a circuit.

## 7. Equivalence of analyses

Two circuits with the same tree of wires give the same message star (the compilation is
deterministic and does not depend on wire names). Two different circuits of the same message give
stars whose similarity falls with how much they differ. On the 389 messages of the registry with an
accepted and a rejected circuit (`hierarchy-checks/equiv.out`, D = 1024):

| Core lines that differ | Messages | Median similarity of the two message stars |
| --- | --- | --- |
| 1–2 | 17 | 0.728 |
| 3–4 | 43 | 0.685 |
| 5–8 | 88 | 0.567 |
| 9 or more | 241 | 0.446 |

Spearman correlation −0.48. The message star is therefore a graded agreement score between two
analyses (in the spirit of tree kernels, Collins and Duffy 2002), usable to compare two strategies'
circuits beyond exact identity. A structure-only star, compiled with one constant star in place of
every word, is equal for two messages whose circuits have the same shape with different words. As
the book says, equivalence "is induced by the shared targets", not labelled on pairs.

## 8. Strictness: what is VSA and what is not

**VSA, inside the reading:**

| Part | How |
| --- | --- |
| word stars | hash phasors of the form and letter trigrams, bundled |
| positions, origins | fractional power encoding, relative to each constellation's origin |
| constellations | binding with named stars and positions, bundling |
| condensing, expanding | phase projection and a fixed permutation, and its inverse |
| atlas | item memory, cleanup |
| kinds | soft cleanup of a permutation-coded context against a learned memory |
| the probe's view | binding, bundling, one shift by `Z^(−k)` |
| moves, forms, ambiguity | cleanup against learned prototypes (and the optional situation memory) |
| choices among stars | similarity of the bound view with each candidate star at its place |
| moving stars | subtraction of a known term, binding into another constellation |
| readout | unbinding, cleanup over the atlas and over the message's words, margins, remainder |

**Not VSA, declared:**

| Part | Note |
| --- | --- |
| tokenisation | `wordsOf`, the contract of all strategies; punctuation marks between words |
| the stack and the atlas as lists | the bookkeeping of which constellations are open and which star is whose; it is the explicit tree the owner asked for |
| the control flow of the pilot | a left-to-right transition system (the book's pilot; in the field, transition-based reading, Nivre 2008); no grammar is written |
| the restriction of moves to a type's keys | the schema's domains |
| the static oracle | derives moves from labels for training only |
| training | gradient descent on cross-entropies over similarities and on similarities of constellations |
| thresholds | child threshold in the read-back (5–6 standard deviations), τ for ambiguity |
| the writer | `writeCircuit`, `validateSyntax`; names no word |

**Not used at all:** no word lists and no rule that names a word (not even function words), no
part-of-speech tagger (the original's `typer.py` is excluded), no parser, no transformer, no
pretrained embeddings, no knowledge worlds, no output of `vss` or spaCy at reading time.

**Said plainly.** With the constellations given (M1), the representation is lossless and carries
no decision: M1 measures the representation only. All decisions are made by the pilot (M2): it is a
learned transition-based reader whose state is a set of constellations, whose decisions are
cleanups, and whose structural steps are moves of stars. That is what the book's pilot is; the
difference from the flat design is that the state is a tree of constellations instead of one
vector, and the structure is built, not superposed. The labels are mostly `vss` + spaCy circuits, so
what is learned first is their convention.

## 9. Measurements made for this design

All in `hierarchy-checks/` (scripts and outputs; the exported trees are regenerable and stay in the
scratch folder).

| Check | Result |
| --- | --- |
| tree of wires, terms per constellation, depth (`holding.mjs`, `holding.out`) | section 2 |
| writer ceiling | with spans 81,870 / 81,870; words only, wires in tree order 80,932 (98.85%) |
| static oracle (`oracle.mjs`, `oracle.out`, `oracle-stats.out`) | 99.87% derived and written back identical; moves per word 2.33 |
| read-back from the message star, atlas (`m1probe.py`, `m1-atlas-*.out`) | below |
| read-back without atlas (`m1-noatlas-*.out`) | D = 1024: 19.0% of 2,000; D = 4096: 31.9% |
| equivalence on judged pairs (`equiv.py`, `equiv.out`) | section 7 |

**Read-back from the message star and the atlas**, labels' grouping given (7,705 messages: all
1,440 of 25 words or more and a random 6,265 shorter; exact = every wire, type, key, reference and
word as in the label):

| D | Threshold | Exact | < 10 words | 10–24 | 25–39 | 40+ |
| --- | --- | --- | --- | --- | --- | --- |
| 128 | 5σ | 73.2% | 3,506 / 3,830 | 1,870 / 2,435 | 248 / 1,013 | 13 / 427 |
| 256 | 5σ | 99.30% | 3,828 / 3,830 | 2,431 / 2,435 | 989 / 1,013 | 403 / 427 |
| 256 | 6σ | 95.52% | 3,819 / 3,830 | 2,385 / 2,435 | 924 / 1,013 | 232 / 427 |
| 512 | 5σ | 99.83% | 3,829 / 3,830 | 2,433 / 2,435 | 1,010 / 1,013 | 420 / 427 |
| 512 | 6σ | 99.99% | 3,830 / 3,830 | 2,434 / 2,435 | 1,013 / 1,013 | 427 / 427 |
| 1024 | 5σ | 99.92% | 3,830 / 3,830 | 2,435 / 2,435 | 1,010 / 1,013 | 424 / 427 |
| 1024 | 6σ | 99.99% | 3,830 / 3,830 | 2,435 / 2,435 | 1,013 / 1,013 | 426 / 427 |
| 2048 | 5σ | 99.79% | 3,830 / 3,830 | 2,434 / 2,435 | 1,006 / 1,013 | 419 / 427 |
| 2048 | 6σ | 100% | 3,830 / 3,830 | 2,435 / 2,435 | 1,013 / 1,013 | 427 / 427 |

σ = 1/√(2D) is the spread of an unrelated similarity. The remaining errors are single spurious
references in long messages: a slot with no star whose best atlas item passes the threshold by
chance. A constellation is tested at about 10⁴ slots and atlas items, so at 5σ a long message meets
one such chance hit at any D (hence D = 2048 is not better at 5σ); at 6σ they are gone at D = 512
and 1024, while at D = 256 6σ is above some true signals. The rule "a star has one holder unless it
is referred to" is the other answer, tested in M1.

For comparison, the flat chart with the right answers given (`m0/RESULTS.txt`, a different sample
of 4,438 with all 1,438 long messages): 63.1% at D = 256, 83.0% at 512, 96.0% at 1024, with 0 of 427
messages of 40+ words at D = 512. The hierarchical read-back uses one more thing than the flat one:
the atlas, one star per wire.

## 10. Milestones

**M1. Representations of representations, structure given** (offline, nothing learned). Partly done
by the checks above.
1. `src/tree.mjs`: the tree of wires, re-entrance, origins; the static oracle with its failure
   counts; the writer from the tree (copied from `hierarchy-checks/`, cleaned).
2. `m1/encode_decode.py`: the read-back of section 6.2 on all 81,870 labels at D ∈ {256, 512, 1024};
   thresholds 5σ and 6σ and the one-holder rule; words-only against positions.
3. Controls: no atlas; the original `Compiler`'s nesting without condensing (one vector with key
   paths) at the same D; ordinal codes `R_next^i` against positions in coordinations; a soft variant
   where each placement keeps a share p of its belief on the right key (p = 0.6, 0.45), to know how
   much belief noise the read-back tolerates before M2.
4. Equivalence: all judged pairs; vss against spaCy circuits on the benchmark texts (similarity of
   message stars against core identity).
5. Expected, stated in advance: at least 99.9% exact at D = 1024 and 99% at D = 512 on all labels;
   oracle at least 99.8%.

**M2. Learned splitting and placement on short messages** (messages of at most 12 words: 63,993 of
the 81,761 derivable labels, 78%).
1. `model.py`: kind memory, view, move memory, choices, beacons, constellation losses; `train.py` with
   teacher forcing; D = 1024; one seed; at most an hour.
2. Reading: greedy, then beam 4; output the tree, the moves, the margins and the remainders as
   JSONL; `decode.mjs` writes circuits with `writeCircuit`.
3. Report on dev-B and dev-A (close and clean texts apart), messages of at most 12 words: accuracy of
   each move type with teacher forcing and free running; exact tree; exact core; by construction
   (held aside, claim, coordinate, reopen, refer, ambiguity); on words unseen in training; the
   constellation similarity per depth; the read-back check from the message star.
4. Ablations: without the situation memory; P = 1 against 4; C = 64 / 256 kinds; window ±1 against
   ±3; without the pairwise terms; without beacons; learned condensing star.
5. Expected, stated in advance: per-move accuracy at least 97% free running; exact core at least 50%
   on dev-B. Decision rules: high teacher-forced and low free-running accuracy → exposure bias (beam,
   scheduled sampling); errors concentrated on unseen words → kinds (more letter features, more kind
   stars); attachment errors dominant → the attachment choice's features; below 30% exact → the
   decisions are too weak (situation memory, more prototypes).

**M3. All messages and the benchmark.**
1. All lengths; scheduled sampling; the re-placement pass; judged weighting, registry labels and
   negatives from rejected circuits.
2. The strategy: `index.mjs` (`{name: 'strict-vss', schema: 'syntax', open(configuration)}`, engine
   with `analyse(text) → {analyses: [{sop}]}` and `close()`), `worker.py`; ms per message, start-up,
   model MB.
3. The benchmark (1,831 messages, `eval-results/2026-11-27-syntax-benchmark-random`), counted with the
   procedure of `experiments/syntax-learned/review/` (a copy writing into the scratch folder, every
   strategy recounted in the same run, verdict-file snapshot recorded): known accepted (by source:
   judged in the run / registry / label), known rejected, unjudged, invalid; the 593 messages with a
   label before the run against the 1,238 without; the clean subset; bounds; at least 60 unjudged
   circuits read by a reviewer against `tests/benchmark/syntax/rules.md` (no judges launched).
4. Expected, stated in advance: known accepted at least the learned transition parser of
   `experiments/syntax-learned` (55.3%; 37.4% on the 1,238), with `vss` (78.6%, recounted) as the bar.
   Whatever the result, it is reported with all counts.

Every milestone reports all counts, speed and size, whatever they are.

## 11. Risks

| Risk | What and the answer |
| --- | --- |
| weak decisions | A similarity with prototypes over a bundled view may not separate moves. Answer: pairwise terms, P prototypes, the situation memory; measured in M2. |
| error propagation | A left-to-right pilot carries early mistakes. Answer: beam, scheduled sampling, re-placement pass. |
| kinds not discovered | The book's limit (categories were given). Here kinds are learned from the labels' moves, from letters and context; measured on unseen words. The original failed on SNIPS through its kinds (0.107 on new slot heads). |
| circular labels | 95% are `vss` + spaCy agreement circuits. Answer: report the 1,238 messages without a prior label and the clean subset; judged weights and negatives. |
| "it is a parser with vector features" | Its control flow is a transition system, said plainly in section 8; the state, decisions and structural steps are VSA, no grammar is written, and the explicit tree is what the owner asked for. |
| similar stars | Stars of the same type share their type term (similarity 0.14–0.2 between two one-word nominals in the probe); cleanup takes the best star of each slot, never all stars above a threshold. Learned condensing star if needed. |
| rare constructions | ellipsis 55, refer at `subject` 4,211, reopen about 3,000 messages, coordination of a buried constellation 279: low recall expected for the rarest; reported apart. |
| atlas size | grows by one star per wire; stated. |
| speed | sequential reading; about 1–3 ms per message expected. |

**Fallback, in order, every step strict:** more prototypes and the situation memory; larger kind
memory; beam and re-placement; negatives from rejected circuits. No word rule, tagger or pretrained
model is added; a variant with any of those needs its own name. If strict-vss stays far below,
it remains a measured research strategy and `vss` stays the production reader.

## 12. Files

| File | Content |
| --- | --- |
| `DESIGN.md` | this design |
| `DESIGN-flat.md` | the earlier flat design, unchanged |
| `m0/` | the flat design's first measurements |
| `hierarchy-checks/` | the checks of section 9: `holding.mjs`, `oracle.mjs`, `oracle-stats.mjs`, `export-trees.mjs`, `holdtree.mjs`, `export-pairs.mjs`, `m1probe.py`, `equiv.py`, `fails.py`, and their outputs |
| `src/tree.mjs`, `m1/` | M1 |
| `model.py`, `train.py`, `decode.mjs` | M2 |
| `index.mjs`, `worker.py`, `eval/count.mjs` | M3 |

Models go to `.local-models/strict-vss/`; exported data to the scratch folder `strict-vss/`. Nothing
outside `strategies/strict-vss/` is edited.

## 13. References

- G. E. Hinton. Mapping part-whole hierarchies into connectionist networks. *Artificial
  Intelligence* 46, 1990 (reduced descriptions).
- T. A. Plate. Holographic reduced representations. *IEEE Transactions on Neural Networks* 6(3), 1995
  ([doi](https://doi.org/10.1109/72.377968)); *Holographic Reduced Representations: Distributed
  Representation for Cognitive Structures*, CSLI, 2003 (FHRR, chunks and clean-up memory, recursive
  structures, similarity of structures).
- P. Smolensky. Tensor product variable binding and the representation of symbolic structures in
  connectionist systems. *Artificial Intelligence* 46, 1990 (role–filler binding; HRR binding is its
  compressed form).
- J. B. Pollack. Recursive distributed representations. *Artificial Intelligence* 46, 1990 (RAAM,
  the learned alternative to condensing, not used).
- P. Kanerva. *Sparse Distributed Memory*, MIT Press, 1988; Hyperdimensional computing, *Cognitive
  Computation* 1(2), 2009 ([doi](https://doi.org/10.1007/s12559-009-9009-8)).
- R. W. Gayler. Vector symbolic architectures answer Jackendoff's challenges for cognitive
  neuroscience, 2003 ([arXiv](https://arxiv.org/abs/cs/0412059)) (MAP, permutation as protection).
- D. Kleyko, D. A. Rachkovskij, E. Osipov, A. Rahimi. A survey on hyperdimensional computing aka
  vector symbolic architectures, Parts I and II. *ACM Computing Surveys*, 2022–2023
  ([I](https://arxiv.org/abs/2111.06077), [II](https://arxiv.org/abs/2112.15424)).
- E. P. Frady, S. J. Kent, B. A. Olshausen, F. T. Sommer. Resonator networks, 1 and 2. *Neural
  Computation* 32(12), 2020 ([arXiv](https://arxiv.org/abs/2007.03748)). Not used: with the tree
  explicit, every factor search is a small exhaustive cleanup.
- E. P. Frady, D. Kleyko, C. J. Kymn, B. A. Olshausen, F. T. Sommer. Computing on functions using
  randomized vector representations, 2021 ([arXiv](https://arxiv.org/abs/2109.03429)); B. Komer,
  T. C. Stewart, A. R. Voelker, C. Eliasmith, A neural representation of continuous space using
  fractional binding, CogSci 2019 (fractional power encoding).
- M. N. Jones, D. J. K. Mewhort. Representing word meaning and order information in a composite
  holographic lexicon. *Psychological Review* 114(1), 2007; M. Sahlgren, A. Holst, P. Kanerva.
  Permutations as a means to encode order in word space. CogSci 2008.
- A. Joshi, J. T. Halseth, P. Kanerva. Language geometry using random indexing. Quantum Interaction
  2016 (letter n-grams).
- H. Ramsauer et al. Hopfield networks is all you need. ICLR 2021 ([arXiv](https://arxiv.org/abs/2008.02217)).
- J. Nivre. Algorithms for deterministic incremental dependency parsing. *Computational Linguistics*
  34(4), 2008 ([ACL Anthology](https://aclanthology.org/J08-4003/)); Y. Goldberg, J. Nivre. A dynamic
  oracle for arc-eager dependency parsing. COLING 2012 (static and dynamic oracles).
- C.-Y. Lee, S. Xie, P. Gallagher, Z. Zhang, Z. Tu. Deeply-supervised nets. AISTATS 2015.
- S. Bengio, O. Vinyals, N. Jaitly, N. Shazeer. Scheduled sampling for sequence prediction with
  recurrent neural networks. NeurIPS 2015.
- M. Collins, N. Duffy. Convolution kernels for natural language. NeurIPS 2002 (similarity of trees).
- The original: `vsa-semantic-space/tool/sop/world.py` (`Compiler`), `tool/sop/infer.py` (readout,
  margin, residual), `experiment/v8_gates.py` (route book, gates, chains).
- The book: "Meaning as a Path" (digest in the scratch folder `strict-vss/book-digest.md`).
