import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {test} from 'node:test'
import {openProposalPool} from '../strategies/neuro-selector/pool.mjs'

const knowledgeDir = process.env.SOP_KNOWLEDGE_DIR ??
  fileURLToPath(new URL('../../sop-knowledge-worlds', import.meta.url))
const swipl = process.env.SWIPL

test('proposal pool serializes requests and preserves per-family observations', {
  skip: !swipl && 'Set SWIPL to test the optional Prolog family'
}, async () => {
  const sources = ['Move it.', 'Draw it.']
  const parses = []
  const observations = []
  function provider(family) {
    return {async open() {
      function tokens(text) {
        return [...text.matchAll(/[A-Za-z]+|\./g)].map((match,i) => ({
          i,text:match[0],start:match.index,end:match.index+match[0].length,
          pos:['VERB','PRON','PUNCT'][i],tag:['VB','PRP','.'][i],
          head:0,dep:['ROOT','dobj','punct'][i],lemma:match[0].toLowerCase()
        }))
      }
      return {
        async parse(text) {
          parses.push([family,text,'greedy'])
          return tokens(text)
        },
        async parseBeam(text) {
          parses.push([family,text,'beam'])
          return {tokens:tokens(text),alternatives:[]}
        },
        async close() {}
      }
    }}
  }
  const pool = await openProposalPool({knowledgeDir,swipl,
    baseSyntaxModel:provider('base'),adaptedSyntaxModel:provider('adapted'),compactSyntaxModel:provider('compact'),
    onTiming:timing=>observations.push(timing)})
  try {
    const all = await Promise.all(sources.map(text=>pool.propose(text)))
    assert.deepEqual(parses,sources.flatMap(text=>[
      ['base',text,'beam'],['adapted',text,'beam'],['compact',text,'greedy']
    ]))
    for (const [index,rows] of all.entries()) {
      assert.deepEqual(rows.slice(0,3).map(row=>row.family),['base-beam','adapted-beam','adapted-compact'])
      assert.equal(rows[0].sop,rows[1].sop)
      assert.equal(rows[1].sop,rows[2].sop)
      assert.ok(rows.some(row=>row.family==='neuro-prolog'))
      assert.ok(rows.every(row=>row.sop.includes(index===0?'Move':'Draw')))
      for (const family of new Set(rows.map(row=>row.family))) {
        assert.ok(rows.filter(row=>row.family===family).every((row,rank)=>row.rank===rank))
      }
    }
    assert.equal(observations.length,sources.length)
    assert.ok(observations.every(timing=>Object.keys(timing.evidenceMs).length===3))
  } finally {
    await pool.close()
  }
  await assert.rejects(pool.propose(sources[0]),/closed/)
})
