# Hard-case native supervision

The hard-case pass takes the first 500 entries in the uniform training tranche that lack any source-complete provider proposal. It checks the tranche manifest, original and failure-list source order, reserved-text digests, and provider shards before annotation. The optional draft is the grounded partial with the fewest material gaps, breaking ties by grounded word count and provider order. The teacher may replace the draft entirely.

```sh
node experiments/distilbert/expansion/teach-hard.mjs "$tranche" "$work" "$knowledge"
bash experiments/distilbert/expansion/review-hard.sh "$work"
```

The teacher gets literal source, graph schema, and optional partial with static feedback. It runs one initial proposal and one static repair if needed. Only source-complete proposals are sent for review. Two independent reviewers see each eligible source and circuit. A third reviewer adjudicates disagreements and audits sampled agreements through the existing native review workflow.

The accepted training file is `accepted-supervision.jsonl.gz`, with one `{id,text,sop}` row per accepted source. Its manifest records checksums, teacher coverage and review counts. The working directory retains teacher attempts and independent votes.
