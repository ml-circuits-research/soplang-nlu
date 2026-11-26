# Proposal collection

This experiment collects the public candidates of four families for the same source. It records every `{family,rank,sop,eligible}` observation, including exact duplicate SOPs across families. Eligibility is the normal source-completeness check. The pool assigns no scores or learned weights.

| Family | Public reader | Evidence |
|---|---|---|
| `base-beam` | spaCy beam | Base transformer greedy and beam graphs |
| `adapted-beam` | spaCy beam | Adapted transformer greedy and beam graphs |
| `adapted-compact` | spaCy direct | Adapted compact greedy graph |
| `neuro-prolog` | Neuro-Prolog | The greedy graph from the same base transformer request |

Set `SOP_NLU_SYNTAX_PYTHON` and `SOP_NLU_SYNTAX_MODEL` for the base transformer, `SOP_NLU_ADAPTED_TRF_MODEL` for the adapted transformer, and `SOP_NLU_COMPACT_PYTHON` and `SOP_NLU_COMPACT_MODEL` for the adapted compact model. Set `SOP_KNOWLEDGE_DIR` and `SWIPL` to the SOP knowledge checkout and SWI-Prolog executable.

```sh
node experiments/proposal-selection/collect.mjs sample.json.gz proposals.jsonl.gz
```

The input is a gzip-compressed JSON array with unique string IDs and nonempty source texts. The collector passes only the literal text to the readers. It streams one gzip-compressed JSON Lines record per source, with the exact input ID, text, and ordered observations. Both the proposals output and its `.timing.json` sidecar are created exclusively. Wait for a successful exit before treating the output as a complete cohort.

The prototype makes two serial transformer requests per source, one per transformer model. Beam and Neuro-Prolog share the base graph through a serialized, current-source-only adapter. The timing sidecar records each model evidence call and family call separately. Model and family times are CPU-backend wall-clock measurements, including worker communication. The process CPU counters cover Node only and exclude Python and Prolog CPU time.
