[Home](../README.md) › [hmm-rules in depth](README.md) › [The stations](stations.md) › Stations of clauses

# Stations of clauses

This page: the 14 stations of hmm-rules whose words build or mark clauses, each with its unit, its `nlu` key, its flags and the established term. Kind: Reference.

The fields of each table (unit, `nlu` key, flags, term) are explained in [The stations](stations.md#what-a-station-is). The list is as the architecture report gives it at commit `fa46cb7`; the stations have not changed since. The station's code name is in brackets.

### Interrogative word (`question`)

| Field | Value |
| --- | --- |
| Unit | clause |
| nlu key | `question` |
| Flags | opens a clause, core, closed |
| Term | [interrogative word](https://en.wikipedia.org/wiki/Interrogative_word) |

### Auxiliary (`auxiliary`)

| Field | Value |
| --- | --- |
| Unit | clause |
| nlu key | `auxiliary` |
| Flags | core, closed |
| Term | [auxiliary verb](https://en.wikipedia.org/wiki/Auxiliary_verb) |

### Negation (`negation`)

| Field | Value |
| --- | --- |
| Unit | clause |
| nlu key | `negation` |
| Flags | core, closed |
| Term | [negation](https://en.wikipedia.org/wiki/Affirmation_and_negation) |

### Subordinating conjunction (`marker`)

| Field | Value |
| --- | --- |
| Unit | clause |
| nlu key | `marker` |
| Flags | opens a clause, core, closed |
| Term | subordinating [conjunction](https://en.wikipedia.org/wiki/Conjunction_(grammar)) |

### Infinitival "to" (`infinitive`)

| Field | Value |
| --- | --- |
| Unit | clause |
| nlu key | `marker` |
| Flags | opens a clause, closed |
| Term | the "to" of the [infinitive](https://en.wikipedia.org/wiki/Infinitive) |

### Relative pronoun (`relative`)

| Field | Value |
| --- | --- |
| Unit | clause |
| nlu key | `marker` |
| Flags | opens a clause, closed, never sentence-initial, `after` list |
| Term | [relative pronoun](https://en.wikipedia.org/wiki/Relative_pronoun) |

### Verb that opens its clause (`predicate`)

| Field | Value |
| --- | --- |
| Unit | clause |
| nlu key | `predicate` |
| Flags | core, open, `after` list (start, conjunction, separator, marker, …) |
| Term | verb that opens its clause, as in a command |

### Verb after its subject (`following`)

| Field | Value |
| --- | --- |
| Unit | clause |
| nlu key | `predicate` |
| Flags | core, `like=predicate` |
| Term | verb after its subject |

### Predicative adjective (`complement`)

| Field | Value |
| --- | --- |
| Unit | clause |
| nlu key | `result_complement` |
| Flags | core, `like=modifier` |
| Term | predicative or resultative [adjective](https://en.wikipedia.org/wiki/Adjective) |

### Adverb or particle (`adverb`)

| Field | Value |
| --- | --- |
| Unit | clause |
| nlu key | `adverb` |
| Flags | core, closed, suffixes (-ly, -wise, -ward, -wards, -ways) |
| Term | [adverb](https://en.wikipedia.org/wiki/Adverb), verb particle ([phrasal verbs](https://en.wikipedia.org/wiki/English_phrasal_verbs)) |

### Interjection (`expression`)

| Field | Value |
| --- | --- |
| Unit | clause |
| nlu key | `expression` |
| Flags | core, closed |
| Term | [interjection](https://en.wikipedia.org/wiki/Interjection) |

### Filler (`filler`)

| Field | Value |
| --- | --- |
| Unit | clause |
| nlu key | `filler` |
| Flags | core, closed |
| Term | politeness or hesitation word ([filler](https://en.wikipedia.org/wiki/Filler_(linguistics))) |

### Separator (`separator`)

| Field | Value |
| --- | --- |
| Unit | clause |
| nlu key | `separator` |
| Flags | opens a clause, core, shape mark |
| Term | sentence-internal [punctuation](https://en.wikipedia.org/wiki/Punctuation) |

### Terminator (`terminator`)

| Field | Value |
| --- | --- |
| Unit | clause |
| nlu key | `terminator` |
| Flags | opens a clause, core, closed, ends |
| Term | sentence-final punctuation |

---

Next: [Training: from text to vocabulary](training.md) · Up: [The stations](stations.md)
