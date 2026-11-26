# Integrated analysis circuits

The `nlu` SOP module declares clauses, entities, relations, and coordination. Its quoted roles carry literal source text. Atom and enum slots express the analysis' classifications, and references connect wires within the same circuit.

```sop
@request nlu.clause form=imperative predicate="Move" direct_object=$circle terminator="." act=place
@circle nlu.entity determiner="the" modifier="red" head="circle" kind=circle color=red
@square nlu.entity determiner="the" modifier="red" head="square" kind=square color=red
@placement nlu.relation kind=beside from=$circle to=$square cue="beside"
```

An entity can use a head, written name, or pronoun. A fragment still has a clause, but need not have a predicate. A coordination wire binds two or more distinct clauses or two or more distinct entities. Clause arguments can reference entities or entity coordination. Relations can connect clauses, entities, or coordination. The repeatable `unresolved` and `filler` keys preserve literal text on a clause or entity when the analysis leaves it unresolved or classifies it as filler.

Async `createAnalysisValidator({knowledgeDir, schemaPaths})` returns a synchronous `validate(text, sop)` function. Validation reports `schemaValid`, `sourceValid`, `valid` (both checks), and structured `findings`. Exact source claims are matched in the original text with case and Unicode intact. Each claim uses its own occurrence. Repeated evidence can be ambiguous and is reported without public offsets. Semantic atoms such as `color=red` do not consume a second occurrence of the source word `"red"`.

Coverage reports total `words` (including punctuation), `understood`, `filler`, `unresolved`, `uncovered`, `allAccountedFor`, and repeated surfaces in `ambiguous`. The `understood` count refers to source occurrences placed in declared roles. Coverage and structural validity do not establish semantic correctness or completeness.

Explicit `schemaPaths` can add closed `nlu.*` types or new slots. Extensions cannot replace built-in declarations. The validator reads `kind=string` as literal evidence, `kind=atom` and `enum` as classifications, and `kind=ref` with native `type` or `to` declarations as a typed reference.
