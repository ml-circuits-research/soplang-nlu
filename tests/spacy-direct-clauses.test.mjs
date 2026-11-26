import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {test} from 'node:test'
import {createAnalysisValidator, hasCompleteSource} from '../lib/check-analysis.mjs'
import {projectDependencies} from '../strategies/spacy-direct/project.mjs'

const knowledgeDir = process.env.SOP_KNOWLEDGE_DIR ??
  fileURLToPath(new URL('../../sop-knowledge-worlds', import.meta.url))

test('direct projection grounds interrogative and subordinate cues without external inference', async () => {
  const validate = await createAnalysisValidator({knowledgeDir})
  function read(text, graph) {
    const words = [...text.matchAll(/[A-Za-z]+|[.?!]/gu)]
    assert.equal(words.length, graph.length)
    const dependencies = words.map(([value], i) => {
      const [pos, tag, dep, head] = graph[i].split('/')
      return {i, text: value, start: words[i].index, end: words[i].index + value.length,
        pos, tag, dep, head: Number(head), lemma: value.toLowerCase()}
    })
    const {sop} = projectDependencies(text, dependencies)
    assert.ok(hasCompleteSource(validate(text, sop)), sop)
    return sop
  }

  assert.match(read('How many circles are visible?', [
    'ADV/WRB/advmod/1', 'ADJ/JJ/amod/2', 'NOUN/NNS/nsubj/3', 'AUX/VBP/ROOT/3',
    'ADJ/JJ/acomp/3', 'PUNCT/./punct/3'
  ]), /form=interrogative .*question="How many".* subject=\$n2/)

  const embedded = read('Tell me when the meeting starts.', [
    'VERB/VB/ROOT/0', 'PRON/PRP/dobj/0', 'ADV/WRB/advmod/5', 'DET/DT/det/4',
    'NOUN/NN/nsubj/5', 'VERB/VBZ/ccomp/0', 'PUNCT/./punct/0'
  ])
  assert.match(embedded, /predicate="Tell".* indirect_object=\$n3 clausal_complement=\$n2/)
  assert.match(embedded, /form=interrogative question="when" predicate="starts"/)

  const purpose = read('Move it so that she can see it.', [
    'VERB/VB/ROOT/0', 'PRON/PRP/dobj/0', 'SCONJ/IN/mark/6', 'SCONJ/IN/mark/6',
    'PRON/PRP/nsubj/6', 'AUX/MD/aux/6', 'VERB/VB/advcl/0', 'PRON/PRP/dobj/6', 'PUNCT/./punct/0'
  ])
  assert.match(purpose, /kind=purpose from=\$n1 to=\$n2 cue="so that"/)
  assert.doesNotMatch(purpose, /marker="that"/)

  const relative = read('Choose the room where the team meets.', [
    'VERB/VB/ROOT/0', 'DET/DT/det/2', 'NOUN/NN/dobj/0', 'ADV/WRB/advmod/6',
    'DET/DT/det/5', 'NOUN/NN/nsubj/6', 'VERB/VBZ/relcl/2', 'PUNCT/./punct/0'
  ])
  assert.match(relative, /kind=locative_relative from=\$n3 to=\$n2 cue="where"/)
  assert.match(relative, /form=declarative predicate="meets"/)

  const location = read('Leave it where it is.', [
    'VERB/VB/ROOT/0', 'PRON/PRP/dobj/0', 'ADV/WRB/advmod/4',
    'PRON/PRP/nsubj/4', 'AUX/VBZ/ccomp/0', 'PUNCT/./punct/0'
  ])
  assert.match(location, /kind=where from=\$n1 to=\$n2 cue="where"/)
  assert.doesNotMatch(location, /question=|clausal_complement=/)

  assert.match(read('How about a violin?', [
    'SCONJ/WRB/advmod/3', 'SCONJ/IN/mark/3', 'DET/DT/det/3', 'NOUN/NN/ROOT/3', 'PUNCT/./punct/3'
  ]), /form=fragment .*question="How about" topic=\$n2/)
})

test('a verbal complement separated by a semicolon stays an independent assertion', async () => {
  const {separateWrittenClauses} = await import('../strategies/spacy-direct/clause-boundaries.mjs')
  const tokens = [
    ['it','PRON','PRP','nsubj',1], ['broke','VERB','VBD','ccomp',3], [';','PUNCT',':','punct',3],
    ['remove','VERB','VB','ROOT',3], ['it','PRON','PRP','dobj',3]
  ].map(([value,pos,tag,dep,head],index)=>({index,value,lower:value,pos,tag,dep,head}))
  separateWrittenClauses(tokens)
  assert.equal(tokens[1].dep,'ROOT')
  assert.equal(tokens[1].head,1)
  assert.equal(tokens[2].head,1)
})
