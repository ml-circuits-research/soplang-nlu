# Capped selector and expanded DistilBERT

On the existing 100-source diagnostic, a fixed two-reading policy kept the first selector reading and returned a source-complete expanded span-head reading when it differed from both originals. Otherwise it retained the selector output. Against the existing blind votes this moved ANY from 74% to 78%, with no losses and four gains. ALL moved from 47% to 46%. Filling an empty second slot alone yielded 75% ANY. The model and policy saw no gold reading at runtime. The selector has historical exposure to this development cohort.

## Audit of the gains

A separate blind Astra pass reviewed all four apparent gains and twelve additional eligible circuits selected by a salted hash of the exact source. The secondary reviewer saw neither the original judgment nor the stratum. It confirmed two of four gains and disagreed with three of the twelve control judgments. This targeted check does not estimate a population error rate. The raw 78% is sensitive to reviewer differences.

- “call the Ops colunm Operations” splits the source into the existing column and the name assigned to it. The spelling is preserved.
- “amke the house by the fence bright purple” connects the fence qualifier to the house, and assigns the requested color as a complement.
- In the bird/fence example the graph duplicates the coordination of the opening fragment and the imperative, then attaches the final qualifier twice. The original votes accepted the reading. The additional reviewer identified a material attachment error.
- For the claims-line example, the graph describes the axis as predicative of the line. The additional reviewer interpreted the axis as being requested for the line.

The archived judgments include per-case reasons. The independent 250-source diagnostic uses live public inference with the same cap and fixed policy. The reserved 1% remains separate.
