# strict-vss: reading a message through a VSA state

Status: design, revised 2026-11-27 after a critic's review. Nothing is trained yet. The first draft
is in commit f5be34c. The measurements quoted here come from the scripts in `m0/` (the first
measurements) and `m0/review/` (the review's checks, copied from scratch with their outputs).

## Why a second strategy

The strategy `vss` (`strategies/vss`) is a hidden-Markov tagger plus hand-written general rules.
Of the original vector-symbolic reader (`/home/salboaie/work/sopworlds/vsa-semantic-space`) it kept
the name and a small vector helper. The owner asked for a separate strategy, `strict-vss`, that
reads a message in a vector symbolic architecture (VSA, also called
[hyperdimensional computing](https://en.wikipedia.org/wiki/Hyperdimensional_computing)), the way the
original did. `vss` stays as it is and keeps its name.

"Strict" means:
- Words are high-dimensional vectors. The message is composed into one state only by VSA
  operations: binding, bundling, permutation, similarity, and cleanup against learned memories.
- The circuit is read out of that state by unbinding with role and pointer vectors, then cleanup
  (taking the nearest item of a codebook).
- No rule names a word. There are no word lists, no part-of-speech tagger, no parser, no
  transformer, no pretrained embeddings and no knowledge worlds.
- Learned parts are allowed, as in the original (it learned its codes and gates by gradient).
- A small deterministic step turns the decoded tree into wires. It is described in section 4.3 and
  every repair it makes is counted.

## In short

- **Target.** One circuit per message in the syntax schema (`docs/syntax-schema.md`,
  `schemas/syntax/schema.sop`, checked by `validateSyntax` in `lib/syntax.mjs`).
- **The circuit as a tree.** Every word gets one head (another word or the root) and one label
  (an attachment and a tag). The mapping exists (`experiments/syntax-learned/parser/tree.mjs`). With
  a one-line fix it gives back 99.93% of the labels.
- **Encoding.** Each word has a fixed vector made from its letters. Its context vector bundles its
  neighbours, permuted by offset, and two sentence-level items (the first word and the final
  punctuation mark), each bound to a role. The score of an arc is the similarity between the bound
  pair of two context vectors and a learned label vector. Gates computed the same way choose the
  head along the original's left and right chains. Each word's address (pointer to its head, bound
  with its attachment, bound with its tag) is bound to the word's own code and all are bundled into
  one state S.
- **Decoding.** For every word: unbind its code from S, clean up over (head × label). Violations of
  the tree's constraints are fixed by reading the word again with the offending candidates removed.
  The tree is written as wires in JavaScript.
- **What the state does.** In M1 the state carries decisions that vector similarities computed; it
  cannot add information, only crosstalk noise. M1 is therefore named "state as transport", and the
  comparison between decoding from the state and decoding the scores directly is mandatory. In M2
  the state does part of the computation: a memory hypervector of open heads and waiting words
  decides each attachment from what earlier words left in it (section 3.9).
- **Expectation.** strict-vss will very probably start below `vss` (78.6% on the benchmark) and far
  below `spacy` (93.3%). The first goal is to measure, honestly, how far a VSA state can carry the
  analysis.

## What changed after the review

| Point | Decision |
| --- | --- |
| Tree bug | Adopted. A coordination of relations was anchored at the end word of its first relation, which hid that word's own relation tie. One line in the copied `src/tree.mjs` fixes it: round trip 99.77% → 99.93%, no encoding failures left. A label `conjR~amb` is added (12 more circuits expected back). |
| Class tables | Adopted. Arc, label, gate and tag scores are similarities of hypervectors with learned memory vectors (section 3.5). No table indexed by hard word classes. The first draft's tables are kept only as an ablation in M2. |
| Chu–Liu–Edmonds | Adopted. Replaced by constrained re-reading from the state (section 4.2). Chu–Liu–Edmonds stays as a reported variant. |
| Strict-exact | Adopted. A fourth count: circuits where no re-read and no repair fired. |
| Transport | Adopted. M1 is described as "state as transport". Direct decode against state decode, per length bucket, is mandatory. |
| Working memory | Adopted for M2 as the real research step: the original's chain made vector-valued (section 3.9). |
| Re-heading | Moved to M2 as an ablation. M1 uses the content-head trees of tree.mjs. The inverse for ill-formed predicted trees is specified there and its repairs counted. |
| dev-B split | Adopted: by file stem (strip `.NN`), 8.8% close to training instead of 26.5%. Close and clean subsets reported for dev-A, dev-B and the benchmark. |
| Stale baselines | Adopted. All strategies are recounted in one run, with the verdict-file snapshot recorded. Accepted circuits are split by source. |
| Reviewer sample | Adopted: at least 60 unjudged circuits, stratified, with a confidence interval. |
| Context items | Adopted: the first word and the final punctuation mark, each bound to a role, enter every context vector. |
| JS writer | Adopted. The Python side returns heads, labels and margins; tree → circuit stays in JavaScript. |
| Capacity checks | Adopted: top coefficient and gap measured by length; D = 4096 if messages of 40+ words flip. All products are matrix products. |
| M1 size | Adopted: M1a (offline, measurable today) and M1b (strategy, worker, speed). |
| Not adopted | "About 20 learned vectors" as the whole model. A linear readout of fixed context vectors may be too weak. M1a therefore allows several prototypes per label (a standard cleanup memory with more than one item per class), and M1b adds learned word-class vectors, retrieved by soft cleanup in training and at inference alike. Both stay VSA operations. |

## 1. The space

Fourier holographic reduced representation (FHRR): phasor vectors with D = 2048 complex components
([Plate 1995](https://doi.org/10.1109/72.377968); Plate 2003), as in the original.
- **Binding** is the elementwise product `⊙`. Unbinding multiplies by the conjugate.
- **Bundling** is the sum, normalised back to unit phasors where a phasor is needed.
- **Permutation** `ρ` is a fixed random shuffle of the components
  ([Gayler 2003](https://arxiv.org/abs/cs/0412059); [Kanerva 2009](https://doi.org/10.1007/s12559-009-9009-8)).
  `ρ_H`, `ρ_D` are two further fixed shuffles that mark the head and dependent roles in a pair.
- **Similarity** is `Re⟨u, v⟩ / D`. **Cleanup** is the nearest item of a codebook; soft cleanup
  is a softmax over those similarities.
- **Fractional power encoding**: `z^k = exp(i·k·φ)` with φ uniform in (−π, π) per component
  ([Frady et al. 2021](https://arxiv.org/abs/2109.03429); Komer et al. 2019). Integer powers are
  nearly orthogonal, and `z^q ⊙ conj(z^k) = z^(q−k)` encodes an offset.

The original's words and the established terms used here:

| Original | Here |
| --- | --- |
| star | atomic hypervector of a word |
| named star, legend | role vector, role codebook |
| route book | learned code vectors (here: learned memory vectors) |
| beacon | pointer: the position code of a word, `ρ(y^q)` |
| chart | superposition state S |
| frame | the decoded role–filler structure (the circuit) |
| margin | decision margin: best minus second-best similarity |
| remainder | residual `‖S − Ŝ‖ / ‖S‖` |

## 2. The circuit as a labelled tree

**Mapping.** `circuitToTree` and `treeToCircuit` of `experiments/syntax-learned/parser/tree.mjs`
(copied into `src/tree.mjs`, with the fix). Every word gets one head and one label.
- **Word labels** (the word fills a key of the wire anchored at its head): `dep`, `cont` (continues a
  head or a verb run), `aux`, `neg`, `mod`, `disc`, `mark`, `rneg`, `cc`.
- **Anchor labels** `attachment:tag` (the word anchors a wire). Attachments: `root`, `subj`, `comp`,
  `comp^subj` (complement of one clause and subject of the next, "let us move"), `relC`, `relC~amb`,
  `relN`, `conj`, `conjR`, and the new `conjR~amb`. Tags: nominal, `imp`, `decl`, `inter`, `nonfin`,
  `frag.N`, `frag.R`, `frag.mod`, `frag.disc`, `frag.N^ell`, and a few rarer fragment tags.
- 44 (attachment, tag) pairs occur in the current trees, about 47 after the fix. These are the
  label codebook of the readout.

**Round trip on the 81,870 labels outside the benchmark** (`m0/roundtrip.mjs`, `m0/review/full.out`):

| Case | Back with the same core |
| --- | --- |
| tree.mjs as it is | 81,681 (99.77%); 156 cannot be encoded |
| with the fix | 81,811 (99.93%); none fail to encode |
| coordinated relations | 2 of 158 → 132 of 158 (12 lost to `~amb`, fixed by `conjR~amb`; 14 nested) |
| relation negation | 85 of 111 → 109 of 111 |
| clause negation | 243 of 243 |
| ellipsis | 43 of 48 |
| 2+ coordinations | 395 of 437; the losses are nested coordinations |
| 25+ words | 1,423 of 1,440 |

The fix, in the loop that builds the anchor map `at`:
`if (w.type === 'syntax.coordination' && W(w.refs.conjunct[0]).type === 'syntax.relation') continue`.

**Not representable:** a relation that starts at a coordination (none in the data), and a relation
between two wires anchored at the same word, except a fragment's own relation.

**Representable is not learnable:** about 160 coordinated relations, 53 `frag.N^ell`, about 110
`rneg`, 238 `neg`. Recall on these will be near zero; they are reported on their own.

**Re-heading (M2 only).** Two reversible changes shorten arcs: the first marker word heads its
relation (prep/pobj, as in Stanford basic dependencies), and each further conjunct depends on the
previous one (chained coordination, Popel et al. 2013). Arcs of at most 2 words rise from 70.6% to
76.5%, arcs over 10 words fall from 1.54% to 0.79% (`m0/rehead.mjs`). The inverse
(`unrehead` in `m0/review/repr.mjs`) loses no gold circuit (81,811 before and after). For predicted
trees it must also handle a `pobj` child under a word that is no relation, two `pobj` children, a
marker with no `pobj`, and conjunct chains that mix clauses and nominals: each such case is
repaired to the content-head reading and counted.

**Data facts** (`m0/stats.out`):

| Per message | Distribution (labels outside the benchmark) |
| --- | --- |
| words | mean 9.6, median 8, 90th percentile 16, 99th 28, maximum 67 |
| clauses | 1: 66%, 2: 20%, 3: 10%, 4 or more: 4% |
| relations | 0: 30%, 1: 32%, 2: 23%, 3 or more: 15% |
| coordinations | 1 in 19% of messages |
| forms | imperative 65k, declarative 24k, nonfinite 19k, interrogative 11k, fragment 6.7k |
| benchmark | mean 13.1 words, median 10, 99th percentile 51; 9.6% have 25+ words (labels: 1.8%); 58 have 40+ |

## 3. Encoding: how a message becomes a VSA state

### 3.1 Tokens

The words of `wordsOf(text)` (the positions `writeCircuit` uses), plus the punctuation marks
between them. Punctuation marks are context only: they enter context vectors, never get an
address, and are never read out.

### 3.2 Word identity `f(w)`: fixed, never learned

A bundle, normalised to unit phasors, of hash hypervectors of:
- the lowercased form;
- its letter n-grams, n = 1 to 4, with boundary marks; an n-gram is the binding of its letter
  vectors, each permuted by its place (Joshi, Halseth and Kanerva 2016; Rahimi, Kanerva and Rabaey
  2016);
- its shape (letters become a/A, digits 9, runs collapsed): a generic function of the characters.

Seeds come from sha256 of a prefixed string, as in the original (`"sop-stars-v1:id:<word>"`).
Misspellings ("widnshield") land near the right word. No word list is involved.

### 3.3 Positions and pointers

- Token code `t_k = f(w_k) ⊙ z^k`. Two "the" in one message are distinct terms.
- Pointer of word q: `ρ(y^q)`, with a second independent base y. `Root` is a fixed random vector.

### 3.4 Context vector `x_k`

    x_k = phase( Σ_{d=−3..3} λ_d ρ^d(f(w_{k+d}))  +  μ_1 R_first ⊙ f(w_1)  +  μ_2 R_end ⊙ f(final mark) )

- The window terms are the order vectors of BEAGLE ([Jones and Mewhort 2007](https://doi.org/10.1037/0033-295X.114.1.1))
  and permutation random indexing (Sahlgren, Holst and Kanerva 2008). Boundary vectors stand past
  the ends.
- `R_first`, `R_end` are fixed role vectors. Interrogative form often depends on a "?" or an
  auxiliary further away than three words; these two items reach every word.
- `λ`, `μ` are learned scalars (9 numbers).
- **M1b adds learned word-class vectors.** A codebook `K_1..K_C` (C = 64 to 256 learned
  hypervectors); the class vector of token k is the soft cleanup
  `κ_k = Σ_c softmax_c(β Re⟨x_k, K_c⟩/D) K_c`, the same in training and at inference; the context
  becomes `phase(x_k + Σ_d ν_d ρ^d(κ_{k+d}))`. These are hypervectors, never indices into tables.

### 3.5 Scores: similarities with learned memory vectors

The pair code of a candidate head q for word k binds their contexts in their two roles:

    p_qk = ρ_H(x_q) ⊙ conj(ρ_D(x_k))          (for the root, x_root = Root)

Every decision is a similarity with a learned memory vector:

| Score | Formula |
| --- | --- |
| gate | `g(q→k) = σ( Re⟨p_qk, G⟩/D + Re⟨z^(q−k), E_G⟩/D + b )`: q can take k |
| attachment | `s_a(q,k) = Re⟨p_qk, V_a⟩/D + Re⟨z^(q−k), E_a⟩/D`; `π_qk(a) = softmax_a` |
| tag | `s_t(k) = Re⟨x_k, T_t⟩/D`; `τ_k(t) = softmax_t` |
| direction | `δ_k = σ( Re⟨x_k, Δ⟩/D + b' )`: head before or after |

- `Re⟨z^(q−k), E⟩` is a learned function of the offset, written as a vector (Frady et al. 2021).
- With P prototypes per memory (M1a: P = 4), a score is the soft maximum over the prototypes,
  `(1/β) log Σ_j exp(β Re⟨p, V_{a,j}⟩/D)`: a cleanup memory with several items per class.
- In machine-learning terms the attachment score is the holographic / complex embedding score
  ([Nickel, Rosasco and Poggio 2016](https://arxiv.org/abs/1510.04935);
  [Trouillon et al. 2016](https://arxiv.org/abs/1606.06357); the two are equivalent,
  [Hayashi and Shimbo 2017](https://arxiv.org/abs/1702.05563)): a bilinear form restricted to the
  diagonal in the Fourier domain. It is said here so that nobody has to discover it.

### 3.6 Choosing the head: the original's gated chains

The original's mechanism (`vsa-semantic-space/experiment/v8_gates.py`, `states()`, `chainL`), with
gates computed from vectors instead of looked up per class:
- right chain, heads before k: `w^R_kq = g(q→k) · Π_{q<i<k} (1 − g(i→k))` — the nearest earlier word
  that can take k gets the weight, the words in between let it pass;
- left chain, heads after k: the mirror image;
- `w_kq = δ_k w^R_kq` for q < k and `(1 − δ_k) w^L_kq` for q > k; the root gets what is left of both
  chains, so the weights sum to 1. Chains run over words only.
- The chain weights are scalars, computed with cumulative sums of `log(1 − g)`: O(n²) per message,
  no Python loop over positions.

### 3.7 Address and state

    Att_qk = Σ_a π_qk(a) Att(a)          Tag_k = Σ_t τ_k(t) Tag(t)
    a_k   = ρ²(Tag_k) ⊙ Σ_{q ∈ words ∪ root} w_kq ρ(y^q) ⊙ Att_qk
    S     = Σ_k t_k ⊙ a_k                  (one complex vector of 2048 components)

`Att(a)` and `Tag(t)` are fixed random role vectors. Binding distributes over bundling, so `a_k`
is a superposition of (head, attachment, tag) hypotheses weighted by belief. It is computed as a
matrix product of the coefficient array (n × (n+1) × 19) with the basis `ρ(y^q) ⊙ Att(a)`,
never as an n × n × L × D tensor.

The target state compiled from the gold tree uses the same fixed vectors:
`T = Σ_k t_k ⊙ ρ²(Tag(t*_k)) ⊙ ρ(y^(h*_k)) ⊙ Att(a*_k)`. This is the original's `Compiler`
(`tool/sop/world.py`), now over trees.

### 3.8 What is learned (M1a)

- Memory vectors: 19 attachment vectors `V_a` and 19 offset vectors `E_a`, the gate vectors `G`,
  `E_G`, the direction vector `Δ`, 11 tag vectors `T_t`, each with P = 4 prototypes where it is a
  classifier. Learned as phases, like the original's codes: about 150 vectors, 0.3 M phases, about
  1 MB.
- Scalars: window and role weights, temperatures, biases.
- Fixed and seeded, never stored: identities, positions, pointers, Root, role vectors, permutations.
- M1b adds the class codebook (C × 2048 phases) and its window weights.

### 3.9 M2: a state that computes (working memory of open heads)

In M1 the state only carries what the similarities decided. The original's real vector
computation was its chain: each address was built by binding vector codes along the path, and
that is what generalised to unseen depth. M2 brings it back as two memory hypervectors read and
written word by word (Plate 2003 on sequences and stacks in HRR;
[Frady, Kleyko and Sommer 2018](https://arxiv.org/abs/1803.00412) on working memory in such
vectors):
- **Open heads** `H`: when word k may take later dependents it is pushed,
  `H ← H + g_k ρ(y^k) ⊙ ρ_K(x_k)`.
- **Waiting words** `W`: a word whose head comes later is pushed into `W` the same way.
- **Reading.** Word k unbinds each pointer from `H` and compares what comes back with its query
  `ρ_D(x_k) ⊙ Q`; a soft cleanup over the pointers gives its head distribution. A head reads `W`
  the same way to claim the words waiting for it.
- **Closing.** When k attaches to q, the heads between q and k are closed by gated subtraction of
  the term read back from `H`; claimed words are subtracted from `W`.

A decision now depends on what earlier decisions left in the memory, which is more than first
order, and it is made in the vectors. Its control flow resembles a shift-reduce reader
([Nivre 2008](https://aclanthology.org/J08-4003/)); what keeps it strict is that the stack lives in
one hypervector and every move is a binding, a bundle, a cleanup or a gated subtraction.

## 4. Decoding: reading the circuit out of the state

### 4.1 Readout, word by word

For each word k:
1. `u_k = S ⊙ conj(t_k)`.
2. For each candidate head q (other words and the root), `v_kq = u_k ⊙ conj(ρ(y^q))`; then the
   similarity of `v_kq` with each of the about 47 label codes `Att(a) ⊙ ρ²(Tag(t))`. This is one
   matrix product.
3. Keep the ranked candidates and the margin (best minus second best).

Why per word: every word must have exactly one place, and one (head, label) per word gives that by
construction. The number of clauses, nominals, relations and coordinations follows from the labels;
no count is decoded (the original's open problem: WikiSQL set size 0.217 against 0.376 with the
count given). Iterative peeling needs a stopping test and spreads early errors; a resonator network
([Frady, Kent, Olshausen and Sommer 2020](https://arxiv.org/abs/2007.03748)) pays off for large
product spaces, while here at most 67 heads × 47 labels make exhaustive cleanup exact. The resonator
is tried in M2 for speed, with its agreement reported.

**Direct decode** reads the coefficients `w_kq · π_qk(a) · τ_k(t)` before the bundle. It is never
the strategy; it is measured to know what the state costs.

### 4.2 Constrained re-reading

Labels that cannot stand together are fixed by reading again from the state, not by a graph
algorithm. The constraints are the conditions that `treeToCircuit` would otherwise repair:

| Constraint | Who is read again |
| --- | --- |
| no cycle | the word of the cycle with the smallest margin, without the head that closes the cycle |
| word label, no dependents | the dependent without that head, or the head without word labels, whichever margin is smaller |
| root child is a clause or fragment | that word without (root × non-clause tags) |
| one subject per clause | the weaker subject without `subj` under that head |
| coordination has 2+ conjuncts | the `cc` word without that head |

- Re-reading is cleanup of the same `u_k` over a smaller codebook. Repeat until nothing is
  violated, at most n rounds. The root with a fragment tag always stays a candidate, so it ends.
- Whatever is left goes to `treeToCircuit`'s repairs, which are counted.
- Chu–Liu–Edmonds (maximum spanning tree over the readout scores; [McDonald et al. 2005](https://aclanthology.org/H05-1066/))
  is run as a reported variant only.

### 4.3 From the tree to wires (deterministic, in JavaScript)

`treeToCircuit` (about 250 lines, `src/tree.mjs`), then `writeCircuit` (Rule 1 order) and
`validateSyntax`. It names no word. Its repairs: a word label with dependents hands them to its
head; a root child without a clause tag becomes a fragment; a lone nominal becomes a fragment; a
second subject becomes a complement; a coordination with one conjunct dies and its words become
discourse. The copy counts each repair that fires.

How each key is read:

| Key | Read from |
| --- | --- |
| clause | one per word with a verb or fragment tag; `form` = the tag (`imp`, `decl`, `inter`, `nonfin`, or fragment) |
| verb | that word plus adjacent `cont` words |
| auxiliary, negation, modifier, discourse | words read as `aux`, `neg`, `mod`, `disc` under the clause's word |
| subject, complement | the wire anchored at a word read as `subj` / `comp` under it; `comp^subj` fills both |
| ellipsis | the tag suffix `^ell`; the shared clause is the first conjunct of its coordination, else its head clause |
| nominal | one per word with the nominal tag (or `frag.N`, `frag.R`); head plus adjacent `cont`; dependents read as `dep` |
| relation | one per word read as `relC`, `relC~amb` or `relN`: `from` is the clause / nominal at its head, `to` the wire at the word |
| marker, relation negation | words read as `mark` / `rneg` under the end word; adjacent markers make one value ("next to") |
| coordination | one per chain of `conj` arcs; conjuncts are the wires at those words (relations with `conjR`); `cc` words are conjunctions |
| attachment=ambiguous | M1: the label `relC~amb` / `conjR~amb`, as the labels have it. M2: from the margin, below |

**Ambiguity from the margin (M2).** When the best clause start and the best nominal start of a
relation are within a margin τ, the relation is written from the clause with
`attachment=ambiguous`. This is the original's abstention by margin mapped onto the schema's mark;
the judges' rules accept the mark either way. τ is fitted on dev-B.

### 4.4 Confidence

- The message margin: its smallest decision margin.
- The residual `‖S − Ŝ‖ / ‖S‖`, with Ŝ compiled from the decoded tree: the original's refusal test.
- Both are reported with calibration curves. Neither suppresses a circuit, since a missing circuit
  counts as rejected.

### 4.5 Cost

The readout costs n × (n+1) × 47 × D complex products: about 11 M for a 10-word message, 0.45 G
for the longest (67 words). The gold-state check read 4,438 messages in 3.7 s on the GB10.

## 5. Learning

**Data.** `webmeet-dataset/syntactic/**/*.csv`, read with `readLabels`. 83,619 of 183,497 messages
have a circuit. Every benchmark text (`eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz`,
compared lowercased with spaces collapsed) is removed: 1,749 labels. Left: 81,870 (77,796
agreement, 4,042 judge, 32 written); trees that round-trip: 81,811. The registry lines of the
benchmark messages are never used.

**Splits.**
- **dev-B**: whole CSV files whose stem (file name without `.NN`) has sha1 mod 10 = 0: 9,721
  texts in 32 files. Only 8.8% have a training text at most one word substitution away
  (`m0/review/devb.out`). This is where targets are set.
- **dev-A**: of the rest, sha1(normalised text) mod 10 = 0, about 7,200 texts. 43.8% are that close
  to training: it measures template memory.
- **train**: the rest, about 65,000.

**Weights.** Judge and written labels ×3, agreement ×1; messages of 25+ words ×3 (1.8% of the
labels but 9.6% of the benchmark).

**Objective.** `L = −cos(S, T) + μ · CE_readout`, μ about 1.
- `−cos(S, T)` is the original's own objective.
- `CE_readout` is a softmax over `β · similarity` of `u_k` with every (head, label) candidate, read
  from S exactly as the decoder reads, with the gold answer as target. It brings negatives and
  margins (the original had none and reported about 10% overlap between present and absent roles),
  and it sharpens the addresses, which long messages need (section 6).
- Ablation: cross-entropy on the direct coefficients instead.
- M3 adds the judged registry outside the benchmark: 5,110 accepted and 1,431 rejected circuits over
  4,896 messages, 389 with both. A hinge pushes `cos(S, T_accepted)` above `cos(S, T_rejected)`,
  and readout negatives are added on the words the rejected circuit places differently.

**Optimisation.** Adam: learning rate 0.02 for phases (the original's value), 0.005 for scalars;
phases start uniform in (−π, π); batches of 32–128 messages grouped by length; early stop on dev-B
exact core.

**Time on the GB10.** About 35 M complex products per average message (pair scores with 4
prototypes, address, readout; long messages weigh as n²), so about 50 TFLOP per epoch of 65,000
messages with the backward pass. Expected 2–6 minutes per epoch: M1a's single run of 5–10 epochs
fits in 30 minutes; if it does not, M1a trains on part of the data and says so. The original took
130–234 s per seed on a smaller task.

## 6. Capacity

Gaussian crosstalk estimate for FHRR, checked against the measurements (`m0/capacity.py`,
`m0/soft.py`, `m0/review/cap_est.out`):

| D | Terms in one bundle at error ≤ 1e-3 (2,000 / 10,000 candidates) |
| --- | --- |
| 1024 | about 45 / 40 |
| 2048 | about 90 / 80 |
| 4096 | about 180 / 160 |

| Measured | Result |
| --- | --- |
| gold, D = 1024 | 99.56% of words; messages of 40+ words: 253 of 427 exact |
| gold, D = 2048 | 100% of 4,438 messages (1,438 of them 25+ words), every length |
| 60% belief, D = 2048 | all exact but 4 of 427 messages of 40+ words |
| 45% belief, D = 2048 / 4096 | 40+ words: 135 / 363 of 427 exact |

- One term per word is the right grain: a term per key would reach 61+ terms in 423 labels.
- For a learned model the condition is confidence. At D = 2048 with address energy 0.3, the top
  coefficient must exceed about 0.29 at 25 words, 0.37 at 40 and 0.49 at 67 (D = 4096: 0.20 / 0.26 /
  0.34), and the gap to the runner-up about 0.24 at 40 words.
- Both are measured by length; D = 4096 is used if messages of 40+ words flip between direct and
  state decode.

## 7. What is VSA here and what is not

**VSA, inside the reading:**

| Part | How |
| --- | --- |
| word identities | hash hypervectors of form, letter n-grams (bound permuted letters) and shape, bundled. Fixed. |
| positions, pointers, offsets | fractional power encoding. Fixed. |
| context | permutation by offset, binding with roles, bundling |
| pair code | binding of two contexts in their roles |
| decisions | similarity with learned memory vectors, soft or hard cleanup (gates, attachments, tags, direction) |
| head choice | the original's gated chains over those gates |
| state | binding pointer ⊗ attachment ⊗ tag ⊗ token, bundling of all words |
| readout | unbinding, cleanup over the product codebook, constrained re-reading (cleanup over a smaller codebook), margins, residual |
| M1b word classes | soft cleanup against a learned codebook; the retrieved hypervector is bundled into the context |
| M2 working memory | push by binding and bundling, read by unbinding and cleanup, close by gated subtraction |

**Not VSA, declared:**

| Part | Note |
| --- | --- |
| tokenisation | `wordsOf`, the shared contract of all strategies |
| training | gradient descent with a softmax over similarities, as the original trained by gradient |
| tree → wires | `treeToCircuit` (with counted repairs), `writeCircuit`, `validateSyntax`. Names no word. |
| re-heading (M2) | deterministic rewrite over labels and positions, and its inverse |
| Chu–Liu–Edmonds | a reported variant only, never the strategy |
| label inventory | fixed by the schema through the tree mapping |

**Not used at all:** no word lists (not even the closed lists other strategies name), no rule that
names a word, no part-of-speech tagger (the original's `typer.py` is excluded), no parser, no
transformer, no pretrained embeddings, no knowledge worlds, no `vss` or spaCy output at reading time.

**Honest statement.**
- In M1 the state is transport. Unbinding `t_k` from S gives `a_k` plus crosstalk, so the readout
  score of a candidate is its coefficient plus noise: decoding from S can only lose decisions the
  similarities got right. What is VSA in M1 is that those decisions are computed by binding and
  similarity of hypervectors, and that the decoder sees only S.
- Mathematically M1 is a first-order (arc-factored) dependency model over random hypervector
  features, with a diagonal bilinear arc score. The words "VSA" do not make it more than that.
- M2's working memory is the step where the state does computation. Whether it helps is measured.
- The labels are mostly `vss` + spaCy circuits, so what is learned is their convention.

## 8. Evaluation

**M0 check.** Gold tree → T → readout → circuit gives the label's core for at least 99.9% of the
trees that round-trip, on dev-A and dev-B.

**Development (dev-A, dev-B; each split into close and clean texts).**
- Per word: head accuracy (UAS), head and label (LAS), tag accuracy.
- Per message: exact tree, exact core (`normalForm`, `tests/benchmark/syntax/lib.mjs`), valid share,
  share re-read, share repaired, share strict-exact.
- By length (under 10, 10–24, 25–39, 40+), by `accepted_by`, and for words unseen in training.
- **Mandatory:** direct decode against state decode, per length bucket; distribution of top
  coefficient and gap by length.

**Benchmark (1,831 messages).** M1a writes `strict-vss.jsonl` offline; M1b runs the strategy through
`createReader`. Counted with `eval/count.mjs`, a copy of
`experiments/syntax-learned/review/recompute.mjs` that writes into the scratch folder
`strict-vss/review/` and recounts every strategy in the same run, with the number of verdict files
and the latest one's time recorded. For every strategy:
- **known accepted**: the core equals a circuit judged L8 in the run (`judging/packet-k` +
  `verdicts-k`), an accepted registry line (`webmeet-dataset/annotations/syntax/v1/judged/*.jsonl`),
  or the label before the run (`key/labels-before.jsonl`); split by source (judged in the run /
  registry / label);
- **known rejected**: the core equals a judged rejected circuit;
- **unjudged**, **invalid**;
- **strict-exact**: no re-read, no repair; and how many of those are known accepted;
- the variant without "label now";
- the 593 messages that had a label before the run against the 1,238 that had none (567 of the 593
  are `vss` + spaCy agreement circuits, the convention strict-vss learns);
- the clean subset: without the 431 messages that have a training text one word substitution away
  (and without the 297 that `review/leak.mjs` finds);
- the bounds [known accepted, known accepted + unjudged] out of 1,831;
- the comparison on the messages where both circuits are judged, and the share of its unjudged
  circuits strict-vss would need accepted to reach `vss`.

Unjudged circuits: estimated with `review/akey.mjs`, and a reviewer reads at least 60, stratified by
length and by the 593 / 1,238 groups, against `tests/benchmark/syntax/rules.md`, giving a 95%
Wilson interval (about ±12 points at 60). No judges are launched.

**Baselines, recounted now** (54 verdict files, latest 2026-11-27 20:05:52 UTC;
`m0/review/recount.out`):

| Strategy | Known accepted of 1,831 · on the 1,238 without a prior label · by source (run / registry / label) |
| --- | --- |
| vss | 1,439 (78.6%) · 848 (68.5%) · 1,153 / 26 / 260 |
| spacy | 1,709 (93.3%) · 1,118 (90.3%) · 1,429 / 17 / 263 |
| distilbert | 1,413 (77.2%) · 828 (66.9%) · 1,134 / 21 / 258 |
| parser prototype | 1,013 known accepted, 96 rejected, 722 unjudged on an older snapshot; recounted in the same run |

The 1,238 are the honest field. Agreement of strict-vss with `vss` on unjudged circuits is weak
evidence: 7.3% of the circuits the parser prototype and `vss` agreed on were rejected.

**Speed and size.** Median ms per message and start-up ms as `summary.json` measures them (`vss`
0.44 ms, distilbert 3.9 ms, spacy 49 ms); model MB (`vss` 3.2 MB; strict-vss about 1–2 MB);
training minutes on the GB10.

**Ablations (M1b, M2).** P = 1 against P = 4; learned class vectors; D 2048 against 4096; the first
draft's class tables; re-headed against content-head trees; `−cos` alone against `−cos` plus
readout loss; ambiguity from the label against the margin; exhaustive cleanup against resonator;
constrained re-reading against Chu–Liu–Edmonds; M1 against M2's working memory.

**Expectation, stated in advance** (to judge the result against, not a promise): M1a reaches on
dev-B clean a UAS of at least 80% and an exact core of at least 25%, and on the benchmark's 1,238
at least 20% known accepted. M1a stays below `vss`. Decision rules:
- direct decode far above state decode → capacity: D = 4096, sharper addresses;
- both low → the scores are too weak: M1b class vectors, then M2;
- many re-reads or repairs → the label scores, not the state, are at fault.

## 9. Risks and fallback

| Risk | What and the answer |
| --- | --- |
| weak scores | A linear similarity over fixed hashed contexts may not separate heads well. Answer: P prototypes per label, M1b class vectors, M2 working memory. Measured on dev-B, not guessed. |
| first order | Each arc is scored alone in M1. Whole-circuit exactness is harsh: at 97% per word a 20-word message is right about 54% of the time. Answer: M2. |
| circular labels | 95% are `vss` + spaCy agreement circuits; the hard half of the data (no label) is missing. Answer: report the 1,238 and the clean subset; judged weight and negatives in M3. |
| long messages | 5 times more frequent in the benchmark. Diffuse addresses break at 40+ words. Answer: readout loss, weight ×3, D = 4096. |
| unseen words | The original failed on SNIPS (slot heads 0.107) because its classes put unseen names in clusters unrelated to their role. Answer: letters, shape and context; measured on unseen words and dev-B. |
| rare structures | ellipsis 53, `rneg` about 110, `neg` 238, coordinated relations about 160: near-zero recall expected; reported apart. |
| hidden repairs | Re-reads and repairs can mask errors. Answer: the strict-exact count and the share of each. |
| strictness critique | "The state is a pass-through." True in M1 and said so; M2 is the answer, measured. |
| speed | Plain JavaScript is slow for the longest messages. Answer: a Python worker (M1b); a JavaScript port later if wanted. |

**Fallback, in order; every step stays strict:** P prototypes and larger D; learned class vectors;
offset-bound pair codes; the working memory; negatives from judged rejected circuits. If strict-vss
stays far below, it remains a measured research strategy, and `vss` stays the production reader. No
word rule, tagger or pretrained model is added to rescue it; a variant with any of those needs its
own name.

## 10. Milestones

- **M0 (done).** Label structure, capacity (gold and diffuse), round trip 99.77% → 99.93% with the
  fix, the re-heading inverse on gold trees, split closeness, baselines recounted. Left: copy
  tree.mjs into `src/` with the fix, `conjR~amb` and repair counters; check the `conjR~amb` gain.
- **M1a (one day, offline).**
  1. `src/tree.mjs` as above.
  2. `data/export.mjs`: content-head trees; dev-A, dev-B, train; every benchmark text excluded.
  3. `model.py`, `train.py`: section 3 with P = 4, one seed, D = 2048, loss `−cos` plus readout,
     at most 30 minutes.
  4. Decode from S with constrained re-reading; write heads, labels, margins and re-read flags as
     JSONL for dev-A, dev-B and the 1,831 benchmark texts; also the direct decode.
  5. `decode.mjs`: `treeToCircuit` and `writeCircuit` in JavaScript → `strict-vss.jsonl` (scratch).
  6. `eval/count.mjs`: the counts of section 8.
  7. Report: UAS, LAS, exact core on dev-A and dev-B (close / clean); benchmark known accepted /
     rejected / unjudged / invalid / strict-exact, accepted by source, 593 / 1,238, clean subset;
     direct against state by length; top coefficient and gap by length.
- **M1b.** `index.mjs` (`{name: 'strict-vss', schema: 'syntax', open(configuration)}`, engine with
  `analyse(text) -> {analyses: [{sop}]}` and `close()`), `worker.py` on the pattern of
  `strategies/distilbert/syntax_worker.py`; ms per message, start-up, MB; learned class vectors;
  P = 1 against P = 4.
- **M2.** The working memory (section 3.9); re-heading with its counted inverse; offset-bound pair
  codes; ambiguity from the margin; resonator decoding; D ∈ {2048, 4096}; the first draft's class
  tables as ablation; 3 seeds with their spread.
- **M3.** Negatives from the 1,431 rejected circuits outside the benchmark (389 contrast messages);
  judged and long-message weighting; analysis of scene messages; optional JavaScript inference.
- **M4.** Full comparison with `vss`, `spacy`, `distilbert` and the parser prototype on the 1,831
  messages: all counts, bounds, groups, the reviewer's reading. Decide its use: most likely one more
  voice beside `vss`, with margin and residual as a confidence. Messages where strict-vss and `vss`
  disagree can go to the data session as a mining task, through `management/tasks-worker.md`, by the
  owner or orchestrator.

Every milestone reports all benchmark counts, the development figures, speed and size, whatever
they are.

## 11. Files

| File | Content |
| --- | --- |
| `DESIGN.md` | this design |
| `m0/` | first measurements: label structure, capacity, re-heading distances, writer ceiling, registry (`m0/RESULTS.txt`) |
| `m0/review/` | the review's checks and outputs: round trip with the fix (`full.out`), split closeness (`devb.out`), coordinated relations (`relco.out`), capacity estimate (`cap_est.out`), baselines (`recount.out`) |
| `src/tree.mjs` | M1a: the tree mapping with the fix, `conjR~amb`, repair counters |
| `data/export.mjs` | M1a: trees and splits; output in the scratch folder `strict-vss/` |
| `model.py`, `train.py` | M1a: encoder, state, readout, training (torch) |
| `decode.mjs` | M1a: per-word answers → circuits |
| `eval/count.mjs` | M1a: benchmark counts |
| `index.mjs`, `worker.py` | M1b: the strategy and its Python worker |

Nothing outside `strategies/strict-vss/` is edited.

## 12. References

- [Hyperdimensional computing](https://en.wikipedia.org/wiki/Hyperdimensional_computing), Wikipedia.
- D. Kleyko, D. A. Rachkovskij, E. Osipov, A. Rahimi. A survey on hyperdimensional computing aka
  vector symbolic architectures. *ACM Computing Surveys*, 2022–2023.
  [Part I](https://arxiv.org/abs/2111.06077), [Part II](https://arxiv.org/abs/2112.15424).
- P. Kanerva. Hyperdimensional computing. *Cognitive Computation* 1(2), 2009.
  [doi](https://doi.org/10.1007/s12559-009-9009-8)
- T. A. Plate. Holographic reduced representations. *IEEE Transactions on Neural Networks* 6(3),
  1995 ([doi](https://doi.org/10.1109/72.377968)); and *Holographic Reduced Representations*, CSLI,
  2003 (FHRR, sequences and stacks, the superposition problem).
- R. W. Gayler. Vector symbolic architectures answer Jackendoff's challenges for cognitive
  neuroscience, 2003. [arXiv](https://arxiv.org/abs/cs/0412059)
- K. Schlegel, P. Neubert, P. Protzel. A comparison of vector symbolic architectures. *Artificial
  Intelligence Review*, 2022. [arXiv](https://arxiv.org/abs/2001.11797)
- E. P. Frady, D. Kleyko, C. J. Kymn, B. A. Olshausen, F. T. Sommer. Computing on functions using
  randomized vector representations, 2021. [arXiv](https://arxiv.org/abs/2109.03429)
- B. Komer, T. C. Stewart, A. R. Voelker, C. Eliasmith. A neural representation of continuous space
  using fractional binding. CogSci 2019.
- E. P. Frady, D. Kleyko, F. T. Sommer. A theory of sequence indexing and working memory in
  recurrent neural networks. *Neural Computation* 30(6), 2018. [arXiv](https://arxiv.org/abs/1803.00412)
- E. P. Frady, S. J. Kent, B. A. Olshausen, F. T. Sommer. Resonator networks, 1. *Neural
  Computation* 32(12), 2020 ([arXiv](https://arxiv.org/abs/2007.03748)); S. J. Kent et al.,
  Resonator networks, 2, same issue.
- M. N. Jones, D. J. K. Mewhort. Representing word meaning and order information in a composite
  holographic lexicon (BEAGLE). *Psychological Review* 114(1), 2007.
  [doi](https://doi.org/10.1037/0033-295X.114.1.1)
- M. Sahlgren, A. Holst, P. Kanerva. Permutations as a means to encode order in word space. CogSci
  2008.
- A. Joshi, J. T. Halseth, P. Kanerva. Language geometry using random indexing. Quantum Interaction
  2016. A. Rahimi, P. Kanerva, J. M. Rabaey. A robust and energy-efficient classifier using
  brain-inspired hyperdimensional computing. ISLPED 2016.
- M. Nickel, L. Rosasco, T. Poggio. Holographic embeddings of knowledge graphs. AAAI 2016.
  [arXiv](https://arxiv.org/abs/1510.04935)
- T. Trouillon et al. Complex embeddings for simple link prediction. ICML 2016.
  [arXiv](https://arxiv.org/abs/1606.06357)
- K. Hayashi, M. Shimbo. On the equivalence of holographic and complex embeddings for link
  prediction. ACL 2017. [arXiv](https://arxiv.org/abs/1702.05563)
- H. Ramsauer et al. Hopfield networks is all you need. ICLR 2021 (soft cleanup as one retrieval
  step). [arXiv](https://arxiv.org/abs/2008.02217)
- R. McDonald, F. Pereira, K. Ribarov, J. Hajič. Non-projective dependency parsing using spanning
  tree algorithms. HLT/EMNLP 2005. [ACL Anthology](https://aclanthology.org/H05-1066/)
- J. Nivre. Algorithms for deterministic incremental dependency parsing. *Computational
  Linguistics* 34(4), 2008. [ACL Anthology](https://aclanthology.org/J08-4003/)
- M. Popel et al. Coordination structures in dependency treebanks. ACL 2013.
  [ACL Anthology](https://aclanthology.org/P13-1051/)
- The original: `vsa-semantic-space/experiment/v8_gates.py` (path, pair, chain, gates),
  `tool/sop/world.py` (`Compiler`), `tool/sop/infer.py` (readout, margin, residual).
- The earlier learned prototypes and their review: `experiments/syntax-learned/README.md`,
  `experiments/syntax-learned/review/`.
