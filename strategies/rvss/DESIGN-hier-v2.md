# strict-vss: a message as a constellation of constellations

Status: design, second revision, 2026-11-27, after a critic's review. Nothing is trained yet.
Earlier versions, kept unchanged:
- `DESIGN-flat.md`: the flat design (one vector for the whole message), which the owner rejected;
- `DESIGN-hier-v1.md`: the first hierarchical draft, the version the critic reviewed.

**Data snapshot.** `webmeet-dataset` commit `0a01d23` (2026-11-27 22:01). It has 88,106 labels
outside the benchmark (benchmark texts compared lowercased, with spaces collapsed). Numbers marked
"(81,870)" come from the state before 22:01. They are measured again on the frozen snapshot in M1.

Scripts and outputs:
- `hierarchy-checks/`: the first draft's checks, on 81,870 labels;
- `revision-checks/`: the critic's scripts and my reruns on `0a01d23`;
- `m0/`: the flat design's measurements.

## The owner's direction

> "ideea nu e să pui tot textul într-o singură reprezentare, ci să faci reprezentări de
> reprezentări, cum e și graful unui circuit SOP Lang, acolo e focusul, să învețe cum se pun
> stelele în spațiu, cum să le miște ca să se formeze constelație de constelații."

In English: the idea is not to put the whole text into one representation, but to build
representations of representations, like the graph of a SOP Lang circuit. That is the focus: learn
how the stars are placed in the space, and how to move them so that a constellation of
constellations forms.

## In short

- **One constellation per wire.** Every wire of the circuit (clause, nominal, relation,
  coordination) is a small constellation of its own terms. The terms are its words, each placed at
  the named star of its key and at its position, and the stars of the wires it holds. The book
  calls a constellation a chart. In 88,101 of the 88,106 labels no wire has more than 12 terms,
  however long the message.
- **Condensing.** A finished constellation is condensed into one star: a reduced description
  (Hinton 1990), or a chunk in Plate's terms (2003). That star is placed in the constellation of the
  wire that holds it, exactly like a word. The message star holds the top wires.
- **The atlas.** The book's store of constellations is, in Plate's terms, a clean-up memory. It
  keeps one condensed star per wire, and that is where the content of the message lives. The message
  star only points at the top wires. Reading the circuit means unfolding the stars one level at a
  time through the atlas.
- **Learning to place stars.** The route book (the learned part) gives every star, whether a word
  or a condensed constellation, two things:
  - which constellation it goes into: the book's gates (open, continue, close, hold aside);
  - where it lands inside that constellation: the book's learned keys, per kind of word and per
    pair of kinds, counted from the constellation's opener.
- **Learning to move stars.** Some moves take an exactly known star out of one constellation and
  bind it into another:
  - claiming a star held aside;
  - a coordination taking the previous star as its first conjunct;
  - a relation whose marker comes after its `to` taking the previous nominal;
  - reopening a closed star.

  These are the steps by which the constellation of constellations is rearranged while the words
  are read.
- **Training.** Training is supervised at every node. The label circuit is compiled bottom-up into
  the target constellation of every wire, as the original `Compiler` does, but with condensing. The
  loss compares each constellation the reader builds with its target. The reader's choice of
  constellation for each star is soft during training, so this comparison also trains the gates.
- **What is not VSA is listed** (section 11): the tokenizer, the reader's loop over the words and
  its list of open constellations, the opening conventions used to derive training moves, the
  writer, the thresholds and the training itself.

## 1. The extension, in the book's words

**What the book does.**
- A sentence is one chart. The probe walks the words. Every word is written at the probe's address,
  which the route book computes from learned keys per kind of word and per pair of kinds.
- Gates (one learned number per kind) say which words open a frame: "to", "from" and "that" open;
  verbs and nouns do not.
- A reported clause moves the whole legend to a new origin by one power of `R_reported`. So nesting
  is a power of one key, but every term still lands in the same single chart.
- That is why the book says "the honest range of a chart is a single event". Long texts would need
  "structures of states" (chapter 12), which the book does not build.
- Training maximises `cos(S, S*)`, where `S*` is the world's constellation built from the answers.

**What the extension adds.**
1. **A chart per wire.** When the gates say a word opens something, a new chart starts, with its own
   origin. This is the book's opener, but it starts a separate chart instead of shifting the same
   one.
2. **Condensing replaces the powers of `R_reported`.** When a chart is finished (a gate closes it),
   it is condensed into one star. The star is placed in the chart below, at a key, like a word.
   Depth costs nothing per chart, because each chart holds only its own few terms.
3. **The atlas holds the condensed charts.** It keeps them so that they can be unfolded when reading
   and reopened when a late word belongs to them.
4. **The route book places every star.** It does so with the book's own codes (path, pair of kinds,
   bigram), counted from the opener of the chart the star goes into.
5. **Stars are moved.** Claim, coordinate, "take as `to`" and reopen move a known star from one
   chart to another. Held aside is the book's mechanism: a word or chart that comes before its
   opener waits as a term marked "aside" until a later opener claims it.
6. **The constellation of constellations** is the message star together with the atlas: a tree of
   charts, each a few terms, linked by condensed stars.

**How the text is split into wires.** Splitting is the gates' work. At each word the reader asks the
open charts, from the innermost outwards, "do you close before this word?". It then asks the chart
that stays, "does this word open a new chart in you?". Both answers are learned from the kinds of
the two words involved and from what the chart already holds and still expects (section 7).

**A walk through one message.** The message is "move the blue box next to the red circle and make
it bigger", with the positions 0–12. Gold circuit:
- a coordination of two imperative clauses;
- the first clause has `verb` "move", a nominal at `complement` and a relation "next to" whose
  `to` is "the red circle";
- the second clause has `verb` "make", the nominal "it" at `complement`, and `modifier` "bigger".

| Word | What happens |
| --- | --- |
| move | a clause chart opens in the message (the gate opens); "move" lands at `verb` |
| the | a nominal chart opens inside the clause; "the" lands at `dependent` |
| blue, box | continue the nominal: `dependent`, `head` |
| next | the nominal closes. Its condensed star lands in the clause at `complement`. "next" opens a relation chart in the clause and lands at `marker` |
| to | continues the relation at `marker` (adjacent words of one key are joined when written) |
| the red circle | a nominal opens inside the relation; it fills `dependent`, `dependent`, `head` |
| and | the nominal closes into the relation at `to`. The relation closes into the clause at `rel` (an attachment choice: the clause or "box"; a small margin gives `attachment=ambiguous`). The clause closes into the message. A coordination opens and takes the clause's star out of the message as its first conjunct; "and" lands at `conjunction` |
| make | a clause opens inside the coordination (`conjunct`); `verb` |
| it, bigger | "it" opens a nominal (`head`); at "bigger" it closes into the clause at `complement`; "bigger" lands at `modifier` |
| end | the clause closes into the coordination; the coordination closes into the message |

## 2. What changed from the flat design and why

- **The flat design.** One vector held the whole message. Every word was placed at a key path and
  all terms were summed together. The argument was about capacity: 21–60 terms in one vector for a
  quarter of the messages, so D had to grow with the text.
- **The owner's direction.** Not one representation for the whole text, but representations of
  representations, shaped like the circuit graph.
- **Now.** There is one constellation per wire, condensed into one star and placed in its parent,
  with the atlas as clean-up memory. Each constellation holds at most about 12 terms whatever the
  length of the message. Long texts make deeper or wider trees of small constellations, not bigger
  vectors.
