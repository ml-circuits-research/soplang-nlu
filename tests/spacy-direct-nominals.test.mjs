import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'
import {projectDependencies} from '../strategies/spacy-direct/project.mjs'
import {createAnalysisValidator, hasCompleteSource} from '../lib/check-analysis.mjs'

const directory = fileURLToPath(new URL('../../sop-knowledge-worlds', import.meta.url))
const validate = await createAnalysisValidator({knowledgeDir:process.env.SOP_KNOWLEDGE_DIR ?? directory})

function circuit(source, grammar) {
  let cursor = 0
  const dependencies = grammar.map(([text,pos,tag,dep,head,lemma=text.toLowerCase()],i) => {
    const start = source.indexOf(text,cursor)
    assert.ok(start >= cursor)
    cursor = start + text.length
    return {i,text,start,end:cursor,pos,tag,dep,head,lemma}
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

test('coordinated prepositions keep their landmarks and the scope of negation', () => {
  const sop = circuit('Move it near Ben but not behind Jo.',[
    ['Move','VERB','VB','ROOT',0], ['it','PRON','PRP','dobj',0],
    ['near','ADP','IN','prep',0], ['Ben','PROPN','NNP','pobj',2],
    ['but','CCONJ','CC','cc',2], ['not','PART','RB','neg',6],
    ['behind','ADP','IN','conj',2], ['Jo','PROPN','NNP','pobj',6], ['.','PUNCT','.','punct',0]
  ])
  const near = sop.match(/@(n\d+) nlu.relation kind=near/)?.[1]
  const behind = sop.match(/@(n\d+) nlu.relation kind=behind .*negation="not"/)?.[1]
  assert.ok(near && behind,sop)
  assert.ok(sop.includes('kind=contrast member=$'+near+' member=$'+behind+' cue="but"'),sop)
})

function entityId(sop, slot, text) {
  const field = slot + '=' + JSON.stringify(text)
  const line = sop.split('\n').find(line => /\bnlu\.entity\b/u.test(line) && line.includes(field))
  assert.ok(line, sop)
  return line.split(' ')[0].slice(1)
}

function hasRelation(sop, kind, from, to) {
  return sop.split('\n').some(line => line.includes('nlu.relation kind='+kind+' ') &&
    line.includes('from=$'+from+' to=$'+to))
}

test('a written title stays separate from the noun declaring the document', () => {
  const sop = circuit('Store the document Quarterly Notes 8', [
    ['Store','VERB','VB','ROOT',0], ['the','DET','DT','det',2],
    ['document','NOUN','NN','dobj',0], ['Quarterly','ADJ','JJ','compound',4],
    ['Notes','NOUN','NNS','appos',2], ['8','NUM','CD','nummod',4]
  ])
  assert.ok(hasRelation(sop,'label',entityId(sop,'head','document'),
    entityId(sop,'name','Quarterly Notes 8')),sop)
  assert.doesNotMatch(sop,/quantity="8"/u)
})

test('an explicit naming modifier is a label with its own source marker', () => {
  const sop = circuit('Pack the folder called Audit Log', [
    ['Pack','VERB','VB','ROOT',0], ['the','DET','DT','det',2],
    ['folder','NOUN','NN','dobj',0], ['called','VERB','VBN','acl',2,'call'],
    ['Audit','PROPN','NNP','compound',5], ['Log','PROPN','NNP','oprd',3]
  ])
  assert.ok(hasRelation(sop,'label',entityId(sop,'head','folder'),
    entityId(sop,'name','Audit Log')),sop)
  assert.match(sop,/cue="called"/u)
  assert.doesNotMatch(sop,/predicate="called"/u)
})

test('adjacent lists pair overt categories and values in written order', () => {
  const sop = circuit('Make a chart with values 12, 4 for M&E and Other', [
    ['Make','VERB','VB','ROOT',0], ['a','DET','DT','det',2],
    ['chart','NOUN','NN','dobj',0], ['with','ADP','IN','prep',2],
    ['values','NOUN','NNS','pobj',3], ['12','NUM','CD','nummod',4],
    [',','PUNCT',',','punct',4], ['4','NUM','CD','appos',4],
    ['for','ADP','IN','prep',7], ['M&E','PROPN','NNP','pobj',8],
    ['and','CCONJ','CC','cc',9], ['Other','PROPN','NNP','conj',9]
  ])
  assert.ok(hasRelation(sop,'value',entityId(sop,'name','M&E'),entityId(sop,'literal','12')),sop)
  assert.ok(hasRelation(sop,'value',entityId(sop,'name','Other'),entityId(sop,'literal','4')),sop)
  assert.doesNotMatch(sop,/quantity="(?:12|4)"/u)
})

test('unequal lists keep scalar values without inventing a pairing', () => {
  const sop = circuit('Draw a chart with values 3, 5 for North', [
    ['Draw','VERB','VB','ROOT',0], ['a','DET','DT','det',2], ['chart','NOUN','NN','dobj',0],
    ['with','ADP','IN','prep',2], ['values','NOUN','NNS','pobj',3],
    ['3','NUM','CD','nummod',4], [',','PUNCT',',','punct',4], ['5','NUM','CD','appos',4],
    ['for','ADP','IN','prep',4], ['North','PROPN','NNP','pobj',8]
  ])
  assert.match(sop,/kind=values /u)
  assert.doesNotMatch(sop,/kind=value /u)
})

test('a scheduled venue identifier is independent of the booking date and duration', () => {
  const sop = circuit('reserve Suite 28 for Audit on 2028-02-15', [
    ['reserve','NOUN','NN','compound',1], ['Suite','PROPN','NNP','ROOT',1],
    ['28','NUM','CD','nummod',1], ['for','ADP','IN','prep',1],
    ['Audit','PROPN','NNP','pobj',3], ['on','ADP','IN','prep',4],
    ['2028-02-15','NUM','CD','pobj',5]
  ])
  const suite = entityId(sop,'name','Suite')
  assert.ok(hasRelation(sop,'label',suite,entityId(sop,'name','28')),sop)
  const clause = sop.match(/@(n\d+) nlu.clause form=imperative predicate="reserve"/u)?.[1]
  assert.ok(clause,sop)
  assert.ok(hasRelation(sop,'date',clause,entityId(sop,'literal','2028-02-15')),sop)
})

test('a noun compound is retained without an imperative or name assumption', () => {
  const sop = circuit('the book room', [
    ['the','DET','DT','det',2], ['book','NOUN','NN','compound',2], ['room','NOUN','NN','ROOT',2]
  ])
  assert.match(sop,/form=fragment/u)
  assert.match(sop,/head="room" determiner="the" compound="book"/u)
  assert.doesNotMatch(sop,/predicate=|kind=label/u)
})

test('unlabelled position coordinates retain order without assuming axes', () => {
  const sop = circuit('the position 120, 67', [
    ['the','DET','DT','det',1], ['position','NOUN','NN','ROOT',1],
    ['120','NUM','CD','nummod',1], [',','PUNCT',',','punct',1], ['67','NUM','CD','appos',1]
  ])
  const position = entityId(sop,'head','position')
  assert.ok(hasRelation(sop,'coordinate_component',position,entityId(sop,'literal','120')),sop)
  assert.ok(hasRelation(sop,'coordinate_component',position,entityId(sop,'literal','67')),sop)
  assert.doesNotMatch(sop,/(?:horizontal|vertical)_value/u)
})

test('a later argument repeats an expressly declared name exactly', () => {
  const sop = circuit('Create a calendar called Planning Desk 4; reserve Planning Desk 4', [
    ['Create','VERB','VB','ROOT',0], ['a','DET','DT','det',2],
    ['calendar','NOUN','NN','dobj',0], ['called','VERB','VBN','acl',2,'call'],
    ['Planning','PROPN','NNP','compound',5], ['Desk','PROPN','NNP','oprd',3],
    ['4','NUM','CD','nummod',5], [';','PUNCT',':','punct',0],
    ['reserve','VERB','VB','ROOT',8], ['Planning','PROPN','NNP','compound',10],
    ['Desk','PROPN','NNP','dobj',8], ['4','NUM','CD','nummod',10]
  ])
  assert.equal((sop.match(/name="Planning Desk 4"/gu) ?? []).length,2,sop)
  assert.doesNotMatch(sop,/quantity="4"/u)
})

test('the determiner belongs to the typed noun, with a separate written identifier', () => {
  const sop = circuit('Anchor the part Poster', [
    ['Anchor','VERB','VB','ROOT',0], ['the','DET','DT','det',3],
    ['part','NOUN','NN','compound',3], ['Poster','PROPN','NNP','dobj',0]
  ])
  assert.match(sop,/head="part" determiner="the"/u)
  assert.ok(hasRelation(sop,'label',entityId(sop,'head','part'),entityId(sop,'name','Poster')),sop)
})

test('explicit coordinate axes retain their lexical source and corresponding value', () => {
  const sop = circuit('the location x 14, y 36', [
    ['the','DET','DT','det',1], ['location','NOUN','NN','ROOT',1],
    ['x','NOUN','NN','dep',1], ['14','NUM','CD','nummod',2],
    [',','PUNCT',',','punct',1], ['y','NOUN','NN','appos',1], ['36','NUM','CD','nummod',5]
  ])
  const location = entityId(sop,'head','location')
  assert.ok(hasRelation(sop,'horizontal_value',location,entityId(sop,'literal','14')),sop)
  assert.ok(hasRelation(sop,'vertical_value',location,entityId(sop,'literal','36')),sop)
  assert.match(sop,/kind=horizontal_value .*cue="x"/u)
  assert.match(sop,/kind=vertical_value .*cue="y"/u)
})

test('a predicated dimension owns both its amount and written unit', () => {
  const sop = circuit('Make it 65 pixels wide.',[
    ['Make','VERB','VB','ROOT',0], ['it','PRON','PRP','nsubj',4],
    ['65','NUM','CD','nummod',3], ['pixels','NOUN','NNS','npadvmod',4],
    ['wide','ADJ','JJ','ccomp',0], ['.','PUNCT','.','punct',0]
  ])
  assert.match(sop,/direct_object=\$n2 predicative_entity=\$n3/)
  assert.match(sop,/@n3 nlu.entity head="wide" measure=\$n4/)
  assert.match(sop,/@n4 nlu.entity head="pixels" quantity="65"/)
})

test('source brackets become a data literal only when their contents constitute valid JSON', async () => {
  const {collectExplicitValues} = await import('../strategies/spacy-direct/explicit-literals.mjs')
  for (const [source,expected] of [['[[1,2]]',true],['[move it]',false],['{]',false]]) {
    const spans=[...source.matchAll(/\w+|[^\w\s]/gu)].map(m=>[m.index,m.index+m[0].length])
    assert.equal(collectExplicitValues(source,spans).some(([, , structured]) => structured),expected)
  }
})
