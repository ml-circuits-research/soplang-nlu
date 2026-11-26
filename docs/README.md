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
