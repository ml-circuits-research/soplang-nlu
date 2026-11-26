# Formalising the current text

A reader proposes zero or more independent SOP Lang circuits for a single utterance. Configure worlds when opening the reader. Worlds supply vocabulary, schemas and knowledge. The utterance supplies the participants, instructions and evidence. Preserve a pronoun as written and leave its referent open. Every reading stands on its own.

## Reading a circuit

WebMeet's first charts-01 example asks to “make a bar chart of the stadiums by country”. Its first two wires are:

```sop
@r1 w.request.request act=make mood=do predicate=make
@r1.t w.request.target request=$r1 family=chart mode=new determiner=indefinite
```

The first token declares a local wire ID. The qualified name selects the wire schema. The remaining fields are keyed values. The target's request field links back to the first wire. Three constraint wires link to that request and give the chart type (bar), dimension (country) and measure (stadiums). The reference quotes “by country” on the dimension wire. It gives the measure value without a words field. A reader can make that last claim auditable by identifying the precise occurrence of “stadiums”.

## Evidence in an analysis

Each NLU candidate contains a whole interpretation. A clause points to its participants by local wire ID. A qualified entity keeps its quoted head, determiner and modifiers. A strategy can add a grounded semantic value to the same wire. Each source occurrence belongs to one quoted field in that reading. Repeated equal words can leave the assignment of occurrences ambiguous. The validator reports this and distinguishes evidence, filler, unresolved words and omissions. No character offsets are required in the circuit.

## Library and evaluation design

Use lib/ for the shared reader and configurable world loading, strategies/ for independent implementations, tests/ for contract and evaluation tests, and eval-results/ for run history. The existing readers share createReader(), propose(text) and close(). Preserve multiple candidates, unresolved text and engine errors. See the [Z3](strategies/z3.md) and [Prolog](strategies/prolog.md) pages. Future strategies can implement the same contract.

Each one-percent run should save a new directory with the sample IDs, seed, input hashes, revisions, world configuration, proposal budget, per-row results and summary for every available strategy. Support smaller and larger samples. Give every strategy the same ordered texts. Reference circuits are evaluator inputs only. Record static, schema, syntactic and semantic findings separately. Export failures in batches for optional review, retaining judgments and model provenance.

WebMeet legend v1.2 grades the whole candidate set once per message. L0 means no usable reading, L1 wrong meaning, L2 incomplete meaning, L3 a reasonable exact match and L4 a reasonable alternative. Both L3 and L4 count as success. A lost negation that reverses intent is L1a; an omitted essential condition is L2c. Keep syntax diagnostics alongside these grades. A future grading scale needs its own version and explicit criteria.

When many cases receive the same grade, examine a sample early and split recurring failure modes that can be distinguished by a reproducible check. Keep parent-grade totals and record the rubric version. A shared symptom such as a wrong attachment can have a strategy-specific cause; record the symptom on the candidate and the cause in the strategy diagnostic. Add levels up to L10 if the observed distinctions justify them. Preserve the original grades in historical runs.

## Syntactic evidence

The strategy reads the current text and proposes complete circuits against the versioned [NLU schema](../schemas/nlu/schema.sop). Quoted slots retain the written forms. Reference slots connect clauses, participants, coordination and relations. An entity can preserve a pronoun without assigning a referent. A fragment can be represented without inventing an action. Structural validation and source coverage are separate from adjudicating the meaning of a reading.

## Comparing execution time

Use measureStrategy from lib/measure-strategy.mjs for the sequential baseline. It opens one reader, awaits each proposal and closes the reader. Persist timing with each run, including startup, proposal time, shutdown, total wall time, throughput and median and 95th-percentile latency. Save per-input latency in sample order. Record hardware, runtime versions, solver and world configuration, worker count and proposal budget. Record evaluator and reviewer time separately. Compare case-level outcomes in both directions to identify which strategy handles an attachment, ambiguity or unsupported phrase better.

## Opening a strategy

The [library entry point](../README.md) accepts a strategy and a knowledge installation. Both strategy implementations live in this repository. Configure additional SOP files or directories with worldPaths. Each strategy interprets the world declarations it supports. The engines perform lexical analysis, attachment and semantic inference independently. The public adapter dispatches the request to the native analysis method, validates the supplied integrated circuits and preserves their order. For WebMeet evaluation, the separately available legacy request candidates can be compared with the reference schema used by the CSVs.

## Running the paired benchmark

Run `WORKERS=8 SAMPLE_PERCENT=1 node tests/benchmark/port-run.mjs` with SOP_WORKSPACE pointing to the parent of the dataset and knowledge checkouts. Set SWIPL to the installed SWI-Prolog executable. The runner reads committed dataset blobs, orders record IDs by a seeded SHA-256 digest and takes the requested fraction. A record with several alternative references counts once. To replay an existing sample, pass its run directory as the first argument and a new destination as the second. The historical directory holds the exact sample, engine settings, timings and compressed predictions. Engines run consecutively with the same concurrency. Wall time includes worker startup, generation, result collection and shutdown. Per-request latency measures the reader call inside a worker. Prediction workers receive only IDs and text. Reference circuits are compared in the evaluator.

The default benchmark records native `nlu` readings, per-candidate schema and source checks, coverage, and timing. A message can pass structural checks while assigning a role incorrectly. The archived WebMeet CSV references use `w.request`. To evaluate those legacy predictions, set `EVAL_SCHEMA=w.request` before starting the benchmark. The runner applies the WebMeet comparator only to that representation.

The third benchmark strategy, prolog-example-transfer, uses the complementary training split from the same committed corpus. All rows sharing the exact original evaluation text are excluded across files before training. Its candidates include the symbolic Prolog candidates and distinct learned readings. The report counts the reasonable candidates, the matched reference serialisations, and the messages with at least one reasonable candidate. See [the training boundary](strategies/prolog-example-transfer.md).

## Reviewing disagreements with the annotation

The mechanical WebMeet v1.2 comparator is a screening step. Publish final semantic grades with the [NLU review legend](../tests/benchmark/meaning-review/legend.md). The unit is one message and one strategy. Read the original source before deciding whether a candidate is complete. Evaluate candidates even when a reference fails static validation. L8–L10 are acceptable; L10 needs independent confirmation of a material correction to the dataset. Recheck candidate annotations against the current dataset before applying corrections.

A confirmed L10 triggers an automatic correction review. A reasonable L8 can supply a missing alternative. Record the frozen dataset revision, original message, prior references, candidate and confirmation. Locate the message by its exact original text when row numbers have changed. Before applying the edit, compare all current reference cells against the audited revision and preserve every defensible alternative. Validate the proposed circuit against the current schemas. A subsequent benchmark can award L9 when the reasonable prediction exactly matches the new reference. Retain the historical L10 and the revision of each benchmark so improvements to annotation and improvements to inference can be distinguished.
