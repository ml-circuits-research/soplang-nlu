[Home](../README.md) › [hmm-rules in depth](README.md) › [The stations](stations.md) › Stations of nominals

# Stations of nominals

This page: the 9 stations of hmm-rules whose words build nominals (the words that describe one thing), each with its unit, its `nlu` key, its flags and the established term. Kind: Reference.

The fields of each table (unit, `nlu` key, flags, term) are explained in [The stations](stations.md#what-a-station-is). The list is as the architecture report gives it at commit `fa46cb7`; the stations have not changed since. The station's code name is in brackets.

### Determiner (`determiner`)

| Field | Value |
| --- | --- |
| Unit | entity |
| nlu key | `determiner` |
| Flags | closed |
| Term | [determiner](https://en.wikipedia.org/wiki/Determiner) |

### Numeral (`quantity`)

| Field | Value |
| --- | --- |
| Unit | entity |
| nlu key | `quantity` |
| Flags | core, closed, shape number |
| Term | [numeral](https://en.wikipedia.org/wiki/Numeral_(linguistics)), quantifier |

### Degree adverb (`degree`)

| Field | Value |
| --- | --- |
| Unit | entity |
| nlu key | `degree` |
| Flags | closed |
| Term | degree adverb ([intensifier](https://en.wikipedia.org/wiki/Intensifier)) |

### Attributive adjective (`modifier`)

| Field | Value |
| --- | --- |
| Unit | entity |
| nlu key | `modifier` |
| Flags | open |
| Term | attributive [adjective](https://en.wikipedia.org/wiki/Adjective) or noun modifier |

### Common noun (`noun`)

| Field | Value |
| --- | --- |
| Unit | entity |
| nlu key | `head` |
| Flags | core, open |
| Term | common [noun](https://en.wikipedia.org/wiki/Noun) |

### Proper noun (`name`)

| Field | Value |
| --- | --- |
| Unit | entity |
| nlu key | `name` |
| Flags | core, closed, shapes capital, upper, code |
| Term | [proper noun](https://en.wikipedia.org/wiki/Proper_noun), label |

### Pronoun (`pronoun`)

| Field | Value |
| --- | --- |
| Unit | entity |
| nlu key | `pronoun` |
| Flags | core, closed |
| Term | [pronoun](https://en.wikipedia.org/wiki/Pronoun) |

### Literal (`literal`)

| Field | Value |
| --- | --- |
| Unit | entity |
| nlu key | `literal` |
| Flags | core, closed, shapes quote, date, clock |
| Term | quoted text, date, clock time |

### Possessive clitic (`possessive`)

| Field | Value |
| --- | --- |
| Unit | entity |
| nlu key | `possessive_marker` |
| Flags | closed |
| Term | possessive [clitic](https://en.wikipedia.org/wiki/Clitic) "'s" |

---

Next: [Stations of clauses](stations-clauses.md) · Up: [The stations](stations.md)
