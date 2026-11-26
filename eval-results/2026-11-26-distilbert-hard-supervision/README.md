# Hard-case supervision for DistilBERT

The provider run yielded 451 training texts with no source-complete proposal among 6,000 uniform training inputs. This pass took all 451 in the original source order. GPT-6 Sol generated one SOP per text with the closest valid partial as optional draft. The draft came with static coverage diagnostics and explicit permission to replace it.

| Stage | Texts |
|---|---:|
| Grounded draft available | 451 |
| Source-complete first proposal | 253 |
| One repair attempted | 198 |
| Additional complete proposals from repair | 151 |
| Complete circuits reviewed | 404 |
| Accepted training pairs | 368 |

GPT-6.1 Terra and GPT-6.2 Sol independently reviewed each source-complete candidate as a blinded singleton. GPT-6.1 Sol adjudicated 48 threshold disagreements and audited 40 agreements. The audit contradicted seven of those 40 agreements. The predefined settlement used the third vote on disagreements and preserved concordant decisions. Only the 368 final accepted circuits are included in the training export.

[Accepted supervision](accepted-supervision.jsonl.gz) contains one `{id,text,sop}` row per accepted source. [Teacher inputs](teacher-inputs.jsonl.gz) preserve the original-source digests, exact draft circuits and their static feedback. [Selection](selection.json), [settled review](review/candidate-decisions.jsonl.gz), and [verification](verification.json) record the training source boundary and checksums. All 368 released circuits revalidated as source-complete. This run generated supervision and did not train or score a model.

The pipeline is documented in [hard-case supervision](../../experiments/distilbert/expansion/HARD-CASES.md).
