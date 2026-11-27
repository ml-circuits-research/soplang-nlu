// spacy: the one strategy that reads a message through the dependency parser.
//
// Three strategies used to do this, and they wrote the same circuit for most messages, because
// they share the parse: neural-dependencies wrote the parse as it stands, spacy-direct added four
// repairs of clause boundaries, and spacy-beam added the parser's beam to spacy-direct (a parse
// to fall back on, and `attachment=ambiguous` where the beam disagrees on the start of a phrase).
// spacy-beam held everything the other two did, so this strategy is spacy-beam under one name.
// The code stays where it was written: the transport and the writer of circuits in
// ../neural-dependencies, the repairs in ../spacy-direct, the beam in ../spacy-beam.
//
// It needs a Python with spaCy and an English pipeline with a parser; see
// docs/strategies/neural-dependencies.md for SOP_NLU_SYNTAX_PYTHON and SOP_NLU_SYNTAX_MODEL.
// No knowledge repository is read.
import {spacyBeam} from '../spacy-beam/index.mjs'

export const spacy = {...spacyBeam, name: 'spacy'}
