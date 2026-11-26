import {openDependencies} from '../neural-dependencies/index.mjs'
import {projectDependencies} from './project.mjs'

async function open({python, model, syntaxModel} = {}) {
  const parser = await openDependencies({python, model, syntaxModel})
  const diagnostics = {projector: 'spacy-direct', transport: parser.metadata}
  async function analyse(text) {
    if (typeof text !== 'string' || !text.trim()) {
      return {analyses: [], analysisDiagnostics: {...diagnostics, status: 'invalid-input'}}
    }
    try {
      const reading = projectDependencies(text, await parser.parse(text))
      return {analyses: [reading], analysisDiagnostics: {...diagnostics, status: 'ok'}}
    } catch (error) {
      return {analyses: [], analysisDiagnostics: {...diagnostics, status: 'error', error: error.message}}
    }
  }
  return {analyse, propose: analyse, close: () => parser.close()}
}

export const spacyDirect = {name: 'spacy-direct', open}
