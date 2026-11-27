[Home](README.md) › [Syntax schema](schema/README.md) › syntax-schema.md (moved)

# The syntax schema: specification (moved)

This page: a pointer to where the specification of the syntax schema now lives. Kind: Reference.

This file held the whole specification of the `syntax` schema, version 3. The specification is now split
over the pages of the section [The syntax schema](schema/README.md), with its substance unchanged. Tools,
code comments and other repositories that name `docs/syntax-schema.md` as "the specification" mean these
pages. Read them in this order:

1. [The syntax schema in brief](schema/overview.md): purpose, terms, the four wire types.
2. [Clause and nominal wires](schema/clause-and-nominal.md): the keys of `syntax.clause` and
   `syntax.nominal`.
3. [Relation and coordination wires](schema/relation-and-coordination.md): the keys of
   `syntax.relation` and `syntax.coordination`, and a whole message.
4. [The five rules](schema/rules.md).
5. [What must be right, and boundary cases](schema/correctness.md).
6. [Decisions 1–5: the first review](schema/decisions-review-1.md).
7. [Decisions 6–8: names, punctuation, second review](schema/decisions-names.md).
8. [Related work, weak points, open questions](schema/related-work.md).
9. [From the nlu schema](schema/nlu-mapping.md).

The machine-readable form is `schemas/syntax/schema.sop`; the checker is `lib/syntax.mjs`.

## Where each former section went

- Terms; The terms in plain words; Purpose → [In brief](schema/overview.md).
- The wires and their keys → [Clause and nominal](schema/clause-and-nominal.md) and
  [Relation and coordination](schema/relation-and-coordination.md) (with "A whole message").
- Rule 1 to Rule 5 → [The five rules](schema/rules.md).
- What a formalizer must get right; Boundary examples → [Correctness](schema/correctness.md).
- Decisions and their reasons, 1 to 5, and the points of the first review adopted without change →
  [Decisions 1–5](schema/decisions-review-1.md).
- Decisions 6 to 8 → [Decisions 6–8](schema/decisions-names.md).
- How the schema relates to the literature; Weak points still open; Questions for the reviewer →
  [Related work](schema/related-work.md).
- How it relates to the `nlu` schema; What was measured →
  [From the nlu schema](schema/nlu-mapping.md).
- How a formalizer uses the schema →
  [Library API](reference/library.md#how-a-formalizer-uses-the-schema).

The single file as it stood is kept in the git history:

```sh
git show 97a1b83:docs/syntax-schema.md
```

---

Next: [The syntax schema in brief](schema/overview.md) · Up: [Syntax schema](schema/README.md)
