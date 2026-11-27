[Home](../README.md) › [Concepts](README.md) › Schemas

# Schemas: which wires may exist

This page: what a schema is and how SOP Lang declares one, read from the syntax schema's own file.
Kind: Explanation.

## What a schema is

The notation alone allows any wire. A **schema** says which wire types exist, which keys each type may
have, and what kind of value each key takes. A circuit that follows its schema can be checked by a
program. The idea is the same as a [database schema](https://en.wikipedia.org/wiki/Database_schema) or an
[XML Schema](https://en.wikipedia.org/wiki/XML_schema).

## How SOP Lang declares a schema

In SOP Lang a schema is itself written as wires, of a few built-in types. The definitions are in
`soplang-words-lib/docs/reference.md`. Below, only the attributes this project uses.

### core.module: the schema as a whole

| Attribute | Meaning |
| --- | --- |
| `name` | The module's name, and the prefix of its types: module `syntax` declares `syntax.clause`. |
| `version` | A label for the module's version; nothing checks it. |
| `exports` | A type other modules may read; `exports=clause` means `syntax.clause`. May repeat. |

### core.type: one wire type

| Attribute | Meaning |
| --- | --- |
| `of` | The type declared. |
| `extends` | Its parent type: a wire of the type is also a wire of the parent. The syntax schema does not use it; the meaning schema of the next page does. |
| `closed` | Wires of the type accept only the declared keys. |

### core.slot: one key of a type

| Attribute | Meaning |
| --- | --- |
| `of` | The type the key belongs to. |
| `key` | The key's name. |
| `kind` | The sort of value: `string` (quoted text), `ref` (a reference to a wire), `atom`, `integer` and others. |
| `type` | With `kind=ref`: the wire referred to must be of this type. May repeat: then any of the types. |
| `many` | The key may hold several values. |
| `enum` | An allowed value. Repeated, it lists all of them. |
| `required` | A wire without the key has an open key: a question that may still be asked. |
| `present` | A wire without the key is rejected. Unlike `required`, it cannot stay an open question. |

## The syntax schema's file, read line by line

The syntax schema is in this repository, `schemas/syntax/schema.sop`. Five of its lines:

```sop
@syntax core.module name=syntax version=3 exports=clause exports=nominal exports=relation exports=coordination
@syntax.nominal core.type of=syntax.nominal closed=true
@syntax.nominal.head core.slot of=syntax.nominal key=head kind=string required=true present=true
@syntax.nominal.dependent core.slot of=syntax.nominal key=dependent kind=string many=true
@syntax.clause.form core.slot of=syntax.clause key=form enum=imperative enum=declarative enum=interrogative enum=fragment enum=nonfinite required=true present=true
```

- **Line 1.** A module named `syntax`, version 3, that exports four wire types: clause, nominal, relation
  and coordination.
- **Line 2.** The type `syntax.nominal`, closed: a nominal may carry only the keys declared for it. A
  nominal is the group of words that describe one thing ([Grammar: phrases](grammar-phrases.md#nominal)).
- **Line 3.** A nominal has the key `head`, its main word ([Head](grammar-phrases.md#head)). The value is a
  quoted string, it is not repeated, and every nominal must have it.
- **Line 4.** A nominal may have the key `dependent` (a word that describes the head), as many times as
  needed.
- **Line 5.** A clause has the key `form`, whose value is one of five atoms: `imperative`, `declarative`,
  `interrogative`, `fragment`, `nonfinite` ([Clause type](grammar-clause.md#clause-type-and-mood)). Every
  clause must have it.

A key that points at other wires is declared with `kind=ref` and the allowed types:

```sop
@syntax.clause.complement core.slot of=syntax.clause key=complement kind=ref type=syntax.nominal type=syntax.coordination many=true
```

A clause's `complement` points at a nominal or a coordination, and a clause may have several.

## `required` and `present` are not the same

The two flags differ, as `soplang-words-lib/docs/reference.md` (core.slot) defines them:

- `required=true`: a wire without the key is accepted with an **open key**, a question that may be asked
  later (the reference's example: a tank without a level, asked as "How full is it?").
- `present=true`: a wire without the key is **rejected**; the key cannot stay open.

The syntax schema sets both on the same five keys: `form`, `head`, `from`, `to` and `conjunct`. An
earlier version of this documentation read the pair as one flag; the difference above is the exact one.

## Who checks a circuit against the schema

`validateSyntax(text, sop)` in `lib/syntax.mjs`. That module reads `schemas/syntax/schema.sop` when it
is first imported. The checker reports, for example, an unknown type or key, a repeated key that is not `many`, an atom that is not in
the enum, a reference to a missing wire or to a wire of the wrong type, and a missing required key. It
also checks the message: every word in exactly one quoted value. The checker reads `required` alone;
since the syntax schema sets `present` on the same keys, the outcome is the same. Its other checks and its
companions are on [Library API](../reference/library.md).

## Two schemas in this story

- **`syntax`**, in this repository: how a sentence is built. Its full specification is the section
  [The syntax schema](../schema/README.md).
- **`w.request`**, in the sibling repository `sop-knowledge-worlds`: what a request asks of the
  application. The [next page](syntax-and-semantics.md) shows both for one message.

## Standard, new here, particular

**Standard.** Schemas that declare types, keys and value kinds. Writing a schema in the notation of its
data is also established: an XML Schema is itself an XML document, and
[RDF Schema](https://en.wikipedia.org/wiki/RDF_Schema) is written in RDF.

**New here.** The syntax schema itself: its four wire types and their keys, designed in this project as
a coarser form of standard dependency analysis ([How grammar is usually written down](grammar-notation.md)).
In brief: [The syntax schema in brief](../schema/overview.md).

**Particular.** The built-in types `core.module`, `core.type` and `core.slot`, and the flags such as
`required` and `present`, are SOP Lang's own.

---

Next: [Syntax and semantics: the two layers](syntax-and-semantics.md) · Up: [Concepts](README.md)
