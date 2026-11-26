# Paired Terra and Sol syntax curation on the same 500 sources

Terra found an independently acceptable reading for 464 sources (92.8%), compared with 444 for Sol (88.8%). Both passed on 432, Terra alone passed on 32, and Sol alone passed on 12. Neither passed on 24. This is a single pilot on the first 500 development sources.

| Metric | GPT-6 Sol | GPT-6.1 Terra |
| --- | ---: | ---: |
| Sources with at least one source-complete circuit | 470 | 482 |
| Source-complete circuits | 495 | 510 |
| Accepted sources | 444 | 464 |
| Accepted circuits | 463 | 482 |
| Accepted unchanged drafts | 283 | 268 |
| Accepted new or revised circuits | 180 | 214 |
| Sources with one accepted reading | 425 | 446 |
| Sources with two accepted readings | 19 | 18 |
| Static rework | 30 | 18 |
| Rework after semantic confirmation | 56 | 36 |
| Sources recovered by the single repair round | 47/77 | 40/58 |

Terra's accepted output for “make Item 4345 green.” grounds the target as a single name and `green` as the result complement. Sol alone passed for “update a tear cheek big”, grounding `tear` as the premodifier of `cheek` and `big` as the result complement. Both exact circuits and case identifiers appear in the accepted outputs.

## Timing

Both authors had the same 500 input records and drafts, frozen prompt, NLU schema, source validator, and concurrency of ten. Only the curator model selection and its script fingerprint differed. Terra generation took 279 seconds. Sol took 324 seconds with its local formatter restart, including 259 seconds after resuming. Median first-call time was 34.67 s for Terra and 32.61 s for Sol. Median repair-call time was 18.08 s for Terra and 20.84 s for Sol. Terra sent 32 repair requests to Sol's 40, and Codex reported 644,073 and 652,034 tokens respectively. These one-off timings do not isolate relative model speed.

## Review

The two authors produced 244 shared exact source/circuit identities, and 236 passed independent review. Sol's final review reused 242 settled expansion identities and adjudicated 253 novel circuits. Terra reused 277 exact settled identities from expansion or Sol and sent the other 233 to two blind reviewers. Novel Sol circuits used GPT-6.1 Terra and GPT-6.2 Sol, with GPT-6.1 Sol adjudicating 26 threshold disagreements. Novel Terra circuits used GPT-6.2 Sol and GPT-6.1 Sol, with GPT-6.2 Astra independently adjudicating 16 threshold disagreements. The judge mixes differ to avoid either author model grading its own novel output. The Terra adjudicator reviewed disagreements only.

The raw Terra plan uses the pool's former generic `sol-curated` label. Model attribution comes from the preserved generation manifest and command logs. Review prompts do not include provider labels, and the pool exporter now records the correct curator name. Terra annotations were kept in the experiment archive and were never passed to the dataset publisher.

See the [Sol pilot](../2026-11-26-sol-native-curation-pilot/) for the shared input, schema and Sol evidence. The [paired machine-readable comparison](comparison.json) contains the exact disagreement and reuse counts and lists source IDs gained by each author.
