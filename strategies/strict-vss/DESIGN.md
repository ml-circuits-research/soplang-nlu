# strict-vss: a reader whose analysis goes through a vector-symbolic state

Status: design, 2026-11-27. Nothing here is trained yet. The measurements in section 2 and in
`m0/RESULTS.txt` were taken on the labels for this design.

## Why a second strategy

The strategy `vss` (`strategies/vss`) is a hidden-Markov tagger with hand-written general rules. Of the
original vector-symbolic reader (`/home/salboaie/work/sopworlds/vsa-semantic-space`, described in the
book *Meaning as a Path*) it kept the name and a small vector helper. The owner asked for a separate
strategy, `strict-vss`, that reads a message the way the original did: in a vector symbolic
architecture (VSA, also called hyperdimensional computing). `vss` stays as it is and keeps its name.

"Strict" means four things:
- The message is composed into one state only by VSA operations: binding, bundling, permutation,
  and learned keys and gates like the original's.
- The circuit is read out of that state by unbinding and cleanup. Cleanup means taking the nearest
  item in a codebook.
- No rule names a word. There are no word lists, no parser, no transformer and no knowledge worlds.
- Section 7 lists every part that is not VSA.

## 0. In short

- **One world, one legend.** The legend is the syntax schema. The book says so itself (§11): "The
  legend is the system's schema". There is one named star per key and per form value. With a single
  world there is a single route book, and the book's choice among worlds (§5) is not needed.
- **Encoding.** Each word is a star: a fixed random phasor vector made from its written form, so a word
  never seen before still has one. The pilot draws each star into one chart S at an address. The address
  has two parts:
  - the domain the word lies in (which key it fills). This part comes from the original's route book:
    keys per kind and per pair of kinds, and gates.
  - the beacon of the wire it belongs to. A beacon is the position code of that wire's anchor word,
    placed there by an opener.
- **Decoding, star by star.** For every word, unbind its own star and position from S. Two cleanups
  follow: one over the named stars (its domain) and one over the beacons of this message (its wire).
  Every word therefore gets exactly one place, which is Rule 1 of the schema. A deterministic writer
  turns these per-word answers into wires.
- **Many wires in one vector.** The chart regroups exactly into one constellation per wire, each bound
  to its beacon: S = Σ_j ρ(y^j) ⊙ C_j. This is the book's "many charts, linked by keys" (§12) held in
  one vector.
- **Measured before any training (M0).**
  - Capacity. With the right answers given, a chart of D = 2048 dimensions gives back every word of
    4,438 messages, including all 1,438 messages of 25 words or more. At D = 1024, 99.6% of words
    come back.
  - The writer. Going from per-word answers to a circuit gives back the label's core for 99.77% of
    81,870 labels.
  - So superposition and the writer cost almost nothing. Any loss will come from the learned
    encoder.
- **Honest expectation.** The earlier learned prototypes reached 55% known accepted (a transition parser)
  and 65% (fine-tuned spaCy) on the benchmark. The original reader lost information that its kinds
  carried (SNIPS slots 0.387 against 0.831). strict-vss will probably start below `vss`. The first goal
  is to measure whether a VSA state can carry the analysis at all. Its margin and remainder give a
  confidence per message that is useful even if its circuits are not adopted.

## 1. The book's terms and the technical terms

| Book (*Meaning as a Path*) | In this design | Established technical term |
| --- | --- | --- |
| star | the vector of one word, made from its form | atomic hypervector; FHRR phasor (Plate 1995, 2003) |
| named star R[r] | one fixed vector per key of the syntax schema and per value of `form` | role vector |
| legend | the syntax schema, `schemas/syntax/schema.sop` | role codebook |
| world | one only: syntax | — |
| route book | the learned keys per kind and per pair of kinds, and the gates | learned phase tables |
| pilot | the encoder that reads the message and draws the chart | — |
| kind (category) | a word class found without labels (section 4.3) | cluster of distributional vectors |
| drawing | one placement of a star at an address. The book draws each word three times (§13 step 9); here four times | one address code in a bundle |
| opener, gate | a word whose kind has an open gate places a beacon (§3.5; §13 step 8) | learned sigmoid per kind |
| beacon | the position code of a wire's anchor word. Other words take it as the wire they belong to | pointer, slot identity; fractional power code of a position |
| held-aside word | a word that comes before the word it belongs to ("the" before "box", a subject before its verb). It is drawn at an opener after it (§13 step 9) | backward chain |
| chart | the bundle S of every drawn star | superposition state |
| constellation | the stars of one wire, bound to that wire's beacon | sub-bundle C_j |
| frame | the circuit read from the chart | decoded role–filler structure |
| domain | the region of one named star: the key a word fills | role subspace |
| margin | the best cleanup score minus the second best (§3.3) | decision margin |
| remainder | the chart minus the chart compiled back from the frame (§8) | residual |

