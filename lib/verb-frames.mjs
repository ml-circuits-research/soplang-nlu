import {readFileSync} from 'node:fs'

const source = new URL('../worlds/en.valency/verbs.sop', import.meta.url)
const additions = new URL('../worlds/en.valency/additions.sop', import.meta.url)

// This indexes world facts only. Strategies decide how to use a licensed frame.
export function loadVerbFrames(parse, extraFacts = []) {
  const frames = new Map()
  for (const records of [parse(readFileSync(source, 'utf8')), parse(readFileSync(additions, 'utf8')), extraFacts]) {
    for (const wire of records) {
      if (wire.type !== 'en.valency.verb') continue
      const lemma = JSON.parse(wire.attrs.lemma[0])
      if (!frames.has(lemma)) frames.set(lemma, new Set())
      for (const frame of wire.attrs.frame) frames.get(lemma).add(frame)
    }
  }
  return frames
}

export function loadPosUsage(parse, extraFacts = []) {
  const usage = new Map()
  const posSource = new URL('../worlds/en.valency/pos.sop', import.meta.url)
  for (const records of [parse(readFileSync(posSource, 'utf8')), extraFacts]) {
    for (const wire of records) {
      if (wire.type !== 'en.valency.pos_usage') continue
      const lemma = JSON.parse(wire.attrs.lemma[0])
      const counts = {}
      for (const key of ['noun','verb','adjective','adverb']) {
        if (wire.attrs[key]) counts[key] = Number(wire.attrs[key][0])
      }
      usage.set(lemma, counts)
    }
  }
  return usage
}
