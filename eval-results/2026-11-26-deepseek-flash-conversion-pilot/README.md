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

## 256-row request and exact delimiter recovery

A single request returned all 256 results in about 225 seconds. Its first version passed 180/256. Most misses were source delimiters or terminal punctuation, including 38 document readings that omitted both quote marks. Replaying the saved responses with exact literal-delimiter recovery and clause punctuation cleanup yielded 244/256 (95.3%) static passes without a second model call.

The first twelve hash-selected static passes included one material role error. In “italicise every diamond in sight”, the circuit attached “in sight” to italicising, where the phrase should restrict the scope of “every diamond”. Counting that case caps plausible coverage at 243/256 (94.9%). Full-corpus conversion remains gated on the user's plausibility threshold.

## 384 source-only inputs in one call

DeepSeek returned all 384 results in 230 seconds without draft circuits. The first static pass accepted 357/384 (93.0%). Drawing had 95/96 passes and calendar and document had 96/96 each. Diagram inputs accounted for 26 of the 27 failures. The leading causes were numeric or demonstrative entities without a grounded head, name, pronoun or literal, followed by double claims of connectors and missing source tokens.

A local replay promoted written numeric amounts and ordinals to literal anchors when a graph had no entity anchor, and standalone demonstratives to pronoun anchors. It recovered seven circuits, bringing static coverage to 364/384 (94.8%) without another model call. We added corresponding worked examples and instructions to the prompt. This pilot falls below the conversion threshold even before plausibility review. A 500-row single-file request now exercises the problematic diagram domain.

## Source-only diagram file, 500 rows in one call

DeepSeek returned all 500 results in 326 seconds. The original static conversion passed 381/500. Among failure findings, 31 cases claimed the same written `and` in a clause connective and a coordination cue. Other failures included duplicated pronouns and noun heads, missing source words, or invalid quotations.

A local replay keeps an exact duplicated conjunction on its already linked coordination when the source has one fewer occurrence and a single member claims the redundant copy. This brought static coverage to 411/500 (82.2%) without a new model request. The remaining gap is too large for whole-file conversion at the requested threshold. We are testing guided conversion using the library's generated circuits on the first 96 of the same 500 inputs. This is a paired development comparison.

## Guided comparison on the first 96 diagram texts

The local selector with the 11,148-source DistilBERT checkpoint supplied drafts for all 96 inputs. The one-call guided run passed the static gate on 94/96 (97.9%), compared with 71/96 (74.0%) for the text-only batch after its local connector replay. The guided run also received the more explicit coordination example. The paired comparison reflects those changes together.

We read the first 16 static passes in hash order using the salt `guided96-plausibility-v1`, a zero byte, and the exact source. Three material problems remain. In “Draft to Review, label retry,” the label clause is detached from the arrow and lacks its object. In the Home-to-Login arrow instruction, the name “next” becomes an adverb on “labelled,” leaving the requested label unrepresented. In “box one teal, box two coral, box three olive,” the three identifiers are quantities on the box entities. Counting those three cases and the two static failures caps the cohort's plausible rate at **91/96 (94.8%)**, even if all uninspected readings pass. Mass conversion remains below the requested threshold.

## Second set of 96 diagram texts with local drafts

The revised guided prompt returned 94/96 static passes in one request, in 97.8 seconds. Of these, 70 retained a library draft. On the same inputs the original source-only output plus connective cleanup passed 82/96. The guided arm gained 14 complete circuits and lost two. Overall, the two 96-row diagram pilots returned 188 static passes, while preserving a separate record of the pairs inspected for meaning.

We checked the first 25 eligible texts in hash order using the salt `guided-next96-plausibility-v1`, a zero byte and the exact source. For example, “a table of two rows and two columns, narrow borders” identifies the values but uses apposition to equate the table with its borders. “let me rethink” and “I'd like the online series renamed to Direct orders” have bare or participial complements encoded as declarative. These findings concern clause form and role assignment after the grounding gate. The process has not established more than 95% plausible outputs for mass conversion.

## One thousand guided diagram rows

DeepSeek returned all 1,000 entries in one request. The model and local check took about 4 min 22 s. Preparing the local drafts took 6 min 9 s, for about 10 min 31 s end to end. The static gate passed 970/1,000, including 931 unmodified drafts and 39 edited readings.

