[Home](../README.md) › [Reference](README.md) › SOP Lang: exact rules

# SOP Lang: exact rules

This page: the exact rules of SOP Lang that this project relies on, summarised from its normative definition, and the stricter form this project's circuits use. Kind: Reference.

New to the notation? Read [SOP Lang: the notation](../concepts/sop-lang.md) first. Terms are in the [Glossary](glossary.md#notation-terms).

## Where the rules are defined

- `soplang-words-lib/docs/language.md` is normative: "where another document disagrees with it, this one holds". It is SOP Lang v1.1. It stands in the sibling repository soplang-words-lib.
- `soplang-words-lib/docs/reference.md` describes the built-in wire types, such as `core.slot`, `core.type` and `core.module`.

The sections below follow §1 to §12 of language.md and leave out what this project does not use.

**Standard, New here, Particular.** Facts written as statements about a subject, with keys and values, are a standard idea: [RDF](https://en.wikipedia.org/wiki/Resource_Description_Framework) and its [Turtle](https://en.wikipedia.org/wiki/Turtle_(syntax)) notation, or facts in [Prolog](https://en.wikipedia.org/wiki/Prolog). SOP Lang itself is particular: the notation of this group of repositories, not a public standard. The stricter form of circuits (last section) is new here.

## Grammar of a wire

The grammar of language.md §1, in [EBNF](https://en.wikipedia.org/wiki/Extended_Backus%E2%80%93Naur_form) style (two long lines rewrapped):

```text
text         = { declaration | comment } ;
declaration  = "@" id  type  { entry } ;
entry        = key "=" value ;
value        = string | reference | variable | atom ;
string       = '"' { character | escape } '"' ;
escape       = '\"' | '\\' | '\/' | '\b' | '\f' | '\n' | '\r' | '\t'
             | '\u' hex hex hex hex ;
reference    = "$" id | "$?" id ;
variable     = "?" id ;
atom         = one or more characters, none of them white space,
               '"' or '\', the first not "$", "?", "@" or "#" ;
id, type, key = identifier ;
identifier   = first { "." segment } ;
first        = ( letter | "_" ) { letter | digit | "_" | "-" } ;
segment      = ( letter | digit | "_" )
               { letter | digit | "_" | "-" } ;
letter       = "A".."Z" | "a".."z" ;
comment      = "#" { any character except a line end } ;
white space  = space | tab | carriage return | line end ;
```

The rules that go with it:

1. Tokens are separated by white space. A string may hold white space between its quotes.
2. A declaration starts with `@id`, then a type, and runs until the next token that starts with `@`, or the end of the text. It may span lines; indentation means nothing. An `@` inside a string or an atom is text.
3. An entry is `key=value`, with nothing around the `=`. A key given several times has several values, in the order written.
4. A string uses the escapes of [JSON](https://en.wikipedia.org/wiki/JSON) and no others. A line end or a tab may also stand in it as it is.
5. A comment starts with `#` where a token could start, and runs to the end of the line.
6. There is nothing else: no nesting, no lists, no operators, no escapes outside strings.

## The three signs

| Sign | Meaning |
| --- | --- |
| `@` | declares a wire; the first character of a declaration, nowhere else |
| `$` | refers to a wire by its id; the first character of a value |
| `?` | a variable; the first character of a value, only in the matrix and in queries |

Inside rules only, `$p` names the wire that the pattern or template `@p` matched or made, and `$?x` refers to the wire whose id the variable `?x` holds.

## Values

| Kind | Written, and what it is |
| --- | --- |
| atom | `water`, `10`, `9.81`, `10:00`, `5kg`. Numbers, quantities, times and names are all atoms. What an atom means is decided by the kind of its slot. |
| string | `"free text"`. Stored in a canonical spelling (what `JSON.stringify` writes), so that one text is one value. |
| reference | `$id`: to a fact, or inside a rule to a pattern or template. |
| variable | `?name`: bound by matching; only in matrix wires and queries. |

A value is never interpreted when it is read. `5` and `5.0` are different tokens; they are the same value only under a key whose slot is declared `integer` or `number`. In memory a wire is `{id, type, attrs}`, where `attrs` maps each key to the array of its value tokens, in the order written.

## Facts and the matrix

- The matrix is the set of wires that say what facts may exist and what follows from them: wires of a matrix type (`core.slot`, `core.type`, `core.rule`, `core.deny` and others), and the wires a rule names in the same text.
- A wire named through `when=`, `not=`, `over=` or `remove=` is a pattern: a description of wires to find. A wire named through `then=`, `set=` or `add=` is a template: a wire to make or to complete.
- Every other wire is a fact. A fact may not contain a variable: a wire with a variable that nothing names is refused (`variable`).
- Words of a world (`core.word`) are facts. SOP Lang knows no natural language.

A circuit of this project is made of facts only.

## Ids

1. Facts and matrix wires have separate id spaces.
2. Within a space an id is declared once. Telling a fact whose id exists is refused (`duplicate-id`), unless the new declaration says nothing the wire does not already say.
3. A reference `$id` in a fact must name an existing fact (`dangling-ref`), except under a key of an open namespace that no slot declares.
4. A fact told with the same identity keys as an existing one is merged into it, and its id becomes an alias.
5. A matrix loaded as a module with a prefix has its ids prefixed with the module name and a dot.

## Keys

1. A key is a name. Dots mean nothing to the parser.
2. Short and qualified keys: on a wire of type `shop.order`, `shop.order.total` and `total` are the same key. The short form is kept.
3. Keys that start with `core.` form an open namespace for bookkeeping. They are accepted on every wire, also of a closed type, and are not validated unless a slot declares them. `core.namespace` declares another open prefix.
4. `core.select` and `core.absent` (on patterns) and `core.on` (on templates) are read there and are not part of the wire described.

## Queries

A query is one or more patterns. Only in a query may a declaration leave out its `@id`. Each match gives the value of every variable under its name, and the id of the matched wire under the id of its pattern. The example of language.md §7: `w.ask('@x box colour=?c')` gives `[{"x":"b1","c":"red"},{"x":"b2","c":"blue"}]`.

## Writing wires, and the canonical form

- `format(wire)` writes a wire on one line: `@id type`, then each entry as `key=value`, keys in the order first given, the values of a repeated key in order, single spaces. `parse(format(w))` gives `w` again.
- The canonical form is for hashing and stable diffs. `format(wire, {canonical: true})` writes `@id type`, then one entry per line, indented by four spaces, sorted by key (by UTF-16 code unit). The values of a repeated key keep their order; strings are in the canonical spelling. `serialize(wires, {canonical: true})` ends every wire with one line end.

The canonical form of SOP Lang is not the normal form of a circuit. The [normal form](../evaluation/normal-form.md) renames the wires, orders them by their first word and writes one wire per line; it does not sort keys alphabetically.

## Errors

A text that does not follow the grammar throws `SopError`; nothing is repaired silently. The whole text is read, and `errors` lists every mistake in the order of the text, each `{message, offset, line, column}`, with line and column counted from 1 and offset from 0. Examples of messages: "expected key=value", "unterminated string", "the id "x" is declared twice in this text". The full table is in language.md §9.

An unknown reference or a value of the wrong kind is not a syntax error: the text is read, and the world refuses the change with a violation.

## The old pattern form, and v1 to v1.1

- Before version 0.6 a pattern was declared `?id type …`. That form is still read, noted once as deprecated, and written back as `@id`. It will be removed in the next minor version.
- Every v1 text is a v1.1 text with the same meaning. v1.1 adds:
  - variables, `?name`, as values;
  - comments, from `#` to the end of the line;
  - identifier segments after the first that start with a digit;
  - atoms that contain `@`, `$` or `=`, as long as they do not start with `$`, `?`, `@` or `#`;
  - strings that hold a line end as it is;
  - three more errors, about quotes and backslashes;
  - namespaces in ids and references: `shop::b1`, `$shop::b1`, `$::b1`.
- What v1.1 excludes that v1 allowed: an atom that starts with `?`, or with `#` right after white space.

## Scope: SC1 to SC7

- **SC1** A rule, a deny, an action: its variables are its own; inside it, `$p` names the wire its pattern `@p` matched.
- **SC2** A question (`ask`, `query`): its own variables; a pattern without an id gets one that only the question sees.
- **SC3** A statement (one tell, one patch): an id is declared once in it; its wires are judged together, and none stays if any is refused.
- **SC4** Facts and the matrix have separate id spaces.
- **SC5** A namespace: a fact told in it has the id `ns::id`; a bare reference means the same namespace; facts of different namespaces are never joined by value nor merged.
- **SC5a** Derived wires: what a rule makes is in the namespace of its match.
- **SC6** A world: two worlds share nothing but what was given to both; a fork is its own once it starts.
- **SC7** A module: its name is the prefix of its ids; it may declare types and slots only under that prefix; `exports=` limits what other modules may read.

## The built-in schema types

A schema is written in SOP Lang with built-in matrix types. The three this project uses:

| Type | Declares |
| --- | --- |
| `core.module` | a module: `name`, `version` (a label nothing checks), `imports`, `exports` (the types other modules may read) |
| `core.type` | a type: `of`, `extends`, `closed` (only declared keys), `complete`, and others |
| `core.slot` | one key of a type: `of`, `key`, `kind`, `type`, `enum`, `many`, `required`, `present`, and others |

The kinds of `core.slot`: `integer`, `number`, `boolean`, `string`, `atom`, `quantity.<name>`, `time.<name>`, `any`, `ref`, `blob`, `json`. `required`: a wire without the key has an open key. `present`: a missing or empty key rejects the change. The ideas: [Schemas](../concepts/schemas.md); every attribute: `soplang-words-lib/docs/reference.md`.

## How circuits of this project use SOP Lang

Particular to this project: a circuit of the `syntax` schema is written in a stricter form of SOP Lang, checked by `parseCircuit` and `validateSyntax` in `lib/syntax.mjs` ([Library API](library.md#libsyntaxmjs)). These checks are the project's own, not the SOP Lang parser.

- One wire per line. No comment lines, and no wire over several lines: a line that does not start with `@id type` is refused. Empty lines are skipped.
- Ids are made of letters, digits, `_`, `.` and `-`; types of lower-case letters and dots; keys of lower-case letters and `_`. The check does not apply every rule of SOP Lang identifiers: an id such as `1a` passes it.
- Strings hold words of the message. Atoms are the `enum` values of the schema, such as `form=imperative` or `attachment=ambiguous`. References `$id` point at a wire of the same circuit. There are no variables: a `?x` value fails the check.
- `lib/syntax.mjs` reads the `core.slot` lines of `schemas/syntax/schema.sop` with a simple line pattern, not with the SOP Lang parser.

The comment lines in the examples of this documentation (`# move the box`) give the message. They are not part of the circuit.

Next: [Library API](library.md) · Up: [Reference](README.md)
