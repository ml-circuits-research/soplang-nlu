[Home](../README.md) › [rVSS](README.md) › Mechanics

# Mechanics: the formulas of rvss

This page: the technical version of [the story](story.md): the atoms, the formulas of a constellation, of placing a child and of condensing, the route book's drawings and vote, the gates, the beam, the losses, the readout and the confidence; and what is kept from the original reader and what is new. Kind: Reference.

Source: [strategies/rvss/DESIGN.md](../../strategies/rvss/DESIGN.md), third revision, sections 5 to 10. Nothing here is trained yet.

## The space

Vectors are [Fourier holographic reduced representations](https://doi.org/10.1109/72.377968) (FHRR, Plate 1995): D complex numbers of modulus 1 ([phasors](https://en.wikipedia.org/wiki/Phasor)); D = 1024 by default. **Binding** `x ⊗ y` is the elementwise product; unbinding multiplies by the complex conjugate. **Bundling** is the sum; `phase(x)` sets every component back to modulus 1. **Similarity** is `sim(x, y) = Re⟨x, y⟩ / D`. **Cleanup** takes the nearest item of a list of candidates.

## The atoms

- **Word stars.** `f(w) = phase(h("id:" + w) + (1/√t) Σ_g h("tri:" + g))` over the t letter trigrams g of `#w#`; `h(s)` is a phasor seeded from the sha256 of s. Fixed; an unseen word has a star.
- **Named stars** `R_κ`: one per key of the schema, plus `R_aside`, `R_top`, `R_attachment` and the value `V_ambiguous` ([Legend, values and kinds](legend-and-kinds.md#what-rvss-declares-the-legend)).
- **Type atoms at the holder.** Every term carries the type of what it holds: `T_word`, or `T_t` for a held wire of type t (8 types). Because the holder writes the type, one cleanup per key over the message's words and the atlas together tells words from wires and one wire type from another.
- **Positions.** [Fractional power encoding](https://arxiv.org/abs/2109.03429): `Z^d = exp(i·d·φ)`, so `Z^d ⊗ Z^e = Z^(d+e)`. Offsets are counted from the wire's origin `a_X`, the position of the first word of the wire or of anything it holds. The exact code (φ uniform) is used in targets and readout; the smooth code `Z_s` (φ normal, σ = 0.5, `sim ≈ exp(−(d−e)²/8)`) in every decision, so that what is learned at one distance carries to nearby ones.
- **The level permutation and why binding commutes.** Products of keys commute: `R_a ⊗ R_b = R_b ⊗ R_a`. Nesting by binding alone puts every leaf in the top vector under the product of the keys on its path, and two paths with the same keys in another order collide: the book's "a grid, not a tree". rvss condenses each level with a fixed random permutation `ρ_c`, which does not commute with binding, so each level keeps only its own terms and a path is recovered with one cleanup per level. A second permutation `ρ_q` keeps the order of a pair of kinds.
- **Wire identity.** The atlas item of a wire Y is `I(Y) = Z^(a_Y) ⊗ c(Y)`: the same wire is the same item wherever it is referred to, and two identical wires at different places are different items.
- **Occupancy.** The book adds a fixed occupancy marker to every answer, to tell "answered by a word I do not recognise" from "not answered". rvss needs no marker: its candidates are the message's own words and the atlas, so every value is recognisable. A key is occupied when a candidate passes the threshold. While a constellation is open, its expected keys (the beacons) say which keys are still empty.
- **No `R_next` for conjuncts.** Conjuncts are ordered by their positions; ordinal keys `R_next^i` are kept only as a control of M1.

## A constellation, and placing a child

```text
C_X = Σ own words p at key κ:
        R_κ ⊗ T_word ⊗ Z^(p − a_X) ⊗ f(w_p)
    + Σ held wires Y at key κ:
        R_κ ⊗ T_t(Y) ⊗ Z^(a_Y − a_X) ⊗ c(Y)
    + Σ pointed wires Y at key κ: the same form
    + [ R_attachment ⊗ V_ambiguous ]
    + while open, Σ stars Y held aside in X:
        R_aside ⊗ T_t(Y) ⊗ Z^(a_Y − a_X) ⊗ c(Y)
C_M = Σ top wires Y:  R_top ⊗ T_t(Y) ⊗ Z^(a_Y) ⊗ c(Y)
```

Placing a child adds its term to the parent. Claim, gather and reopen subtract an exactly known term from one constellation and add the same star, at another key, to another. A pointed wire (re-entrance) is added without being removed from its holder; its offset may be negative.

## Condensing and cleanup per level

```text
c(X) = ρ_c( phase( C_X ) )        expand: ρ_c⁻¹, then unbind
```

`phase` keeps the condensed star in the same sky as a word's star; `ρ_c` keeps its terms apart from the parent's. This is Hinton's reduced description ([Hinton 1990](https://doi.org/10.1016/0004-3702%2890%2990004-J)) and Plate's chunk ([Plate's thesis, 1994](https://redwood.berkeley.edu/wp-content/uploads/2024/08/Tony-Plate-thesis.pdf); book 2003). Unbound from its parent, a child's star is noisy; cleanup against the atlas makes it exact again, so errors do not grow with depth. Capacity: a term of a bundle of k = 12 terms keeps a similarity of about 0.256, while unrelated vectors scatter with a standard deviation of 0.022 at D = 1024: eleven standard deviations (DESIGN.md, section 5.1).

## The kinds

```text
x_k  = phase( Σ_{d=−3..3} λ_d ρ^d(f(w_{k+d}))
              + μ_1 R_first ⊗ f(w_1) + μ_2 R_end ⊗ f(last mark) )
π_k(c) = softmax_c( β · sim(x_k, K_c) )    c = 1..64
κ_k  = Σ_c π_k(c) K_c
```

A closed constellation gets its kind the same way from its condensed kind star `s(Y)`, against a second set of 64 stars. Every open constellation also has a **kind constellation**, built like the word one with `κ_p` in place of `f(w_p)` and the smooth position code; the decisions read it.

## The route book: the drawings and the vote

A pair of kinds is bound into one code, and a learned key–value memory (an attention read over 256 slots; [Ramsauer et al. 2021](https://arxiv.org/abs/2008.02217)) turns it into a key:

```text
q(a, b) = a ⊗ ρ_q(b)
Mem(q)  = phase( Σ_i softmax_i(β · sim(q, Q_i)) · V_i )
```

Four memories: A (from the opener), B (from the previous word), L (backwards, at a claim) and C (choices among stars). For a star s in an open constellation X with opener `o_X`:

```text
open    A( q(κ_o, κ_s) ) ⊗ Z^(p − a_X)
pair    B( q(κ_{k−1}, κ_k) ) ⊗ addr(k−1)
path    exp( i · Σ_{j=o..k} Σ_c π_j(c) θ_P[c] )
back    L( q(κ_o, s_Y) ) ⊗ Z^(a_Y − a_X)
beacon  phase( Σ_{κ empty} b_κ R_κ ) ⊗ Z^(p − a_X)
addr(s) = phase( Σ_d g_d(κ_s) · drawing_d(s) )
key(s)  = argmax_κ sim( addr(s) ⊗ Z^−(p − a_X), R_κ )
```

The book's three drawings are the path (the probe's full position), the pair of kinds and the drawing from the last opener; rvss adds the backward drawing for held stars and the beacon of keys still empty. The key is chosen among the keys of X's type plus `R_aside`, and the margin is the best similarity minus the second. **What the route book learns** is keys whose products land each star on the named star of its key; for a dependent followed by its head, the pair key comes out as about `R_head ⊗ conj(R_dependent) ⊗ Z`.

## Opening and closing

For an incoming star s, the gates are tested from the innermost open constellation outwards (σ is the [logistic function](https://en.wikipedia.org/wiki/Logistic_function), which turns a score into a probability between 0 and 1):

```text
g_close(X|s) = σ( γ_close(q(κ_o, κ_s)) + Σ u·sim(part, G) + b )
g_open(s|X)  = σ( γ_open(q(κ_o, κ_s))  + Σ u·sim(part, G) + b )
p(s → X_j)   = (1 − g_close(X_j|s)) · Π_{i>j} g_close(X_i|s)
```

The parts of the view are small bundles shifted to the probe: the word with its two neighbours' kinds, the tested constellation, its pairs with the word, the parent, the stars held aside, the last closed child, the expected keys. The decisions are read from the state; the conventions open every wire at the word that shows it. The moves: open, place, close, claim, gather, reopen, point.

## The beam, scored by fit

```text
score(h) = Σ_moves log p(move) + λ · Σ_{closed X} fit(X)
fit(X)   = margin_type + mean margin_key − remainder
           + sim( phase(K_X), Π_t )
```

A beam of 4 (milestone M3). After the end, a re-placement pass tests each closed star against the other possible holders and moves it when another fits better by a margin.

## The losses at every node

```text
L = Σ_wires w·(1 − sim(phase(C̃_X), phase(C*_X)))
  + Σ_stars w·CE(key)  + Σ_gates w·BCE(open, close)
  + Σ_choices w·CE(type, claim, gather, reopen, point)
  + Σ_closes w·CE(form, ambiguity)  + margins from rejected
```

CE is the [cross-entropy](https://en.wikipedia.org/wiki/Cross-entropy) of a choice among several options, BCE its two-option (binary) form. `C*_X` is compiled from the label; `C̃_X` is the one the pilot believes in, with soft receivers, so that the per-wire loss also reaches the gates and the attachment. Judged and written labels weigh 3, agreement labels 1. Under teacher forcing (training each decision from the correct state, as given by the label) the effect of a wrong decision on later ones is not reached: that is the job of roll-in in M2c ([Milestones](milestones.md)).

## What is learned

Kinds (64 word and 64 constellation kind stars, with λ, μ, β); path keys `θ_P`; the memories A, B, L, C (256 keys and values each) with the gate values; the vote weights g and beacon weights b; the prototypes of the type, form and ambiguity decisions; the fit prototypes `Π_t`. About 2.8 M angles (DESIGN.md, section 9.1).

## The readout to SOP wires

From the message star, for each node X reached and each key κ of its type: `U_κ = C_X ⊗ conj(R_κ) ⊗ Z^(a_X)`, compared with every `T_word ⊗ Z^p ⊗ f(w_p)` of the message and every `T_t(Y) ⊗ I(Y)` of the atlas; every candidate above 5 standard deviations of noise is accepted, and a word accepted at several places keeps the best. Then `writeCircuit` and `validateSyntax` write and check the wires; adjacent words at `head`, `verb`, `marker` or `conjunction` are joined into one value. The pilot's explicit tree is written as a second circuit, and every disagreement is counted.

## Attachment, margins and confidence

- `attachment=ambiguous` is written when the ambiguity star is in the relation, or when the attachment margin is below a threshold τ fitted on the development set; both variants are reported.
- The **remainder** of a constellation is `1 − sim(phase(C̃_X), phase(Ĉ_X))`, with `Ĉ_X` recompiled from the decoded wire.
- A message's **confidence** is its smallest margin and its largest remainder, with calibration curves.

## Kept from the classic reader, and new here

| Kept from classic | New here |
| --- | --- |
| FHRR phasors | a constellation per wire, with its own origin |
| word stars | the type atom at the holder |
| named stars | condensing with `phase` and `ρ_c`, not powers of `R_reported` |
| route book | drawings counted from each constellation's opener |
| gates per kind | gates on the pair (opener, incoming star) and on parts of the state |
| held aside | moves of stars: claim, gather, reopen, point |
| cleanup, margin | the atlas, with the wire's identity in each item |
| remainder | the read-back from stars as the output |
| loss 1 − cos | a loss at every wire and every decision |
| beacons | key–value memories over pair codes; kinds learned from letters and neighbours |

---

Next: [rvss as an HMM plus a VSA memory](hmm-plus-vsa.md) · Up: [rVSS](README.md)
