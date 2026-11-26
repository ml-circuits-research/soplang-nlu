# Ownership model trained on 11,148 native source texts

The enlarged source-only DistilBERT checkpoint used the same public graph codec and the same 283 development and 100 study texts as the 7,040-text model. The training set added 4,108 distinct texts from published native shards and refreshed some overlapping labels. The manifest pins the exact dataset revision and labels. The same frozen study and independent per-circuit review yielded 63% accepted for the standalone model, versus 53% for the earlier ownership checkpoint. Source-complete outputs moved from 86% to 80%. This illustrates that passing the static gate and obtaining a plausible reading measure different outcomes.

Replaying the deployed two-reading policy on those exact outputs yielded 82% with at least one acceptable circuit, comprising 51% all acceptable and 31% mixed. The selector alone yielded 74%. The combined policy gained nine texts and lost one. The 100 texts are a diagnostic cohort. The live reserved 1% benchmark uses the earlier frozen 7,040-text checkpoint.

The model trained on the GB10. Its CPU study used the shared two-core scheduling limit and ran alongside the reserved benchmark. The recorded 97 ms median is specific to that concurrent load.

A later selection rule protects a complete, connected second circuit when the additional graph contains a component detached from every clause. In a development replay on these same 100 texts, the rule improved the paired result from 82 to 83 accepted messages. The earlier ownership model on the 250 historical diagnostic texts improved from 203 to 204. This rule was developed and tested using those diagnostics. The in-progress reserved evaluation still runs its original pinned library revision.