- **The extra cost.** One atlas star per wire.
- **Kept from the flat design:**
  - word stars from the form plus letter trigrams;
  - the label statistics;
  - the writer (`writeCircuit`, `validateSyntax`);
  - the held-out rules (benchmark texts removed, lowercased, spaces collapsed);
  - the dev splits.

## 3. What changed after the review

Each point of the critic's list, with what this revision does.

| Point | What this revision does |
| --- | --- |
| 1. the book's learned placement | Adopted, and made the main mechanism, not an alternative. A star's place in its constellation comes from the route book: path, bigram and relative keys per pair of kinds, counted from the constellation's opener. It is trained by `−cos` per wire. The first draft's place classifier stays as a control (section 6). |
| 2. open and close as the book's gates | Adopted. A close gate and an open gate. Each is the book's learned number, extended from one kind to a pair of kinds (the chart's opener and the incoming star), plus terms read from the chart's parts. A discrete choice remains only for type, aside, claim, coordinate, take as `to`, reopen and refer (section 7.2). |
| 3. what the constellation loss reaches | Adopted both ways. Each star's constellation is soft during training: the gate products give a probability over the open constellations, so the per-wire loss trains the gates and the attachment choice. A table says what each loss reaches and what it does not. A roll-in with the reader's own moves is added. The message-star loss is dropped (it is depth-biased) (section 8.3). |
| 4. scoring by parts | Adopted. Separate prototypes for each part of the view: word, current constellation, parent, aside, last closed, expected keys. Every part holds at most about 12 terms. There is no 30–70-term bundle (section 7.3). |
| 5. choices bilinear in the two kinds | Adopted. One relative-key table per pair of 32 coarse kinds, shared by all choices, plus one star per kind of choice (section 7.4). |
| 6. smooth distances for decisions | Adopted. Decisions use a band-limited position code (nearby offsets are similar); targets keep the exact code (section 5.1). |
| 7. claims and coordination from any open constellation | Adopted. Measured again on `0a01d23`: oracle coverage goes from 99.70% to 99.92%. |
| 8. arguments in every move, a replay executor | Adopted as M1 step 2. The draft's claim that "the moves, executed without the label, write the identical circuit" is withdrawn until the replay exists. |
| 9. opening conventions as a variable | Adopted. Every convention is listed with the lookahead it needs (section 7.6). There is a new move, "take as `to`", for a marker after its `to`, plus late opening of relations without a marker and coordinations opened at their conjunction. M1 chooses by coverage and lookahead. |
| 10. judged and written failures | Adopted. The 70 failures that remain are broken down by source: agreement 27 / 83,921, judge 36 / 4,153, written 7 / 32. The convention variants of M1 target the 43 judged and written ones. Whatever remains is listed, and what training drops is reported per source. |
| 11. the VSA carries the structure when reading | Adopted, with one exception. Candidates for claim, coordinate, reopen and attach come from unbinding the open constellations and cleaning up against the atlas. The output circuit is read back from the message star through the atlas. The reader's own lists are a check, and every disagreement is counted. The exception: the order of the open constellations stays an explicit list (declared; a vector stack would add noise and learn nothing). |
| 12. M1 | Adopted: all labels; one threshold rule fixed on a dev part; the flat design on the same sample; the no-atlas control on a representative sample; the soft-belief control; a decision-capacity probe with a logistic-regression and a perceptron control on the same states; equivalence per matched wire. |
| 13. bars and roll-in for the learned reader | Adopted (now M3). The bar is the `experiments/syntax-learned` parser retrained on the same split and length cap. Roll-in uses the reader's own moves and stops at the first move that leaves the gold tree. Three seeds. |
| 14. data snapshot | Adopted: `0a01d23`, 88,106 labels. Tree statistics, writer ceilings, oracle and contiguity were measured again; the rest is marked "(81,870)" and redone in M1. |
| 15. corrections to the summary | Adopted. One threshold per table row. "Executed without the label" is withdrawn. "Read back from the message star" becomes "read back through the atlas". The original's route book is 12.6 MB (3.1 M phases), not 12.6 M phases. |
| 16. a bottom-up reader | Adopted as the second reader, compared in M3. It repeatedly merges the best pair of neighbouring constellations (easy-first, Goldberg and Elhadad 2010). It needs no lookahead and no aside list, and for contiguous trees the set of correct merges is known from any state. 8% of labels need one re-placement step (section 7.8). |

Other remarks of the review, also taken:
- The opening conventions and the writer's join rule are now listed as not VSA.
- The beam and the re-placement pass are declared as symbolic search.
- The no-atlas and flat comparisons are marked as using other samples.
- The cost is estimated from bytes moved.
- The benchmark is reported without an expected number as the success line.
- The equivalence measure's bias towards errors near the top is stated (section 10).

## 4. The circuit as a tree of wires

A circuit is a graph: a wire refers to other wires by `$id`. To build constellations of
constellations, every wire needs one parent: the wire whose constellation holds its star.

| Reference | Parent in the tree |
| --- | --- |
| `subject`, `complement`, `to`, `conjunct` | the wire that refers |
| `from` of a relation | the relation is held by its `from` wire; `from` is not a term |
| coordination of relations | held by the common `from` of its relations (165 of 165) |
| second reference, `ellipsis` | re-entrance: the later key points at the star without holding it |

In 4,400 labels a wire is referred to twice:
- a nominal that is the complement of one clause and the subject of the next ("Let us put Review …"):
  4,370;
- two coordinations sharing a conjunct: 27;
- a clause that is both a `to` and a conjunct: 5.

`ellipsis` points in 41 more. The wire that opens first holds; the later reference points
(re-entrance, as in feature structures).

**The labels as trees** (`revision-checks/holding.out`, 88,106 labels):

| Measure | Distribution |
| --- | --- |
| top wires | 1: 89.25%, 2: 10.68% (two sentences), 3 or more: 55 |
| depth | 1: 0.3%, 2: 26.5%, 3: 19.3%, 4: 21.5%, 5: 13.1%, 6: 10.6%, 7: 4.2%, 8: 2.9%, 9 or more: 1.5% |
| nominal terms | 2–5: 96.0%, at most 8: 99.99%, largest 17–24 (2 wires) |
| clause terms | at most 8: 99.67%, largest 13–16 (1 wire) |
| relation, coordination | at most 6; at most 10 |
| largest per message | at most 8 terms: 99.46%; at most 12: 99.994% (5 messages above) |
| contiguous wires | in 91.99% of labels every wire's words form one run; the rest have a relation attached to an outer clause from inside an inner one |

**Constructions that fit** (every label outside the benchmark goes through the tree and the moves;
200 labels were read by the critic):

| Construction | Example, and how it fits |
| --- | --- |
| relation from a clause | put Review **on the Work 6 calendar**: the clause holds the relation, the nominal is at `to` |
| relation from a nominal | the title **of Weekly review**: the nominal holds the relation |
| relation without marker | a room **called Board Room 2**: the nominal holds a relation whose `to` is a nonfinite clause |
| subordinate clause first | **if Grace isn't in the people list yet**, add her: the relation is held aside until "add" opens the main clause and claims it |
| possessive | **the man's** glasses: the marker "'s" follows its `to`; the relation takes "the man" as `to` and waits aside until "glasses" claims it |
| relation before a fragment | **near the tent**: a big yellow balloon: the relation waits aside; at the end a fragment clause wraps the nominal and claims it |
| coordination | Ana **and** Lee; to Quarterly plan **and** on Monday: the coordination takes the previous star as its first conjunct and stands where it stood |
| ellipsis | … and **the location to second floor**: the fragment points at the first clause's star at `ellipsis` |
| shared subject | Let **us** put Review: "Let" holds "us"; "put" points at the same star at `subject` |
| ambiguous attachment | 5,455 messages: a value star `V_ambiguous` in the relation, from the attachment margin or a learned choice |
| multiword values | `head="Board Room 2"`, `marker="next to"`: each word at the same key in adjacent positions, joined when written |

## 5. The representation: levels, condensing, atlas

### 5.1 The space

Fourier holographic reduced representations (FHRR; [Plate 1995](https://doi.org/10.1109/72.377968),
Plate 2003), as in the original: vectors of D complex numbers of modulus 1.
- **Binding** `x ⊗ y` is the elementwise product. Unbinding multiplies by the complex conjugate.
- **Bundling** is the sum. `phase(x)` sets every component back to modulus 1.
- **Similarity** is `sim(x, y) = Re⟨x, y⟩ / D`. Cleanup takes the nearest item of a codebook.
- **Protection.** `ρ_c` is a fixed random permutation (Gayler 2003).
- **Two position codes.** Both use fractional power encoding, `Z^d = exp(i·d·φ)`, so
  `Z^d ⊗ Z^e = Z^(d+e)` ([Komer et al. 2019](https://cogsci.mindmodeling.org/2019/papers/0156/index.html);
  [Frady et al. 2021](https://arxiv.org/abs/2109.03429)).
  - **Exact**, `Z`: φ uniform on (−π, π]. Different offsets are unrelated. Used in the targets and
    the readout, where every span must come back exactly.
  - **Smooth**, `Z_s`: φ normal with σ = 0.5. Then `sim(Z_s^d, Z_s^e) ≈ exp(−(d−e)²/8)`: 0.88 at
    one word apart, 0.61 at two, 0.32 at three, 0.04 at five. Used in every decision, so that a
    decision learned at one distance carries over to nearby distances. σ is an ablation.
- **D = 1024** by default. A term of a phase-normalised bundle of k terms keeps a similarity of
  about 0.886/√k, while unrelated vectors scatter with standard deviation 1/√(2D). At k = 12 that is
  0.256 against 0.022, 11 standard deviations. The book's "a few dozen terms sit cleanly at about
  1000 dials" and the original's 32 clean terms say the same.

### 5.2 Level 0: word stars (fixed)

    f(w) = phase( h("id:" + w) + (1/√t) Σ_{g ∈ trigrams(#w#)} h("tri:" + g) )

- `h(s)` is a phasor vector seeded from sha256 of the string, as in the original's
  `"sop-stars-v1:id:<word>"`.
- The form keeps every word distinct. The letter trigrams make "boxes" close to "box" (Joshi,
  Halseth and Kanerva 2016).
- An unseen word has a star, and no word list is involved.

### 5.3 Order inside a wire

Every constellation X has an **origin** `a_X`: the position of the first word of the wire or of
anything it holds. A star at position p is placed at `Z^(p − a_X)`. This gives:
- the order inside a key ("the two small red boxes");
- two occurrences of the same word kept apart;
- the exact span of every value.

Because positions are relative, a wire has the same constellation wherever it stands in the message.
Without positions, writing the wires in tree order gives back 98.37% of the labels; with positions,
100% (`revision-checks/holding.out`).

### 5.4 The constellations

General form for a wire X. The type of a held wire sits in the holder's term (the variant the critic
measured best at one threshold, section 12):

    C_X =   Σ_{own words p at key κ}        R_κ ⊗ Z^(p − a_X) ⊗ f(w_p)
          + Σ_{held wires Y at key κ}       R_κ ⊗ T_{t(Y)} ⊗ Z^(a_Y − a_X) ⊗ c(Y)
          + Σ_{pointed wires Y at key κ}    R_κ ⊗ T_{t(Y)} ⊗ Z^(a_Y − a_X) ⊗ c(Y)     (offset may be negative)
          + [ R_attachment ⊗ V_ambiguous ]
          + while open: Σ_{stars Y held aside here}  R_aside ⊗ T_{t(Y)} ⊗ Z^(a_Y − a_X) ⊗ c(Y)

    C_M = Σ_{top wires Y} R_top ⊗ T_{t(Y)} ⊗ Z^(a_Y) ⊗ c(Y)          (the message)

- `T_t` is one of 8 fixed type stars: nominal, relation, coordination, and the clause in its five
  forms.
- The keys of each type (its domain, from the schema):
  - nominal: `head`, `dependent`, `rel`;
  - relation: `marker`, `negation`, `to`;
  - coordination: `conjunct`, `conjunction`, `rel`;
  - clause: `verb`, `auxiliary`, `negation`, `modifier`, `discourse`, `subject`, `complement`,
    `rel`, `ellipsis`.
- **Held aside** is a term of the open constellation below the held star, under the named star
  `R_aside`. Claiming it moves the term:

      C_holder −= R_aside ⊗ T ⊗ Z^(a_Y − a_holder) ⊗ c(Y);   C_claimer += R_κ ⊗ T ⊗ Z^(a_Y − a_claimer) ⊗ c(Y)

  No aside term is left in a finished target.

The example of section 1, written out:

    C_n1 = R_dependent ⊗ Z^0 ⊗ f(the) + R_dependent ⊗ Z^1 ⊗ f(blue) + R_head ⊗ Z^2 ⊗ f(box)
    C_r1 = R_marker ⊗ Z^0 ⊗ f(next) + R_marker ⊗ Z^1 ⊗ f(to) + R_to ⊗ T_nominal ⊗ Z^2 ⊗ c(n2) + R_attachment ⊗ V_ambiguous
    C_c1 = R_verb ⊗ Z^0 ⊗ f(move) + R_complement ⊗ T_nominal ⊗ Z^1 ⊗ c(n1) + R_rel ⊗ T_relation ⊗ Z^4 ⊗ c(r1)
    C_k1 = R_conjunct ⊗ T_imperative ⊗ Z^0 ⊗ c(c1) + R_conjunction ⊗ Z^9 ⊗ f(and) + R_conjunct ⊗ T_imperative ⊗ Z^10 ⊗ c(c2)
    C_M  = R_top ⊗ T_coordination ⊗ Z^0 ⊗ c(k1)

The conjuncts are ordered by their positions, so no ordinal key `R_next^i` is needed (it stays an
ablation).

### 5.5 Condensing

    c(X) = ρ_c( phase( C_X ) )

- `phase` keeps a unit-modulus star in the same sky as a word star, so it is placed like a word.
- `ρ_c` protects it: its own terms cannot meet the parent's terms by accident. Expanding again is
  `ρ_c⁻¹` followed by unbinding.
- This is Hinton's reduced description (1990) and Plate's chunk (2003, chapter 3): noisy when
  unbound from its parent, made exact again by cleanup against the clean-up memory.
- Learned variant: `c(X) = ρ_c(K_t ⊗ phase(C_X))`, with one learned star per type. It is still
  exactly invertible. A learned compression like Pollack's RAAM (1990) is not used, because it loses
  the exact inverse.

**Why not the original `Compiler`'s nesting.** The original adds the inner sum under its role without
normalising (`vsa-semantic-space/tool/sop/world.py`). Every leaf term then ends up in the top vector,
bound with the product of the keys on its path. The message holds all its terms, and products of
keys commute, so two paths with the same keys in another order collide: the book's "a grid, not a
tree". With condensing, each level holds only its own terms. The path is recovered by one cleanup
per level.

### 5.6 The atlas

- Every condensed star of the message is kept as an item bound with its origin, `A(Y) = Z^(a_Y) ⊗ c(Y)`.
  Two identical wires at different places are therefore different items.
- **Reading a child** at key κ of type t in constellation X takes one unbinding and one cleanup over
  the atlas items of type t:

      U = C_X ⊗ conj(R_κ) ⊗ conj(T_t) ⊗ Z^(a_X) ≈ A(Y)

  No scan over offsets is needed. Each level is cleaned, so errors do not add up with depth.
- **Reopening** a closed star (a late word belongs to it) unfolds it by this read-back. The stored
  sum is kept only as a check.
- **Size.** The atlas grows by one star per wire. What stays fixed is the size of each vector and
  the number of terms in each constellation.

### 5.7 Two tracks: words and kinds

The word constellations above are the targets, the readout and the equivalence. The reader's
decisions need to know what kind of word stands where, not which word. So every open constellation
also has a kind constellation:
- built the same way with the learned kind stars `κ_p` instead of `f(w_p)`;
- holding the condensed kind stars `s(Y)` of its children;
- using the smooth position code `Z_s`.

The book makes the same split: the chart is written with word identities, and the route is learned
per kind.

**Kinds** are learned and replace the book's given categories:

    x_k = phase( Σ_{d=−3..3} λ_d ρ^d(f(w_{k+d})) + μ_1 R_first ⊗ f(w_1) + μ_2 R_end ⊗ f(last mark) )
    π_k(c) = softmax_c( β · sim(x_k, K_c) ),   κ_k = Σ_c π_k(c) K_c          (C = 32 kind stars)

- The window is permutation-coded context (BEAGLE, Jones and Mewhort 2007; Sahlgren, Holst and
  Kanerva 2008).
- The kind is a soft cleanup against a learned memory, the same in training and in reading.
- A closed constellation's kind `π_Y` comes from its condensed kind star `s(Y)`, by the same cleanup
  against a second memory of 32 stars.

## 6. Placing stars: the route book's keys

This is the owner's "how the stars are placed in the space". Every star s is placed in its
constellation X at an address. A star is a word at position `p_s`, or a closed constellation whose
origin is `p_s`. The probe's step is fixed (one power of Z per word); the route book learns the
turn, that is, the key:

    address(s | X) = Z^(p_s − a_X) ⊗ K(s | X)          (for a held wire: ⊗ T̃(s), its believed type)

    K(s | X) = phase(  E_path(s | X)  +  E_bigram(s)  +  E_pair^dir(o_X, s)  +  E_type(t_X, s)  )

    E_path(s | X)      = exp( i · Σ_{j = a_X .. p_s} Σ_c π_j(c) θ_path[c] )                the book's path, started at X's origin
    E_bigram(s)        = Σ_{a,b} π_{s−1}(a) π_s(b) exp(i θ_bigram[a, b])                   the book's bigram code
    E_pair^→(o_X, s)   = Σ_{a,b} π_{o_X}(a) π_s(b) exp(i θ_→[a, b])                         the book's relative key A, star after the opener
    E_pair^←(o_X, s)   = Σ_{a,b} π_{o_X}(a) π_s(b) exp(i θ_←[a, b])                         the book's backward key L, star held before its opener
    E_type(t_X, s)     = Σ_b π_s(b) exp(i θ_type[t_X, b])

Notes:
- `o_X` is the kind of X's opener: the word that opened X, or for a coordination its conjunction.
  For a closed constellation placed in X, π_s is its constellation kind.
- These are the codes of the original reader, applied inside each constellation from its opener
  instead of across the whole sentence: path, bigram, the chain's relative keys `A` and `L`
  (`vsa-semantic-space/tool/sop/infer.py`, `Routebook.addresses`; `experiment/v8_gates.py`).
- **Reading the key:** `κ̂ = argmax_{κ ∈ domain(t_X)} sim(K(s | X), R_κ)`. The margin to the second
  best is the confidence.
- **Training:** `−cos(phase(C̃_X), phase(C*_X))` per wire (section 8.3).
- **Said plainly.** The word stars and offsets of one constellation are nearly orthogonal, so this
  loss works mostly as "land on the right key", weighted per constellation. In the field's terms it
  is a classifier whose prototypes are fixed (the legend) and whose inputs are learned codes per kind
  and per pair of kinds. The original reader's `−cos(S, S*)` worked the same way.
- **Control:** the first draft's place classifier (a move memory read from the bundled view) and a
  logistic regression on the same inputs, both in M2.

## 7. Moving stars: splitting the text into wires

### 7.1 Tokens and state

The reader walks the words of `wordsOf(text)`, the punctuation marks between them, and an end token.
Punctuation can close and open constellations, but is never placed. The state at token k:
- the open constellations, in order from the message to the innermost `[M, X_1, …, X_m]`. Each has
  its word constellation, its kind constellation (aside terms included) and its expected keys;
- the atlas;
- the probe at position k.

### 7.2 One decision per star: which constellation receives it (the book's gates)

For an incoming star s (the word at k, or a constellation that just closed), the gates are tested
from the innermost open constellation outwards:

    g_close(X | s) = σ( Σ_{a,b} π_{o_X}(a) π_s(b) γ_close[a, b]  +  Σ_part u_part · sim(V_part(X), G_close,part)  +  b_close )
    g_open(s | X)  = σ( Σ_{a,b} π_{o_X}(a) π_s(b) γ_open[a, b]   +  Σ_part u_part · sim(V_part(X), G_open,part)   +  b_open )

    p(s → X_j)     = (1 − g_close(X_j | s)) · Π_{i > j} g_close(X_i | s)        receiver: X_j, after closing X_{j+1..m}
    p(s placed in X_j) = p(s → X_j) · (1 − g_open(s | X_j))
    p(s opens in X_j)  = p(s → X_j) · g_open(s | X_j)

- `γ` is the book's gate number, here per pair of kinds rather than per kind: the opener of the
  constellation and the incoming star.
- The products are the original's chain formula (`Π (1 − g)`). Here they run over the open
  constellations instead of over earlier words, so a constellation stays reachable until it is
  closed.
- When s opens a new constellation, a discrete choice gives its type t, or "aside" (no receiver
  yet). Its key comes from the route book (section 6). A key is read when the constellation opens,
  to update the expected keys, and read again from its condensed star when it closes.
- When a closed constellation is a relation, its receiver is the attachment choice of section 7.4:
  among the open constellations and the closed nominals of the current clause, reopened if chosen.

### 7.3 Views and scores by parts

Every part is a small bundle shifted to the probe with `Z_s^(−k)`, and each has its own prototypes.

| Part | Content (terms) |
| --- | --- |
| word | `R_{−1} ⊗ κ_{k−1} + R_0 ⊗ κ_k + R_{+1} ⊗ κ_{k+1}` (3) |
| current | the kind constellation of the tested constellation (at most about 12) |
| cur × word | the same bound with `κ_k`: pairs of kinds with keys and offsets (at most about 12) |
| parent | the same two parts for the constellation below (at most about 12 each) |
| aside | the aside terms of all open constellations (a few) |
| last | the last closed child with its key and offset (1) |
| expected | the beacons: `Σ_κ b_{t,κ} R_κ ⊗ E` for keys still empty, erased when filled (at most 9) |

    score(m) = Σ_part u_part · (1/β) log Σ_{j=1..P} exp( β · sim(V_part, P_{m,part,j}) ),     P = 4

No part goes beyond the clean range of one constellation. The first draft's single view of 30–70
terms is gone. Optional, as an ablation: a situation memory (a Hopfield or sparse distributed memory
step; Kanerva 1988, [Ramsauer et al. 2021](https://arxiv.org/abs/2008.02217)) on the word and current
parts.

### 7.4 Choices among stars

For claim, coordinate, take as `to`, reopen or attach, and refer:

    score(Y | s, choice) = Σ_{a,b} π_s(a) π_Y(b) · sim( A[a, b] ⊗ G_choice ,  Z_s^(a_Y − p_s) ⊗ R_{key(Y)} )  +  part terms

- `A[a, b]` is the book's relative key per pair of kinds, shared by all choices. `G_choice` is one
  star per kind of choice.
- Read in plain words: "is Y where a star of my kind expects a partner of Y's kind, for this
  choice?". The score is bilinear in the two kinds, with a full D-dimensional key per pair, and
  smooth in the distance.
- **Candidates are found by the VSA.**
  - Aside stars: unbind `R_aside` from each open constellation and clean up against the atlas.
  - Closed children: unbind the reference keys of the open constellations and clean up against the
    atlas.

  The reader's lists check them; misses are counted.

### 7.5 The moves

Every move records its arguments: which star (atlas item), which constellation, which key, which
offset. A replay executor turns words plus moves into a circuit without the label (M1).

| Move | Operation on stars |
| --- | --- |
| open | push an empty constellation with origin k, of type t, in the receiver, or aside |
| place | `C_X += R_κ ⊗ Z^(k − a_X) ⊗ f(w_k)` (kind track: `κ_k`, `Z_s`); an expected key is erased |
| close | condense, add the item to the atlas, place the star in its receiver at its key (or aside) |
| claim | an aside star of any open constellation is moved to a key of the new constellation |
| coordinate | a coordination opens and takes the previous star (the last closed child, or an aside star, of any open constellation) out of its place as conjunct 1; variant: it also takes back earlier comma-separated siblings |
| take as `to` | a relation whose marker follows its `to` ("the man **'s**") opens and takes the previous nominal out of its place as its `to` |
| reopen | a closed star is unfolded from the atlas back onto the open list, and its term is subtracted from its holder |
| refer | `C_X += R_κ ⊗ T ⊗ Z^(a_Y − a_X) ⊗ c(Y)` for a star Y already placed (re-entrance) |
| form, ambiguous | at close: the clause's form (its type star), the relation's `V_ambiguous` |

### 7.6 Opening conventions and lookahead

The static oracle needs a time at which each wire opens. Those times are conventions, not facts of
the labels, and they decide what the reader must predict before it can see the evidence. Measured on
`0a01d23` (`revision-checks/analyze.out`):

| Case | Base convention, and the lookahead it needs |
| --- | --- |
| marker after `to` | the relation opens at the start of its `to` ("the old bench **'s**"): 3,697 opens; lookahead 1 word 3,055; 2: 488; 3: 147; 4–6: 7 |
| no marker | the relation opens at the start of its `to` clause ("the box **the user selected**"): 1,754 opens need lookahead, 1,185 of them 4 words or more (beyond the ±3 window) |
| late conjunction | the coordination opens at conjunct 2 before its conjunction (lists with commas): 2,462 opens; 1: 88; 2: 154; 3: 63; 4–6: 941; 7 or more: 1,216 |
| no conjunction | coordination without a conjunction word: 274 need lookahead |
| aside or not | a star held aside while a constellation that could take it is open: 8,854 decisions, 7,290 of them a nominal while a relation is open |

The rule adopted is to decide at or after the evidence wherever coverage allows. The variants
measured in M1 (coverage, failures per source, and lookahead for each):
1. claim and coordinate from any open constellation (99.92% today);
2. "take as `to`" for a marker after its `to` (removes the first row);
3. late opening of a relation without marker, at its `to` clause's opener. The critic measured that
   it fixes 194 of the 195 "closed with held items" failures but breaks about 1,160 others under the
   present coordination rule, so it is tested with coordination and claim adapted;
4. coordination opened at its conjunction, taking back the earlier comma-separated conjuncts.

The convention with the least lookahead that keeps coverage at 99.9% or more is chosen. Every
convention is listed as not VSA (section 11).

### 7.7 Held aside, in detail

- "the title is too long": "the title" closes as an aside term in the message. "is" opens the clause,
  which claims it at `subject`.
- "if Grace isn't in the people list yet, add her please": "if" opens a relation aside, and its clause
  is built inside it. "add" opens the main clause, which claims the relation at `rel`.
- "Chapter and its entire contents removed": "Chapter" is aside. "and" opens a coordination that takes
  it as conjunct 1 and is itself aside. "removed" opens the clause, which claims the coordination at
  `subject`.
- "a fireplace": the nominal is aside. At the end token a fragment clause opens and claims it.

### 7.8 The two readers, and what stays symbolic

- **Left-to-right reader** (the book's pilot; transition-based reading in the field, Nivre 2008).
  Built first, because its oracle exists. A beam of 4 is added in M4, together with a re-placement
  pass after the end token: each closed star is tested against the other possible holders with the
  choice score and moved when another fits better by a margin (the book's "the copies vote", done on
  stars).
- **Bottom-up reader** (easy-first; Goldberg and Elhadad 2010). It starts with every word as a star.
  It repeatedly takes the best-scoring pair of neighbouring items and places one into the other at a
  key, or opens a constellation holding both. An item whose close gate fires is condensed into one
  star. It ends when the message holds everything.
  - It uses the same route book, gates and pair tables, and sees the whole message, so it needs no
    lookahead and no aside list.
  - For contiguous trees, the set of correct merges is known from any state, so it trains on its own
    states.
  - 8% of labels (a wire whose words are not one run) need one re-placement step after merging.
  - Compared with the left-to-right reader in M3.
- **Symbolic in both** (declared in section 11): the loop over words or items, the list of open
  constellations or items, the beam and the re-placement pass. Inside that control everything is VSA:
  the state, the scores, the placements and the moves.

## 8. Learning

### 8.1 Fixed and learned

At D = 1024, C = 32:

| Part | Size, fixed or learned |
| --- | --- |
| legend | word stars, trigram stars, key stars, type stars, `R_aside`, `V_ambiguous`, `E`, `Z`, `Z_s`, permutations, part keys: fixed, seeded, not stored |
| kinds | word kinds 32 × D and constellation kinds 32 × D: 65,536 phases; λ, μ, β: about 15 scalars |
| placement | `θ_path` 32 × D, `θ_bigram` 32² × D, `θ_→` and `θ_←` 2 × 32² × D, `θ_type` 8 × 32 × D: 3.44 M phases |
| gates | `γ_open`, `γ_close` 2 × 32² scalars; their part stars 2 × 8 × D |
| structural choices | type, aside, form, ambiguity: about 16 outcomes × 8 parts × P = 4: 524,288 phases |
| choices among stars | `A` 32² × D: 1.05 M phases; 6 choice stars |
| expected keys | weights b per type and key: about 70 scalars |
| options | situation memory 512 × D; condensing stars 8 × D |

The total is about 5.1 M phases (20 MB as float32). For comparison:
- the original's route book: 3.1 M phases (12.6 MB) at 32 kinds;
- the first draft: 0.42 M phases.

The increase is the book's pair tables, which the review asked to bring back. C = 64 (about 17 M
phases) is an ablation.

### 8.2 Targets at every node

The label circuit is turned into its tree of wires, and from it:
- the oracle's moves, with their arguments;
- the target constellation `C*_X` of every wire;
- the target star `c*(X)` of every wire.

The targets are compiled bottom-up with the same fixed stars, as the original `Compiler` did, but
with condensing.

### 8.3 Losses, and what each one reaches

    L =  λ_c Σ_wires w · (1 − sim( phase(C̃_X), phase(C*_X) ))           per-wire constellation loss
       + Σ_gate decisions   w · BCE(g_open, g_close)
       + Σ_choices          w · CE(type, aside, claim, coordinate, take as `to`, reopen/attach, refer)
       + Σ_closes           w · CE(form, ambiguity)
       + λ_neg ·            margin terms from rejected circuits

`C̃_X` is the constellation the reader believes in, built under the gold state:

    C̃_X = Σ_stars s  p(s placed in X) · address(s | X) ⊗ star(s)  [+ Σ_t p(t) T_t on held terms]

- `star(s)` is `f(w)` for a word, or the reader's own condensed star `c̃(Y)` for a closed
  constellation.
- The sum runs over every star for which X was a candidate receiver, gold or not. A star sent
  elsewhere is missing mass; a star wrongly sent here is a spurious term. Both lower the similarity.

| Loss | What it reaches |
| --- | --- |
| per-wire loss | placement codes (keys); the close and open gates, through `p(s → X)`; the attachment choice, through the soft placement of the relation's star; the type choice, through `T̃`. It also reaches children's keys, through `c̃(Y)`, but only weakly (section 10: one wrong word one level down still leaves similarity 0.69) |
| BCE on gates | every open and close decision directly, including those at punctuation and the end token, which place no star |
| CE on choices | type, aside, claim, coordinate, take as `to`, reopen, refer |
| not reached | under teacher forcing, the effect of a wrong decision on later decisions (exposure bias): handled by roll-in |

- The message-star loss of the first draft is dropped. It is dominated by the top level (section 10)
  and adds nothing that the per-wire loss does not already give.
- **Weights w:** judge and written labels ×3, agreement labels ×1. Accepted circuits of the registry
  outside the benchmark are used where the dataset has no label.
- **Rejected circuits** outside the benchmark: a margin between the gold move and the rejected
  circuit's move at the first step where they part, and a per-wire hinge where they share a wire.
- **Benchmark texts** are removed (lowercased, spaces collapsed), and their registry lines are never
  used.

### 8.4 Procedure

- **Teacher forcing first.** Under the oracle's moves every state is known, so all views of a batch
  are built in parallel. The constellation losses are computed bottom-up, one depth level at a time.
- **Then roll-in with the reader's own moves** (in the spirit of DAgger, Ross, Gordon and Bagnell
  2011). With a probability rising to 0.5, the reader continues from its own move.
  - The oracle continues from any state that is still consistent with the gold tree: every closed
    constellation is a gold wire, every open one a prefix of a gold wire.
  - A wrong key with the right receiver keeps the state consistent.
  - At the first move that leaves the gold tree the sequence stops, and the loss counts up to there
    (early update, Collins and Roark 2004).
  - A full dynamic oracle for this move set is not available, and that is stated. The bottom-up
    reader does not need one.
- **Splits.** dev-B is whole CSV files whose stem has sha1 mod 10 = 0. dev-A is the sha1 of the text
  mod 10 = 0 among the rest. Train is the rest. Text-hash lists are frozen with the snapshot.
- **Optimisation.** Adam, learning rate 0.02 for phases (the original's), 0.005 for scalars; phases
  start uniform; batches grouped by length; early stop on dev-B exact core; three seeds before any
  conclusion.
- **Cost, estimated from bytes moved.** The elementwise products are limited by memory, not
  arithmetic.
  - About 2 M steps per epoch, with about 200 vector operations of 8 KB each per step, forward and
    backward: some tens of TB, about 2–5 min at the GB10's 273 GB/s.
  - The pair tables are matrix products (for each star, the outer product of kinds × `exp(iθ)`):
    about 150 TFLOP per epoch with the backward pass.
  - Altogether about 5–20 min per epoch, measured at the first M2 run.
- **Reading cost.** Sequential, with hard kinds (top 1 or 2) for table lookups: a few to some tens
  of ms per message in numpy, in a Python worker on the pattern of
  `strategies/distilbert/syntax_worker.py`. For comparison: `vss` 0.44 ms, spaCy 49 ms.

## 9. Reading out the circuit

1. **The output is read back from the message star through the atlas.**
   - Unbind each reference key and type from the message star, and clean up over the atlas items.
     Continue from each exact item.
   - Every word goes to the (constellation, key) where its star at its offset scores highest, so
     every word has exactly one place (the schema's Rule 1).
   - One threshold rule, fixed on a dev part in M1. The candidate is 5σ with origin-bound items and
     the type in the holder's term (section 12).
2. **The check.** The reader's own lists (the explicit tree it built) give a second circuit. Every
   disagreement with the read-back is counted and reported.
3. **The writer.** `writeCircuit` orders the wires (Rule 1) and `validateSyntax` checks them.
   - It joins adjacent words at the same `head`, `verb`, `marker` or `conjunction` into one value.
     It never joins words at `dependent`, `modifier`, `auxiliary`, `negation` or `discourse`. This
     join rule decides spans and is listed as not VSA.
   - A relation's `from` is its holder; for a coordination of relations, the coordination's holder.
   - With the spans the reader knows, the writer gives back 88,106 / 88,106 labels.
4. **Margins and remainder.**
   - Each choice and each key has a margin (best minus second).
   - `attachment=ambiguous` is written from the learned ambiguity choice, or when the attachment
     margin is below τ (fitted on dev-B). Both variants are reported.
   - The remainder of a constellation is `1 − sim(phase(C̃_X), phase(C_X))`.
   - A message's confidence is its smallest margin and its largest remainder, with calibration
     curves.

## 10. Equivalence of analyses

- Two circuits with the same tree of wires give the same message star and the same atlas: the
  compilation is deterministic and does not depend on wire names.
- **The message star alone is biased towards the top.** One word replaced in a wire changes the
  message star by depth (critic's `depthbias.py`, D = 1024, 1,500 messages):

| Depth | Median message-star similarity |
| --- | --- |
| 1 | 0.688 |
| 2 | 0.847 |
| 3 | 0.931 |
| 4 | 0.964 |
| 5 | 0.985 |
| 6 | 0.992 |
| 7+ | 0.997 |

- So the measure becomes **per matched wire**. Match the atlas of one analysis against the other's:
  an equal star means an equal subtree, as in subtree kernels (Collins and Duffy 2002). Report:
  - the share of wires with an equal star on the other side;
  - a wire-level F1 with partial credit by the best similarity;
  - the message-star similarity beside them.
- On the 389 judged messages with an accepted and a rejected circuit, the message-star medians fell
  from 0.728 (1–2 core lines differ) to 0.446 (9 or more), Spearman −0.48 (81,870). That figure is
  confounded by depth and circuit size, and is recomputed per matched wire with size controlled.
- **Use:** comparing two strategies' circuits beyond exact identity, and a structure-only star (one
  constant star for every word) to compare shapes. As the book says, equivalence "is induced by the
  shared targets", not labelled on pairs.

## 11. What is VSA here and what is not

**VSA, inside the reading:**

| Part | How |
| --- | --- |
| word stars | hash phasors of the form and letter trigrams, bundled |
| positions | fractional power encoding relative to each constellation's origin; exact for targets, smooth for decisions |
| constellations | binding with named stars, types and positions; bundling |
| condensing | phase projection and a fixed permutation; expanding by its inverse and unbinding |
| atlas | origin-bound items, cleanup |
| kinds | soft cleanup of a permutation-coded context against a learned memory |
| placement | the route book's keys (path, bigram, relative keys per pair of kinds), read by cleanup against the named stars |
| gates | learned numbers per pair of kinds plus similarities of the parts with learned stars |
| decisions | cleanup of each part against learned prototypes |
| choices among stars | relative key per pair of kinds compared with each candidate's place; candidates found by unbinding and atlas cleanup |
| moving stars | subtracting a known term, binding it into another constellation |
| readout | unbinding, cleanup over the atlas and the message's words, margins, remainder |

**Not VSA, declared:**

| Part | Note |
| --- | --- |
| tokenizer | `wordsOf`, the contract of all strategies; punctuation marks between words |
| control loop | the left-to-right walk over words (or the bottom-up loop over pairs) and the list of which constellations are open, in order |
| domains | moves are restricted to the keys a type has in the schema |
| opening conventions | the times at which the oracle opens each wire (section 7.6). They are a structural prior: training only, but they shape what is learned |
| oracle and roll-in | derive moves from labels; the consistency test of roll-in |
| beam, re-placement | symbolic search over the VSA scores |
| training | gradient descent on similarities and cross-entropies |
| thresholds | the read-back threshold, τ for ambiguity |
| writer | `writeCircuit`, `validateSyntax`, and the join rule of section 9; no word is named |

**Not used at all:** word lists, and any rule that names a word (not even function words); a
part-of-speech tagger (the original's `typer.py` is excluded); a parser; a transformer; pretrained
embeddings; knowledge worlds; any output of `vss` or spaCy at reading time.

**Said plainly.**
- In the field's terms this is a learned incremental reader with an explicit list of open
  constellations: a transition-based reader whose state, scores, placements and structural steps
  are VSA, and in which no grammar is written.
- The book's pilot also walks the words in a loop, but its structure comes only from where the
  learned keys carry the probe, softly, trained by `−cos(S, S*)`. Here structure comes from discrete
  choices of receiver, which are soft only during training. The book's learned keys place the stars
  inside each constellation.
- With the structure given (M1), the representation carries no decision.
- The labels are mostly `vss` + spaCy circuits, so what is learned first is their convention.

## 12. Measurements so far

**On `0a01d23`, 88,106 labels** (`revision-checks/`):

| Check | Result |
| --- | --- |
| writer ceilings | spans known 88,106 / 88,106; words only, in tree order 86,672 (98.37%) |
| oracle, base | 87,841 (99.70%) derived; failures: closed with held items 199, first conjunct not found 53, re-entry 9, other 4 |
| oracle, claim from any open | 88,036 (99.92%); 70 failures (41 first conjunct not found, 13 re-entry, 12 closed with held items, 4 other) |
| failures by source | agreement 27 / 83,921; judge 36 / 4,153; written 7 / 32; by folder: drawing 43, diagram 15, calendar 11, document 1 |
| contiguity | every wire one run of words in 80,987 of 88,036 (91.99%) |
| lookahead | section 7.6 |

The "derived" counts write the circuit from the label's word owners plus the oracle's own map. They
are not yet a replay of the moves alone (M1 step 2).

**Read-back with the label's grouping given (81,870)**. The sample is 7,705 messages: all 1,440 of
25 words or more and a random 6,265 shorter. Exact means every wire, type, key, reference and word
as in the label.

| D | Exact |
| --- | --- |
| 128 | 73.2% at 5σ |
| 256 | 99.30% at 5σ; 95.52% at 6σ; 99.86% at 5σ with origin-bound items and the type in the holder's term |
| 512 | 99.83% at 5σ; 99.99% at 6σ; 100% at 5σ with origin-bound items and the type in the holder's term |
| 1024 | 99.92% at 5σ; 99.99% at 6σ; 99.97% at 5σ with origin-bound items and the type in the holder's term |
| 2048 | 99.79% at 5σ; 100% at 6σ |

- σ = 1/√(2D). The first draft picked the threshold per D on this same sample. The critic's variant
  (`revision-checks/m1abs.py`, `abs-holder-5.out`) holds one rule, 5σ, across D, and is the
  representation adopted in section 5. It is fixed on a dev part and run on all labels in M1.
- **Without the atlas:** 19.0% at D = 1024 and 31.9% at D = 4096. That sample was the first 2,000
  exported, with 3 messages of 40+ words against 427 in the full sample, so it is not representative
  and is redone in M1.
- **The flat chart** with its answers given: 63.1%, 83.0% and 96.0% at D = 256, 512 and 1024, on
  another sample (4,438). Redone on the same sample in M1.
- **What this does and does not show.** It shows that the representation is lossless with the
  grouping given, and that the atlas is what makes it so. It does not test whether a reader can learn
  to place and move stars: that is M2 and M3.

## 13. Milestones

**M1. Data, moves and representation** (structure given; only the probe learns anything).
1. Freeze the snapshot: dataset commit, text-hash lists of train, dev-A, dev-B and the benchmark
   exclusions. Every result file names it.
2. `src/tree.mjs` and `src/moves.mjs`:
   - the tree of wires, re-entrance, origins;
   - the moves with their arguments, and the replay executor (words plus moves give a circuit, no
     label);
   - coverage of the replay per source, and lookahead per convention, for the variants of section
     7.6. Choose the convention.
3. `m1/encode_decode.py` on all labels at D = 256, 512, 1024, with one threshold rule fixed on dev-A.
   - Controls: the flat design on the same sample; no atlas on a representative sample; the original
     `Compiler`'s nesting; ordinal keys against positions.
   - The soft-belief control: each placement keeps a share p of its belief on the right key, p = 0.6
     and 0.45.
4. **Decision-capacity probe.**
   - On the oracle's states for messages of at most 12 words, learn only the gate tables and the
     part prototypes. Kinds are fixed context stars first, then the 32-kind memory.
   - Accuracy of every decision on dev-B, against a logistic regression and an averaged perceptron
     on the same states and the same information (window words, the kinds and keys filled in the
     open constellations, aside and last items).
   - This tests the risk "decisions too weak" in hours.
5. Equivalence per matched wire and by message star, on all judged pairs; `vss` against spaCy
   circuits on the benchmark texts.
6. Stop rules, stated in advance:
   - replay coverage at least 99.9% with the chosen convention;
   - read-back at least 99.9% at D = 1024 with the one rule;
   - if the probe's VSA decisions are more than 2 points below the logistic regression, strengthen
     the decisions (situation memory, more prototypes) before M3.

**M2. Learning to place stars** (the tree given, so the receivers are gold; the route book learns
the keys). This is the first direct test of "learn how the stars are placed".
1. `model.py` and `train.py`: kinds and placement codes, trained by the per-wire loss alone. Keys
   are read by cleanup against the named stars.
2. Report on dev-B and dev-A (close and clean texts apart):
   - key accuracy, overall and per key, for words and for held constellations;
   - accuracy on words unseen in training;
   - constellation similarity per depth;
   - the learned kinds, listed by their most frequent words (for inspection, never used as a rule).
3. Controls on the same inputs: the first draft's place classifier, and a logistic regression.
   Ablations: no pair table, no path, no bigram; C = 16, 32, 64; the smooth position code's σ.
4. Three seeds.

**M3. Learning to move stars** (splitting; messages of at most 12 words).
1. Gates, structural choices and choices among stars, with soft receivers in the per-wire loss.
   Teacher forcing, then roll-in with the reader's own moves. Three seeds.
2. The left-to-right reader and the bottom-up reader, on the same data.
3. Bars on the same split and length cap:
   - the `experiments/syntax-learned` parser retrained without the features that come from `vss`
     (its station and word kinds), and with them as a reference;
   - the logistic regression on the same oracle states.
4. Report:
   - accuracy of every decision, with teacher forcing and free running;
   - exact tree and exact core;
   - results by construction (aside, claim, coordinate, take as `to`, reopen, refer, ambiguity);
   - unseen words, per depth;
   - read-back against the reader's lists;
   - calibration of margins and remainder.
5. Decision rules:
   - good with teacher forcing but poor free running: exposure bias, so beam and more roll-in;
   - errors on unseen words: kinds;
   - attachment errors dominant: the pair tables of the attachment choice;
   - far below the parser: compare with the probe of M1 to tell weak decisions from conventions.

**M4. All messages and the benchmark.**
1. All lengths, beam 4, the re-placement pass, judged weights, registry labels, negatives from
   rejected circuits.
2. The strategy:
   - `index.mjs` (`{name: 'strict-vss', schema: 'syntax', open(configuration)}`, `analyse(text) →
     {analyses: [{sop}]}`, `close()`) and `worker.py`;
   - ms per message, start-up time, model MB.
3. The benchmark (1,831 messages), counted with the procedure of `experiments/syntax-learned/review/`
   (a copy writing into the scratch folder, every strategy recounted in the same run, the verdict
   snapshot recorded):
   - known accepted, known rejected, unjudged and invalid, by source;
   - comparisons only on the messages where both strategies have verdicts;
   - exact-core agreement with accepted circuits;
   - lower and upper bounds;
   - the 593 messages with an earlier label against the 1,238 without; the clean subset;
   - at least 60 unjudged circuits read by a reviewer against `tests/benchmark/syntax/rules.md`.
     No judges are launched.
4. No expected number is the success line. The parser (55.3% known accepted; 37.4% on the 1,238)
   and `vss` (78.6%) are context, compared on commonly judged messages. Every count is reported,
   whatever it is.

## 14. Risks

| Risk | What, and the answer |
| --- | --- |
| weak decisions | Similarities with prototypes may not separate moves. Answer: parts with their own prototypes, pair tables, the situation memory; tested early by the M1 probe against a logistic regression. |
| error propagation | A left-to-right reader carries early mistakes. Answer: roll-in, beam, re-placement, and the bottom-up reader. |
| lookahead | Some conventions predict before the evidence (1,185 opens beyond the window today). Answer: conventions chosen by lookahead in M1; "take as `to`"; the bottom-up reader. |
| kinds not discovered | The book's limit; the original failed on SNIPS through its kinds (0.107 on new slot heads). Answer: kinds learned from placement, letters and context; measured on unseen words. |
| pair tables overfit | 3.4 M placement phases at C = 32. Answer: dev-B by whole files, unseen words, C as an ablation. |
| soft receivers blur training | Answer: BCE on the gates beside the per-wire loss; λ_c tuned on dev-B. |
| VSA candidates missed | Answer: the reader's lists check them, and misses are counted. |
| circular labels | 95% are `vss` + spaCy agreement circuits. Answer: report the 1,238 messages without an earlier label and the clean subset; judged weights and negatives. |
| rare constructions | ellipsis 41, shared subject 4,370, reopen 3,720 messages, coordination of a buried star 387. Recall reported apart. |
| atlas size | One star per wire; stated. |
| data moving | The parallel data session rewrites labels. Answer: the frozen snapshot named in every result. |

**Fallback, in order, every step strict:** more prototypes and the situation memory; more kinds; beam
and re-placement; the bottom-up reader; negatives from rejected circuits. No word rule, tagger or
pretrained model is added; a variant with any of those needs its own name. If strict-vss stays far
below, it remains a measured research strategy and `vss` stays the production reader.

## 15. Files

| File | Content |
| --- | --- |
| `DESIGN.md` | this design |
| `DESIGN-hier-v1.md` | the first hierarchical draft, as reviewed |
| `DESIGN-flat.md` | the flat design, unchanged |
| `m0/` | the flat design's measurements |
| `hierarchy-checks/` | the first draft's checks (81,870) |
| `revision-checks/` | the critic's scripts (copied from the scratch folder; some still read scratch paths) and the reruns on `0a01d23`: `runlate.out`, `contiguous.out`, `bysource2.out`, `holding.out`, `analyze.out`, `abs-*.out` |
| `src/`, `m1/` | M1 |
| `model.py`, `train.py`, `decode.mjs` | M2, M3 |
| `index.mjs`, `worker.py`, `eval/` | M4 |

Models go to `.local-models/strict-vss/`; exported data to the scratch folder `strict-vss/`. Nothing
outside `strategies/strict-vss/` is edited.

## 16. References

- G. E. Hinton. Mapping part-whole hierarchies into connectionist networks. *Artificial
  Intelligence* 46, 1990 (reduced descriptions).
- T. A. Plate. Holographic reduced representations. *IEEE Transactions on Neural Networks* 6(3), 1995
  ([doi](https://doi.org/10.1109/72.377968)); *Holographic Reduced Representations*, CSLI, 2003
  (FHRR, chunks, clean-up memory, similarity of structures).
- P. Smolensky. Tensor product variable binding. *Artificial Intelligence* 46, 1990.
- J. B. Pollack. Recursive distributed representations. *Artificial Intelligence* 46, 1990 (RAAM, not
  used).
- P. Kanerva. *Sparse Distributed Memory*, MIT Press, 1988; Hyperdimensional computing, *Cognitive
  Computation* 1(2), 2009.
- R. W. Gayler. Vector symbolic architectures answer Jackendoff's challenges, 2003
  ([arXiv](https://arxiv.org/abs/cs/0412059)).
- D. Kleyko, D. A. Rachkovskij, E. Osipov, A. Rahimi. A survey on hyperdimensional computing, Parts I
  and II. *ACM Computing Surveys*, 2022–2023 ([I](https://arxiv.org/abs/2111.06077),
  [II](https://arxiv.org/abs/2112.15424)).
- E. P. Frady, D. Kleyko, C. J. Kymn, B. A. Olshausen, F. T. Sommer. Computing on functions using
  randomized vector representations, 2021 ([arXiv](https://arxiv.org/abs/2109.03429)); B. Komer et
  al. A neural representation of continuous space using fractional binding. CogSci 2019 (fractional
  power encoding; band-limited codes give smooth similarity over distance).
- M. N. Jones, D. J. K. Mewhort. Representing word meaning and order information in a composite
  holographic lexicon. *Psychological Review* 114(1), 2007; M. Sahlgren, A. Holst, P. Kanerva.
  Permutations as a means to encode order in word space. CogSci 2008.
- A. Joshi, J. T. Halseth, P. Kanerva. Language geometry using random indexing. Quantum Interaction
  2016.
- H. Ramsauer et al. Hopfield networks is all you need. ICLR 2021.
- J. Nivre. Algorithms for deterministic incremental dependency parsing. *Computational Linguistics*
  34(4), 2008; Y. Goldberg, J. Nivre. A dynamic oracle for arc-eager dependency parsing. COLING 2012.
- Y. Goldberg, M. Elhadad. An efficient algorithm for easy-first non-directional dependency parsing.
  NAACL 2010.
- S. Ross, G. Gordon, J. A. Bagnell. A reduction of imitation learning and structured prediction to
  no-regret online learning (DAgger). AISTATS 2011.
- M. Collins, B. Roark. Incremental parsing with the perceptron algorithm (early update). ACL 2004.
- C.-Y. Lee et al. Deeply-supervised nets. AISTATS 2015.
- M. Collins, N. Duffy. Convolution kernels for natural language. NeurIPS 2002.
- The original: `vsa-semantic-space/tool/sop/world.py` (`Compiler`), `tool/sop/infer.py`
  (`Routebook.addresses`, readout, margin, residual), `experiment/v8_gates.py` (route book, gates,
  chains).
- The book: "Meaning as a Path" (digest in the scratch folder `strict-vss/book-digest.md`).
