# Fresh benchmark of 2026-11-28

A new sample, drawn anew with the seed "2026-11-28-a" by `tests/benchmark/syntax/draw-sample.mjs` (share 0.01).

| Item | Value |
| --- | --- |
| Dataset commit | c6b11f6d87b0ecae5784ee3aabccb564e62d3a7c (183,497 distinct texts) |
| Method | whole files of `semantic/` chosen at random per area (calendar, diagram, document, drawing), smaller files likelier, until each area holds at least 1% of its messages |
| Exclusions | none: messages judged or worked on before stay eligible; where a circuit equals an existing label it counts as already known |
| Messages | 2,225 (1.21%): calendar 54, diagram 1,057, document 159, drawing 955 |
| Files | see `sample.lock.json` (24 files) |

Redraw with another seed: `node tests/benchmark/syntax/draw-sample.mjs <out> --seed <s> --share 0.01`.