Operations, all on complex phasor vectors of D dimensions (Plate's Fourier holographic reduced
representation, FHRR, as in the original):
- binding is the elementwise product `⊙`, and unbinding multiplies by the conjugate;
- bundling is the sum `+`;
- ρ is a fixed random permutation of the dimensions (Gayler's MAP, 1998 and 2003; Kanerva 2009);
- a fractional power `z^k` is the phasor `exp(i·k·φ)` for a fixed random phase vector φ (Plate 1995;
  Komer et al. 2019; Frady et al. 2021);
- cleanup is the argmax of `Re⟨u, c⟩ / D` over a codebook.

## 2. What the labels look like (measured, `m0/stats.out`)

The data: 83,619 messages have a circuit. 1,749 of them are benchmark messages (compared case- and
space-insensitively) and are removed, leaving 81,870 for training and development. Of these:
- 95.0% are agreement labels, written by `vss` together with a spaCy strategy;
- 4.9% (4,042) were judged by a judge;
- 32 were written by hand.

The judged registry outside the benchmark adds 5,110 accepted and 1,431 rejected circuits, over 4,896
messages. Its 6,202 circuits inside the benchmark are never used for training.

| Per message | Distribution |
| --- | --- |
| words | mean 9.6, median 8, 90th percentile 16, 99th 28, maximum 67 |
| clauses | 1: 66.1%, 2: 20.0%, 3: 9.8%, 4: 2.4%, 5–6: 1.7% |
| nominals | 1: 16.5%, 2: 31.8%, 3: 21.9%, 4: 12.9%, 5–7: 13.8%, 8 or more: 2.7% |
| relations | 0: 30.3%, 1: 31.9%, 2: 22.9%, 3: 8.3%, 4 or more: 6.6% |
| coordinations | 0: 80.8%, 1: 18.6%, 2 or more: 0.6% |
| wires | 2–5: 53%, 6–10: 33.9%, 11–20: 11.7%, 21–40: 0.9% |

| Keys over all labels | Count |
| --- | ---: |
| nominal.head / dependent | 247,318 / 211,457 |
| clause.form / verb / complement / subject | 125,874 / 119,141 / 113,952 / 41,598 |
| relation.from = relation.to | 110,950 (15% without a marker; 54% start at a clause, 46% at a nominal; 20% end at a clause) |
| relation.marker | 94,274 (91,220 one word, 3,031 two words, 23 three words) |
| coordination.conjunct / conjunction | 36,341 / 14,741 (conjuncts: 12,174 clauses, 3,842 nominals, 158 relations; 9.5% of coordinations have no conjunction word) |
| clause.modifier / discourse / auxiliary | 32,536 / 18,778 / 18,360 |
| relation.attachment=ambiguous | 5,704 |
| clause.negation / relation.negation / clause.ellipsis | 243 / 112 / 55 |
| form values | imperative 64,987; declarative 23,884; nonfinite 19,088; interrogative 11,182; fragment 6,733 |

What this means for the design:
- **Messages are short.** The per-word answers of a whole message fit in one chart (section 4.5).
- **Rare keys.** Negation, relation negation and ellipsis occur a few hundred times or less, so a
  learner will hardly learn them. They are measured on their own.
- **Ambiguous attachment.** `attachment=ambiguous` is used inconsistently across the strategies that
  wrote the labels. In the benchmark's accepted circuits it ranges from 6% (`vss`) to 48% (`prolog`).
  It is therefore not learned as a label; it is read from the margin (section 5.4).

**The per-word view.** The mapping of `experiments/syntax-learned/parser/tree.mjs` gives every word one
answer: a word label, or an anchor label (the tie of the word's wire to its parent wire, times what the
word anchors), together with the word it points at.
- It encodes 81,714 of 81,870 labels. The other 156 have an inner wire with two parents.
- 44 different answers occur. 3.4% of messages have crossing arcs, which does not matter here: a chart
  has no projectivity limit.
- A word points at a word at most 2 positions away in 70.6% of cases, at most 5 away in 92.8%, and
  more than 10 away in 1.54%.
- If a relation is anchored at its marker (the preposition takes the arc to the wire it attaches to,
  and the end noun points at the preposition) and conjuncts are chained (each points at the previous
  one): 76.5%, 94.9% and 0.79% (`m0/rehead.mjs`). This is the book's picture, in which a preposition is
  an opener.

## 3. The legend, and what makes two readings the same

The named stars are fixed random phasors, one each for the following.
- **Answers of a word that anchors no wire.** `nominal.dependent`, `clause.auxiliary`,
  `clause.negation`, `clause.modifier`, `clause.discourse`, `relation.marker`, `relation.negation`,
  `coordination.conjunction`. One more star, *continuation*, is not a key of the schema: it says that
  a word continues the head or the verb before it (a head of several words, a verb run).
- **What a word anchors (its own wire).** `nominal.head`; `clause.verb` bound with one of four
  `form` values (imperative, declarative, interrogative, nonfinite); a fragment, with the key of its
  first own word (complement, subject, relation, modifier, discourse, negation, auxiliary); `ellipsis`
  bound on a fragment.
- **How that wire is tied to its parent.**
  - none: a top clause, which takes the root beacon;
  - `clause.subject`;
  - `clause.complement`;
  - a relation from the clause at the beacon;
  - a relation from the nominal at the beacon;
  - `coordination.conjunct`;
  - a conjunct relation;
  - complement of one clause and subject of the next ("let us move").

An anchor word's domain is the product of two named stars: its tie and what it anchors. There are 44
answers in the labels, and the cleanup runs over these.

**Meaning, and equivalence.** In the book, the meaning of a sentence is its answers to the legend's
questions. Two formulations are equivalent exactly when they give the same answers: "the same S*,
because they give the same answers to the same questions" (§13 step 4). With the syntax legend, the
same answers means the same circuit core (`normalForm` in `tests/benchmark/syntax/lib.mjs`), up to the
readings that the judges' rules let pass either way. That class is the agreement key `variants`
(`relaxedCore` or `agreementKey` in the same file). Charts of two such readings are only similar, since
the stars carry positions; their frames are equal. This equivalence is used in two places:
- in training: when a message has several accepted circuits, the target is the nearest one (section 6);
- in evaluation: development accuracy is reported both by core and by `variants`.

## 4. Encoding: how a message becomes a chart

### 4.1 Stars (word identities)

The star of a word is fixed and never learned, so an unseen word works:

    f_w = phase( id(w) + λ · Σ_i ρ^i( t(g_i) ) )

- `id(w)` is a random phasor drawn from a hash of the exact written form, as the original did
  (`sha256("sop-stars-v1:id:<word>")`).
- `g_i` are the letter trigrams of `#form#`, case kept. `t(g)` is a phasor from the hash of the trigram.
  The power `ρ^i` keeps the order of the trigrams (letter n-gram vectors with permutation: Joshi,
  Halseth and Kanerva 2016).
- `phase(·)` keeps the phase of each component, so the result is a phasor again.

So "widnshield" lies near "windshield", and a capitalised or numeric form carries that in its letters.
No list of words is involved.

Punctuation marks are not words of the schema (`wordsOf` leaves them out), but they are drawn into the
chart as stars: a question mark is evidence for `form=interrogative` and a comma for a split between
clauses. They are never asked a question in the readout.

### 4.2 Positions and beacons

- The token code of the k-th word is `f_k ⊙ z^k`, a fractional power of a fixed random base. Tokens at
  different positions are nearly orthogonal whatever their words, so two "the" in one message do not
  collide.
- The beacon of word j is `y^j`, a power of a second, independent base. A fixed random vector `y^root`
  is the beacon of "no parent".
- Beacons are always used under the permutation, as `ρ(y^j)`, so a position code and a beacon code
  never commute into each other.

### 4.3 Kinds (categories)

The book takes kinds from a dictionary or a tagger, and says they "do not arise on their own" (§13,
§15). The original took the 40 most frequent words as their own kinds and put every other word into
48 k-means clusters of skip-gram vectors. That is the cause of its SNIPS failure: unseen names fell
into clusters unrelated to their role.

Here:
- **Type vectors.** The type vector of a word is a random-indexing context vector over all 183,497 raw
  messages, with no labels. Each neighbour's `id` is permuted by its offset
  (`Σ_{d=−2..2, d≠0} ρ^d(id(w_{k+d}))`), so order enters the vector (Kanerva, Kristoferson and Holst
  2000; Sahlgren, Holst and Kanerva 2008; BEAGLE: Jones and Mewhort 2007).
- **K kinds.** The type vectors of words seen at least twice are clustered into K = 48 kinds by
  k-means. The kind prototypes are the cluster centres.
- **The kind of one occurrence** is the cleanup of `phase(m_w + λ1·form_w + λ2·Σ_d ρ^d(K[c_{k+d}]))`
  against the prototypes:
  - `m_w` is the word's type vector, which is absent for an unseen word;
  - `form_w` is its trigram code;
  - the last term is the bundle of its neighbours' kind prototypes.

  So an unseen name gets its kind from its letters and from the words around it, not from a cluster
  computed without context.
- **M1** uses hard kinds as the original did. **M2** lets the prototypes be learned with the route book
  (a codebook, which is allowed). This makes the kinds partly supervised, and section 7 says so.

Ablation, not the default: the stations that `vss` learns as kinds. They come from a hidden-Markov
model over a hand-written legend that fixes the places of English function words, so using them
imports `vss`'s rules. They are measured only to see how much better kinds would help, and reported
as not strict. The book itself warns against this (see SNIPS: the tagger alone 0.886, tagger and
reader 0.798).

### 4.4 The route book and the four drawings

For word k with kind c_k, the domain address is the vote of four drawings. The first three are the
original's (V8 in `experiment/v8_gates.py`; book §13 step 9). The fourth is the backward drawing the
book's own limit calls for.

    path_k     = ρ(path_{k−1}) ⊙ E(θ_path[c_k])                 keys since the start, order kept by ρ
    pair_k     = E(θ_pair[c_{k−1}, c_k])                         the key of the pair of kinds
    forward_k  = Σ_{q<k} α^F_{kq} · E(A[c_q, c_k])               from the openers before it
    backward_k = Σ_{q>k} α^B_{kq} · E(L[c_q, c_k])               from the openers after it (held-aside words)
    d_k        = path_k + pair_k + forward_k + backward_k

`E(θ) = exp(iθ)`. The permutation in `path` answers the book's limit that "an address remembers
which keys were used, not in what order" (§13 step 10): the paths no longer form "a grid, not a tree"
(§8).

The beacon taken by word k is a weighted bundle of the beacons of the message:

    b_k = h_k · Σ_{q<k} α^F_{kq} · y^q  +  (1 − h_k) · Σ_{q>k} α^B_{kq} · y^q  +  (leftover weight) · y^root

- **M1**, the original's gates. Two gates per kind: `g^F` opens a beacon for later words and `g^B` for
  earlier ones. Then
  - `α^F_{kq} = g^F_{c_q} · Π_{q<i<k} (1 − g^F_{c_i})` (the last opener before k);
  - `α^B_{kq} = g^B_{c_q} · Π_{k<i<q} (1 − g^B_{c_i})`. This counts every opener after k, not only the
    first one, which is the remedy the book left as a hypothesis (§13 step 9);
  - `h_k = σ(s_{c_k})` per kind.

  This is V8's `chainL`, with the address of the opener replaced by its beacon. The original's chain
  was already a pointer whose weights came from gates.
- **M2**, a beacon memory read by similarity. Every word q places `g_q · ρ(y^q) ⊙ P[c_q]` in a memory
  (a bundle). Word k reads it by unbinding its expectation key `E[c_k]` and cleaning up over the
  beacons, with a soft cleanup:
  `α_{kq} ∝ exp(τ · g_q · Re⟨P[c_q], E[c_k]⟩ / D + κ_{c_k}(q − k))`. Here κ is a learned kernel over
  distance, which is shift-invariant through fractional powers (Frady et al. 2021).

  This is the book's beacon (§3.5): an opener places a beacon for the kinds that may follow, and a
  later word takes the one that matches its kind. Unlike M1, it can skip a nearer opener of the wrong
  kind, which attachment and the scope of a coordination need. Section 7 says what this is
  mathematically.

### 4.5 The chart

    S = Σ_k  f_k ⊙ z^k ⊙ d_k ⊙ ρ(b_k)

The target chart compiled from a label (section 6) is the same expression with the right answers:

    S* = Σ_k  f_k ⊙ z^k ⊙ R[l_k] ⊙ ρ(y^{beacon_k})

- `l_k` is the word's answer: a named star, or the product of its tie and what it anchors.
- `beacon_k` is its anchor word, or root.

Grouping the words by beacon gives

    S* = Σ_j ρ(y^j) ⊙ C_j,    where C_j = Σ_{k : beacon_k = j} f_k ⊙ z^k ⊙ R[l_k]

that is, one constellation per wire (a nominal is `R[head] ⊙ star + Σ R[dependent] ⊙ star`), bound to
its beacon. Constellations are linked by the anchor words' ties. This is the book's structure of
states for long texts ("many charts, linked by keys", §12), held in one vector. The book's capacity
warning ("a few dozen terms sit cleanly in a constellation", §2.5; "the honest range of a chart is a
single event", §8) is met because each constellation holds the words of one wire, at most about a
dozen. The whole chart holds one term per word (at most 67) and was measured:

| Capacity (`m0/capacity.py`, `m0/soft.py`; 4,438 messages, 1,438 of them of 25 words or more) | Result |
| --- | --- |
| right answers given, D = 1024 | 99.56% of words; 96.0% of messages exact (messages of 40+ words: 253 of 427) |
| right answers given, D = 2048 | 100% of words and of messages, every length |
| diffuse addresses, 60% of the weight on the right answer, D = 2048 | all exact except 4 of 427 messages of 40+ words |
| diffuse, 45% on the right answer, D = 2048 / D = 4096 | 40+ words: 135 / 363 of 427 exact; 25–39 words: 886 / 1,007 of 1,011 |

So D = 2048 is enough while the encoder is sharp. If it stays diffuse, long messages need D = 4096, or
charts split by learned gates of clause openers (section 9).

Why per-word pointers and not the original's nested compilation (`R_role ⊙ value`, `Σ R_next^i ⊙ item`,
in `tool/sop/world.py`, class `Compiler`)? Two complements of one clause bundled under one role,
`R_complement ⊙ (val(n1) + val(n2))`, mix their dependents. "the red box" and "a blue circle" can no
longer say which colour is whose. This is the superposition catastrophe that binding was introduced
to solve (von der Malsburg 1986; Plate 2003). Indexed roles would avoid it, but at the price of
decoding paths of variable depth. Giving every wire its own identity, the beacon of its anchor word,
avoids both. The book's beacons already are such identities.

## 5. Decoding: reading the circuit out of the chart, star by star

### 5.1 The readout

For every word k of the message (punctuation marks excluded):

    u_k = S ⊙ conj(f_k ⊙ z^k)
    score_k(l, j) = Re⟨ u_k , R[l] ⊙ ρ(y^j) ⟩ / D     for the 44 answers l and every beacon j ≠ k of this message and root
    answer_k = argmax (l, j);   margin_k = best − second best

The readout always goes through S. Reading `d_k ⊙ ρ(b_k)` directly, before the bundle, would skip the
superposition. That shortcut is measured, to know what the bundle costs, and is not the strategy.

| Way to read a variable number of wires | Chosen? | Why |
| --- | --- | --- |
| per word: unbind its star, then clean up over named stars × beacons (exhaustive) | yes | Every word gets exactly one place, so Rule 1 holds by construction. It reads in parallel and is exact. The search is small: 44 × (n+1) candidates, about 3,000 for the longest message. Cost n·44·(n+1)·D: about 6.5 M complex products for a median message, 0.4 G for the longest. |
| iterative peeling: read one wire, subtract it, read the next | no, only as a refinement | Errors compound and the result depends on the order. Used only in M3: subtract the terms of the confident words and read the uncertain ones again (explaining away, with the remainder). |
| resonator network that factors answer ⊗ beacon (Frady, Kent, Olshausen and Sommer 2020; Kent et al. 2020) | not needed now | It pays off when the product space is large (10^5 or more). Here exhaustive search is exact and cheap. It stays available if the answers are split into more factors later. |

### 5.2 From per-word answers to wires: the writer

A deterministic step turns the per-word answers into wires:
1. Group the words by beacon into wires.
2. Type each wire by what its anchor anchors.
3. Tie each wire to its parent by the anchor's tie.
4. Order the wires with `writeCircuit` (`lib/syntax.mjs`).

This is `treeToCircuit` of `experiments/syntax-learned/parser/tree.mjs`, which will be copied into this
folder. It names no word. When every answer is right it gives back the label's core for 81,681 of
81,870 labels (99.77%; `m0/roundtrip.mjs`). The rest are the 156 labels that cannot be encoded.

When answers do not form a tree, its repairs apply:
- a word answer with dependents hands them to its head;
- a word under root becomes a fragment;
- a lone nominal is wrapped in a fragment;
- a second subject becomes a complement;
- a coordination with fewer than two conjuncts hands its words on.

These repairs are not VSA. How often each one fires is counted and reported. Option for M3, off by
default: decide all answers together under the constraint that they form a tree, using a maximum
spanning tree over the cleanup scores (Chu–Liu/Edmonds). The original already decided jointly, with a
one-to-one assignment over the sentence's words (`vss-vs-bert/sop`). This is the one place that
borrows from parsing, and section 7 lists it.

### 5.3 How each key of the schema is read

| Key | Read from |
| --- | --- |
| clause.form | what the verb's star anchors: `verb` bound with imperative, declarative, interrogative or nonfinite. A clause with no verb is a fragment. |
| clause.verb | the star whose answer anchors a verb. Continuation stars after it extend the verb. |
| clause.auxiliary, negation, modifier, discourse | word stars with these named stars. Their beacon is the clause's anchor. |
| clause.subject / complement | an anchor star tied as subject / complement. Its beacon is the clause's anchor. |
| clause.ellipsis | a fragment bound with `ellipsis`. The clause it shares the verb with is the first conjunct of its coordination (the writer's rule). Only 55 cases in the labels: measured on its own. |
| nominal.head / dependent | a star that anchors a nominal, plus its continuation stars / dependent stars whose beacon is that head |
| relation.from | the beacon of the relation's anchor. The tie says whether it stands for the clause or the nominal anchored at that word. |
| relation.to | the wire anchored at the end word |
| relation.marker | marker stars. Their beacon is the end word, or, with the marker as anchor (M2), the marker itself. Adjacent marker words make one value ("next to"). |
| relation.negation | relation-negation stars, with the end word as beacon |
| relation without a marker | an anchor tied as a relation, with no marker star pointing at it |
| relation.attachment=ambiguous | the margin (5.4) |
| coordination.conjunct | anchor stars tied as conjuncts. Their beacon is the first conjunct (M1) or the previous one (chained, M2). |
| coordination.conjunction | conjunction stars, with the following conjunct as beacon |

### 5.4 attachment=ambiguous from the margin

A relation with a marker that starts at a clause or at one of its nominals has two candidate beacons
for its start: the clause's anchor, and a nominal of that clause. Its score margin between them is
compared with a threshold τ. When the margin is below τ, the writer puts the start at the clause and
adds `attachment=ambiguous`.
- This is the book's margin, "where 'I'm not sure' lives" (§3.3).
- The judges' rules accept the clause or any nominal of it that grammar allows, with or without the
  mark (`judging/RULES.md` line 40), so the mark does not lower acceptance.
- Labels with `attachment=ambiguous` are trained as plain relations from the clause.
- τ is fitted on the development split, and the share of relations marked is reported.

### 5.5 Margin, remainder and confidence

- **Margin.** Every decision has a margin. A message's margin is its smallest decision margin.
- **Remainder.** The decoded circuit is compiled back with the same stars, giving Ŝ. The remainder is
  `‖S − a·Ŝ‖ / ‖S‖` (§8).
  - Unbinding the remainder at each word's token code shows which words the frame does not explain.
  - A part of the remainder that no named star explains would point to a question the legend lacks.
- **Calibration.** The book asks for calibration "reported on every table", and for the "confident and
  wrong" rate at a threshold fixed in advance.
  - On the development split: the reliability curve of the probability that the circuit equals its
    label, against margin and remainder.
  - On the benchmark: the accepted share per decile of confidence, among the circuits with a known
    verdict.
- **Use.** The conversion can send only uncertain messages to judges.

## 6. Learning

**What is trained.** Only what a VSA allows:
- the route book: `θ_path[K,D]`, `θ_pair[K,K,D]`, `A[K,K,D]`, `L[K,K,D]`;
- the gates `g^F, g^B, s` per kind;
- in M2, the beacon keys `P, E[K,D]` and the distance kernel κ, and the kind prototypes `K[K,D]`.

The stars, named stars, positions and beacons are fixed random vectors, generated from seeds and never
stored.

**Objective.**
- **A, the book's.** Maximise `cos(S, S*)`, where S* is the label compiled as in 4.5. As in V8: Adam,
  learning rate 0.02, phases initialised uniform on (−π, π).
- **B, if A plateaus.** Cross-entropy of the readout of 5.1 over the (answer, beacon) pairs, read from
  S. It trains the decision itself, through the superposition. Which one was used is reported.
- **Equivalent readings ("frames equal").** A message may have several accepted circuits: the label,
  and judged accepted circuits that differ within the `variants` class. The loss uses the nearest of
  them, `−max_t cos(S, S*_t)`.
- **Weighting.** Judged circuits weigh 3 times an agreement label. The weight is tuned to 1, 3 or 10 on
  the judged part of the development split.
- **Negative examples (the original had none).** There are 1,431 rejected registry circuits outside
  the benchmark. Each word that a rejected circuit places differently from an accepted one gets a hinge
  on the readout: `max(0, δ + score_k(rejected) − score_k(accepted))`. Where no accepted circuit is
  known, the rejected placement is pushed below the best other one.

**Data and what is held out.**
- **Benchmark.** Every message of `eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz`
  (case- and space-insensitive) is removed from labels and registry before anything is trained.
- **Development split.** 10% of the rest, chosen by a hash of the normalised text.
- **Near-duplicates.** The earlier review found 297 benchmark messages within one edit of a training
  text (`experiments/syntax-learned/review/leak.mjs`). Benchmark numbers are reported with and without
  them.
- **Kinds.** The kinds are built from raw text without labels (all corpus lines, as the owner's rule
  says). One control run builds them without the benchmark texts.

**Time on the GB10.**
- Kinds: about 1–2 minutes.
- The original trained in 130–234 s per seed (30–40 k sentences, D = 1024, K = 32).
- Here: about 74 k messages, D = 2048, K = 48, length buckets. The pointer of M1 needs no loop over
  positions, because the beacons are fixed codes, not recursive addresses. Expected about 1–2 minutes
  per epoch and 10–20 epochs, so **15–40 minutes per run**. M1's first step measures this before any
  longer run.

## 7. Strictness audit

| Part | VSA? | Note |
| --- | --- | --- |
| stars (word identities) | yes | Fixed random phasors from a hash of the form, plus a bundle of letter trigrams. Never learned. |
| positions, beacons | yes | Fractional powers and a permutation |
| kinds | partly | The type vectors (random indexing) and the cleanup to prototypes are VSA. The k-means clustering that starts the prototypes is a standard unsupervised step outside VSA. Prototypes learned in M2 make the kinds partly supervised. |
| route book, gates | yes, learned | Phases per kind and per pair of kinds, and gates per kind, as in V8 |
| pointer, M1 | yes | Weights from products of gates over the beacons (V8's chain) |
| pointer, M2 | borderline | A soft cleanup over this message's beacons with a softmax. Mathematically this is one attention head whose values are the fixed beacons, with keys and queries made of route-book phases. There are no learned value maps, no layers and no per-word embeddings. It is named as such and compared with M1. |
| chart S | yes | One bundle |
| readout | yes | Unbinding, then cleanup over named stars × beacons. Always read from S. |
| writer: per-word answers to wires | no | Deterministic. `treeToCircuit` of tree.mjs (about 250 lines, with repairs) and `writeCircuit`. Ceiling 99.77%. The rate of every repair is reported. |
| joint decision under a tree constraint | no | A combinatorial search over cleanup scores. Off by default, M3 option. |
| thresholds (τ, calibration) | fitted numbers | On the development split |
| training | gradient (Adam) | As in the original |
| tokenizer | no | `wordsOf` of `lib/syntax.mjs`, shared by every strategy. Punctuation is drawn but never asked. |
| continuation star | outside the schema | Encodes values of several words (a head or verb run). |
| labels | not a rule, a bias | 95% are agreement labels written by `vss` with spaCy. Their conventions are learned. |

Absent:
- no rule that names a word, and no list of words;
- no parser, transformer, spaCy or knowledge world;
- no output of `vss` at reading time, except in the labelled ablation.

## 8. Evaluation

- **Development split, per word.** Accuracy of the answer, of the beacon and of both. Separately for:
  - anchor words and word answers;
  - relations: start, end and marker;
  - coordinations: conjuncts;
  - forms;
  - the rare keys.
- **Development split, per message.** Exact core, and core or `variants`.
- **Cost of the bundle.** The same figures read from the per-word addresses before the bundle.
- **Benchmark (1,831 messages).** Recomputed as in the earlier review
  (`experiments/syntax-learned/review/recompute.mjs`, with `strict-vss.jsonl` added). A circuit is:
  - **known accepted** if its core equals a circuit judged L8 in the run (`judging/packet-k` +
    `verdicts-k`), an accepted registry circuit, or the label before the run (`key/labels-before.jsonl`);
  - **known rejected** if its core equals a judged rejected circuit;
  - **unjudged** otherwise.

  All three counts are always reported. As a secondary estimate, `akey.mjs` checks whether an unjudged
  circuit shares the `variants` key with a known accepted or rejected one. 20 unjudged circuits are
  read against the judges' rules. No judges are launched, so the unjudged count will be large and the
  known accepted count is a lower bound.
- **Comparison** with the same run. GOAL means judged at L8–L10; the medians are of the run. The fair
  comparison with the others is on the messages where strict-vss's circuit has a known verdict.

| Strategy | Accepted (GOAL) | Median per message |
| --- | ---: | ---: |
| vss | 1,417 (77.4%) | 0.44 ms |
| distilbert | 1,415 (77.3%) | 3.9 ms |
| spacy | 1,683 (91.9%) | 49 ms |
| parser prototype (known accepted / rejected / unjudged) | 1,013 / 96 / 722 | 3.3 ms |

- **Speed per message and start-up time**, in the shared runner. Expected:
  - 2–10 ms per message with numpy on the CPU for a median message, mostly the readout;
  - well under 1 ms per message when batched on the GPU;
  - a JavaScript port of the chart and readout (about 150 lines, as in the original's numpy
    re-implementation) is possible later.
- **Model size.** The route book at K = 48, D = 2048 is 14.2 M phases, about 28 MB at 16 bits and 14 MB
  at 8 bits (the book: quantised codes, §14). At K = 32 it is 6.3 M phases, about 13 MB. A table of
  kinds per known word adds about 1 MB. For comparison: `vss` 3.2 MB, DistilBERT about 66 M parameters.

## 9. Risks and the fallback

| Risk | What it would look like | Answer |
| --- | --- | --- |
| The route book is a function of kinds and pairs of kinds. Attachment and the scope of a coordination need more. | M1 gets dependents and heads but misplaces relations and conjuncts. The original reached only 0.63–0.68 on new kind transitions. | M2's beacon memory, read by similarity |
| Kinds lose what the reading needs | Unseen names are misread, as on SNIPS (slots 0.387) | Letters and context in the kind of each occurrence (4.3). The `vss` stations ablation measures how much better kinds would help. |
| Agreement labels are circular | Close to `vss` on messages like its training data, far below on the rest. The parser prototype: 37.4% known accepted on messages without a label, against 63.7% for `vss`. | Judged weight and negative examples. Report separately on messages that had no label. |
| Capacity with a diffuse encoder | Long scene messages fail (measured: 45% of the weight on the right answer at D = 2048 leaves 135 of 427 messages of 40+ words exact) | D = 4096, or one chart per segment opened by learned gates of clause openers (the book's structure of states, §12) |
| Structure announced after its scope | "Q if P", postposed reporting: 0.20–0.44 in the original | The backward drawing, and the backward chain over every following opener |
| Rare keys | Negation (243), relation negation (112), ellipsis (55) hardly learned | Measured on their own. Not hidden in the averages. |
| Invalid sets of answers | Repairs fire often | Counted. M3: joint decision under a tree constraint, listed as not VSA. |

Fallback, if the circuits stay below `vss`: strict-vss as a VSA scorer of readings. Compile the circuit
of any strategy into S* and measure `cos(S, S*)`, the margins and the remainder. This is the book's
"the fit is the classifier" (§5), applied to readings instead of worlds. It can choose among the
circuits of `vss`, `spacy` and `distilbert`, and flag uncertain messages for judges. Used that way it
is no longer a strict reader, because its candidates come from other strategies. The scorer itself
stays VSA.

## 10. Milestones

- **M0 (done; `m0/`).**
  - The structure of the labels.
  - Capacity with the right answers given, at D = 256 to 4096, sharp and diffuse.
  - The ceiling of the writer (99.77%).
  - Distances to the beacon under two anchoring conventions.
  - The registry outside the benchmark.
- **M1, the smallest measurable reader (about 1–2 days).**
  - Kinds as in 4.3, hard.
  - Stars, positions and beacons.
  - The route book with the four drawings, and the gated pointer of M1.
  - The compiler of S*, and objective A.
  - Training on labels outside the benchmark. Measurements on the development split, including the
    cost of the bundle.
  - Benchmark: known accepted / rejected / unjudged, speed, size.
  - Decision: if the readout from S loses much against reading the addresses directly, the problem is
    capacity. If the addresses themselves are wrong, the problem is the route book, and M2 is next.
- **M2.**
  - The beacon memory, read by similarity.
  - The marker as the relation's anchor, and chained conjuncts. Their round trip is checked to stay at
    or above 99.7% before they are used.
  - Kinds of each occurrence, with learned prototypes. Objective B if needed.
- **M3.**
  - Judged weighting, negative examples, the nearest accepted circuit as target.
  - `attachment=ambiguous` from the margin.
  - Remainder and calibration curves; the "confident and wrong" rate at a fixed threshold.
  - Optional: refinement by explaining away; joint decision under a tree constraint.
- **M4, the strategy.**
  - `index.mjs` exporting `{name: 'strict-vss', schema: 'syntax', open(configuration)}`. Its engine
    has `analyse(text) -> {analyses: [{sop}]}` and `close()`.
  - A Python worker for numpy inference on the pattern of `strategies/distilbert/syntax_worker.py`.
  - The model files, and the writer in JavaScript.
  - A benchmark run through the shared runner, and the report.

Each milestone reports all three benchmark counts, the development figures, speed and size, whatever
they are.

## 11. Files

- `m0/stats.mjs`, `m0/stats.out`: the structure of the labels.
- `m0/export.mjs`: the per-word trees of the labels, as `trees.json`. The file is regenerated, not kept.
- `m0/capacity.py`, `m0/soft.py`: capacity of the chart.
- `m0/rehead.mjs`: distances under the two anchoring conventions.
- `m0/roundtrip.mjs`: the ceiling of the writer.
- `m0/reg.mjs`: the registry outside the benchmark.
- `m0/RESULTS.txt`: every figure, with the command that produced it.

## 12. References

- T. A. Plate. Holographic reduced representations. *IEEE Transactions on Neural Networks* 6(3), 1995;
  and *Holographic Reduced Representations*, CSLI, 2003 (FHRR, fractional powers, the superposition
  problem).
- P. Kanerva. Hyperdimensional computing: an introduction to computing in distributed representation
  with high-dimensional random vectors. *Cognitive Computation* 1(2), 2009.
- R. W. Gayler. Multiplicative binding, representation operators and analogy, 1998; Vector symbolic
  architectures answer Jackendoff's challenges for cognitive neuroscience, ICCS/ASCS 2003 (MAP:
  multiply, add, permute).
- E. P. Frady, S. J. Kent, B. A. Olshausen, F. T. Sommer. Resonator networks, 1: an efficient solution
  for factoring high-dimensional, distributed representations of data structures. *Neural Computation*
  32(12), 2020; S. J. Kent et al., Resonator networks, 2, same issue.
- E. P. Frady, D. Kleyko, F. T. Sommer. A theory of sequence indexing and working memory in recurrent
  neural networks. *Neural Computation* 30(6), 2018 (capacity of superposition).
- E. P. Frady, D. Kleyko, C. J. Kymn, B. A. Olshausen, F. T. Sommer. Computing on functions using
  randomized vector representations, 2021 (arXiv 2109.03429).
- B. Komer, T. C. Stewart, A. R. Voelker, C. Eliasmith. A neural representation of continuous space
  using fractional binding. CogSci 2019.
- P. Kanerva, J. Kristoferson, A. Holst. Random indexing of text samples for latent semantic analysis.
  CogSci 2000.
- M. Sahlgren, A. Holst, P. Kanerva. Permutations as a means to encode order in word space. CogSci 2008.
- M. N. Jones, D. J. K. Mewhort. Representing word meaning and order information in a composite
  holographic lexicon (BEAGLE). *Psychological Review* 114(1), 2007.
- A. Joshi, J. T. Halseth, P. Kanerva. Language geometry using random indexing. Quantum Interaction 2016.
- D. Kleyko, D. A. Rachkovskij, E. Osipov, A. Rahimi. A survey on hyperdimensional computing aka vector
  symbolic architectures, parts I and II. *ACM Computing Surveys*, 2022–2023.
- C. von der Malsburg. Am I thinking assemblies? 1986 (the binding problem).
- H. Ramsauer et al. Hopfield networks is all you need. ICLR 2021 (a soft cleanup equals one attention
  step; relevant to the M2 pointer).
- Y. J. Chu, T. H. Liu (1965); J. Edmonds (1967): maximum spanning arborescence (the optional M3
  decision).
- The original: `vsa-semantic-space/experiment/v8_gates.py` (V8: path, pair, chain and gates),
  `tool/sop/infer.py` (readout, margin, presence, remainder), `tool/sop/world.py` (`Compiler`), and
  the later decoder in `vss-vs-bert/sop` (one-to-one assignment over the sentence's words). The book
  *Meaning as a Path*: §2.5, §3.3, §3.5, §3.6, §5, §8, §11, §12, §13 steps 2, 4, 8, 9, 10, §14, §15.
