import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createReader} from '../lib/index.mjs'
import {z3} from '../strategies/z3/index.mjs'
import {prolog} from '../strategies/prolog/index.mjs'

test('each symbolic strategy reads new vocabulary from its configured SOP worlds',
  {skip: !(process.env.SOP_KNOWLEDGE_DIR && process.env.SWIPL)}, async () => {
    const folder = await mkdtemp(join(tmpdir(),'sop-nlu-vocabulary-'))
    try {
      const file = join(folder,'terms.sop')
      await writeFile(file, [
        '@custom.flenk k.words.sense word=flenk pos=verb n=1 supersense=verb.change gloss="to mark for inspection"',
        '@custom.mavnish k.words.sense word=mavnish pos=adjective n=1 supersense=adj.all gloss="bearing the inspection mark"'
      ].join('\n'))
      for (const strategy of [prolog,z3]) {
        const reader = await createReader({strategy,knowledgeDir:process.env.SOP_KNOWLEDGE_DIR,worldPaths:[file]})
        try {
          const result = await reader.propose('Flenk the mavnish circle.')
          assert.ok(result.candidates.some(({sop,check}) => check.valid && check.coverage.unresolved === 0 &&
            sop.includes('predicate="Flenk"') && sop.includes('modifier="mavnish"') &&
            sop.includes('head="circle"') && !sop.includes(' act=')), strategy.name)
        } finally { await reader.close() }
      }
    } finally { await rm(folder,{recursive:true,force:true}) }
  })
