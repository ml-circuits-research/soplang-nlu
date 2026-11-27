# rvss: a message as a constellation of constellations

Status: design, third revision, 2026-11-27. Nothing is trained yet.

**Names.** The owner named this strategy `rvss` (recursive VSS). Its folder will be `strategies/rvss/`
and its models `.local-models/rvss/`; until the folder is renamed, this file and its checks live in
`strategies/strict-vss/`. The earlier reader `vss` is now `hmm-rules` (`strategies/hmm-rules/`). In the
data, the `source` column may still say `vss`.

**Earlier versions, kept unchanged:**
- `DESIGN-flat.md`: the flat design (one vector for the whole message), which the owner rejected;
- `DESIGN-hier-v1.md`: the first hierarchical draft, the version the first critic reviewed;
- `DESIGN-hier-v2.md`: the second revision, written before the detailed critique of the owner's
  technical points.

**Data snapshot.** `webmeet-dataset` commit `0a01d23` (2026-11-27 22:01). The 238 CSV files of
`syntactic/` are listed with their sha1 in `hierarchy-checks/v2/snapshot-0a01d23.sha1`, and every check
of this revision reads a copy extracted from that commit. Outside the benchmark (its texts compared
lowercased, with spaces collapsed) there are 88,106 labels: agreement 83,921, judge 4,153, written 32.

**Scripts and outputs:**
- `hierarchy-checks/v2/`: this revision's checks on `0a01d23`, run order in `RESULTS.txt`;
- `revision-checks/`: the first critic's scripts, rerun on `0a01d23`;
- `hierarchy-checks/`: the first draft's checks (81,870 labels, before 22:01);
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
  coordination) is a small constellation of its own terms: its words, each at the named star of its
  key and at its position, and the stars of the wires it holds. The book calls a constellation a
  chart. In 88,101 of the 88,106 labels no wire has more than 12 terms, however long the message.
- **Condensing.** A finished constellation is condensed into one star (a reduced description, Hinton
  1990; a chunk, Plate 2003). That star is placed in the constellation of the wire that holds it,
  exactly like a word. The message star holds the top wires.
- **The atlas** (the book's store of constellations; a clean-up memory in Plate's terms) keeps one
  star per wire, bound with the wire's origin. The content lives there; the message star points at
  the top wires, and the circuit is read by unfolding one level at a time.
- **Measured on the snapshot, structure given, nothing learned:** the whole circuit comes back from
  the message star through the atlas, with one 5σ threshold fixed in advance, for 99.993% of all
  88,105 labels at D = 512 and 99.997% at D = 1024, and for all 2,203 messages of 25 words or more at
  D = 1024. Like for like, without the atlas only 33.5% come back at D = 1024; the flat chart of
  `DESIGN-flat.md` (which has no atlas either) reads an estimated 99.7% of the population at
  D = 1024 but only 765 of the 1,052 messages of 40 words or more, and none of them at D = 512.
- **Splitting the text into wires** is the pilot's moves: open, place, close, hold aside, claim,
  gather into a coordination, reopen, point. Every move now records which star it moves, and an
  executor that sees only the words and the moves rebuilds the label's circuit for 99.97% of the
  labels. Under the adopted conventions no constellation opens before the word that shows it; the
  only decisions that wait for later words are 9,514 "hold aside" decisions (442 of them more than
  three words before the word that claims the star).
- **Learning to place stars** is the book's route book, brought back inside each constellation: the
  key of every star comes from learned keys counted from the constellation's opener, from the
  previous word (pair of kinds), along the path, and backwards at a claim. The drawings vote, and
  the key is read by cleanup against the named stars. Pairs of kinds go through VSA key–value
  memories, not tables. Training is the original's `1 − cos(built, target)` at every wire.
- **Learning to move stars** is the book's gates (close, open) and choices among stars (claim,
  gather, reopen, point, attach), each read from the VSA state. Candidate stars are found by
  unbinding and atlas cleanup.
- **The output is read back from the pilot's own stars**, with the same decoder as above; the
  pilot's explicit list of what it built is a check, and every disagreement is counted.
- **What is not VSA is listed** (section 12).

## 1. The extension, in the book's words

**What the book does.**
- A sentence is one chart. The probe walks the words. Every word is written at the probe's address,
  which the route book computes from learned keys per kind of word and per pair of kinds.
- Gates (one learned number per kind) say which words open a frame: "to", "from" and "that" open;
  verbs and nouns do not.
- A reported clause moves the whole legend to a new origin by one power of `R_reported`. So nesting
  is a power of one key, but every term still lands in the same single chart.
- That is why the book says "the honest range of a chart is a single event"; long texts would need
  "structures of states" (chapter 12), which the book does not build.
- Training maximises `cos(S, S*)`, where `S*` is the world's constellation built from the answers.

**What rvss adds.**
1. **A chart per wire.** When a gate opens, a new chart starts with its own origin (the book's
   opener), instead of shifting the same chart.
2. **Condensing replaces the powers of `R_reported`.** When a gate closes a chart, it is condensed
   into one star and placed in the chart below at a key, like a word. Depth costs nothing per chart,
   because each chart holds only its own terms.
3. **The atlas holds the condensed charts**, so that they can be unfolded when reading and reopened
   when a late word belongs to them.
4. **The route book places every star inside its chart** with the book's own drawings (from the
   opener, from the previous word, along the path, backwards for a held star), counted from the
   opener of that chart.
