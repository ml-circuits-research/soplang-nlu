[Home](../README.md) › [hmm-rules in depth](README.md) › Writing

# Writing the syntax circuit

This page: how hmm-rules turns its internal wires into a syntax circuit: `emitSyntax`, the discourse fallback, the shared writer, the mapping from internal names to syntax keys, and the ids it makes. Kind: Reference.

As the architecture report describes it at commit `fa46cb7`. `src/emit-syntax.mjs` changed in `71f0dd2` by a few lines (a question word before the pronoun "one" is its dependent). The schema's keys are defined in [Clause and nominal wires](../schema/clause-and-nominal.md) and [Relation and coordination wires](../schema/relation-and-coordination.md).

## emitSyntax and the discourse fallback

`emitSyntax(text, tokens, wires, knows)` in `src/emit-syntax.mjs`:

1. Maps every token span to words of the message, as the schema's checker counts them. Punctuation is not a word, so a span that covers only punctuation disappears.
2. Translates each internal wire (below).
3. Runs a series of passes over the syntax wires ([The rule catalogue](rules.md#writing)).
4. Gives every word still uncovered a `discourse` place (a word of the clause that fills no role) in the clause it stands in. With no clause at all, a fragment clause `c0` is made for such words.

`knows` gives it lookups from the reader: whether a question word stands for a thing, whether a word is a verb form, a quality, a naming participle, a conjunction or a question word, and whether a verb takes a result.

## writeCircuit

`writeCircuit` in `lib/syntax.mjs` is the writer shared by all formalizers ([Library API](../reference/library.md)).

- **Order for Rule 1.** It orders the wires so that the schema's alignment rule gives each quoted value its own occurrence: a value claims the earliest free occurrence of its words ([The five rules](../schema/rules.md#rule-1-alignment-every-word-exactly-once)).
- **Refusals.** It throws when a span lies outside the message, or when a word is uncovered or claimed twice.
- **Crossing repeated words.** When repeated words cross between wires, so that no order gives every value its own occurrence, it writes the wires in message order (since commit `d12c190`). It throws only if the check of that text then finds words uncovered or not in the message. When measured on 2026-11-27 (the decisions report, I7), the case occurred in 2 to 8 of the 1,831 benchmark messages, depending on the formalizer, mostly with "and", "then" and "right".
- **No circuit.** When it throws, the strategy returns no circuit and the error.

## From internal names to syntax keys

The linker writes internal wires with the slot names of the `nlu` schema ([From the nlu schema](../schema/nlu-mapping.md)). Nominal ids `e1, e2, …` are renamed `n1, n2, …`.

### Clause keys (`nlu.clause` → `syntax.clause`)

- A clause with no `predicate` gets `form=fragment`; `form` keeps its value.
- `predicate` → `verb`; `auxiliary`, `negation` and `subject` keep their names.
- `particle`, `adverb`, `result_complement`, `degree`, `unresolved` → `modifier`. Adjacent grading words become one run ("a little longer").
- `connective`, `filler`, `expression` → `discourse`. Written with a capital right after another word, the words are mentioned, not said: they become a nominal ("a paragraph saying Thank you").
- `direct_object`, `indirect_object`, `predicative_entity`, `topic`, `participant` → `complement`. The schema does not say what the nominal is to the verb.
- `clausal_complement` → a `syntax.relation` from the governing clause to the completing clause, marked "to" when the infinitive has it.
- `marker` → the `marker` of the relation that ends at this clause. Without such a relation: a new relation from the main clause. Alone in its message: `discourse` for a word that joins clauses ("so make the boxes blue"), `modifier` otherwise ("where is the title?").
- `question` → `dependent` of the next nominal ("what colour"), `head` of a nominal of its own ("what is this?"), or `modifier` ("where is it?").
- `separator`, `terminator` → not written. A word used as a separator: a sign after a number ("30%") is a `dependent`, others `discourse`.
- `polarity`, `speech_act` → dropped.
- A fragment that shares a verb (`shares`) → `ellipsis`, pointing at the clause whose verb it borrows.

### Entity keys (`nlu.entity` → `syntax.nominal`)

- `head`, `name`, `pronoun`, `literal` → the first present is the `head`, the others are `dependent`. With none, the last word becomes the head.
- `determiner`, `quantity`, `degree`, `modifier`, `compound`, `adverb` → `dependent`.
- `possessor` + `possessive_marker` → a `syntax.relation` from the owned nominal to the owner, marker "'s" ("put Jan's chair next to the table").

### Relation and coordination keys

- `nlu.relation` → `syntax.relation`; `from` and `to` keep their names; `cue` → `marker`; `negation` stays ("not behind Jo").
- A relation's `adverb` → `modifier` of the clause where the relation starts ("right below"; this choice of clause dates from `fa46cb7`).
- `attachment=open` → `attachment=ambiguous`.
- `kind` (on, at, open, purpose, nominal_clause, elaboration, …) → dropped. A relation with `kind=open` is written without a marker.
- `nlu.coordination` → `syntax.coordination`, dissolved when it has fewer than two conjuncts or conjuncts of different types; `member` → `conjunct`; `cue` → `conjunction`. Commas are not words, so they disappear.

## The ids that the writer makes

Wires made by `emit-syntax.mjs` itself carry their own letters:

| Id | Wire |
| --- | --- |
| `x` | A relation the writer adds. |
| `q` | A nominal for a question word. |
| `p` | A nonfinite clause made from a naming participle ("a group called g2"). |
| `m` | A nominal for mentioned words, or for a run of names. |
| `j` | A coordination of names. |
| `f` | A fragment that holds a nominal. |
| `c0` | A fragment for left-over words when there is no clause. |

For example, at `97a1b83` "make sure it fits" is written with `@x1 syntax.relation from=$c1 to=$c2`, a relation the writer added.

---

Next: [The rule catalogue in brief](rules.md) · Up: [hmm-rules in depth](README.md)
