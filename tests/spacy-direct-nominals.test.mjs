import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'
import {projectDependencies} from '../strategies/spacy-direct/project.mjs'
import {createAnalysisValidator, hasCompleteSource} from '../lib/check-analysis.mjs'

const directory = fileURLToPath(new URL('../../sop-knowledge-worlds', import.meta.url))
const validate = await createAnalysisValidator({knowledgeDir:process.env.SOP_KNOWLEDGE_DIR ?? directory})

function circuit(source, grammar) {
  let cursor = 0
  const dependencies = grammar.map(([text,pos,tag,dep,head],i) => {
    const start = source.indexOf(text,cursor)
    assert.ok(start >= cursor)
    cursor = start + text.length
    return {i,text,start,end:cursor,pos,tag,dep,head,lemma:text.toLowerCase()}
  })
  const {sop} = projectDependencies(source,dependencies)
  assert.ok(hasCompleteSource(validate(source,sop)),sop)
  return sop
}

test('a base verb attached as a determiner of a nominal root introduces a directive', () => {
  const sop = circuit('erase one document',[
    ['erase','VERB','VB','det',2], ['one','NUM','CD','nummod',2], ['document','NOUN','NN','ROOT',2]
  ])
  assert.match(sop,/form=imperative predicate="erase".*direct_object=\$n2/)
  assert.match(sop,/head="document" quantity="one"/)
})

test('a hyphenated distance retains the full surface unit on its quantified relation', () => {
  const sop = circuit('a cat two hand-widths from the edge',[
    ['a','DET','DT','det',1], ['cat','NOUN','NN','ROOT',1],
    ['two','NUM','CD','nummod',5], ['hand','NOUN','NN','compound',5],
    ['-','PUNCT','HYPH','punct',5], ['widths','NOUN','NNS','npadvmod',6],
    ['from','ADP','IN','prep',1], ['the','DET','DT','det',8], ['edge','NOUN','NN','pobj',6]
  ])
  const measure = sop.match(/@(n\d+) nlu.entity head="hand-widths" quantity="two"/)?.[1]
  assert.ok(measure,sop)
  assert.ok(sop.split('\n').some(line => line.includes('kind=from') && line.endsWith('measure=$'+measure)),sop)
})

test('an independent interjection and a question retain their separate clause boundaries', () => {
  const sop = circuit('Hmm, is it blue?.',[
    ['Hmm','INTJ','UH','intj',2], [',','PUNCT',',','punct',2],
    ['is','AUX','VBZ','ROOT',2], ['it','PRON','PRP','nsubj',2],
    ['blue','ADJ','JJ','acomp',2], ['?','PUNCT','.','punct',2], ['.','PUNCT','.','punct',2]
  ])
  assert.match(sop,/form=fragment speech_act=hesitation expression="Hmm" separator=","/)
  assert.match(sop,/form=interrogative terminator="\?\."/u)
})

test('a fronted prepositional object remains connected to its stranded preposition', () => {
  const sop = circuit('What did it land on?',[
    ['What','PRON','WP','pobj',3], ['did','AUX','VBD','aux',3],
    ['it','PRON','PRP','nsubj',3], ['land','VERB','VB','ROOT',3],
    ['on','ADP','IN','prt',3], ['?','PUNCT','.','punct',3]
  ])
  assert.match(sop,/pronoun="What"/)
  assert.match(sop,/kind=on from=\$n1 to=\$n\d+ cue="on"/)
})
