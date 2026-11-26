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

Use measureStrategy from lib/measure-strategy.mjs for the sequential baseline. It opens one reader, awaits each proposal and closes the reader. Persist timing with each run, including startup, proposal time, shutdown, total wall time, throughput and median and 95th-percentile latency. Save per-input latency in sample order. Record hardware, runtime versions, model and world configuration, worker count and proposal budget. Record evaluator and reviewer time separately. Compare case-level outcomes in both directions to identify which strategy handles an attachment, ambiguity or unsupported phrase better.

## Opening a strategy during migration

The first adapters load an existing engine from an explicit installation directory. Both expose the shared lifecycle while retaining the engine's native candidates, confidence, rankings and diagnostics where available.

```js
import {createReader} from '../lib/reader.mjs'
import {z3} from '../strategies/z3/index.mjs'

const reader = await createReader({
  strategy: z3,
  engineDirectory: process.env.Z3_FORMALISER,
  knowledgeDir: process.env.SOP_KNOWLEDGE,
  topK: 8
})
try {
  const result = await reader.propose('Move it to the left')
  console.log(result.candidates)
} finally {
  await reader.close()
}
```

For Prolog import prolog from strategies/prolog/index.mjs and supply its engineDirectory. Its adapter accepts modelPath, worldsOnly, languageFrames and evidence. Its underlying loader currently uses the installed knowledge snapshot and SOP_WORLDS overlays. Supply analyseSyntax from createSyntaxReader when syntax evidence is required.
