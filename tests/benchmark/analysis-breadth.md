# Integrated analysis breadth diagnostic

Run the hand-authored fixtures through the same public `createReader` entry point used by the benchmark.

```sh
node tests/benchmark/analysis-breadth.mjs --strategies z3,prolog --output /tmp/nlu-breadth.json
node tests/benchmark/analysis-breadth.mjs --strategies prolog --case temporal-pp --case complement-clause
```

Install the strategy's solver and the SOP knowledge installation first. The command supports `--knowledge`, `--swipl`, and `--z3-module` overrides. The example-transfer strategy can also be selected with its explicit `--model-path`.

Version `nlu-breadth-v1` covers 31 independently authored messages. Its expected graphs constrain material roles and typed links, including direction, clause arguments, modifiers, negation, and coordination. The matcher ignores wire IDs and wire order. Each listed alternative must match within one whole candidate. An alternative can accept a genuine ambiguity, such as attaching “near the wall” to the moved object or to the movement. Matching enforces the number of wires of each type and any specified required or absent slots. Fields omitted from expectations are outside this test.

The JSON diagnostic keeps every proposal, its shared validator report, and the expected-graph comparison. Summary counts are separate:

- `schemaValidCircuit` means a row has a schema-valid candidate.
- `validCircuit` additionally requires exact source grounding.
- `accountedSource` allows evidence marked as unresolved or filler.
- `noUnresolvedSource` requires every occurrence to be accounted for and none marked unresolved. That alone does not establish semantic agreement.
- `expectedReading` means at least one valid candidate satisfies an expected graph.

These fixtures are a targeted set of language constructions. Their result is a diagnostic for regression and development. It is neither a population estimate nor a comparison to the historical WebMeet `w.request` benchmark. A readable proposal can preserve all source text while missing a material role or relationship.