A 16-output hash-selected spot check used the salt `guided-1000-spot1`, a zero byte, and exact source text. In “could you make me a triangle rotated by 45 degrees?”, a retained draft makes “me” the direct object and the triangle predicative. “not Draft, its neighbour on the row” makes the rejected Draft and its requested neighbour appositional. “let the arrow leap over the Verify label” treats the bare complement as declarative. These errors show that a complete returned response and 97% static coverage leave the 95% plausibility target unverified.

We extended the same spot check to 32 accepted outputs. Among the next 16, “Ready?” loses the question mark from the quoted label, “root at the bottom” becomes a command to root the tree, and “easy to scan” emits the bare verb on a detached clause. In “24 pixel gaps”, the number and unit are on an entity disconnected from the gaps. The manually identified defects leave the user's revised 90% plausibility requirement unverified. Sol is being evaluated in one request on the same 1,000 texts and exact draft circuits, with the same example context and local checks. A configured file group of 5,000 or 10,000 is separate from demonstrated single-request capacity.

## Matched Sol capacity probe

On the exact same 1,000 sources and local drafts, GPT-6.2-Sol returned a well-formed response for indices 0–99 only. The CLI exited successfully in 245 seconds and omitted the other 900 rows. All 100 returned rows passed static checks. Ninety-seven also passed the DeepSeek-run static check, and the other three were recovered. Of the 100 returned rows, 46 retained a draft and 54 emitted a revised primary reading. A preliminary source-first inspection of 12 hash-selected outputs found no definite material role error. That spot check does not establish the corpus plausibility rate. The width-1,000 request is unsuitable for unattended Sol conversion at this setting.

With 256 inputs and an exact per-request result-array cardinality, the Sol CLI reached the 521-second process deadline without writing a response. The static gate recorded all 256 rows as rework. This establishes a timeout under the tested settings. Response accounting verifies every index independently of the CLI's exit code.

A separate source-only Sol request selected 25 inputs from each of calendar, diagram, document and drawing in the existing 256-row mixed pilot. It required exactly 100 indexed results and reached the 240-second deadline with an empty response. The exact-input timing and output accounting are in `sol-mixed-source-100/`. The result gives no estimate of Sol's output plausibility on those domains.

### Paired plausibility spot check

From the 100 shared source indices, we inspected the 24 smallest SHA-256 digests of `paired-sol-deepseek-v1`, a NUL byte and the exact source. A row passed when at least one returned graph expressed a plausible grounded reading, with no major role, clause, grouping or attachment error. The reviewer knew the model identities. Sol passed 24/24 and DeepSeek passed 15/24. This spot check measures the returned Sol prefix on one diagram file. It cannot establish either model's corpus-wide plausibility or adjudicate the unreturned Sol indices.

The inspected indices were `48, 69, 57, 79, 95, 44, 31, 22, 85, 23, 68, 27, 67, 3, 14, 28, 34, 12, 18, 6, 8, 43, 42, 65`. DeepSeek failed statically on 48 and 28. The other material issues were duplicate detached fragments around “no heads anywhere” (57), “amber” as a verb (22), apposition of a page and its backdrop (85), equating dimensions with their measures (68), a finite clause in a coordinated bare complement (67), apposition of a star and “same idea” (43), and equating list values with each other (65). Sol's accepted readings represented these as linked fragments, specifications, nonfinite clauses or coordinated groups as appropriate.

## DeepSeek prompt with explicit role checks

We clarified when to change a supplied draft and how to handle apposition, ordered lists, measures, adjective complements and coordinated control clauses. We replayed 100 sources from the diagram batch with the same drafts, disjoint from the preceding paired plausibility spot check. One request returned all 100 in 179 seconds. All passed the static gate, compared with 96 on exactly those sources under the previous prompt. Forty-one output circuit sets changed. On a fresh 24-row source-based spot check, 19 were plausible. Remaining defects included a finite reading of the bare passive in “I want the Start text bolded” and a detached “to scan” in “the options are easy to scan.” This prompt revision did not establish 90% plausibility. The timing and exact sample indices are in `diagram-role-check-100/`.

## File-scoped rollout from already converted rows

The previous 384-row source-only pilot included 96 texts from `document/text-01.csv`. All 96 passed a replay through the current validator. Of the 30 smallest source hashes using `mass-file-spot-v1` plus a NUL separator, 29 passed a manual whole-reading inspection. The conservative rejected example represents “lovely” as a nominal head in “cheers, that's lovely.” This is evidence for the document file only. The official corpus now stores the 96 existing outputs as statically checked conversions (WebMeet commit `677ff09`). No paid model requests were needed to recover them.
