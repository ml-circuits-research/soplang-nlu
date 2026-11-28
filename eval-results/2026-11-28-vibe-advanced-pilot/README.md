# GLM 5.3 against Opus on the hard half

Three `-advanced` parts (spaCy and hmm-rules disagree), one per area, drawn with seed `2026-11-28-adv`, judged by
GLM 5.3 through `vibe` (glm/) and by Opus (opus/), both with the same RULES.md and checker.

| | Count |
| --- | ---: |
| Rows | 238 |
| Opus accepts spaCy | 166 (69.7%) |
| Same verdict, GLM and Opus | 197 (82.8%) |
| Opus rejections GLM also catches | 44 of 72 (61%) |
| GLM rejections Opus accepts | 13 of 166 accepted (7.8%) |
| Corrections equal to Opus's (variants key), where both reject | 26 of 44 (59%) |

GLM alone leaves about 28 wrong circuits per 238 rows in the hard half (12%), too many for the 98% goal. On the
easy half (`-simple`) its pilot was much closer to Opus.
