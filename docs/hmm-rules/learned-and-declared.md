[Home](../README.md) › [hmm-rules in depth](README.md) › Learned and declared

# Learned and declared: Standard, New here, Particular

This page: area by area, what hmm-rules learns from text and what is declared by hand, and the three labels applied to every part of hmm-rules. The other hmm-rules pages summarise this block. Kind: Explanation.

As the architecture report gives it at commit `fa46cb7` (section 10); the number habits of `71f0dd2` are added where they belong. "Learned" means learned from the text of the messages, with no labels. "Declared" means written by hand, in the legend or in the code.

## Seven areas

### Words

| Side | What |
| --- | --- |
| Learned | The vocabulary (words seen at least 3 times); spelling variants; openers. |
| Declared | The listed words and compounds of the legend, and which lists confine their words. |

### Word classes

| Side | What |
| --- | --- |
| Learned | HMM emissions and transitions; shape distributions; occurrence prototypes; kinds [verb, thing, quality] from anchored frames; thing or quality (`nominal`); since `71f0dd2`, grammatical number. |
| Declared | The 25 stations and their attributes; the transition prior (4 / 1 / 0.05); which frames are anchored (`src/anchors.mjs`). |

### Morphology

| Side | What |
| --- | --- |
| Learned | Which forms belong to which word in this text: a stem must itself occur. |
| Declared | Endings, form rules and irregular pairs (`legend.sop`); stem spelling rules (`src/forms.mjs`); ending classes (`src/observe.mjs`); clitics (`src/tokens.mjs`). |

### Verb frames

| Side | What |
| --- | --- |
| Learned | `takesQuality`, `takesClause`, `directs`, `names`, `gives`, `asks`, `phrasal`, `separable`, `anchored`. |
| Declared | The marks `makesdo`, `needsbare`, `finite`, `perfect`, `bare`, `predicative`; the patterns in which frames are counted (`src/habits.mjs`). |

### Attachment

| Side | What |
| --- | --- |
| Learned | Verb and noun rates per preposition, settled over the doubtful cases; the role-filler memory. |
| Declared | The sure patterns; the competition of hosts; the weight 2 and the margin 0.5. |

### Likeness

| Side | What |
| --- | --- |
| Learned | Word vectors; pairs that stand together; participle–noun counts. |
| Declared | The build vector of a nominal (which slots, which fillers); the threshold 0.3. |

### Structure

| Side | What |
| --- | --- |
| Learned | Nothing. |
| Declared | Every rule of the chunker, linker and writer ([The rule catalogue](rules.md)); the clause-form decisions; the verb budget; the loop limit 4. |

## English knowledge outside the legend

The legend is meant to be the only place for knowledge of English. Some of it is in JavaScript instead:

- the ending classes of `src/observe.mjs`;
- the clitic pattern of `src/tokens.mjs`;
- the stem spelling rules of `src/forms.mjs`;
- the plural test `/[^s]s$/` and the hyphen-and-ed test in `src/units.mjs`;
- the question mark in the clause-form decision of `src/links.mjs`;
- the literal word "it" as an object in the verb frames of `src/anchors.mjs`;
- the pattern of break marks `/^[,:;!—–-]$/` that ends an opener, in `train.mjs` and `src/reader.mjs`.

The names of stations, marks and `nlu` slots are also hard-coded ([The legend](legend.md#the-legend-is-not-independent-of-the-code)).

## Standard, new here, particular

The full block for hmm-rules. The project's index of what is new, across all parts, is [What is new here](../project/what-is-new.md).

| Label | For hmm-rules |
| --- | --- |
| Standard | Hidden Markov model, Baum–Welch, Viterbi, chunking, PPMI word vectors, vector-symbolic bind and bundle, prepositional-phrase attachment, selectional preferences, underspecification ([Methods](methods.md)). |
| New here | The design of the legend (both prior and only word list); the changes to EM (kinship, sharpening, damping, form lean); the register of the verb budget (constrained decoding itself is standard); the doubts loop as designed here; anchored kinds; the habits and the memory; a rule set that names only function words. |
| Particular | The thresholds `SURELY_A_THING`, `SURELY_A_VERB` and `UNLIKE`, set from this dataset's counts; openers and spelling variants shaped by the dataset; borderline legend words (left/right, today/tomorrow, thanks); the choice of constructions, driven by the faults seen on WebMeet. The origin of the "n" thresholds is not recorded. |

What each label means:

- **Standard**: an established idea or tool, used as the field knows it.
- **New here**: designed in this project.
- **Particular**: holds only for this project's language, data or setting.

## Why it matters

A reader that should work on other English must not depend on this dataset. The particular parts are the ones a generality audit would rewrite or remove, and the declared parts in JavaScript are the ones that would move into the legend. The plan is on [Making hmm-rules reusable](reuse.md).

---

Next: [Known limits of hmm-rules](limits.md) · Up: [hmm-rules in depth](README.md)