5. **Stars are moved.** A star that comes before its opener is held aside (the book's mechanism) and
   claimed when the opener comes; a coordination gathers the stars already drawn at the same key; a
   closed chart is reopened for a late part; a key can point at a star drawn elsewhere.
6. **The constellation of constellations** is the message star together with the atlas: a tree of
   charts of a few terms each, linked by condensed stars.

**How the text is split into wires.** At each word the pilot asks the open charts, from the innermost
outwards, "do you close before this word?". It then asks the chart that stays, "does this word open
a new chart in you, and of which kind?". Both answers are learned from the kinds of the words
involved and from what the chart already holds and still expects (section 8). A chart opens only at
the word that shows it: a relation at its marker, a coordination at its conjunction.

**A walk through one message**, "move the blue box next to the red circle and make it bigger"
(positions 0–12). Gold circuit: a coordination of two imperative clauses; the first has `verb`
"move", a nominal at `complement` and a relation "next to" whose `to` is "the red circle"; the second
has `verb` "make", the nominal "it" at `complement` and `modifier` "bigger".

| Word | What happens |
| --- | --- |
| move | a clause chart opens in the message (the gate opens); "move" lands at `verb` |
| the | a nominal chart opens inside the clause; "the" lands at `dependent` |
| blue, box | continue the nominal: `dependent`, `head` |
| next | the nominal closes; its star lands in the clause at `complement`. "next" opens a relation chart in the clause and lands at `marker` |
| to | continues the relation at `marker` (adjacent words of one key are joined when written) |
| the red circle | a nominal opens inside the relation: `dependent`, `dependent`, `head` |
| and | the nominal closes into the relation at `to`; the relation closes into the clause at `rel` (an attachment choice between the clause and "box"; a small margin writes `attachment=ambiguous`); the clause closes into the message. A coordination opens at "and" and gathers the clause's star from the message as its first conjunct; "and" lands at `conjunction` |
| make | a clause opens inside the coordination at `conjunct`; `verb` |
| it, bigger | "it" opens a nominal (`head`); at "bigger" it closes into the clause at `complement`; "bigger" lands at `modifier` |
| end | the clause closes into the coordination, the coordination into the message |

## 2. What changed from the flat design and why

- **The flat design.** One vector held the whole message. Every word was placed at a key path and
  all terms were summed together. Its argument was about capacity: 21–60 terms in one vector for a
  quarter of the messages, so D had to grow with the text.
- **The owner's direction.** Not one representation for the whole text, but representations of
  representations, shaped like the circuit graph; the focus is learning how stars are placed and
  moved.
- **Now.** One constellation per wire, condensed into one star and placed in its parent, with the
  atlas as clean-up memory. Each constellation holds at most about 12 terms whatever the length of
  the message. Long texts make deeper or wider trees of small constellations, not bigger vectors.
- **The learning is about placing and moving stars**, with the book's route book inside each
  constellation and the pilot's moves between constellations, not about the capacity of one vector.
- **The extra cost:** one atlas star per wire.
- **Kept from the flat design:** word stars from the form plus letter trigrams; the label statistics;
  the writer (`writeCircuit`, `validateSyntax`); the held-out rules (benchmark texts removed,
  lowercased, spaces collapsed); the dev splits.

## 3. What changed after the two reviews

**First review** (16 points, on `DESIGN-hier-v1.md`):

| Point | What this revision does |
| --- | --- |
| 1. learned placement | Adopted as the main mechanism (section 7), now with key–value memories over pair codes instead of the second revision's pair tables (second review, point 5). The first draft's place classifier is a control in M2a. |
| 2. gates | Adopted: close and open gates, the book's learned number extended to the pair (the chart's opener, the incoming star), plus terms read from the chart's parts (section 8.4). |
| 3. what the per-wire loss reaches | Adopted: receivers are soft during training, so the per-wire loss reaches the gates and the attachment choice; a table says what each loss reaches (section 9.3). The message-star loss is dropped (it is depth-biased). |
| 4. scoring by parts | Adopted: each part of the view has its own prototypes and holds at most about 12 terms (section 8.5). |
| 5. choices bilinear in two kinds | Adopted, through a key–value memory read with the pair code of the two kinds (section 8.6). |
| 6. smooth distances | Adopted: decisions use a band-limited position code; targets keep the exact one (section 5.1). |
| 7. claims from any open constellation | Adopted, and coordination gathers every conjunct already built (section 8.2): replay coverage 99.97%. |
| 8. arguments in moves, a replay executor | Done: `hierarchy-checks/v2/oracle2.mjs`. Words plus moves give the identical core for 88,083 labels (99.97%) under the adopted conventions. |
| 9. conventions as a variable | Done: two conventions measured with their lookahead (section 8.3). Under the adopted one no opening needs lookahead. The "take as `to`" move of the second revision is not needed: the relation opens at its marker and claims its `to`. |
| 10. judged and written failures | Under the adopted conventions 3 judge and 1 written label fail (from 41 and 7); all 23 failures are listed in `v2/oracle2-failures.json`. |
| 11. VSA carries the structure when reading | Adopted: the output is the read-back from the pilot's stars; candidates come from unbinding and atlas cleanup; the explicit lists are a check. The order of the open constellations stays an explicit list (declared). |
| 12. M1 | Mostly done on the snapshot: all labels, one threshold fixed in advance, flat and no-atlas controls weighted to the same population, equivalence with partial correlation. The rest is listed in section 14. |
| 13. bars for the learned reader | Adopted in M2c: the `experiments/syntax-learned` parser retrained on the same split and length cap; roll-in; three seeds. |
| 14. data snapshot | Done (`0a01d23`, sha1 list). |
| 15. summary corrections | Done: one threshold; "read back through the atlas"; the replay claim now rests on the executor. |
| 16. a bottom-up reader | Kept as a comparison in M2c (easy-first, Goldberg and Elhadad 2010). |

