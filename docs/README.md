# Formalising the current text

A reader proposes zero or more independent SOP Lang circuits for a single utterance. Configure worlds when opening the reader. Worlds supply vocabulary, schemas and knowledge. The utterance supplies the participants, instructions and evidence. Preserve a pronoun as written and leave its referent open. Every reading stands on its own.

## Reading a circuit

WebMeet's first charts-01 example asks to “make a bar chart of the stadiums by country”. Its first two wires are:

```sop
@r1 w.request.request act=make mood=do predicate=make
@r1.t w.request.target request=$r1 family=chart mode=new determiner=indefinite
```

The first token declares a local wire ID. The qualified name selects the wire schema. The remaining fields are keyed values. The target's request field links back to the first wire. Three constraint wires link to that request and give the chart type (bar), dimension (country) and measure (stadiums). The reference quotes “by country” on the dimension wire. It gives the measure value without a words field. A reader can make that last claim auditable by identifying the precise occurrence of “stadiums”.

## Proposed evidence contract

For each candidate, associate syntactic keys and semantic keys with wire IDs and ranges in the original text. Use half-open UTF-16 offsets so JavaScript slice(start, end) recovers the exact quote. Support multiple spans per key. Keep structural fields such as generated IDs distinguishable from meaning supplied by the text. Record the world binding used when normalising a surface value. Check proposed SOP keys against the configured schemas before emission. Document schema gaps and proposed extensions.

Syntactic evidence identifies phrases, heads, attachments, coordination and scope. Account for grammatical words and explicitly record unexplained spans. Semantic evidence answers questions specific to each wire, such as which participant is affected and which value describes the result. In “make the red circle blue”, both colours can be copied verbatim while their roles are reversed. Coverage is therefore only one check.

Test the verifier with controlled faults: swap the colour roles, attach negation to the wrong coordinated verb, omit a quantity, or introduce an unwritten participant. Verify the expected diagnostic for each mutation. Report unreviewed attachments separately from attachments checked against annotated examples.

## Library and evaluation design

Use lib/ for the shared reader and configurable world loading, strategies/ for independent implementations, tests/ for contract and evaluation tests, and eval-results/ for run history. The existing readers share createReader(), propose(text) and close(). Preserve multiple candidates, unresolved text and engine errors. See the [Z3](strategies/z3.md) and [Prolog](strategies/prolog.md) pages. Future strategies can implement the same contract.

Each one-percent run should save a new directory with the sample IDs, seed, input hashes, revisions, world configuration, proposal budget, per-row results and summary for every available strategy. Support smaller and larger samples. Give every strategy the same ordered texts. Reference circuits are evaluator inputs only. Record static, schema, syntactic and semantic findings separately. Export failures in batches for optional review, retaining judgments and model provenance.

WebMeet legend v1.2 grades the whole candidate set once per message. L0 means no usable reading, L1 wrong meaning, L2 incomplete meaning, L3 a reasonable exact match and L4 a reasonable alternative. Both L3 and L4 count as success. A lost negation that reverses intent is L1a; an omitted essential condition is L2c. Keep syntax diagnostics alongside these grades. A future grading scale needs its own version and explicit criteria.

When many cases receive the same grade, examine a sample early and split recurring failure modes that can be distinguished by a reproducible check. Keep parent-grade totals and record the rubric version. A shared symptom such as a wrong attachment can have a strategy-specific cause; record the symptom on the candidate and the cause in the strategy diagnostic. Add levels up to L10 if the observed distinctions justify them. Preserve the original grades in historical runs.

## Syntactic evidence

Pass parsed facts from the configured worlds to createSyntaxReader in lib/syntax.mjs and call the returned function with the current text. Load worlds/w.syntax/schema.sop to check the resulting SOP. Token wires preserve every non-whitespace token, with half-open UTF-16 offsets. Repeated pos values are lexical possibilities. Cues record potential discourse functions and polarity markers. Expression wires retain multiword matches. Phrase wires describe local hypotheses with explicit token links for heads, determiners and modifiers. Overlapping hypotheses remain available to the strategy. tokensWithPos counts lexical recognition; it does not measure correct attachment or semantic coverage.

## Comparing execution time

Use measureStrategy from lib/measure-strategy.mjs for the sequential baseline. It opens one reader, awaits each proposal and closes the reader. Persist timing with each run, including startup, proposal time, shutdown, total wall time, throughput and median and 95th-percentile latency. Save per-input latency in sample order. Record hardware, runtime versions, solver and world configuration, worker count and proposal budget. Record evaluator and reviewer time separately. Compare case-level outcomes in both directions to identify which strategy handles an attachment, ambiguity or unsupported phrase better.

## Opening a strategy

The [library entry point](../README.md) accepts a strategy and a knowledge installation. Both strategy implementations live in this repository. Configure additional SOP files or directories with worldPaths. Each strategy interprets the world declarations it supports. The reader loads lexical evidence from the configured worlds once at startup and returns the shared syntax analysis alongside each result. Each emitted candidate has its own sourceEvidence array with the wire ID, key, surface form and exact matching ranges. Repeated phrases retain all compatible ranges inside the owning request. World-derived semantic values may have a different spelling from their source.

## Running the paired benchmark

Run `WORKERS=8 SAMPLE_PERCENT=1 node tests/benchmark/port-run.mjs` with SOP_WORKSPACE pointing to the parent of the dataset and knowledge checkouts. Set SWIPL to the installed SWI-Prolog executable. The runner reads committed dataset blobs, orders record IDs by a seeded SHA-256 digest and takes the requested fraction. A record with several alternative references counts once. To replay an existing sample, pass its run directory as the first argument and a new destination as the second. The historical directory holds the exact sample, engine settings, timings and compressed predictions. Engines run consecutively with the same concurrency. Wall time includes worker startup, generation, result collection and shutdown. Per-request latency measures the reader call inside a worker. Prediction workers receive only IDs and text. Reference circuits are compared in the evaluator.

Run `node tests/benchmark/grade.mjs eval-results/RUN` to apply the same static verifier and WebMeet comparator to both engines after timing. The evaluator considers whole circuits across every candidate and reference in deterministic order. Automatic grades and semantic error tags can be audited from the saved rows. Prolog currently emits its native candidate set and Z3 uses up to eight candidates. This measures the installed configurations and their native output costs.

The third benchmark strategy, prolog-example-transfer, uses the complementary training split from the same committed corpus. All rows sharing the exact original evaluation text are excluded across files before training. Its candidates include the symbolic Prolog candidates and distinct learned readings. The report counts the reasonable candidates, the matched reference serialisations, and the messages with at least one reasonable candidate. See [the training boundary](strategies/prolog-example-transfer.md).
