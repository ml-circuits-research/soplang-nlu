import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {alignCircuit} from './legacy-evidence.mjs'

// WebMeet CSV reference cells contain w.request circuits. Store the native NLU
// circuits and their checks alongside the predictions used by that comparator.
export async function createRecordWriter(knowledgeDir) {
  if ((process.env.EVAL_SCHEMA ?? 'nlu') === 'nlu') {
    return (text, result) => ({
      evaluatedSchema: 'nlu', candidates: result.candidates.map(candidate => candidate.sop),
      checks: result.candidates.map(candidate => candidate.check),
      evidence: result.candidates.map(candidate => candidate.semanticEvidence ?? candidate.evidence ?? []),
      diagnostics: result.analysisDiagnostics,
      error: result.error
    })
  }
  const {parse} = await import(pathToFileURL(join(resolve(knowledgeDir),'tools/sopworld/sopworld.mjs')))
  return (text, result) => {
    const {candidates, unresolved} = result.legacy ?? result
    const candidateEvidence = candidates.map(({sop, source, support, transfer}) => {
      try {
        return {sourceEvidence: alignCircuit(text,parse(sop)),source,support,transfer}
      } catch (error) {
        return {sourceEvidence: [],sourceEvidenceError: error.message,source,support,transfer}
      }
    })
    return {evaluatedSchema:'w.request',candidates:candidates.map(candidate=>candidate.sop),
      candidateEvidence,unresolved,status:result.legacy?.status ?? result.status,error:result.legacy?.error ?? result.error,
      ...(result.legacy ? {analyses:result.candidates} : {})}
  }
}
