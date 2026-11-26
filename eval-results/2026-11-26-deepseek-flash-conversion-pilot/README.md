# DeepSeek Flash static conversion spot check

The first successful Vibe request returned entries for 24 sources in 48 seconds. All 24 passed the current native schema and source checks after the local repair attempt where needed. Some proposals kept an existing local formalizer draft. These 24 texts came from a previously drafted development batch. They do not estimate availability or latency for source-only conversion.

Six initial responses were inspected by sorting the exact text with SHA-256 over the prefix `vibe-spot-v1` plus a NUL byte plus the text. “give the avatar hair” assigns avatar as recipient and hair as direct object. The bar-chart message keeps the chart request and the question as separate coordinated clauses. Several errors passed static checks. “make lamp 1 yellow” treats the written identifier as a measure. “oops, Plums should be 15 for me” treats “oops” as an adverb on the proposition. One “Let's” reading labels the embedded bare verb as declarative and attaches chart grouping to the verb. A separate “Let us book” example also gives the embedded bare verb a declarative form. These are examples of issues for a later targeted pass.

The conversion pipeline keeps static passes and rework records in separate conversion shards from the benchmark's reviewed reference registry. No paid whole-corpus review was launched.

## Single-pass context revisions

The old 96-input request returned all 96 entries but achieved only 65 valid outputs after three repair requests, taking 348 seconds in total. A new schema-and-example prompt returned 92 valid circuits in one request for a different 96-source cohort in 121 seconds. It contained 48 calendar, 24 drawing and 24 diagram sources. This is 95.8% static coverage, with 42 retained drafts. The four static rejects were missing one source occurrence each. A manual spot check also found a statically valid reading that encoded “just left of” as a generic `of` relation with adverbs. Even if every remaining circuit were acceptable, counting this material error would cap plausible coverage at 91/96 (94.8%). The conversion has not passed a greater-than-95% plausibility gate.

A subsequent prompt clarifies that overt repeated pronouns use distinct grounded entity occurrences. It also explicitly distinguishes a multiword spatial relation from a generic preposition and requires checking preserved drafts for attachment and direction. The next single-request pilot uses 192 different sources across calendar, diagram, drawing and document CSVs.

## Mixed-file 192-row request

One headless request returned all 192 entries in 160 seconds. The original one-pass gate accepted 158. The model often spent a single written period twice on a matrix clause and its subordinate. It also repeated optional punctuation already included in a literal or a coordination cue.

We replayed the same raw response through a local pass that removes only surplus optional comma and period claims before validation. It retained punctuation inside quoted literals and preserved question marks. The gate then accepted **187 of 192 (97.4%)**, with 47/48 calendar, 48/48 drawing, 44/48 diagram and 48/48 document inputs. It made no new model requests. The five remaining static failures and the quality of role assignments are separate from punctuation cleanup. Sixteen hash-selected accepted outputs received a manual spot check. This limited spot check cannot establish the greater-than-95% plausibility target. A new 256-row request on disjoint texts tests the revised prompt and checker together.
