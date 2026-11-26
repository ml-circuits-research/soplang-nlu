import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {alignCircuit} from './legacy-evidence.mjs'

// WebMeet CSV reference cells contain w.request circuits. Store the native NLU
// circuits and their checks alongside the predictions used by that comparator.
export async function createRecordWriter(knowledgeDir) {
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
      candidateEvidence,unresolved,status:result.status,error:result.error,
      ...(result.legacy ? {analyses:result.candidates} : {})}
  }
}
