# Native annotation publication

WebMeet dataset commit `e33d4f1` contains 384 reviewed native circuits on 215 exact source texts. The selection checked 700 distinct complete circuits on the 276 texts with an accepted reading across the three strategy runs. The inventory records the 175 disputed candidates and 141 below threshold alongside the approved alternatives. Every published candidate has at least two distinct model approvals and no retained dissent. The importer verified the exact source and emitted circuit, the final schema and coverage checks, and membership of the text in the committed dataset.

The archived run used dataset commit `d25c264`. That revision contains no native reference annotations. Replaying the reference loader against the original revision returned zero native readings. Against `e33d4f1` it returned all 384. These new annotations are available for future comparisons.

The original `w.request` annotations and the native `nlu` circuits are separate formats. The earlier [legacy annotation repair audit](../../2026-11-26-paired-symbolic-transfer/semantic-review-v1/annotation-update.json) describes the 59 changes to CSV records.
