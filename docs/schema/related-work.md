[Home](../README.md) › [Syntax schema](README.md) › Related work

# Related work, weak points, open questions

This page: each choice of the schema set against the literature, the weak points still open, and the questions for the reviewer. Kind: Explanation.

How grammar is usually annotated (dependency trees, Universal Dependencies, chunking) is explained from zero in [How grammar is usually written down](../concepts/grammar-notation.md).

## UD labels used here

[Universal Dependencies](https://en.wikipedia.org/wiki/Universal_Dependencies) (UD) names each relation between two words with a short label. The labels met on this page, with the names the [UD documentation](https://universaldependencies.org/u/dep/index.html) gives them:

- `nsubj` nominal subject; `obj` object; `iobj` indirect object; `xcomp` open clausal complement.
- `aux` auxiliary; `advmod` adverbial modifier; `amod` adjectival modifier.
- `det` determiner; `nummod` numeric modifier; `compound` compound.
- `case` case marking (for prepositions); `mark` marker (for subordinators).
- `obl` oblique nominal (attached to a predicate); `nmod` nominal modifier (attached to a noun).
- `acl` clausal modifier of noun; `appos` appositional modifier.
- `conj` conjunct; `cc` coordinating conjunction; `discourse` discourse element.

## How the schema relates to the literature

One heading per choice. The table gives the related work and how this schema relates to it.

### Nominals as flat groups with a head

| Part | Text |
| --- | --- |
| Related work | Chunking, or partial parsing: Abney, "Parsing by Chunks" (1991); the CoNLL-2000 shared task. See [shallow parsing](https://en.wikipedia.org/wiki/Shallow_parsing). |
| How it relates | A nominal is a base noun phrase. Chunkers find these reliably without a full parse. |

### `verb`, `auxiliary`, `negation`

| Part | Text |
| --- | --- |
| Related work | The verb group of chunking; `aux` in UD ([Universal Dependencies](https://en.wikipedia.org/wiki/Universal_Dependencies)) |
| How it relates | The verb with its auxiliaries and negation forms one unit. |

### `subject`, `complement`

| Part | Text |
| --- | --- |
| Related work | `nsubj`, `obj`, `iobj`, `xcomp` in UD |
| How it relates | UD separates object, indirect object and predicative. This schema keeps only subject against the other complements. |

### No semantic roles

| Part | Text |
| --- | --- |
| Related work | Semantic role labelling: PropBank (Palmer, Gildea and Kingsbury 2005); proto-roles (Dowty 1991). See [semantic role labeling](https://en.wikipedia.org/wiki/Semantic_role_labeling), [PropBank](https://en.wikipedia.org/wiki/PropBank), [David Dowty](https://en.wikipedia.org/wiki/David_Dowty). |
| How it relates | Who receives and what is affected is the task of role labelling, a separate layer above syntax. |

### `modifier`

| Part | Text |
| --- | --- |
| Related work | `advmod` and adjectival `xcomp` in UD; secondary predication ([secondary predicate](https://en.wikipedia.org/wiki/Secondary_predicate)) |
| How it relates | Manner, degree and result differ in meaning. Their syntax is close: a word that modifies the predicate. |

### `dependent`

| Part | Text |
| --- | --- |
| Related work | `det`, `nummod`, `amod`, `compound` in UD |
| How it relates | All are dependents of the noun. This schema does not tell them apart. |

### Relations with a marker, starting at the clause or at a nominal

| Part | Text |
| --- | --- |
| Related work | `case` and `mark` in UD, with `obl` against `nmod`; Hindle and Rooth (1993). See [syntactic ambiguity](https://en.wikipedia.org/wiki/Syntactic_ambiguity). |
| How it relates | UD attaches a prepositional phrase to the predicate or to a noun. The choice is a known hard ambiguity. |

### Relations without a marker

| Part | Text |
| --- | --- |
| Related work | `acl`, `appos` in UD ([apposition](https://en.wikipedia.org/wiki/Apposition)) |
| How it relates | A clause or a nominal that stands with a nominal. |

### `coordination`

| Part | Text |
| --- | --- |
| Related work | `conj` and `cc` in UD ([coordination](https://en.wikipedia.org/wiki/Coordination_(linguistics)), [gapping](https://en.wikipedia.org/wiki/Gapping)) |
| How it relates | A fragment that shares a verb is gapping. |

### One wire per clause

| Part | Text |
| --- | --- |
| Related work | Clause-based open information extraction: ClausIE (Del Corro and Gemulla 2013). See [open information extraction](https://en.wikipedia.org/wiki/Open_information_extraction). |
| How it relates | A sentence is split into clauses and each clause yields one proposition. |

### `attachment=ambiguous`

| Part | Text |
| --- | --- |
| Related work | Underspecified representations, for example Minimal Recursion Semantics (Copestake et al. 2005). See [underspecification](https://en.wikipedia.org/wiki/Underspecification), [minimal recursion semantics](https://en.wikipedia.org/wiki/Minimal_recursion_semantics). |
| How it relates | One representation stands for several readings until more information settles them. |

### In one sentence

In short: the schema is a dependency analysis in the style of UD, coarsened to the level of a chunker, with the ambiguities that syntax cannot settle marked.

## Weak points still open

1. **`complement` merges object and predicative complement.** "the box is a square" and "the box hits a square" get the same shape. Only the verb differs.
2. **Punctuation is in no wire.** A layer that needs the marks must read them from the message.
3. **`complement` in a fragment.** A fragment has no verb, so its nominals are complements of nothing. The key is used there to avoid one more key.
4. **`modifier` merges adverbs and adjectives.** "make it red" and "move it slowly" look alike.
5. **`dependent` merges determiners, numerals and adjectives.** A layer that needs the count must find it among the dependents.
6. **The scope of a coordination has no mark for ambiguity.** A formalizer must choose which earlier wire the coordination joins. Attachment has a mark and coordination scope has none.
7. **Rule 1 cannot say which occurrence of a repeated word a value holds when claims cross.** The circuit stays valid and the two values are the same word; see the known limit of [Rule 1](rules.md#rule-1-alignment-every-word-exactly-once).
8. **A required head costs acceptance.** Earlier judging let any choice of head pass when the group was right. Under this version a wrong head is an error. Measured by identity with an accepted circuit, comparing the head changes the result for 4 of the 1,831 messages. The effect on judged acceptance is not known.
9. **The question word has no key.** The next layer finds it by the word itself.

The report of 2026-11-27 says that these weak points and the questions below remain as listed, and names four of them: coordination scope has no ambiguity mark, a required head costs acceptance (not measured in judged terms), `complement` in a fragment, and `complement` merging object and predicative complement ([The full reports](../project/reports.md)).

## Questions for the reviewer

Numbered as in the specification; the specification has no question 3.

- **1.** Is `attachment=ambiguous` on one circuit the right way to deliver an unsettled attachment?
- **2.** Is a required head the right decision, given that it lowers acceptance?
- **4.** Should the scope of a coordination get a mark for ambiguity as well?
- **5.** Is Rule 1 acceptable with its known limit?
- **6.** Is it right to drop the key for the question word and leave the word where its grammar puts it?
- **7.** Is `complement` acceptable for the nominals of a fragment, or should fragments have a key of their own?

The reasons behind the choices these questions touch are on [Decisions 1–5](decisions-review-1.md) and [Decisions 6–8](decisions-names.md).

---

Next: [From the nlu schema](nlu-mapping.md) · Up: [The syntax schema](README.md)

## Open question (owner, 2026-11-28): the order of wires

The circuit is written in the order of the message, but the order of wires is "not compared" (see
[Correctness](correctness.md)): nothing in a circuit states that one sentence follows another. The owner noted that
if the order of the wires were kept as part of the circuit, some ties between sentences might not be needed. The owner's
decision (later the same day): the order of wires is useful and must be kept (circuits are written in the order of
the message); ties between sentences are recommended, not required, since such references are hard to settle at this
step and, like pronouns, belong to later steps of the pipeline; there will be ambiguous cases. Whether the schema
should state the order of top-level wires explicitly (and compare it) is open.
