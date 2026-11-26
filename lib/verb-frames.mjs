import {readFileSync} from 'node:fs'

const source = new URL('../worlds/en.valency/verbs.sop', import.meta.url)

// This indexes world facts only. Strategies decide how to use a licensed frame.
export function loadVerbFrames(parse, extraFacts = []) {
  const frames = new Map()
  for (const records of [parse(readFileSync(source, 'utf8')), extraFacts]) {
    for (const wire of records) {
      if (wire.type !== 'en.valency.verb') continue
      const lemma = JSON.parse(wire.attrs.lemma[0])
      if (!frames.has(lemma)) frames.set(lemma, new Set())
      for (const frame of wire.attrs.frame) frames.get(lemma).add(frame)
    }
  }
  return frames
}
