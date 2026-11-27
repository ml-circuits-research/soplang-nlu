[Home](../README.md) › [rVSS](README.md) › What research says

# What research says for rvss

This page: published results that guide rvss, and hmm-rules where they apply, grouped as unsupervised tagging, hierarchy and grammar induction, state machines and VSA memory, training and decoding; each with its number, its source and one line for rvss; then the decisions they imply. It is the page that keeps us from spending time where the field already knows the answer. Kind: Reference.

Every number below was read in the source (the research notes of 2026-11-27). A number belongs to its paper and its data, mostly English newswire (the Wall Street Journal part of the Penn Treebank, "WSJ"); it does not carry over to this project's messages. Many-to-1, 1-to-1 and V-measure are the usual scores of learned word classes against gold tags: many-to-1 maps each class to its most frequent tag (several classes may share one), 1-to-1 allows each tag only one class, and [V-measure](https://aclanthology.org/D07-1043/) is an information-theoretic score that needs no mapping.

## Unsupervised tagging: kinds and stations

### EM drifts away from a good start

Trained by [Baum–Welch](https://en.wikipedia.org/wiki/Baum%E2%80%93Welch_algorithm) from a model estimated on all the tagged text, a tagger falls from 97.0% to 95.2% correct in 10 iterations; from a uniform start limited by a dictionary it rises from 77.0% to 86.6%. "If we use more than 5,000 tagged sentences, even the first iteration of ML training degrades the tagging." Freezing the word–tag probabilities of the 1,000 most frequent words slows the fall (96.09% instead of 95.21%). [Merialdo 1994](https://aclanthology.org/J94-2001/). **For rvss:** it learns from label circuits, the "much tagged text" case: no unsupervised phase on raw text; if one is ever tried, stop at the first drop of labelled development accuracy.

### EM spreads words evenly over the states

Real tags are skewed (six tags hold over 55% of tokens), but EM gives each state about the same share: with 50 states, 1-to-1 0.40 and many-to-1 0.62; posterior decoding "often scored more than 5% better" than Viterbi at modest iteration counts. [Johnson 2007](https://aclanthology.org/D07-1031/). **For rvss:** log how many tokens each kind takes, compare with the keys; never add a term that makes kinds equal in size.

### Word lists and a small grammar matter more than the estimator

A fully Bayesian HMM beats maximum likelihood with a full dictionary, 86.8% against 74.5%; with 17 tags, keeping dictionary entries only for words seen 10 times or more brings maximum likelihood and the better Bayesian model from 83.2 and 87.3 (full dictionary) down to 50.9 and 49.7 ([Goldwater and Griffiths 2007](https://aclanthology.org/P07-1094/)). Keeping the smallest set of tag pairs that explains the corpus (459 of 2,025) and alternating EM on grammar and dictionary reaches 91.6% ([Ravi and Knight 2009](https://aclanthology.org/P09-1057/)). **For rvss:** prune the pairs of kinds that the label circuits never use from the gate and pair memories.

### Simple clustering with morphology is as good as newer models

Over seven systems and 20 years, the old type clustering of [Brown et al. 1992](https://aclanthology.org/J92-4003/) and Clark 2003 does as well as or better than Bayesian and feature HMMs, and the two best use morphology (Clark: 71.2 many-to-1, 53.8 1-to-1, 65.5 V-measure, 45 clusters). Many-to-1 rises "to almost 85%" with 200 clusters, so [V-measure](https://aclanthology.org/D07-1043/) is the steadier score. [Christodoulopoulos, Goldwater and Steedman 2010](https://aclanthology.org/D10-1056/). **For rvss:** score kinds against the keys the words fill, with all three measures at a fixed number of kinds; spend effort on features and seeds, not estimators.

### Letters help rare words, if the letter model stays weak

A weak letter model per class helps rare words in seven languages; a strong one finds spurious classes, as of words starting with "st". A plain HMM with more states turns its states into position groups. [Clark 2003](https://aclanthology.org/E03-1009/). **For rvss:** give the word's ending a bound term of its own instead of weighting every letter trigram equally; leave position to the constellations.

### Prototypes spread through context similarity

Three example words per tag and no dictionary: 41.3% at base, 68.8% with the prototypes fixed, 80.5% with similarity of context vectors; with prototypes fixed alone, only 47.7% of the other words' occurrences are right. [Haghighi and Klein 2006](https://aclanthology.org/N06-1041/). **For rvss:** the kind cleanup, a context vector compared with the kind stars, is this mechanism; seeds help only through it.

### Most word types have one tag; likelihood misleads

91.5% of English word types are unambiguous. With 12 universal tags, an estimator built on words that anchor one tag reaches 66.1 many-to-1 against Baum–Welch's 59.8, with a lower likelihood (−7.06 against −6.45). [Stratos, Collins and Hsu 2016](https://aclanthology.org/Q16-1018/). **For rvss:** kinds can be mostly a property of the word type, with a context correction for ambiguous words; never choose a model by likelihood.

### Letters and context bring the gains, not neural parametrisation

Spelling features on the emissions lift a basic HMM from 63.1 to 68.1 many-to-1, and to 75.5 with direct gradient training ([Berg-Kirkpatrick et al. 2010](https://aclanthology.org/N10-1083/)). A neural HMM alone scores like a classical one (59.8 against 62.5); a character convolution and longer context bring it to 79.1 ([Tran et al. 2016](https://aclanthology.org/W16-5907/)). **For rvss:** give the kind input separate terms for identity, trigrams, ending and shape (digit, hyphen, capital); no neural HMM is needed.

### Short windows, and context without the word

HMMs with Gaussian emissions over word vectors beat featurised ones, and word vectors trained with a context window of one word gave the best average V-measure, against windows of 2 to 16 ([Lin et al. 2015](https://aclanthology.org/N15-1144/)); with an invertible projection, 80.8 many-to-1 and 74.1 V-measure ([He, Neubig and Berg-Kirkpatrick 2018](https://aclanthology.org/D18-1160/)). Vectors of the words that could stand at a position, from context alone, reach .7680 many-to-1, .8023 with spelling ([Yatbaz, Sert and Yuret 2012](https://aclanthology.org/D12-1086/)). **For rvss:** start the window weights with the ±1 neighbours highest; read a kind from a context-only part and the word's own part.

## Hierarchy and grammar induction

### A hierarchical HMM, and the cost of exact inference

Each state may be an HMM of its own; evaluation costs O(N T³) ([Fine, Singer and Tishby 1998](https://doi.org/10.1023/A:1007469218079)). As a [dynamic Bayesian network](https://en.wikipedia.org/wiki/Dynamic_Bayesian_network), inference becomes linear in length but exponential in depth, at most O(T Q^2D) ([Murphy and Paskin 2001](https://proceedings.neurips.cc/paper/2001/hash/aebf7782a3d445f43cf30ee2c0d84dee-Abstract.html)). **For rvss:** a beam over the open list, linear in the message's length; no exact inference over the pilot's states.

### Inside–outside on raw text: cubic and inconclusive

An iteration "may require O(n³|w|³) time per training sentence" for n nonterminals, against O(s²|w|) for an HMM, and results on natural language were "so far inconclusive" ([Pereira and Schabes 1992](https://aclanthology.org/P92-1017/), on [Lari and Young 1990](https://doi.org/10.1016/0885-2308%2890%2990022-X)). **For rvss:** the grammar view describes rvss; it is not a way to train it.

### Brackets decide where constituents open and close; likelihood does not

On ATIS, grammars trained on raw and on bracketed text reach almost the same cross-entropy (about 2.95 and 2.97), but bracketing accuracy is 37.35% against 90.36%. [Pereira and Schabes 1992](https://aclanthology.org/P92-1017/). **For rvss:** keep the supervision on every opening and closing.

### The words just outside a span signal a boundary

The constituent-context model scores a span by its words and by the words just before and after it: F1 71.1 on short WSJ sentences with treebank tags, 63.2 with induced tags. [Klein and Manning 2002](https://aclanthology.org/P02-1017/). **For rvss:** the close gate should see the kind after the candidate constellation, the open gate the kind before the opener.

### Conventions reach a model only through labels

The dependency model with valence scores 43.2% directed (adjacent-word baseline 33.6%), and 55.7% when determiners head noun phrases, its own convention. [Klein and Manning 2004](https://aclanthology.org/P04-1061/). **For rvss:** it learns the labels' conventions; keep the oracle's conventions consistent, and treat a change of convention as a change of target.

### Induction without labels stays far below the ceiling

The compound PCFG reaches a mean unlabelled F1 of 55.2 against a binary ceiling of 84.3, with recall 56.1% on SBAR and 41.7% on VP ([Kim, Dyer and Rush 2019](https://aclanthology.org/P19-1228/)); DIORA 48.9, and 55.7 with a rule for final punctuation ([Drozdov et al. 2019](https://aclanthology.org/N19-1116/)). A supervised chart parser reaches 93.55 labelled F1, not comparable point for point ([Kitaev and Klein 2018](https://aclanthology.org/P18-1249/)). **For rvss:** no discovery of clause boundaries without labels; keep explicit edge conventions (punctuation opens and closes, never placed); a span chart reader is a good comparison.

### Transition systems, and composing a closed constituent

A deterministic parser is a transition system, a feature model and a classifier trained through an oracle; arc-standard runs in O(n) ([Nivre 2008](https://aclanthology.org/J08-4003/)). Recurrent neural network grammars compose a finished constituent into one vector, reading its label first: 92.4 F1, generative ([Dyer et al. 2016](https://aclanthology.org/N16-1024/)). **For rvss:** keep the type star in the condensed star; test the gates against a logistic regression on the same view.

### The order of commitment is part of the model

PCFGs and probabilistic pushdown automata define the same distributions, but the standard shift-reduce translation fails in the probabilistic case, and the two appear to impose different inductive biases ([Abney, McAllester and Pereira 1999](https://aclanthology.org/P99-1070/)). Arc-eager [left-corner](https://en.wikipedia.org/wiki/Left_corner_parser) parsing needs constant memory except for [centre embedding](https://en.wikipedia.org/wiki/Center_embedding) ([Resnik 1992](https://aclanthology.org/C92-1032/)). **For rvss:** the opening conventions shape what is learned; measure the depth of the open list in the oracle's replay.

### Soft stacks and latent trees learn something else

A stack RNN learns counting languages only with search and rounding ([Joulin and Mikolov 2015](https://arxiv.org/abs/1503.01007)); continuous stacks solve reversal (1.00 against 0.04 for a deep LSTM) on synthetic tasks ([Grefenstette et al. 2015](https://arxiv.org/abs/1506.02516)). Trees learned through a task loss alone differ between runs and do not resemble treebank trees ([Williams, Drozdov and Bowman 2018](https://aclanthology.org/Q18-1019/); [Kim et al. 2017](https://arxiv.org/abs/1702.00887)). **For rvss:** with the moves known, a soft stack adds no signal; run "no action loss" once, as a diagnostic.

## State machines and VSA memory

### The forward recursion is a linear recurrent network

A multiplicative-integration RNN computes the HMM forward algorithm exactly when its matrices are probability matrices and its input is one-hot. [Wu et al. 2016](https://arxiv.org/abs/1606.06630). **For rvss:** the HMM reading of the control is an identity of form, not a loose analogy ([rvss as an HMM plus a VSA memory](hmm-plus-vsa.md)).

### Diagonal recurrences cannot track state

State-space models with diagonal or input-independent transitions cannot track state (assuming TC⁰ ≠ NC¹) such as composing permutations; full, input-dependent transitions can ([Merrill, Petty and Sabharwal 2024](https://proceedings.mlr.press/v235/merrill24a.html)). A dense linear recurrence can be rewritten in complex diagonal form, its eigenvalues initialised on a ring of radius at most 1 ([Orvieto et al. 2023](https://arxiv.org/abs/2303.06349)). **For rvss:** positions are such a recurrence with modulus 1, restarted at each opener; keep the open list explicit; no learned decay.

### How much a VSA memory holds

Recall sensitivity is √(N/M) for N dimensions and M items, a bound of 0.39 bits per neuron ([Frady, Kleyko and Sommer 2018](https://arxiv.org/abs/1803.00412)). An HRR trace needs n = 4.5(k + 0.7) ln(m/30q⁴) dimensions for k pairs, and unitary vectors avoid the loss on deep structures ([Plate 1995](https://redwood.berkeley.edu/wp-content/uploads/2020/08/Plate-HRR-IEEE-TransNN.pdf)). Encoding more than k + 1 elements of a kth-order Markov sequence in one vector weakens prediction ([Kanerva 2009](https://cs.uwaterloo.ca/~jhoey/teaching/cogsci600/papers/Kanerva09.pdf)). **For rvss:** size D from theory; one memory per constellation; split a constellation into chunks when it crosses the bound.

### Chunks need a stack and a decision

Long sequences are chunked into new items added to the clean-up memory, and decoding them requires "the use of a stack and decisions on whether an item is a non-terminal". [Plate 1994](https://redwood.berkeley.edu/wp-content/uploads/2024/08/Tony-Plate-thesis.pdf). **For rvss:** condensing is Plate's chunk and the pilot supplies the stack and the decisions; cite the lineage, do not claim condensing as new.

### Discrete control, distributed memory

Input–output HMMs map input sequences to outputs, supervised ([Bengio and Frasconi 1995](https://papers.nips.cc/paper/1994/hash/8065d07da4a77621450aa84fee5656d9-Abstract.html)). Holding 30 bits of history in one state needs 2^30 states ([Ghahramani and Jordan 1997](https://link.springer.com/article/10.1023/A:1007425814087)). Switching state-space models let a discrete switch choose a linear update ([Ghahramani and Hinton 2000](https://www.cs.toronto.edu/~hinton/absps/switch.html)). **For rvss:** train the control as a per-step classifier; the memory follows the moves exactly, so no EM or variational inference.

### Memories with keys: factoring, gating, rewriting

Resonator networks factor a product of bound vectors by search in superposition; their capacity grows quadratically with dimension, but convergence is not guaranteed ([Frady et al. 2020](https://arxiv.org/abs/2007.03748); [Kent et al. 2020](https://redwood.berkeley.edu/wp-content/uploads/2020/08/resonator2.pdf)). Redundant permuted copies reduce the noise of an HRR memory ([Danihelka et al. 2016](https://arxiv.org/abs/1602.03032)). A fast-weight memory of d-dimensional keys gives retrieval errors beyond d associations, and a delta-rule write corrects old values ([Schlag, Irie and Schmidhuber 2021](https://proceedings.mlr.press/v139/schlag21a.html)). The one HMM-plus-HDC work found classifies sequences ([Ślot et al. 2026](https://pubmed.ncbi.nlm.nih.gov/42330488/)). **For rvss:** candidates can be listed, so plain cleanup is exact; rewrite a binding by subtracting the old term and adding the new.

## Training and decoding

### Choose the decoder for the metric

Viterbi gives the most exactly correct trees, while a decoder of expected labelled recall gives better recall, "as much as a 10% reduction in error rate" ([Goodman 1996](https://aclanthology.org/P96-1024/)). Pointwise decoding was more accurate than Viterbi in 85.35% of rounds but returned an impossible path in 74.14% of cases ([Lember and Koloydenko 2014](https://www.jmlr.org/papers/v15/lember14a.html)). **For rvss:** the best whole hypothesis for exact core; the end-of-message cleanup is pointwise, so always validate it and fall back to the pilot's tree.

### Label bias, and global normalisation

On a synthetic task a CRF errs 4.6% where an MEMM errs 42% ([Lafferty, McCallum and Pereira 2001](https://oa.ee.tsinghua.edu.cn/~ouzhijian/pgm/pgm-pdf/icml01_CRF.pdf)). Without lookahead, a greedy parser scores 76.96 UAS, a locally normalised one with a beam 81.35, a globally normalised one 93.60 ([Andor et al. 2016](https://aclanthology.org/P16-1231/)). **For rvss:** its moves are normalised locally and it has almost no lookahead; plan M3 as local pretraining, then a global loss over the beam.

### Separate model errors from search errors

With exact search, a translation model's best output was the empty one for 51.8% of sentences; beam search scored 30.3 BLEU only because its search errors hid this. [Stahlberg and Byrne 2019](https://aclanthology.org/D19-1331/). **For rvss:** a sum of log-probabilities of moves favours fewer moves; search short messages exhaustively before tuning the beam.

### Train the beam as it will be used

Updating as soon as the gold prefix leaves the beam (early update) made "an enormous difference"; with the generative model it reached 88.8 F1 ([Collins and Roark 2004](https://aclanthology.org/P04-1015/)); updating at the largest violation cut training time by 3 fold against early update on part-of-speech tagging ([Huang, Fayong and Guo 2012](https://aclanthology.org/N12-1015/)). To decode with a beam of size K, "it makes sense to train with a beam of size K + 1" ([Wiseman and Rush 2016](https://aclanthology.org/D16-1137/)). **For rvss:** decide greedy or beam 4 for production first, and train for it.

### Exposure bias: roll-in with an oracle

Trained only on expert states, a policy can make up to T²ε mistakes over T steps; training on its own states makes it linear ([Ross, Gordon and Bagnell 2011](https://proceedings.mlr.press/v15/ross11a/ross11a.pdf)). A dynamic oracle with exploration adds 1.5 LAS on average ([Goldberg and Nivre 2012](https://aclanthology.org/C12-1059/)). Scheduled sampling lifts parsing from 86.54 to 88.08 F1 ([Bengio et al. 2015](https://proceedings.neurips.cc/paper/2015/hash/e995f98d56967d946471af29d7bf99f1-Abstract.html)), but its objective is improper ([Huszár 2015](https://arxiv.org/abs/1511.05101)). **For rvss:** report teacher-forced and free-running accuracy by length; build a cost-based oracle.

### Curriculum: speed, not accuracy

Easy examples first gave 16.3% error against 17.1% on a toy task ([Bengio et al. 2009](https://cognitivemedium.com/assets/rmnist/Bengio2009.pdf)). For EM grammar induction on WSJ, growing the length one word at a time gave 39.4%, training only on sentences of 15 words or fewer 44.1%, and a quick ramp to all data 45.0% ([Spitkovsky, Alshawi and Jurafsky 2010](https://aclanthology.org/N10-1116/)). **For rvss:** ordering by length is a convenience; for hmm-rules' EM, short messages first is worth a try.

### Calibrate the confidence; abstain with a bound

One temperature cut calibration error from 16.53% to 1.26% on an image task ([Guo et al. 2017](https://proceedings.mlr.press/v70/guo17a.html)). In structured prediction, the margin between the best and second output is a good feature for a small recalibrator ([Kuleshov and Liang 2015](https://cs.cornell.edu/~kuleshov/papers/nips2015.pdf)). Rejecting where consistent hypotheses disagree is optimal without noise ([El-Yaniv and Wiener 2010](https://www.jmlr.org/papers/volume11/el-yaniv10a/el-yaniv10a.pdf)); a threshold with a bound guaranteed 2% top-5 error at almost 60% coverage ([Geifman and El-Yaniv 2017](https://papers.nips.cc/paper_files/paper/2017/hash/4a8423d5e91fda00bb7e46540e2b0cf1-Abstract.html)). **For rvss:** recalibrate margin, remainder and beam gap on dev-B; report risk–coverage; reject on disagreement.

## Decisions this implies

**What we do:**

- Keep supervision on every opening, closing, key and choice (Pereira and Schabes; Kim et al. 2019).
- Keep the open list discrete and explicit; decode with a beam, linear in length (Murphy and Paskin; Merrill et al.).
- Kinds: mostly per word type, plus context; separate terms for identity, ending and shape; ±1 neighbours weighted highest; a context-only part (Stratos et al.; Berg-Kirkpatrick et al.; Lin et al.; Yatbaz et al.).
- Seed the kind stars from Brown clusters of the raw text if seeds are tried; seeds from hmm-rules' stations bring word lists and make a variant with its own name.
- Gate views include the kind before the opener and after the candidate (Klein and Manning 2002); the type star stays in the condensed star (Dyer et al.).
- Score kinds with many-to-1, 1-to-1 and V-measure against the keys, by frequency band, with the size of each kind (Johnson; Christodoulopoulos et al.).
- Before M3, separate model errors from search errors on short messages (Stahlberg and Byrne); then local pretraining and a global loss with early or max-violation updates (Andor et al.; Collins and Roark; Huang et al.).
- Report by length bucket, teacher-forced against free-running, with a trivial baseline and the ceiling (Ross et al.; Klein and Manning).
- Confidence: recalibrated margin and remainder, risk–coverage curves, rejection on disagreement (Kuleshov and Liang; Geifman and El-Yaniv).

**What we skip, and why:**

- An unsupervised EM or likelihood phase on raw text, and choosing models by likelihood: it drifts from good starts (Merialdo; Stratos et al.).
- Exact inside–outside or an EM-trained grammar: cubic and inconclusive (Pereira and Schabes).
- Soft stacks; "no action loss" except once as a diagnostic: no signal beyond known moves (Joulin and Mikolov; Williams et al.).
- Neural HMMs, Gibbs samplers, more kinds to fix errors: little gain against letters and seeds (Tran et al.; Johnson).
- Resonator networks while candidates can be listed; learned decay for constellations (Frady et al. 2020; Orvieto et al.).
- Tuned curricula, dropout or ensembles for confidence (Bengio et al. 2009; Geifman and El-Yaniv).

**For hmm-rules:** choose the Baum–Welch iteration count by judged accuracy and stop at the first drop (Merialdo); compare posterior decoding limited to allowed paths with Viterbi (Johnson; Lember and Koloydenko); one sharpening exponent per station; short messages first (Spitkovsky et al.).

---

Next: [Milestones and what to expect](milestones.md) · Up: [rVSS](README.md)
