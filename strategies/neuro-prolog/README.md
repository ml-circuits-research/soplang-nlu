# Neuro-Prolog

Neuro-Prolog accepts dependency tokens from an English spaCy model or a
caller-supplied `syntaxModel`. The input model supplies token boundaries,
parts of speech, lemmas and labeled head arcs. The strategy passes that
evidence to a persistent SWI-Prolog worker. Prolog composes the native clauses,
arguments, modifiers, coordination and attachments. JavaScript serializes the
typed graph and uses the ordinary source and schema validator to rank it
alongside symbolic Prolog's proposals.

Configure the standard spaCy transport with `SOP_NLU_SYNTAX_PYTHON` and
`SOP_NLU_SYNTAX_MODEL`, or pass `python` and `model` to the strategy. Configure
SWI-Prolog with `SWIPL` and the knowledge installation with
`SOP_KNOWLEDGE_DIR`. Set `dependencyOnly: true` when diagnosing the projection
without symbolic competition.

Public results contain up to three distinct circuits. Complete, schema-valid
circuits rank before partial readings. Exact source claims stay anchored to
the token spans. The worker leaves unrecognized material unresolved. If a
projection fails validation, `analysisDiagnostics.projectionFindings` records
the failure. The dependency model's installed version and pipeline appear in
`analysisDiagnostics.model`.

The dependency graph can mislabel an argument, clause boundary or attachment.
A source-complete circuit still needs independent assessment of the roles it
assigns.
