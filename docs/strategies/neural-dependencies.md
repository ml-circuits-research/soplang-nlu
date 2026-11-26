# Optional dependency evidence

The neuro-Prolog and neuro-Z3 strategies use a local English dependency parser.
All lexical evidence refers to the current text. Each strategy receives a token's
written form, grammatical tag, lemma, predicted dependency label and head index.
A head index is a parser hypothesis. The native strategy selects a graph of SOP
clauses, entities, attachments and literal source roles.

The dependency worker starts once per reader and handles one current input per
request. The two strategies share only its transport, validation of token offsets,
and model metadata. Python, spaCy and the English model are optional dependencies
of these strategies. The symbolic readers run independently.

For the compact configuration install spaCy 3.8 and the English
`en_core_web_sm` 3.8.0 pipeline in a Python environment, and point
`SOP_NLU_SYNTAX_PYTHON` at that environment's Python executable. Set
`SOP_NLU_SYNTAX_MODEL` to a pipeline package name or installed model directory.
Model loading does not download files. The pinned small release wheel used for
development has SHA-256 `1932429db727d4bff3deed6b34cfc05df17794f4a52eeb26cf8928f7c1a0fb85`.
The installed pipeline records its sources and model version in its metadata.
The parser is pretrained on external language data, with OntoNotes listed for
English syntax. This experiment does not train on WebMeet examples.

The sealed 1% benchmark includes both optional strategies with the same input as
the symbolic strategies. Configure the Python environment before running it.

A neuro-symbolic reader can select a dependency provider through the optional
`syntaxModel` strategy at startup. Its `open(options)` returns `parse(text)`,
`metadata`, and `close()`. Each token carries `i`, `text`, UTF-16 `start` and
`end`, `pos`, `tag`, `lemma`, `dep` and the token index of its `head`.
The adapter checks source slices and head indices for every provider. Choosing
another encoder or a separately trained parser uses the same contract in either
solver. The default provider opens the local spaCy worker.
