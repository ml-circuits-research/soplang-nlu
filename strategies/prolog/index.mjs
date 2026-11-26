import { catalogIssues } from './src/catalog.mjs'
import { evidenceReport } from './src/evidence.mjs'
import { createFormaliser } from './src/formaliser.mjs'
import { openKnowledge, withKnowledge } from './src/knowledge.mjs'
import { parse } from './src/schema.mjs'
import { loadWorlds } from './src/worlds.mjs'
import { createNativeSyntax } from './src/syntax.mjs'

const syntaxStatus = error => error ? {solver:'swipl',status:'error',error} : {solver:'swipl',status:'ok'}

const field = (wire, key) => {
  const raw = wire.attrs[key]?.[0]
  return raw?.startsWith('"') ? JSON.parse(raw) : raw
}

export const prolog = {
  name: 'prolog',
  async open({
    knowledgeDir = process.env.SOP_KNOWLEDGE_DIR,
    worldPaths,
    swipl = process.env.SWIPL || 'swipl',
    evidence = true,
    languageFrames = true,
    ...unknown
  } = {}) {
    if (Object.keys(unknown).length) {
      throw new TypeError('Unsupported symbolic Prolog options: ' + Object.keys(unknown).join(', '))
    }
    if (!knowledgeDir) throw new TypeError('Expected a SOP knowledge directory')
    if (worldPaths !== undefined && !Array.isArray(worldPaths)) {
      throw new TypeError('Expected an array of SOP world paths')
    }
    const installation = await openKnowledge(knowledgeDir)
    return withKnowledge(installation, () => {
      const worlds = loadWorlds({paths: worldPaths})
      const formaliser = createFormaliser(worlds, {languageFrames, swipl})
      const syntax = createNativeSyntax(worlds, formaliser.analyseSyntax)
      const decorateAnalyses = (text, candidates) => withKnowledge(installation, () => syntax(text, candidates))
      return {
        decorateAnalyses,
        async analyse(text) {
          try {
            if (typeof text !== 'string') throw new TypeError('Expected a text string')
            const {analyses} = await decorateAnalyses(text)
            return {analyses, analysisDiagnostics: syntaxStatus()}
          } catch (error) {
            return {analyses: [],
              analysisDiagnostics: syntaxStatus(error instanceof Error ? error.message : String(error))}
          }
        },
        propose: text => withKnowledge(installation, async () => {
          let analyses = []
          let syntaxError = null
          try {
            if (typeof text !== 'string') throw new TypeError('Expected text to be a string')
            try { ({analyses} = await syntax(text)) }
            catch (error) { syntaxError = error instanceof Error ? error.message : String(error) }
            const result = await formaliser.formalise(text)
            const unresolved = []
            const candidates = result.candidates.map((candidate, index) => {
              const wires = parse(candidate.sop)
              for (const wire of wires.filter(wire => wire.type === 'w.request.unread')) {
                unresolved.push({candidate: index, text: field(wire, 'text'), note: field(wire, 'note')})
              }
              return evidence ? {...candidate, evidence: evidenceReport(text, wires, worlds.evidenceVocabulary),
                catalog: {issues: catalogIssues(wires, worlds)}} : candidate
            })
            if (!candidates.length && result.unread !== undefined) unresolved.push({text: result.unread})
            let output = {analyses, candidates}
            if (!syntaxError) {
              try { output = await syntax(text, candidates) }
              catch (error) { syntaxError = error instanceof Error ? error.message : String(error) }
            }
            return {...result, ...output, engine: 'prolog', text, unresolved, error: null,
              analysisDiagnostics: syntaxStatus(syntaxError)}
          } catch (error) {
            return {engine: 'prolog', text: typeof text === 'string' ? text : null, candidates: [], analyses,
              unresolved: [], error: error instanceof Error ? error.message : String(error),
              analysisDiagnostics: syntaxStatus(syntaxError)}
          }
        }),
        close: formaliser.close
      }
    })
  }
}
