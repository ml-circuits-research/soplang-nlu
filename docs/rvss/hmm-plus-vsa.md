[Home](../README.md) › [rVSS](README.md) › rvss as an HMM plus a VSA memory

# rvss as an HMM plus a VSA memory

This page: the main idea behind rvss in established terms: its control is a hidden Markov model advanced word by word, its content is a vector-symbolic memory, and its hierarchy is a hierarchical HMM whose general form is a probabilistic context-free grammar; how hmm-rules relates; the link between the HMM's forward recursion, linear recurrent networks and phase binding; where the analogy stops. Kind: Explanation.

## In plain words

A [hidden Markov model](https://en.wikipedia.org/wiki/Hidden_Markov_model) (HMM) reads a text word by word. It keeps one small hidden state, such as "a noun is expected", moves to the next state at each word, and at each step produces (emits) an output. Everything it has seen is forgotten except that state.

rvss also moves a state forward word by word: what kind of word stands here, which constellations are open, what the gates just decided. Each step emits a move: open, place, close, claim. The difference is what happens to the moves. An HMM forgets them. rvss binds each one to a key and adds it to a constellation, and keeps every finished constellation as one star in the atlas. Its **control** works like an HMM; its **content** is a vector-symbolic (VSA) memory.

## The two halves

| Part | In rvss |
| --- | --- |
| Hidden state | The kind of the word at k, the list of open constellations with their held-aside stars, the gate decisions. |
| Input | The word's star and those of its neighbours, three on each side. |
| Emission | A move: open, place, close, claim, gather, reopen, point. |
| Memory | The constellations and the atlas: every move bound and bundled, nothing discarded. |
| Decoding | A beam over states, an approximation of [Viterbi](https://en.wikipedia.org/wiki/Viterbi_algorithm) decoding. |

## Why the state is split in two

In a plain HMM one state has to say both what the word is and where it stands. Clark (2003) found that an HMM given more states does not match the part-of-speech tags better: its states become position groups, for example "a noun that occurs before a main verb, and a separate state that corresponds to a noun after a main verb" ([Clark 2003](https://aclanthology.org/E03-1009/)). hmm-rules shows the same thing: it has a separate station `following`, a verb after its subject ([Stations of clauses](../hmm-rules/stations-clauses.md)). rvss splits the state: the **kind** is mostly a property of the word, and the **position** is which constellation is open and where in it. So the kinds do not need to encode position.

The kind is read as a vector scored by its similarity to a centre per class, `softmax(β · sim(x_k, K_c))`. That is the idea of HMMs that emit vectors instead of symbols, with Gaussian emissions over word vectors ([Lin et al. 2015](https://aclanthology.org/N15-1144/); [He et al. 2018](https://aclanthology.org/D18-1160/)).

## The hierarchy: a hierarchical HMM

In a [hierarchical HMM](https://en.wikipedia.org/wiki/Hierarchical_hidden_Markov_model) every state can itself be an HMM. A "vertical transition" starts a sub-model, only "production states" emit, and when the sub-model ends, control returns to the state that called it, which then moves on within its own level ([Fine, Singer and Tishby 1998](https://doi.org/10.1023/A:1007469218079)). In rvss:

- **opening** a constellation is a vertical transition;
- **placing** a word is an emission;
- **closing** is the return to the parent, followed by the next step at the parent's level.

The addition is that the sub-model's emissions are kept: bound, bundled and condensed into one star in the parent. A hierarchical HMM can be flattened into a plain HMM, but the flat model "cannot represent the hierarchical structure, yet alone learn it", and exact inference costs grow exponentially with the depth: at most O(T Q^2D) for T words, D levels and Q states per level ([Murphy and Paskin 2001](https://proceedings.neurips.cc/paper/2001/hash/aebf7782a3d445f43cf30ee2c0d84dee-Abstract.html)). rvss's beam (a search that keeps only the few best partial readings at each word) avoids that cost; it gives up exactness.

**The general form is a grammar.** Hierarchical HMMs are less expressive than stochastic context-free grammars, since they allow only hierarchies of bounded depth (Murphy and Paskin 2001). A [probabilistic context-free grammar](https://en.wikipedia.org/wiki/Probabilistic_context-free_grammar) is trained by the [inside–outside algorithm](https://en.wikipedia.org/wiki/Inside%E2%80%93outside_algorithm), Baker's generalisation of the HMM's forward–backward method, and is equivalent to a probabilistic [pushdown automaton](https://en.wikipedia.org/wiki/Pushdown_automaton): a machine with a stack, like rvss's list of open constellations ([Abney, McAllester and Pereira 1999](https://aclanthology.org/P99-1070/)). The same paper shows that the standard shift-reduce translation from grammars to automata does not carry over to the probabilistic case, and concludes that the two models, though equal in what distributions they define, appear to impose different inductive biases: how a reader is built, including when it commits, shapes what it learns. rvss measured this: under its first conventions 6,926 openings came before the word that shows the wire; under the adopted ones, none (DESIGN.md, section 8.3).

## Trained with the moves given: an input–output HMM

In an [input–output HMM](https://papers.nips.cc/paper/1994/hash/8065d07da4a77621450aa84fee5656d9-Abstract.html) (Bengio and Frasconi 1995), each state predicts the next state and the output from the current input. The rvss pilot is one: the input is the word, the state is the control configuration, the output is the move. Because the moves are known in training from the label circuits, learning is a supervised fit at every step, with no [EM](https://en.wikipedia.org/wiki/Expectation%E2%80%93maximization_algorithm). The closest established name for "a discrete switch choosing which linear update acts on a vector memory" is the switching state-space model ([Ghahramani and Hinton 2000](https://www.cs.toronto.edu/~hinton/absps/switch.html)): in rvss the move chooses which bind-and-add acts on which constellation.

## How hmm-rules relates

hmm-rules kept the Markov path and dropped the memory. Its 25 stations have no levels, so its hand-written rules rebuild the hierarchy that the HMM never represented. One discrete state is a narrow channel: to hold 30 bits of history, an HMM "would need K = 2^30 distinct states", where a distributed state needs 30 binary variables ([Ghahramani and Jordan 1997](https://link.springer.com/article/10.1023/A:1007425814087)).

The two readers can meet at the kinds. hmm-rules' station probabilities at each word are exactly the input an input–output HMM takes, so they could serve as the kinds of the route book. That would bring `legend.sop`'s hand-written word lists into rvss, which the design excludes, so it would be a variant with its own name. The design's way is kinds learned from letters and neighbours ([Legend, values and kinds](legend-and-kinds.md#where-the-word-kinds-come-from)).

## The forward recursion, linear recurrent networks and phase binding

- **The HMM's forward step is a linear recurrence.** With U the transition matrix, W the emission matrix and a one-hot input x, the [forward](https://en.wikipedia.org/wiki/Forward_algorithm) values follow `h_{t+1} = (W x_{t+1}) ⊙ (U h_t)`: a [recurrent network](https://en.wikipedia.org/wiki/Recurrent_neural_network) gated by its input, with a full transition matrix ([Wu et al. 2016](https://arxiv.org/abs/1606.06630), section 4.1).
- **A VSA sequence code is also a recurrent network**, with random input weights and a unitary recurrent matrix; for FHRR the recurrence is diagonal, a phase turn per step ([Frady, Kleyko and Sommer 2018](https://arxiv.org/abs/1803.00412)). An rvss position code `Z^d = exp(i·d·φ)` is such a recurrence with every eigenvalue of modulus 1, restarted at each opener: a [linear recurrent unit](https://arxiv.org/abs/2303.06349) with no decay.
- **The difference matters.** Recurrences that are diagonal, or diagonal after one change of basis, cannot track state such as composing permutations (proved under a standard assumption of complexity theory, TC⁰ ≠ NC¹); full, input-dependent transitions can ([Merrill, Petty and Sabharwal 2024](https://proceedings.mlr.press/v235/merrill24a.html)). So the control (which constellations are open, in what order) stays discrete and explicit, and the phases carry content. rvss is built on exactly this split.
- **Capacity** follows the same theory: recall sensitivity grows as √(N/M) for N dimensions and M stored items (Frady et al. 2018). Restarting at each opener keeps M small; one flat history for the whole message would fade (Kanerva 2009, linked on [What research says](what-research-says.md#state-machines-and-vsa-memory)).

## Lineage

Plate's thesis already chunks long sequences into new items added to the clean-up memory, and notes that decoding them requires "the use of a stack and decisions on whether an item is a non-terminal" ([Plate 1994](https://redwood.berkeley.edu/wp-content/uploads/2024/08/Tony-Plate-thesis.pdf)). rvss's pilot and gates are that stack and those decisions, learned. A gated controller writing to a complex-valued memory like HRR is the [Associative LSTM](https://arxiv.org/abs/1602.03032). The only work found that joins an HMM and hyperdimensional computing directly classifies whole sequences and writes no structure ([Ślot et al. 2026](https://pubmed.ncbi.nlm.nih.gov/42330488/)). So condensing is not new; what is new here is an HMM-like controller writing nested VSA structures to parse.

## Where the analogy stops

1. **Conditional, not generative.** rvss scores moves given the words, normalised at each state; that is the [maximum-entropy Markov model](https://en.wikipedia.org/wiki/Maximum-entropy_Markov_model) case, which suffers from label bias: a state with few allowed moves passes its weight on whatever the word says ([Lafferty et al. 2001](https://oa.ee.tsinghua.edu.cn/~ouzhijian/pgm/pgm-pdf/icml01_CRF.pdf)). An HMM is a joint model and does not have this problem. The cure is global training of the scores, not a better decoder ([Andor et al. 2016](https://aclanthology.org/P16-1231/)).
2. **No probability of words.** rvss models moves, not the text; it has no likelihood to maximise and no Baum–Welch.
3. **The memory is not hidden.** Given the moves, the constellations are computed exactly; only the controller is uncertain.
4. **Moves reach back.** Claim, gather and reopen change sub-models that have already finished, which a hierarchical HMM cannot do; a key that points at a star placed elsewhere makes a graph, not a tree, beyond a context-free grammar.
5. **The stack is explicit.** The list of open constellations is a symbolic list, not a probability over stack configurations, and there is no forward–backward pass over it.
6. **Kinds are soft.** A word's kind is a mixture of kind stars, where an HMM is in one state at a time.

---

Next: [What research says for rvss](what-research-says.md) · Up: [rVSS](README.md)