**Second review** (the detailed critique of the owner's technical points):

| Point | What this revision does |
| --- | --- |
| 1. snapshot and reruns | Done. Tree statistics, writer ceilings, oracle and read-back rerun on `0a01d23`. The 195 labels that crossed under the old conventions (a clause closed while a star was still held aside in it, mostly `drawing/scenes-*`) are reported; under the adopted conventions they are rebuilt through reopen, with no new move. |
| 2. representation | Adopted: the type atom sits at the holder for words too (`R_κ ⊗ T_word ⊗ Z^d ⊗ f(w)`); atlas items carry the wire's identity `Z^(a_Y) ⊗ c(Y)`; one cleanup per key over the message's words and the atlas; one 5σ threshold fixed in advance. Measured on all labels (section 6). |
| 3. output path | Adopted: the output is the read-back from the pilot's own message star and atlas; the explicit list is a cross-check with disagreements counted (section 6.3). |
| 4. decide late, move the stars | Adopted (section 8.2). Coordination gathers its built conjuncts at the conjunction; a coordination without a conjunction gathers at the token after its last conjunct; claims come from any held list. Lookahead reported for both conventions (section 8.3). |
| 5. the book's placement | Adopted as specified (section 7): addresses from the opener, the pair key, the path and the backward key, voted; placement by cleanup against the named stars of the domain; A, B, L as key–value memories over pair codes; loss `1 − cos` per wire plus cross-entropy on the cleanup. |
| 6. split M2 | Adopted: M2a placement with the grouping given; M2b moves under teacher forcing against a non-VSA control on the same view; M2c free running plus writer, judged by placement accuracy, core-line F1 and exact core. |
| 7. beam scored by fit | Adopted (section 10); soft stack and "no action loss" are M3 ablations. |
| 8. evaluation | Adopted (section 15): like-for-like headline, population-weighted M1, the caveat on the 55.3% bar, partial correlation for equivalence, near-duplicates, dev-B first, blind reading. |
| 9. more parts declared not VSA | Adopted: the join rule, the view template, the opening conventions and the ±3 window are listed (section 12). |

## 4. The circuit as a tree of wires

A circuit is a graph: a wire refers to other wires by `$id`. To build constellations of
constellations, every wire needs one parent: the wire whose constellation holds its star.

| Reference | Parent in the tree |
| --- | --- |
| `subject`, `complement`, `to`, `conjunct` | the wire that refers |
| `from` | the relation is held by its `from` wire; `from` is not a term |
| relations coordinated | the coordination is held by their common `from` (165 of 165) |
| second reference, `ellipsis` | re-entrance: the later key points at the star without holding it |

In 4,400 labels a wire is referred to twice: a nominal that is the complement of one clause and the
subject of the next ("Let us put Review …", 4,370), two coordinations sharing a conjunct (27), a
clause that is both a `to` and a conjunct (5). `ellipsis` points in 41 more. The wire that opens
first holds; the later reference points (re-entrance, as in feature structures).

**The labels as trees** (`v2/holding.out`, 88,106 labels):

| Measure | Distribution |
| --- | --- |
| top wires | 1: 89.25%; 2: 10.68% (two sentences); 3 or more: 55 |
| depth | 1: 0.3%; 2: 26.5%; 3: 19.3%; 4: 21.5%; 5: 13.1%; 6: 10.6%; 7: 4.2%; 8: 2.9%; 9 or more: 1.5% |
| nominal terms | 2–5: 96.0%; at most 8: 99.99%; largest 17–24 (2 wires) |
| clause terms | at most 8: 99.67%; largest 13–16 (1 wire) |
| relation, coordination | at most 6; at most 10 |
| largest per message | at most 8 terms: 99.46%; at most 12: 99.994% (5 messages above) |
| contiguous wires | every wire's words form one run in 91.99% of labels (`revision-checks/contiguous.out`) |

**Constructions that fit** (every label outside the benchmark goes through the tree, the moves and
the replay):

| Construction | Example, and how it fits |
| --- | --- |
| relation from a clause | put Review **on the Work 6 calendar**: the clause holds the relation, the nominal is at `to` |
| relation from a nominal | the title **of Weekly review**: the nominal holds the relation |
| relation without marker | a room **called Board Room 2**: the nominal holds a relation whose `to` is a nonfinite clause; it opens at "called" |
| subordinate clause first | **if Grace isn't in the people list yet**, add her: the relation waits aside until "add" opens the main clause and claims it |
| possessive | **the man's** glasses: "the man" waits aside; "'s" opens the relation, which claims it at `to` and waits aside itself until "glasses" claims it |
| relation before a fragment | **near the tent**: a big yellow balloon: the relation waits aside; at the end a fragment clause wraps the nominal and claims it |
| coordination | Ana **and** Lee; to Quarterly plan **and** on Monday; Q1, Q2 **and** Q3: at the conjunction the coordination gathers the stars already drawn at the same key |
| ellipsis | … and **the location to second floor**: the fragment points at the first clause's star at `ellipsis` |
| shared subject | Let **us** put Review: "Let" holds "us"; "put" points at the same star at `subject` |
| ambiguous attachment | 5,455 messages: a value star `V_ambiguous` in the relation |
| multiword values | `head="Board Room 2"`, `marker="next to"`: each word at the same key in adjacent positions, joined when written |

## 5. The representation: levels, condensing, atlas

### 5.1 The space

Fourier holographic reduced representations (FHRR; [Plate 1995](https://doi.org/10.1109/72.377968),
Plate 2003), as in the original: vectors of D complex numbers of modulus 1.
- **Binding** `x ⊗ y` is the elementwise product (the book's key, or shift); unbinding multiplies by
  the complex conjugate (the inverse key).
- **Bundling** is the sum (the book's tally). `phase(x)` sets every component back to modulus 1.
- **Similarity** `sim(x, y) = Re⟨x, y⟩ / D`. Cleanup (the book's scanner) takes the nearest item of a
  codebook.
- **Protection.** `ρ_c` and `ρ_q` are fixed random permutations (Gayler 2003).
- **Two position codes**, both fractional power encoding, `Z^d = exp(i·d·φ)`, so
  `Z^d ⊗ Z^e = Z^(d+e)` ([Komer et al. 2019](https://cogsci.mindmodeling.org/2019/papers/0156/index.html);
  [Frady et al. 2021](https://arxiv.org/abs/2109.03429)):
  - **exact** `Z`: φ uniform; different offsets are unrelated. Used in targets and readout, where
    every span must come back exactly;
  - **smooth** `Z_s`: φ normal with σ = 0.5, so `sim(Z_s^d, Z_s^e) ≈ exp(−(d−e)²/8)` (0.88 one word
    apart, 0.61 at two, 0.04 at five). Used in every decision, so that what is learned at one distance
    carries to nearby distances. σ is an ablation.
- **D = 1024** by default (512 suffices for the read-back). A term of a phase-normalised bundle of k
  terms keeps a similarity of about 0.886/√k, while unrelated vectors scatter with standard deviation
  σ_D = 1/√(2D): at k = 12, 0.256 against 0.022, eleven standard deviations. The book's "a few dozen
  terms sit cleanly at about 1000 dials" and the original's 32 clean terms say the same.

### 5.2 Level 0: word stars (fixed)

    f(w) = phase( h("id:" + w) + (1/√t) Σ_{g ∈ trigrams(#w#)} h("tri:" + g) )

`h(s)` is a phasor vector seeded from sha256 of the string, as in the original's
`"sop-stars-v1:id:<word>"`. The form keeps every word distinct; the letter trigrams make "boxes" close
to "box" (Joshi, Halseth and Kanerva 2016). An unseen word has a star, and no word list is involved.

### 5.3 Order inside a wire

Every constellation X has an **origin** `a_X`: the position of the first word of the wire or of
anything it holds. A star at position p is placed at `Z^(p − a_X)`. This gives the order inside a key
("the two small red boxes"), keeps two occurrences of one word apart, and gives back the exact span
of every value. Because positions are relative, a wire has the same constellation wherever it stands.
Without positions, writing the wires in tree order gives back 98.37% of the labels; with positions,
100% (`v2/holding.out`).

### 5.4 The constellations

Every term carries the type of what it holds: `T_word` for a word, `T_t(Y)` for a held wire of type t
(the type atom sits at the holder):

    C_X =   Σ_{own words p at key κ}       R_κ ⊗ T_word   ⊗ Z^(p − a_X)   ⊗ f(w_p)
          + Σ_{held wires Y at key κ}      R_κ ⊗ T_{t(Y)} ⊗ Z^(a_Y − a_X) ⊗ c(Y)
          + Σ_{pointed wires Y at key κ}   R_κ ⊗ T_{t(Y)} ⊗ Z^(a_Y − a_X) ⊗ c(Y)        (offset may be negative)
          + [ R_attachment ⊗ V_ambiguous ]
          + while open: Σ_{stars Y held aside here}  R_aside ⊗ T_{t(Y)} ⊗ Z^(a_Y − a_X) ⊗ c(Y)

    C_M = Σ_{top wires Y} R_top ⊗ T_{t(Y)} ⊗ Z^(a_Y) ⊗ c(Y)              (the message; a_M = 0)

- `T_t` is one of 8 fixed type stars (nominal, relation, coordination, and the clause in its five
  forms) plus `T_word`.
- The keys of each type (its domain, from the schema): nominal `head`, `dependent`, `rel`; relation
  `marker`, `negation`, `to`; coordination `conjunct`, `conjunction`, `rel`; clause `verb`,
  `auxiliary`, `negation`, `modifier`, `discourse`, `subject`, `complement`, `rel`, `ellipsis`.
- **Held aside** is a term under the named star `R_aside` in the open constellation below the held
  star. A claim moves the term: it is subtracted there and bound at a key of the claimer. No aside
  term is left in a finished target.

The example of section 1, written out (T_w = T_word):

    C_n1 = R_dependent ⊗ T_w ⊗ Z^0 ⊗ f(the) + R_dependent ⊗ T_w ⊗ Z^1 ⊗ f(blue) + R_head ⊗ T_w ⊗ Z^2 ⊗ f(box)
    C_r1 = R_marker ⊗ T_w ⊗ Z^0 ⊗ f(next) + R_marker ⊗ T_w ⊗ Z^1 ⊗ f(to) + R_to ⊗ T_nominal ⊗ Z^2 ⊗ c(n2) + R_attachment ⊗ V_ambiguous
    C_c1 = R_verb ⊗ T_w ⊗ Z^0 ⊗ f(move) + R_complement ⊗ T_nominal ⊗ Z^1 ⊗ c(n1) + R_rel ⊗ T_relation ⊗ Z^4 ⊗ c(r1)
    C_k1 = R_conjunct ⊗ T_imperative ⊗ Z^0 ⊗ c(c1) + R_conjunction ⊗ T_w ⊗ Z^9 ⊗ f(and) + R_conjunct ⊗ T_imperative ⊗ Z^10 ⊗ c(c2)
    C_M  = R_top ⊗ T_coordination ⊗ Z^0 ⊗ c(k1)

Conjuncts are ordered by their positions, so no ordinal key `R_next^i` is needed (an ablation).

### 5.5 Condensing

    c(X) = ρ_c( phase( C_X ) )

- `phase` keeps a unit-modulus star in the same sky as a word star, so it is placed like a word.
- `ρ_c` protects it: its own terms cannot meet the parent's terms by accident. Expanding is `ρ_c⁻¹`
  followed by unbinding.
- This is Hinton's reduced description (1990) and Plate's chunk (2003, chapter 3): noisy when
  unbound from its parent, made exact again by cleanup against the clean-up memory.
- Learned variant: `c(X) = ρ_c(K_t ⊗ phase(C_X))`, one learned star per type; still exactly
  invertible. A learned compression like Pollack's RAAM (1990) is not used: it loses the exact
  inverse.

**Why not the original `Compiler`'s nesting.** The original adds the inner sum under its role without
normalising (`vsa-semantic-space/tool/sop/world.py`). Every leaf term then ends up in the top vector,
bound with the product of the keys on its path; products of keys commute, so two paths with the same
keys in another order collide (the book's "a grid, not a tree"). With condensing, each level holds
only its own terms and the path is recovered by one cleanup per level.

### 5.6 The atlas

- Every condensed star is kept as an item bound with its origin: `I(Y) = Z^(a_Y) ⊗ c(Y)`. The item is
  the wire's identity: the same wire is the same item wherever it is referred to, and two identical
  wires at different places are different items.
- The atlas grows by one star per wire. What stays fixed is the size of each vector and the number of
  terms in each constellation.

### 5.7 Two tracks: words and kinds

The word constellations above are the targets, the readout and the equivalence. The pilot's
decisions need to know what kind of word stands where, not which word, so every open constellation
also has a **kind constellation**, built the same way with the learned kind stars `κ_p` instead of
`f(w_p)`, the condensed kind stars `s(Y)` of its children, and the smooth position code `Z_s`. The book
makes the same split: the chart is written with word identities, the route is learned per kind.

**Kinds** are learned and replace the book's given categories:

    x_k = phase( Σ_{d=−3..3} λ_d ρ^d(f(w_{k+d})) + μ_1 R_first ⊗ f(w_1) + μ_2 R_end ⊗ f(last mark) )
    π_k(c) = softmax_c( β · sim(x_k, K_c) ),   κ_k = Σ_c π_k(c) K_c            (C = 64 kind stars)

The window is permutation-coded context (BEAGLE, Jones and Mewhort 2007; Sahlgren, Holst and Kanerva
2008). A closed constellation's kind comes from its condensed kind star `s(Y)` by the same cleanup
against a second memory of 64 stars.

## 6. Reading the circuit back from stars

This is the strategy's output path (second review, points 2 and 3).

### 6.1 The decoder

Start from the message star with `a_M = 0` and type M. For every node X reached (origin `a_X`, type
`t_X`, its constellation `C_X = ρ_c⁻¹(c(X))`) and every key κ of `t_X`'s domain:

    U_κ = C_X ⊗ conj(R_κ) ⊗ Z^(a_X)
    candidates = { T_word ⊗ Z^p ⊗ f(w_p) : every word p of the message }  ∪  { T_{t(Y)} ⊗ I(Y) : every atlas item Y }
    accept every candidate with sim(U_κ, candidate) > 5 σ_D

- One cleanup per key, over the message's words and the atlas together; the type atom tells words
  from wires and one wire type from another.
- A word accepted at several places keeps the best one, so every word has exactly one place (the
  schema's Rule 1).
- A wire found for the first time is expanded from its exact atlas star and read in turn; each level
  is cleaned, so errors do not add up with depth.
- `attachment=ambiguous` when `sim(C_X, R_attachment ⊗ V_ambiguous) > 5 σ_D`.
- No scan over offsets: the origin bound into the item does that work.

### 6.2 Measured with the grouping given (`v2/m1star.py`; nothing learned)

Exact means every wire, type, ambiguity mark, reference (holding and re-entrant) and word placement
as in the label. One threshold, 5σ, fixed before the run.

| Sample | Exact |
| --- | --- |
| all labels | 88,105 messages. D = 256: 99.892%; D = 512: 99.993%; D = 1024: 99.997% (3 messages with one spurious edge) |
| long sample | 8,537 messages, all 2,203 of 25 words or more and a random 6,334 shorter. D = 128: 73.53%; D = 256: 99.285%; D = 512: 99.953%; D = 1024: 100% |
| 25–39 words | D = 512: 1,148 / 1,151; D = 1024: 1,151 / 1,151 |
| 40+ words | D = 512: 1,051 / 1,052; D = 1024: 1,052 / 1,052 |
| time | decoding: median 0.49 ms, 99th percentile 2.98 ms per message at D = 1024 (numpy, one core) |

**Like for like** (second review, point 8). The two controls have no item memory:

| Control | Exact |
| --- | --- |
| no atlas | same tree, children decoded from the noisy unbound vector (`hierarchy-checks/m1probe.py`, its own encoding), 2,000 labels drawn at random: 33.5% at D = 1024, 53.6% at D = 4096 |
| flat chart | `DESIGN-flat.md` with its answers given (`m0/capacity.py`, own sample of 5,201), weighted to the population of length buckets: 91.0% at D = 256, 98.2% at D = 512, 99.7% at D = 1024; for 40+ words 0 / 1,052, 0 / 1,052, 765 / 1,052 |

The hierarchy without the atlas is worse than the flat chart: what makes representations of
representations readable is the clean-up memory, one star per wire.

**What this does and does not show.** It shows that the representation is lossless with the grouping
given, at a size fixed in advance, for every length in the data. It is close to guaranteed by
construction (at most 12 terms per constellation at D ≥ 512), so it is a necessary check, not an
answer to the owner's question. Whether a reader can learn to place and move stars is M2.

### 6.3 At reading time

- The pilot builds the word constellations as it reads (section 8): hard terms for decided stars,
  or, when it keeps beliefs, `Σ_κ p(κ) R_κ ⊗ …` for a word and a relation's star added to each
  candidate holder with its probability.
- At the end the decoder above runs on the pilot's own message star and atlas. The cleanup then
  settles each belief: a word goes to its strongest place, a relation to its strongest holder, and
  the score differences are the margins. This is where the constellations do work at reading time.
- The pilot's explicit tree (its lists of what it opened, closed and moved) is written as a second
  circuit. Every disagreement between the two is counted and reported; neither suppresses a circuit.
- The writer (`writeCircuit`, `validateSyntax`) orders and checks the wires. It joins adjacent words
  at the same `head`, `verb`, `marker` or `conjunction` into one value and never joins `dependent`,
  `modifier`, `auxiliary`, `negation` or `discourse` (declared not VSA). With the spans the pilot
  knows, it gives back 88,106 / 88,106 labels.
- **Margins and remainder.** Every key and every choice has a margin (best minus second). The
  remainder of a constellation is `1 − sim(phase(C̃_X), phase(Ĉ_X))`, where `Ĉ_X` is recompiled from
  the decoded wire. A message's confidence is its smallest margin and its largest remainder, with
  calibration curves. `attachment=ambiguous` is written from the ambiguity star or when the
  attachment margin is below τ (fitted on dev-B); both variants are reported.

## 7. Placing stars: the route book

This is the owner's "how the stars are placed in the space" (second review, point 5). Every star s
(a word at position p, or a closed constellation Y with origin `p = a_Y`) is placed in its
constellation X at an **address**, the product of a learned key and the fixed position step.

### 7.1 Pair codes and key–value memories

Pairs of kinds are not tables of D-dimensional keys (no `K² × D` table). A pair is bound into one
code, and a learned associative memory turns the code into a key:

    q(a, b) = a ⊗ ρ_q(b)                                              pair code of two kind stars (order kept by ρ_q)
    Mem(q) = phase( Σ_{i=1..M} softmax_i( β · sim(q, Q_i) ) · V_i )    key–value memory, M = 256 slots

This is a clean-up memory whose items are paired with values (Kanerva's sparse distributed memory;
an attention read in today's terms, [Ramsauer et al. 2021](https://arxiv.org/abs/2008.02217)). Its
keys `Q_i` and values `V_i` are learned stars. Three such memories hold the book's three kinds of
relative keys: `A` (from the opener), `B` (from the previous word), `L` (backwards, at a claim). A
fourth serves the choices among stars (section 8.6). Soft kinds give soft pair codes, so nothing is
discrete inside the reading.

### 7.2 The drawings and the vote (the book's "three drawings")

For an open constellation X with origin `a_X` and opener `o_X` (the word that opened it; for a
coordination, its conjunction):

    from the opener      d_open(s | X)   = A( q(κ_{o_X}, κ_s) ) ⊗ Z^(p − a_X)
    pair of neighbours   d_pair(k | X)   = B( q(κ_{k−1}, κ_k) ) ⊗ addr(k−1 | X)            (when word k−1 is in X)
    path                 d_path(k | X)   = exp( i · Σ_{j = o_X .. k} Σ_c π_j(c) θ_P[c] )   (running product of per-kind keys from the opener)
    backward, at a claim d_back(Y | X)   = L( q(κ_{o_X}, s_Y) ) ⊗ Z^(a_Y − a_X)             (a star held aside, claimed by X's opener)
    beacons              d_beacon(s | X) = phase( Σ_{κ still empty in X} b_{t_X,κ} R_κ ) ⊗ Z^(p − a_X)

    addr(s | X) = phase( Σ_d g_d(κ_s) · d_d(s | X) )                 the drawings vote (weights g learned per kind)

- These are the codes of the original reader (`vsa-semantic-space/tool/sop/infer.py`,
  `Routebook.addresses`: path, bigram, the chain's relative keys `A` and backward keys `L`), applied
  inside each constellation from its opener instead of across the whole sentence.
- The beacon drawing is the book's beacon: an expected key of X's type pulls the next star while it
  is empty and is erased when filled.
- The pair key composes: for a dependent followed by its head, `B ≈ R_head ⊗ conj(R_dependent) ⊗ Z`,
  the book's "shift" from one role to the next.

### 7.3 Reading the key, and the terms

    κ̂(s | X) = argmax_{κ ∈ domain(t_X) ∪ {aside}} sim( addr(s | X) ⊗ Z^(−(p − a_X)), R_κ )      margin = best − second

    term of a word:     addr(k | X) ⊗ T_word ⊗ f(w_k)
    term of a wire:     addr(Y | X) ⊗ T̃(Y) ⊗ c̃(Y)          (T̃: the believed type, Σ_t p(t) T_t)

- The placement is a cleanup against the named stars of X's domain, plus `R_aside` ("no key here
  yet": the book's held aside). It is not a 9-way prototype classifier: the prototypes are the fixed
  legend, and what is learned are the drawings that lead to them.
- When a constellation opens, its opener's key in the holder is read the same way. When it closes,
  the key is read again from its condensed star.

### 7.4 Training the placement

    L_place = Σ_wires w · ( 1 − sim( phase(C̃_X), phase(C*_X) ) )  +  Σ_stars w · CE( softmax_κ(β · sim(addr ⊗ Z^(−d), R_κ)), κ* )

- `C*_X` is the target constellation compiled bottom-up from the label (as the original `Compiler`
  does, but with condensing); `C̃_X` is the one the route book builds. The first term is the
  original's objective, `−cos(S, S*)`, at every wire.
- Said plainly: the word stars and offsets of one constellation are nearly orthogonal, so the first
  term works mostly as "land on the right key", weighted per constellation; the cross-entropy makes
  that explicit and gives the margin a scale.
- In M2a the grouping is given, so this is the direct test of "learn how the stars are placed".

## 8. Moving stars: the pilot

### 8.1 Tokens and state

The pilot walks the words of `wordsOf(text)`, the punctuation marks between them, and an end token.
Punctuation can close and open constellations but is never placed. The state at token k:
- the open constellations, in order from the message to the innermost, `[M, X_1, …, X_m]`; each with
  its word constellation, its kind constellation (aside terms included) and its expected keys;
- the atlas;
- the probe at position k.

### 8.2 Deciding at the evidence (the adopted conventions)

The static oracle that turns a label into training moves needs a time at which each wire opens.
These times are conventions, and they decide what the pilot must predict before it can see the
evidence. The adopted conventions open every wire at the word that shows it, and move stars later
instead of guessing early (second review, point 4):

| Wire | Opens at |
| --- | --- |
| nominal, clause | its first own word; a verbless fragment wraps what is held at the token after its words |
| relation | its first own word (marker or negation), even when its `to` began earlier: it then claims the `to` from the held list; without marker, at the first own word of its `to` (for a clause, its verb or first own word; for a coordination, its first conjunct's) |
| coordination | its conjunction; it **gathers** every conjunct already built, whether a closed sibling at the same key or a star held aside; without a conjunction word, at the token after its last conjunct |

Before its coordination opens, each conjunct takes the coordination's place: it is placed at the key
the coordination will have, as if there were no coordination, and is moved in when the conjunction
comes. Claims come from the held list of any open constellation. When the place a new constellation
takes is closed, it is reopened.

### 8.3 Coverage and lookahead (`v2/oracle2.mjs`, `v2/oracle2-diff.mjs`)

Every move records its arguments, and the replay executor (`replay` in `oracle2.mjs`) rebuilds the
circuit from the words and the moves alone, with `writeCircuit`.

| Measure | Result |
| --- | --- |
| first-draft conventions | 87,842 / 88,106 (99.70%) derived and replayed to the identical core; 264 failures: a constellation closed while a star was still held aside in it 198 (195 clauses, mostly `drawing/scenes-*`), first conjunct not found 53, re-entry 9, other 4; agreement 216, judge 41, written 7 |
| adopted conventions | 88,083 / 88,106 (99.97%) derived and replayed to the identical core; 23 failures: re-entry of a held wire 20 (long scene lists), closed with held items 2, holding cycle 1; agreement 19, judge 3, written 1. 9 of the 23 are derived by the first-draft conventions |
| the 195 crossing labels | rebuilt under the adopted conventions, through reopen; no move was added. Whether they are label errors is left to the data session (they are listed in `v2/oracle2-failures.json`) |
| openings before their evidence | first draft: 6,926 of 544,075 (1 word: 3,711; 2: 794; 3: 249; 4–6: 956; 7 or more: 1,216; mostly relations whose marker follows their `to`, and coordinations opened at conjunct 2); adopted: none of 549,035 |
| aside decisions with a possible holder open | first draft 8,859, adopted 9,514. Words until the claiming opener, adopted: nominal 1: 3,329; 2: 4,396; 3: 462; 4–6: 209; 7+: 38; relation 1: 611; 2: 13; 3: 255; 4–6: 189; 7+: 1; other 14. Beyond three words: 442 |
| moves per word | 2.33 |
| messages needing a move (adopted) | claim 28,047; open aside 28,046 (a nominal 27,350, a relation 2,759); gather 1 conjunct 13,086, 2: 2,513, 3 or more: 2,046; reopen 3,892 (one star 3,190, a chain of two or more 1,209); point 4,441 |

Lookahead is counted in words from the decision to the word that shows the wire (for a relation
without marker, the first own word of its `to`). Under the adopted conventions the only decisions
that need later words are "hold aside or place here": the pilot sees a nominal while a relation is
open and must decide whether it is the relation's `to` or the subject of a clause still to come.
These sit mostly within the ±3-word window of the kinds; 442 do not.

**Next variant to measure (M1):** remove even these by **provisional placement**: a star whose holder
has not opened takes the place of its nearest unopened holder in the open constellation (as
conjuncts already do), and is moved when the holder opens. Its coverage and the lookahead of the
remaining decisions decide whether it replaces held aside.

### 8.4 Which constellation receives a star: the gates

For an incoming star s (the word at k, or a constellation that has just closed), the gates are tested
from the innermost open constellation outwards:

    g_close(X | s) = σ( γ_close( q(κ_{o_X}, κ_s) ) + Σ_part u_part · sim(V_part(X), G_close,part) + b_close )
    g_open(s | X)  = σ( γ_open( q(κ_{o_X}, κ_s) )  + Σ_part u_part · sim(V_part(X), G_open,part)  + b_open )

    p(s → X_j)          = (1 − g_close(X_j | s)) · Π_{i > j} g_close(X_i | s)      receiver X_j, after closing X_{j+1..m}
    p(s placed in X_j)  = p(s → X_j) · (1 − g_open(s | X_j))
    p(s opens in X_j)   = p(s → X_j) · g_open(s | X_j)

- `γ(q)` is the book's gate number per kind, read here from the pair code (the chart's opener, the
  incoming star) through scalar values stored beside the keys of memory A.
- The products are the original's chain formula (`Π (1 − g)`), run over the open constellations
  instead of over earlier words.
- When s opens a constellation, its type is a choice (section 8.5) and its key in the receiver comes
  from the route book (section 7), `R_aside` included.
- At the conjunction of a coordination, the gather is a sequence of yes/no choices over the closed
  siblings at the same key, from the most recent backwards (section 8.6).

### 8.5 Views and scores by parts

Every part is a small bundle shifted to the probe with `Z_s^(−k)`, with its own prototypes:

| Part | Content (terms) |
| --- | --- |
| word | `R_{−1} ⊗ κ_{k−1} + R_0 ⊗ κ_k + R_{+1} ⊗ κ_{k+1}` (3) |
| current | the kind constellation of the tested constellation (at most about 12) |
| cur × word | the same bound with `κ_k`: pairs of kinds with keys and offsets (at most about 12) |
| parent | the same two parts for the constellation below (at most about 12 each) |
| aside | the aside terms of all open constellations (a few) |
| last | the last closed child, with its key and offset (1) |
| expected | the beacons, `Σ_κ b_{t,κ} R_κ ⊗ E` for keys still empty (at most 9) |

    score(m) = Σ_part u_part · (1/β) log Σ_{j=1..P} exp( β · sim(V_part, P_{m,part,j}) ),     P = 4

Used for the structural choices that are not placements: the type of a new constellation, the form
and the ambiguity at close. No part goes beyond the clean range of one constellation. The choice of
parts is a hand-made template (declared not VSA).

### 8.6 Choices among stars

For claim, gather, reopen or attach, and point:

    score(Y | s, choice) = sim( C( q(κ_s, s_Y) ) ⊗ G_choice ,  Z_s^(a_Y − p) ⊗ R_{key(Y)} )  +  part terms

- `C` is the fourth key–value memory, read with the pair code of the deciding star's kind and the
  candidate's kind; `G_choice` is one learned star per kind of choice. In plain words: "is Y where a
  star of my kind expects a partner of Y's kind, for this choice?". The score is bilinear in the two
  kinds and smooth in the distance.
- **Candidates are found by the VSA:** aside stars by unbinding `R_aside` from each open
  constellation, closed children by unbinding the reference keys of the open constellations, each
  followed by a cleanup over the atlas. The pilot's lists check them; misses are counted.
- **Attachment** of a relation is the choice of its receiver among the open constellations and the
  closed nominals of the current clause (a closed one is reopened); its margin is where
  `attachment=ambiguous` comes from.

### 8.7 The moves

| Move | Operation on stars, with its recorded arguments |
| --- | --- |
| open | a constellation of type t, with origin k, at key κ of the receiver or aside |
| place | the word's term, `addr ⊗ T_word ⊗ f(w_k)`, is added to the receiving constellation (kind track: `κ_k`, `Z_s`); an expected key is erased |
| close | condense; add `I(X)` to the atlas; place the star in its receiver at its key, or aside; form and ambiguity read here |
| claim | a star held aside in any open constellation (which one) moves to a key of the new constellation |
| gather | a coordination opens and moves in the listed stars (closed siblings at its key, or stars held aside) as conjuncts |
| reopen | the listed closed stars are unfolded from the atlas back onto the open list; their terms are subtracted from their holders |
| point | `C_X += R_κ ⊗ T ⊗ Z^(a_Y − a_X) ⊗ c(Y)` for a star Y already placed (which one): re-entrance |

"Move the stars" is literal: claim, gather and reopen subtract an exactly known term from one
constellation and bind the same star into another.

### 8.8 Held aside, in detail

- "the title is too long": "the title" is an aside term in the message; "is" opens the clause, which
  claims it at `subject`.
- "if Grace isn't in the people list yet, add her please": "if" opens a relation aside; its clause is
  built inside it; "add" opens the main clause, which claims the relation at `rel`.
- "Chapter and its entire contents removed": "Chapter" is aside; "and" opens a coordination that
  gathers it and is itself aside; "removed" opens the clause, which claims the coordination at
  `subject`.
- "a fireplace": the nominal is aside; at the end token a fragment clause opens and claims it.

### 8.9 The two readers, and what stays symbolic

- **Left-to-right** (the book's pilot; transition-based reading in the field, Nivre 2008). Built
  first, because its oracle and replay exist.
- **Bottom-up** (easy-first, Goldberg and Elhadad 2010), a comparison in M2c: it repeatedly takes the
  best pair of neighbouring items and places one into the other at a key, or opens a constellation
  holding both, with the same route book, gates and memories. It needs no lookahead and no aside
  list; for contiguous trees the correct merges are known from any state; 8% of labels need one
  re-placement step.
- **Symbolic in both** (declared): the loop over words or items, the list of open constellations, the
  beam and the re-placement pass. Inside that control the state, the scores, the placements and the
  moves are VSA.

## 9. Learning

### 9.1 Fixed and learned

At D = 1024, C = 64 kinds, M = 256 memory slots:

| Part | Size, and whether learned |
| --- | --- |
| legend | word stars, trigram stars, key stars (with `R_aside`, `R_top`, `R_attachment`), type stars (8 and `T_word`), `V_ambiguous`, `E`, `Z`, `Z_s`, permutations, part keys: fixed, seeded, not stored |
| kinds | word kinds 64 × D and constellation kinds 64 × D: 131,072 phases; λ, μ, β: about 15 scalars |
| path keys | `θ_P` 64 × D: 65,536 phases |
| memories A, B, L, C | 4 × (256 keys + 256 values) × D: 2,097,152 phases; gate values 2 × 256 scalars |
| vote, beacons | g: 64 × 5 scalars; b: about 70 scalars |
| part prototypes | type, form, ambiguity: about 16 outcomes × 8 parts × P = 4: 524,288 phases; choice stars 5 × D |
| fit prototypes | one kind-constellation prototype per type for the beam: 8 × D |
| options | situation memory 512 × D; condensing stars 8 × D |

The total is about 2.8 M phases (11 MB as float32). The original's route book was 3.1 M phases
(12.6 MB) at 32 kinds; the second revision's pair tables were 5.1 M. M (64, 128, 256, 512) and C (32,
64, 128) are ablations.

### 9.2 Targets at every node

The label circuit gives its tree of wires, and from it: the adopted oracle's moves with their
arguments; the target constellation `C*_X` and target star `c*(X)` of every wire, compiled bottom-up
with the same fixed stars; the keys of every star.

### 9.3 Losses, and what each one reaches

    L =  L_place                                                    section 7.4: per-wire 1 − cos and key cross-entropy
       + Σ_gate decisions   w · BCE(g_open, g_close)
       + Σ_choices          w · CE(type, claim, gather, reopen/attach, point)
       + Σ_closes           w · CE(form, ambiguity)
       + λ_neg ·            margins from rejected circuits

The constellation the pilot believes in, under the gold state, has soft receivers:

    C̃_X = Σ_stars s  p(s placed in X) · addr(s | X) ⊗ T̃(s) ⊗ star(s)

`star(s)` is `f(w)` for a word or the pilot's own `c̃(Y)` for a closed constellation; the sum runs over
every star for which X was a candidate receiver, gold or not.

| Loss | What it reaches |
| --- | --- |
| per-wire 1 − cos | the drawings and their vote (keys); the close and open gates, through `p(s → X)`; the attachment choice, through the soft placement of the relation's star; the type choice, through `T̃`; children's keys through `c̃(Y)`, but only weakly (one wrong word one level down still leaves a similarity of 0.69) |
| key cross-entropy | every placement directly, with a scale for its margin |
| BCE on gates | every open and close decision, including those at punctuation and the end token, which place no star |
| CE on choices | type, claim, gather, reopen, point, attachment |
| not reached | under teacher forcing, the effect of a wrong decision on later ones (exposure bias): handled by roll-in in M2c |

- **Weights w:** judge and written labels ×3, agreement labels ×1. Accepted circuits of the registry
  outside the benchmark are used where the dataset has no label.
- **Rejected circuits** outside the benchmark: a margin between the gold move and the rejected
  circuit's move at the first step where they part, and a per-wire hinge where they share a wire.
- **Benchmark texts** are removed (lowercased, spaces collapsed) and their registry lines are never
  used.

### 9.4 Procedure and cost

- **M2a** (placement, grouping given): all wires of a batch in parallel; the per-wire losses computed
  bottom-up, one depth level at a time.
- **M2b** (moves, teacher forcing): every state is known, so all views of a batch are built in
  parallel.
- **M2c** (roll-in, in the spirit of DAgger, Ross, Gordon and Bagnell 2011): with a probability
  rising to 0.5 the pilot continues from its own move. The adopted oracle continues from any state
  still consistent with the gold tree (every closed constellation a gold wire, every open one a
  prefix of a gold wire): a wrong key with the right receiver keeps the state consistent, and a
  constellation closed too early can be reopened. At the first move that leaves the gold tree the
  sequence stops and the loss counts up to there (early update, Collins and Roark 2004). A full
  dynamic oracle for this move set is not available.
- **Splits.** dev-B (primary): whole CSV files whose stem has sha1 mod 10 = 0. dev-A: sha1 of the text
  mod 10 = 0 among the rest. Train: the rest. Text-hash lists are frozen with the snapshot.
- **Optimisation.** Adam, learning rate 0.02 for phases (the original's), 0.005 for scalars; phases
  start uniform; batches grouped by length; early stop on dev-B exact core; three seeds before any
  conclusion.
- **Cost, from bytes moved and arithmetic.** Elementwise products are limited by memory: at about
  2 M steps per epoch and some 200 vector operations of 8 KB per step, forward and backward, an epoch
  moves some tens of TB, minutes at the GB10's 273 GB/s. The memory reads are matrix products
  (256 × D per read, about four reads per star): about 50 TFLOP per epoch with the backward pass.
  Expected: minutes per epoch for M2a, 5–20 minutes for M2b and M2c; measured at the first run.
- **Reading cost.** Sequential: about 2.3 moves per word, each a few memory reads, plus the read-back
  (0.49 ms median at D = 1024): a few ms per message in numpy, in a Python worker on the pattern of
  `strategies/distilbert/syntax_worker.py`. For comparison: `hmm-rules` 0.44 ms, spaCy 49 ms.

## 10. The beam, scored by the fit of what it builds

In M3 the pilot keeps a beam of 4. A hypothesis is scored by its moves and by how well its closed
constellations fit (second review, point 7):

    score(h) = Σ_moves log p(move) + λ · Σ_{closed X in h} fit(X)
    fit(X)   = margin_type(X) + mean_κ margin_key(X) − remainder(X) + sim( phase(K_X), Π_{t_X} )

`K_X` is X's kind constellation and `Π_t` a learned prototype of well-formed constellations of type t.
After the end token a re-placement pass tests each closed star against the other possible holders
with the choice score and moves it when another fits better by a margin (the book's "the copies
vote", done on stars). Both are symbolic search over VSA scores (declared).

M3 ablations:
- **soft stack:** the list of open constellations replaced by a superposition (each level bound with
  a power of a fixed permutation), to see whether the explicit list can go;
- **no action loss:** train with the per-wire loss alone, no BCE or CE on moves, to see whether the
  gates emerge from the constellation targets as they did in the original (relation markers open,
  content words closed, in 5 of 5 seeds).

## 11. Equivalence of analyses

Two circuits with the same tree of wires give the same message star and the same atlas: the
compilation is deterministic and does not depend on wire names. Two scores compare analyses:
- **message star:** `sim(m_A, m_B)`. It is biased towards the top: one word replaced in a wire leaves
  a median similarity of 0.688 at depth 1, 0.847 at 2, 0.931 at 3, 0.964 at 4, 0.985 at 5, 0.997 at
  7 or more (critic's `depthbias.py`, D = 1024);
- **identical subtrees:** match the two atlases item by item; an equal item means an equal subtree,
  as in subtree kernels (Collins and Duffy 2002). Score `2·matched / (|A| + |B|)`; every subtree
  counts once, whatever its depth.

On the 390 judged messages with an accepted and a rejected circuit (`v2/equiv2.py`, D = 1024):

| Score | Against the number of differing core lines |
| --- | --- |
| message star | Spearman −0.50; partial, controlling for the number of wires, −0.51; medians 0.666 (1–2 lines differ), 0.596 (3–4), 0.492 (5–8), 0.321 (9+) |
| identical subtrees | Spearman −0.17; partial −0.47; medians 0.50, 0.40, 0.33, 0.26 |

The message star's agreement with the size of the difference is not explained by circuit size. Use:
comparing two strategies' circuits beyond exact identity; a structure-only star (one constant star
for every word) compares shapes. As the book says, equivalence "is induced by the shared targets",
not labelled on pairs.

## 12. What is VSA here and what is not

**VSA, inside the reading:**

| Part | How |
| --- | --- |
| word stars | hash phasors of the form and letter trigrams, bundled |
| positions | fractional power encoding relative to each constellation's origin; exact for targets, smooth for decisions |
| constellations | binding with named stars, type atoms and positions; bundling |
| condensing | phase projection and a fixed permutation; expanding by its inverse and unbinding |
| atlas | items bound with their origin; cleanup |
| kinds | soft cleanup of a permutation-coded context against a learned memory |
| placement | the route book's drawings (opener, pair, path, backward, beacon) from key–value memories read with pair codes; vote; cleanup against the named stars |
| gates | the pair code's value in memory A, plus similarities of the parts with learned stars |
| decisions | cleanup of each part against learned prototypes |
| choices among stars | the pair code's key from memory C compared with each candidate's place; candidates found by unbinding and atlas cleanup |
| moving stars | subtracting a known term and binding the star into another constellation |
| readout | unbinding, cleanup over the message's words and the atlas, margins, remainder |

**Not VSA, declared:**

| Part | Note |
| --- | --- |
| tokenizer | `wordsOf`, the contract of all strategies; punctuation marks between words |
| control loop | the left-to-right walk over words (or the bottom-up loop over pairs) and the explicit list of open constellations, in order |
| domains | placements and moves are restricted to the keys a type has in the schema |
| opening conventions | the times at which the oracle opens each wire and the gathering of conjuncts (section 8.2): training only, but a structural prior that shapes what is learned |
| ±3 window | the width of the context that makes a kind, and the ±1 of the view's word part |
| view template | which parts the decision view has, and their keys (section 8.5) |
| oracle, replay, roll-in | derive moves from labels; rebuild circuits for the coverage check; the consistency test of roll-in |
| beam, re-placement | symbolic search over the VSA scores |
| training | gradient descent on similarities and cross-entropies |
| thresholds | 5σ in the read-back; τ for ambiguity |
| writer | `writeCircuit`, `validateSyntax`, and the join rule of section 6.3; no word is named |

**Not used at all:** word lists and any rule that names a word (not even function words); a
part-of-speech tagger (the original's `typer.py` is excluded); a parser; a transformer; pretrained
embeddings; knowledge worlds; any output of `hmm-rules` or spaCy at reading time.

**Said plainly.**
- In the field's terms this is a learned incremental reader with an explicit list of open
  constellations: a transition-based reader whose state, scores, placements and structural steps are
  VSA, and in which no grammar is written.
- The book's pilot also walks the words in a loop, but its structure comes only from where the
  learned keys carry the probe, softly, trained by `−cos(S, S*)`. Here the keys inside each chart
  come from the book's drawings, trained the same way; which chart receives a star is a gate
  decision, soft during training and settled by the read-back at reading time.
- With the structure given, the representation carries no decision; M1 measures only the
  representation and the moves.
- The labels are mostly `hmm-rules` + spaCy agreement circuits, so what is learned first is their
  convention.

## 13. Measurements so far

All on `0a01d23` (`hierarchy-checks/v2/`), unless marked:

| Check | Result |
| --- | --- |
| writer ceilings | spans known 88,106 / 88,106; words only, wires in tree order 86,672 (98.37%) |
| constellation size | at most 12 terms in 88,101 of 88,106 labels |
| read-back | 99.892% / 99.993% / 99.997% of 88,105 at D = 256 / 512 / 1024, one 5σ rule (section 6.2) |
| controls | no atlas 33.5% (D = 1024); flat 99.7% weighted, 765 / 1,052 of 40+ words (D = 1024) |
| oracle and replay | first-draft conventions 99.70%; adopted 99.97%; no opening before its evidence (section 8.3) |
| equivalence | partial Spearman −0.51 (message star), −0.47 (identical subtrees) |
| contiguity | 91.99% (`revision-checks/contiguous.out`) |
| depth bias | section 11 (critic, 81,870) |

## 14. Milestones

**M1. Data, moves and representation** (structure given; nothing learned). Done on `0a01d23`:
snapshot and sha1 list; tree statistics and writer ceilings; the moves with their arguments and the
replay executor for two conventions, with lookahead; the read-back on all labels with one fixed
threshold; the flat and no-atlas controls weighted to the same population; equivalence with partial
correlation. Remaining:
1. Freeze the text-hash lists of train, dev-A, dev-B and the benchmark exclusions; measure
   near-duplicates of dev-B (texts with a training text one word substitution away).
2. The provisional-placement variant of section 8.3: coverage and the lookahead of what remains.
3. Controls: the soft-belief read-back (each placement keeps a share p of its belief on the right
   key, p = 0.6 and 0.45, and a relation's star split between two holders), the original
   `Compiler`'s nesting, ordinal keys against positions.
4. Clean modules from the checks: `src/tree.mjs`, `src/moves.mjs` (oracle and replay), `m1/readback.py`.
5. Stop rules, stated in advance and met: replay coverage at least 99.9% (99.97%); read-back at least
   99.9% at D = 1024 with one rule (99.997%).

**M2a. Placing stars, with the grouping given** (the first direct test of "learn how the stars are
placed"). The tree and every star's receiver come from the adopted oracle; the route book learns the
keys.
1. `model.py`, `train.py`: kinds, path keys, memories A, B, L, beacons and the vote, trained by
   `L_place` (section 7.4). Minutes on the GB10; three seeds.
2. Output through the read-back (section 6) with the gold grouping and the learned keys.
3. Report on dev-B (primary) and dev-A, near-duplicates apart: key accuracy overall and per key, for
   words and for claimed stars; exact wires; exact core; words unseen in training; constellation
   similarity per depth; the learned kinds listed by their most frequent words (for inspection,
   never used as a rule).
4. Controls on the same inputs: a logistic regression over the same kinds (opener, previous word,
   word, distance), and the first draft's prototype place classifier. Ablations: each drawing
   removed; M and C; σ of `Z_s`.

**M2b. Moves under teacher forcing** (messages of at most 12 words: 68,369 replayable labels).
1. Gates, types, form and ambiguity, and the choices among stars, with soft receivers in the
   per-wire loss; teacher forcing; three seeds.
2. Per-move accuracy on dev-B, under teacher forcing only.
3. Control: a logistic regression and an averaged perceptron on the same view, given as symbolic
   features (the window kinds, the kinds and keys filled in the open constellations, the aside and
   last items, the expected keys).
4. Decision rule: if the VSA decisions are more than 2 points below the control, strengthen them
   (situation memory, more prototypes, larger M) before M2c.

**M2c. Free running and the writer** (at most 12 words).
1. The pilot reads alone; roll-in with its own moves (section 9.4); output by the read-back, the
   explicit tree as a check.
2. Judged by placement accuracy (each word at the right wire and key), core-line F1 and exact core,
   on dev-B and dev-A; by construction (aside, claim, gather, reopen, point, ambiguity); unseen
   words; read-back against the explicit tree.
3. Bars on the same split and length cap: the `experiments/syntax-learned` parser retrained without
   the features that come from `hmm-rules` (its stations and word kinds) and, as a reference, with
   them; the bottom-up reader.
4. Decision rules: good under teacher forcing but poor free running means exposure bias (more
   roll-in, the beam); errors on unseen words mean kinds; attachment errors dominant mean the choice
   memory; far below the parser means comparing with M2b to tell weak decisions from conventions.

**M3. All messages and the benchmark.**
1. All lengths; beam 4 scored by fit; the re-placement pass; judged weights, registry labels,
   negatives from rejected circuits. Ablations: soft stack; no action loss.
2. The strategy: `index.mjs` (`{name: 'rvss', schema: 'syntax', open(configuration)}`,
   `analyse(text) → {analyses: [{sop}]}`, `close()`) and `worker.py`; ms per message, start-up time,
   model MB.
3. The benchmark (1,831 messages), counted with the procedure of `experiments/syntax-learned/review/`
   (section 15).

## 15. Evaluation rules

- **Snapshot.** Every number names its data snapshot (commit, date, count). Numbers from another
  state are marked.
- **Like for like.** Headlines compare controls with the same resources: the read-back with the
  atlas against its own no-atlas control, and the no-atlas control beside the flat chart; figures are
  weighted to the population, with length buckets shown.
- **dev-B first.** dev-B (whole files) is the primary development measure; dev-A is reported beside
  it, and texts of either with a near-duplicate in training are reported apart.
- **Benchmark** (1,831 messages, `eval-results/2026-11-27-syntax-benchmark-random`), with a copy of
  the review procedure writing into the scratch folder, every strategy recounted in the same run and
  the verdict snapshot recorded:
  - known accepted, known rejected, unjudged and invalid, by source;
  - comparisons only on messages where both strategies have verdicts;
  - exact-core agreement with accepted circuits;
  - lower and upper bounds;
  - the 593 messages with an earlier label against the 1,238 without; the clean subset;
  - at least 60 unjudged circuits read **blind** against `tests/benchmark/syntax/rules.md` (strategy
    names hidden, order shuffled). No judges are launched.
- **The bars are context, not success lines.** The learned parser's 55.3% known accepted (37.4% on
  the 1,238) used `hmm-rules`' stations and word kinds as features and a dynamic oracle (Goldberg and
  Nivre 2012), and included verdicts from judges run for it; `hmm-rules` reads 78.6%. Every count is
  reported, whatever it is.
- **Equivalence** is reported with the identical-subtree score beside the message star, with the
  partial correlation controlling for size.

## 16. Risks

| Risk | What, and the answer |
| --- | --- |
| weak decisions | Similarities with prototypes may not separate moves. Answer: parts with their own prototypes, pair-code memories, the situation memory; tested in M2b against a logistic regression on the same view. |
| error propagation | A left-to-right reader carries early mistakes. Answer: roll-in, the beam scored by fit, re-placement, the bottom-up reader. |
| aside decisions | 9,514 need later words, 442 beyond the window. Answer: provisional placement (M1), the beam, the bottom-up reader. |
| kinds not discovered | The book's limit; the original failed on SNIPS through its kinds (0.107 on new slot heads). Answer: kinds learned from placement, letters and context; measured on unseen words. |
| memories too small or overfit | Answer: M and C as ablations; dev-B by whole files; unseen words. |
| soft receivers blur training | Answer: BCE on the gates beside the per-wire loss; λ tuned on dev-B. |
| VSA candidates missed | Answer: the explicit lists check them; misses are counted. |
| circular labels | 95% are `hmm-rules` + spaCy agreement circuits. Answer: the 1,238 messages without an earlier label and the clean subset; judged weights; negatives. |
| rare constructions | ellipsis 41, shared subject 4,370, reopen 3,892 messages, gathering of 3 or more conjuncts 2,046. Recall reported apart. |
| atlas size | One star per wire; stated. |
| data moving | The parallel data session rewrites labels. Answer: the frozen snapshot, named in every result. |

**Fallback, in order, every step strict:** more prototypes and the situation memory; larger memories
and more kinds; the beam and re-placement; the bottom-up reader; negatives from rejected circuits. No
word rule, tagger or pretrained model is added; a variant with any of those needs its own name. If
rvss stays far below, it remains a measured research strategy and `hmm-rules` stays the production
reader.

## 17. Files

| File | Content |
| --- | --- |
| `DESIGN.md` | this design (third revision) |
| `DESIGN-hier-v2.md`, `DESIGN-hier-v1.md`, `DESIGN-flat.md` | earlier versions, unchanged |
| `hierarchy-checks/v2/` | this revision's checks on `0a01d23`: `snapshot-0a01d23.sha1`, `RESULTS.txt`, `m1star.py`, `oracle2.mjs` (oracle with arguments and replay), `oracle2-diff.mjs`, `oracle2-failures.json`, `equiv2.py`, and their outputs |
| `hierarchy-checks/` | the first draft's checks; `holding.mjs`, `oracle.mjs`, `oracle-stats.mjs`, `export-trees.mjs`, `export-pairs.mjs` now read a snapshot through `SYNTACTIC_DIR` / `REGISTRY_DIR` |
| `revision-checks/` | the first critic's scripts, rerun on `0a01d23` |
| `m0/` | the flat design's measurements (`export.mjs` reads `SYNTACTIC_DIR`) |
| `src/`, `m1/` | M1 modules |
| `model.py`, `train.py`, `decode.mjs` | M2a–M2c |
| `index.mjs`, `worker.py`, `eval/` | M3 |

Models go to `.local-models/rvss/` (now `.local-models/strict-vss/`); exported data and the snapshot
copy go to the scratch folder `strict-vss/`. Nothing outside the strategy's folder is edited.

## 18. References

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
- H. Ramsauer et al. Hopfield networks is all you need. ICLR 2021 (associative memory read as
  attention).
- J. Nivre. Algorithms for deterministic incremental dependency parsing. *Computational Linguistics*
  34(4), 2008; Y. Goldberg, J. Nivre. A dynamic oracle for arc-eager dependency parsing. COLING 2012.
- Y. Goldberg, M. Elhadad. An efficient algorithm for easy-first non-directional dependency parsing.
  NAACL 2010.
- S. Ross, G. Gordon, J. A. Bagnell. A reduction of imitation learning and structured prediction to
  no-regret online learning (DAgger). AISTATS 2011.
- M. Collins, B. Roark. Incremental parsing with the perceptron algorithm (early update). ACL 2004.
- M. Collins, N. Duffy. Convolution kernels for natural language. NeurIPS 2002.
- The original: `vsa-semantic-space/tool/sop/world.py` (`Compiler`), `tool/sop/infer.py`
  (`Routebook.addresses`, readout, margin, residual), `experiment/v8_gates.py` (route book, gates,
  chains).
- The book: "Meaning as a Path" (digest in the scratch folder `strict-vss/book-digest.md`).
