import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { unquoteSop } from './contracts.mjs'
import { sopFiles } from './kb/overlays.mjs'

const lexicalTypes = new Set(['k.words.sense', 'w.lang.en.closed', 'w.lang.en.neg', 'w.lang.en.skip',
  'w.lang.en.cue', 'w.lang.en.fn'])
const normalize = (raw) => unquoteSop(raw).toLowerCase().replaceAll('’', "'")

export async function loadAnalysisLexicon(kb, worldPaths = []) {
  const {parse} = await import(pathToFileURL(kb.sopworldPath))
  const worlds = join(kb.knowledgeDir, 'docs', 'worlds')
  const installed = new Set(readdirSync(worlds))
  const sources = ['k.words', 'w.lang.en'].filter((name) => installed.has(name)).map((name) => join(worlds, name))
  const wires = new Map()
  for (const path of [...sources, ...worldPaths]) {
    for (const file of sopFiles(path)) {
      const text = readFileSync(file, 'utf8')
      if (![...lexicalTypes].some((type) => text.includes(' ' + type + ' '))) continue
      for (const wire of parse(text)) {
        if (lexicalTypes.has(wire.type)) wires.set(wire.id, wire)
      }
    }
  }

  const classes = new Map()
  const negative = new Set()
  const negativeEndings = new Set()
  const filler = new Set()
  const gratitudeLeads = new Set()
  const tailPoliteness = new Set()
  for (const {type, attrs} of wires.values()) {
    const forms = (type === 'k.words.sense' ? attrs.word : attrs.text) ?? []
    const tags = (type === 'k.words.sense' ? attrs.pos : attrs.class) ?? []
    if (type === 'w.lang.en.cue') {
      if (attrs.on?.some((value) => normalize(value) === 'reaction') &&
          attrs.value?.some((value) => normalize(value) === 'thanks')) {
        for (const lead of attrs.lead ?? []) gratitudeLeads.add(normalize(lead))
      }
    } else if (type === 'w.lang.en.fn') {
      if (attrs.view?.some((value) => normalize(value) === 'politeness') &&
          attrs.at?.some((value) => normalize(value) === 'tail')) {
        for (const form of forms) tailPoliteness.add(normalize(form))
      }
    } else if (type === 'w.lang.en.neg') {
      for (const form of forms) negative.add(normalize(form))
      for (const ending of attrs.ending ?? []) negativeEndings.add(normalize(ending))
    } else if (type === 'w.lang.en.skip') {
      if (tags.some((tag) => ['filler', 'politeness', 'desire'].includes(unquoteSop(tag)))) {
        for (const form of forms) filler.add(normalize(form))
      }
    } else {
      for (const raw of forms) {
        const form = normalize(raw)
        if (!classes.has(form)) classes.set(form, new Set())
        for (const tag of tags) classes.get(form).add(unquoteSop(tag))
      }
    }
  }
  const gratitude = new Set([...gratitudeLeads].filter((lead) => tailPoliteness.has(lead)))
  return {classes, negative, negativeEndings, filler, gratitude}
}
