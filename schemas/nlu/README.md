# Integrated analysis circuits

The `nlu` SOP module declares clauses, entities, relations, and coordination. Its quoted roles carry literal source text. Atom and enum slots express the analysis' classifications, and references connect wires within the same circuit.

```sop
@request nlu.clause form=imperative predicate="Move" direct_object=$circle terminator="." act=place
@circle nlu.entity determiner="the" modifier="red" head="circle" kind=circle color=red
@square nlu.entity determiner="the" modifier="red" head="square" kind=square color=red
@placement nlu.relation kind=beside from=$circle to=$square cue="beside"
```

An entity can use a head, written name, or pronoun. A nominal fragment can reference its entity through the clause's `topic` role without assigning a subject or object. A coordination wire binds two or more distinct clauses or two or more distinct entities. Clause arguments can reference entities or entity coordination. Relations can connect clauses, entities, or coordination. The repeatable `unresolved` and `filler` keys preserve literal text on a clause or entity when the analysis leaves it unresolved or classifies it as filler.

Async `createAnalysisValidator({knowledgeDir, schemaPaths})` returns a synchronous `validate(text, sop)` function. Validation reports `schemaValid`, `sourceValid`, `valid` (both checks), and structured `findings`. Exact source claims are matched in the original text with case and Unicode intact. Each claim uses its own occurrence. Repeated evidence can be ambiguous and is reported without public offsets. Semantic atoms such as `color=red` do not consume a second occurrence of the source word `"red"`.

Coverage reports total `words` (including punctuation), `understood`, `filler`, `unresolved`, `uncovered`, `allAccountedFor`, and repeated surfaces in `ambiguous`. The `understood` count refers to source occurrences placed in declared roles. Coverage and structural validity do not establish semantic correctness or completeness.

Explicit `schemaPaths` can add closed `nlu.*` types or new slots. Extensions cannot replace built-in declarations. The validator reads `kind=string` as literal evidence, `kind=atom` and `enum` as classifications, and `kind=ref` with native `type` or `to` declarations as a typed reference.

### Compounds, possession and modifiers

For `Move Jan’s office chair.` the lookup can carry both the noun compound and an explicit possessor.

```sop
@c nlu.clause form=imperative predicate="Move" direct_object=$chair terminator="."
@chair nlu.entity head="chair" compound="office" possessor=$person possessive_marker="’s"
@person nlu.entity name="Jan"
```

Each literal keeps its original spelling. The checker allows a separate claim for the genitive clitic, and also accepts a whole-word claim when an analysis calls for one. An attributed possessor must be an entity or a coordination of entities. A possessive determiner such as `my` can stand directly in `determiner` without inferring the speaker's identity.

For `Find the very small bird facing left`, the participle has its own dependent clause. Its relation identifies the entity that the participle modifies.

```sop
@c nlu.clause form=imperative predicate="Find" direct_object=$bird
@bird nlu.entity determiner="the" degree="very" modifier="small" head="bird"
@f nlu.clause form=nonfinite predicate="facing" adverb="left"
@r nlu.relation kind=modifier from=$bird to=$f
```

A nonfinite clause may carry a written infinitive marker in `marker`. Finite dependent clauses can use the same slot for their written subordinator when it is not already allocated to a relation cue. A predicative complement's degree belongs on the clause, as in `degree="slightly" result_complement="smaller"`.

Use `literal` on an entity for verbatim content, for example the quotation in
`Insert the words "open the window".` The quoted imperative is text to
insert. Its lexical content supplies evidence for the literal entity without
introducing an instruction to open a window.

A nominal complement can identify a class or resulting role. In `Make it a straight line`,
`direct_object` points to `it` and `predicative_entity` points to the qualified
lookup with determiner `a`, modifier `straight` and head `line`.

An adverb can qualify the relation itself. For `Place it directly behind the wall`,
the relation from the clause to the wall carries `cue="behind" adverb="directly"`.
When `directly` instead modifies a verb, the corresponding clause owns the adverb.

An entity may carry a quoted `adverb` modifying its nominal head, as in
`pronoun="everything" adverb="else"`. A leading discourse connective such as
`and` in `and a picnic blanket` is grounded on the fragment clause as
`connective="and"`. This preserves the connective while leaving its unwritten
first conjunct unspecified.

A quantified prepositional relation can point through `measure` to an entity with its written unit and quantity. For example, “two inches from the edge” supplies a distance measure on the `from` relation.

A coordination may group two or more relations of the same syntactic construction. Each relation retains its own endpoints and can carry a written negation. In “near Ben but not behind Jo”, only the second relation has a negation. The member types of a coordination used in a role must be permitted by that role's schema.
