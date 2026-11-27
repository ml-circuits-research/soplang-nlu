// The dependency strategies write the `syntax` schema: neural-dependencies, spacy-direct and
// spacy-beam. Each reads one message and returns one circuit, written from the dependency
// parse, with no knowledge repository. Run with SOP_KNOWLEDGE_DIR unset:
//
//   env -u SOP_KNOWLEDGE_DIR node --test tests/spacy-syntax.test.mjs
//
// The parses below were recorded once from the pretrained parser, so the test needs neither
// Python nor a model. With SOP_NLU_SYNTAX_PYTHON and SOP_NLU_SYNTAX_MODEL set, the last test
// also runs the parser itself.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createReader, validateSyntax, parseCircuit, wordsOf} from '../lib/index.mjs'
import {neuralDependencies} from '../strategies/neural-dependencies/index.mjs'
import {spacyDirect, directCircuit} from '../strategies/spacy-direct/index.mjs'
import {spacyBeam, beamCircuit} from '../strategies/spacy-beam/index.mjs'

// Recorded parses: for each message the tokens [text, start, part of speech, tag, relation, head,
// lemma] of the greedy parse, and the parses of the beam [probability, "relation>head …"].
// spacy 3.8.16, core_web_trf 3.8.0
const recorded = {
  "move the blue box next to the red circle and make it bigger": {"tokens":[["move",0,"VERB","VB","ROOT",0,"move"],["the",5,"DET","DT","det",3,"the"],["blue",9,"ADJ","JJ","amod",3,"blue"],["box",14,"NOUN","NN","dobj",0,"box"],["next",18,"ADV","RB","advmod",3,"next"],["to",23,"ADP","IN","prep",4,"to"],["the",26,"DET","DT","det",8,"the"],["red",30,"ADJ","JJ","amod",8,"red"],["circle",34,"NOUN","NN","pobj",5,"circle"],["and",41,"CCONJ","CC","cc",0,"and"],["make",45,"VERB","VB","conj",0,"make"],["it",50,"PRON","PRP","nsubj",12,"it"],["bigger",53,"ADJ","JJR","ccomp",10,"big"]],"beam":[[0.8091,"ROOT>0 det>3 amod>3 dobj>0 advmod>3 prep>4 det>8 amod>8 pobj>5 cc>0 conj>0 nsubj>12 ccomp>10"],[0.163,"ROOT>0 det>3 amod>3 dobj>0 advmod>3 prep>4 det>8 amod>8 pobj>5 cc>3 conj>3 nsubj>12 ccomp>10"],[0.0252,"ROOT>0 det>3 amod>3 dobj>0 amod>3 prep>4 det>8 amod>8 pobj>5 cc>0 conj>0 nsubj>12 ccomp>10"]]},
  "make A blue and B green": {"tokens":[["make",0,"VERB","VB","ROOT",0,"make"],["A",5,"NOUN","NN","nsubj",2,"a"],["blue",7,"ADJ","JJ","ccomp",0,"blue"],["and",12,"CCONJ","CC","cc",2,"and"],["B",16,"NOUN","NN","nsubj",5,"b"],["green",18,"ADJ","JJ","conj",2,"green"]],"beam":[[0.8513,"ROOT>0 nsubj>2 ccomp>0 cc>2 nsubj>5 conj>2"],[0.1486,"ROOT>0 nsubj>2 ccomp>0 cc>2 conj>2 amod>4"],[0.0001,"ROOT>0 dobj>0 amod>1 cc>1 conj>1 amod>4"]]},
  "put the lamp two inches from the edge": {"tokens":[["put",0,"VERB","VB","ROOT",0,"put"],["the",4,"DET","DT","det",2,"the"],["lamp",8,"NOUN","NN","dobj",0,"lamp"],["two",13,"NUM","CD","nummod",4,"two"],["inches",17,"NOUN","NNS","npadvmod",5,"inch"],["from",24,"ADP","IN","prep",0,"from"],["the",29,"DET","DT","det",7,"the"],["edge",33,"NOUN","NN","pobj",5,"edge"]],"beam":[[0.6146,"ROOT>0 det>2 dobj>0 nummod>4 npadvmod>5 prep>0 det>7 pobj>5"],[0.2865,"ROOT>0 det>2 dobj>0 nummod>4 npadvmod>0 prep>4 det>7 pobj>5"],[0.0459,"ROOT>0 det>2 dobj>0 nummod>4 advmod>0 prep>4 det>7 pobj>5"]]},
  "put it near Ben but not behind Jo": {"tokens":[["put",0,"VERB","VB","ROOT",0,"put"],["it",4,"PRON","PRP","dobj",0,"it"],["near",7,"ADP","IN","prep",0,"near"],["Ben",12,"PROPN","NNP","pobj",2,"Ben"],["but",16,"CCONJ","CC","cc",2,"but"],["not",20,"PART","RB","conj",2,"not"],["behind",24,"ADP","IN","prep",5,"behind"],["Jo",31,"PROPN","NNP","pobj",6,"Jo"]],"beam":[[0.95,"ROOT>0 dobj>0 prep>0 pobj>2 cc>2 neg>4 prep>5 pobj>6"],[0.0352,"ROOT>0 dobj>0 prep>0 pobj>2 cc>2 neg>6 conj>2 pobj>6"],[0.011,"ROOT>0 dobj>0 prep>0 pobj>2 cc>2 conj>2 prep>5 pobj>6"]]},
  "I want to delete it": {"tokens":[["I",0,"PRON","PRP","nsubj",1,"I"],["want",2,"VERB","VBP","ROOT",1,"want"],["to",7,"PART","TO","aux",3,"to"],["delete",10,"VERB","VB","xcomp",1,"delete"],["it",17,"PRON","PRP","dobj",3,"it"]],"beam":[[0.9996,"nsubj>1 ROOT>1 aux>3 xcomp>1 dobj>3"],[0.0002,"nsubj>1 ROOT>1 aux>3 xcomp>1 dep>3"],[0.0001,"nsubj>1 ROOT>1 aux>3 xcomp>1 npadvmod>3"]]},
  "the box was moved by Ana": {"tokens":[["the",0,"DET","DT","det",1,"the"],["box",4,"NOUN","NN","nsubjpass",3,"box"],["was",8,"AUX","VBD","auxpass",3,"be"],["moved",12,"VERB","VBN","ROOT",3,"move"],["by",18,"ADP","IN","agent",3,"by"],["Ana",21,"PROPN","NNP","pobj",4,"Ana"]],"beam":[[0.9984,"det>1 nsubjpass>3 auxpass>3 ROOT>3 agent>3 pobj>4"],[0.0006,"det>1 nsubjpass>3 auxpass>3 ROOT>3 agent>3 pcomp>4"],[0.0004,"det>1 nsubjpass>3 auxpass>3 ROOT>3 prep>3 pobj>4"]]},
  "what colour is the castle?": {"tokens":[["what",0,"PRON","WP","det",1,"what"],["colour",5,"NOUN","NN","attr",2,"colour"],["is",12,"AUX","VBZ","ROOT",2,"be"],["the",15,"DET","DT","det",4,"the"],["castle",19,"NOUN","NN","nsubj",2,"castle"],["?",25,"PUNCT",".","punct",2,"?"]],"beam":[[0.9988,"det>1 attr>2 ROOT>2 det>4 nsubj>2 punct>2"],[0.0005,"det>1 pobj||prep>2 ROOT>2 det>4 nsubj>2 punct>2"],[0.0003,"det>1 attr>2 ROOT>2 det>4 dobj>2 punct>2"]]},
  "Could you move it?": {"tokens":[["Could",0,"AUX","MD","aux",2,"could"],["you",6,"PRON","PRP","nsubj",2,"you"],["move",10,"VERB","VB","ROOT",2,"move"],["it",15,"PRON","PRP","dobj",2,"it"],["?",17,"PUNCT",".","punct",2,"?"]],"beam":[[0.9998,"aux>2 nsubj>2 ROOT>2 dobj>2 punct>2"],[0.0001,"aux>2 dative>2 ROOT>2 dobj>2 punct>2"],[0.0001,"aux>2 nsubj>2 ROOT>2 punct>2 punct>2"]]},
  "do not move it, please": {"tokens":[["do",0,"AUX","VB","aux",2,"do"],["not",3,"PART","RB","neg",2,"not"],["move",7,"VERB","VB","ROOT",2,"move"],["it",12,"PRON","PRP","dobj",2,"it"],[",",14,"PUNCT",",","punct",2,","],["please",16,"INTJ","UH","intj",2,"please"]],"beam":[[0.9937,"aux>2 neg>2 ROOT>2 dobj>2 punct>2 intj>2"],[0.0021,"aux>2 neg>2 ROOT>2 dobj>2 punct>2 npadvmod>2"],[0.0015,"aux>2 neg>2 ROOT>2 dobj>2 punct>2 advmod>2"]]},
  "to fix the details, edit the members": {"tokens":[["to",0,"PART","TO","aux",1,"to"],["fix",3,"VERB","VB","advcl",5,"fix"],["the",7,"DET","DT","det",3,"the"],["details",11,"NOUN","NNS","dobj",1,"detail"],[",",18,"PUNCT",",","punct",5,","],["edit",20,"VERB","VB","ROOT",5,"edit"],["the",25,"DET","DT","det",7,"the"],["members",29,"NOUN","NNS","dobj",5,"member"]],"beam":[[1,"aux>1 advcl>5 det>3 dobj>1 punct>5 ROOT>5 det>7 dobj>5"]]},
  "move the box, and thanks": {"tokens":[["move",0,"VERB","VB","ROOT",0,"move"],["the",5,"DET","DT","det",2,"the"],["box",9,"NOUN","NN","dobj",0,"box"],[",",12,"PUNCT",",","punct",0,","],["and",14,"CCONJ","CC","cc",0,"and"],["thanks",18,"NOUN","NNS","conj",0,"thank"]],"beam":[[0.74,"ROOT>0 det>2 dobj>0 punct>0 cc>0 conj>0"],[0.1716,"ROOT>0 det>2 dobj>0 punct>0 cc>0 dep>4"],[0.0691,"ROOT>0 det>2 dobj>0 punct>2 cc>0 conj>0"]]},
  "pie radius smaller": {"tokens":[["pie",0,"NOUN","NN","compound",1,"pie"],["radius",4,"NOUN","NN","ROOT",1,"radius"],["smaller",11,"ADJ","JJR","amod",1,"small"]],"beam":[[0.6953,"compound>1 ROOT>1 amod>1"],[0.2729,"compound>1 ROOT>1 appos>1"],[0.0157,"compound>1 ROOT>1 advmod>1"]]},
  "a bird facing left": {"tokens":[["a",0,"DET","DT","det",1,"a"],["bird",2,"NOUN","NN","ROOT",1,"bird"],["facing",7,"VERB","VBG","acl",1,"face"],["left",14,"ADV","RB","advmod",2,"left"]],"beam":[[0.9248,"det>1 ROOT>1 acl>1 advmod>2"],[0.0597,"det>1 ROOT>1 acl>1 npadvmod>2"],[0.0099,"det>1 ROOT>1 advcl>1 advmod>2"]]},
  "give the avatar a hat": {"tokens":[["give",0,"VERB","VB","ROOT",0,"give"],["the",5,"DET","DT","det",2,"the"],["avatar",9,"NOUN","NN","dative",0,"avatar"],["a",16,"DET","DT","det",4,"a"],["hat",18,"NOUN","NN","dobj",0,"hat"]],"beam":[[0.4063,"ROOT>0 det>2 dative>0 det>4 appos>2"],[0.2541,"ROOT>0 det>2 dative>0 det>4 dobj>0"],[0.2393,"ROOT>0 det>2 dative>0 det>4 dobj>2"]]},
  "the title is too long": {"tokens":[["the",0,"DET","DT","det",1,"the"],["title",4,"NOUN","NN","nsubj",2,"title"],["is",10,"AUX","VBZ","ROOT",2,"be"],["too",13,"ADV","RB","advmod",4,"too"],["long",17,"ADJ","JJ","acomp",2,"long"]],"beam":[[0.9996,"det>1 nsubj>2 ROOT>2 advmod>4 acomp>2"],[0.0002,"det>1 nsubj>2 ROOT>2 advmod>4 attr>2"],[0.0002,"det>1 nsubj>2 ROOT>2 advmod>4 advmod>2"]]},
  "where is it?": {"tokens":[["where",0,"SCONJ","WRB","advmod",1,"where"],["is",6,"AUX","VBZ","ROOT",1,"be"],["it",9,"PRON","PRP","nsubj",1,"it"],["?",11,"PUNCT",".","punct",1,"?"]],"beam":[[0.9971,"advmod>1 ROOT>1 nsubj>1 punct>1"],[0.0021,"attr>1 ROOT>1 nsubj>1 punct>1"],[0.0004,"expl>1 ROOT>1 nsubj>1 punct>1"]]},
  "Thanks!": {"tokens":[["Thanks",0,"NOUN","NNS","ROOT",0,"thank"],["!",6,"PUNCT",".","punct",0,"!"]],"beam":[[1,"ROOT>0 punct>0"]]},
  "move it if it fits": {"tokens":[["move",0,"VERB","VB","ROOT",0,"move"],["it",5,"PRON","PRP","dobj",0,"it"],["if",8,"SCONJ","IN","mark",4,"if"],["it",11,"PRON","PRP","nsubj",4,"it"],["fits",14,"VERB","VBZ","advcl",0,"fit"]],"beam":[[0.7354,"ROOT>0 dobj>0 mark>4 nsubj>4 advcl>0"],[0.0007,"ROOT>0 dobj>0 mark>4 nsubj>4 ccomp>0"]]},
  "point me to the Publish oval's position": {"tokens":[["point",0,"VERB","VB","ROOT",0,"point"],["me",6,"PRON","PRP","dobj",0,"I"],["to",9,"ADP","IN","prep",0,"to"],["the",12,"DET","DT","det",5,"the"],["Publish",16,"ADJ","JJ","compound",5,"publish"],["oval",24,"NOUN","NN","poss",7,"oval"],["'s",28,"PART","POS","case",5,"'s"],["position",31,"NOUN","NN","pobj",2,"position"]],"beam":[[0.5452,"ROOT>0 dobj>0 prep>0 det>5 compound>5 poss>7 case>5 pobj>2"],[0.4473,"ROOT>0 dobj>0 prep>0 det>5 amod>5 poss>7 case>5 pobj>2"],[0.0013,"ROOT>0 dobj>0 prep>0 det>5 compound>5 nmod>7 case>5 pobj>2"]]},
  "how many groups have I made?": {"tokens":[["how",0,"SCONJ","WRB","advmod",1,"how"],["many",4,"ADJ","JJ","amod",2,"many"],["groups",9,"NOUN","NNS","dobj",5,"group"],["have",16,"AUX","VBP","aux",5,"have"],["I",21,"PRON","PRP","nsubj",5,"I"],["made",23,"VERB","VBN","ROOT",5,"make"],["?",27,"PUNCT",".","punct",5,"?"]],"beam":[[0.9892,"advmod>1 amod>2 dobj>5 aux>5 nsubj>5 ROOT>5 punct>5"],[0.005,"advmod>1 amod>2 dep>5 aux>5 nsubj>5 ROOT>5 punct>5"],[0.0021,"advmod>1 amod>2 oprd>5 aux>5 nsubj>5 ROOT>5 punct>5"]]},
  "add a heading called Newsletter; then create a paragraph saying \"We will review the draft tomorrow.\"": {"tokens":[["add",0,"VERB","VB","advcl",7,"add"],["a",4,"DET","DT","det",2,"a"],["heading",6,"NOUN","NN","dobj",0,"heading"],["called",14,"VERB","VBN","acl",2,"call"],["Newsletter",21,"NOUN","NN","oprd",3,"newsletter"],[";",31,"PUNCT",":","punct",7,";"],["then",33,"ADV","RB","advmod",7,"then"],["create",38,"VERB","VB","ROOT",7,"create"],["a",45,"DET","DT","det",9,"a"],["paragraph",47,"NOUN","NN","dobj",7,"paragraph"],["saying",57,"VERB","VBG","acl",9,"say"],["\"",64,"PUNCT","``","punct",10,"\""],["We",65,"PRON","PRP","nsubj",14,"we"],["will",68,"AUX","MD","aux",14,"will"],["review",73,"VERB","VB","ccomp",10,"review"],["the",80,"DET","DT","det",16,"the"],["draft",84,"NOUN","NN","dobj",14,"draft"],["tomorrow",90,"NOUN","NN","npadvmod",14,"tomorrow"],[".",98,"PUNCT",".","punct",7,"."],["\"",99,"PUNCT","''","punct",7,"\""]],"beam":[[0.3568,"advcl>7 det>2 dobj>0 acl>2 oprd>3 punct>7 advmod>7 ROOT>7 det>9 dobj>7 acl>9 punct>10 nsubj>14 aux>14 ccomp>10 det>16 dobj>14 npadvmod>14 punct>7 punct>7"],[0.0341,"ccomp>7 det>2 dobj>0 acl>2 oprd>3 punct>7 advmod>7 ROOT>7 det>9 dobj>7 acl>9 punct>10 nsubj>14 aux>14 ccomp>10 det>16 dobj>14 npadvmod>14 punct>7 punct>7"],[0.0184,"advcl>7 det>2 dobj>0 acl>2 oprd>3 punct>2 advmod>7 ROOT>7 det>9 dobj>7 acl>9 punct>10 nsubj>14 aux>14 ccomp>10 det>16 dobj>14 npadvmod>14 punct>7 punct>7"]]},
  "the gaps are uneven, distribute each round node from top to bottom": {"tokens":[["the",0,"DET","DT","det",1,"the"],["gaps",4,"NOUN","NNS","nsubj",2,"gap"],["are",9,"AUX","VBP","ccomp",5,"be"],["uneven",13,"ADJ","JJ","acomp",2,"uneven"],[",",19,"PUNCT",",","punct",5,","],["distribute",21,"VERB","VB","ROOT",5,"distribute"],["each",32,"DET","DT","det",8,"each"],["round",37,"NOUN","NN","compound",8,"round"],["node",43,"NOUN","NN","dobj",5,"node"],["from",48,"ADP","IN","prep",5,"from"],["top",53,"NOUN","NN","pobj",9,"top"],["to",57,"ADP","IN","prep",5,"to"],["bottom",60,"NOUN","NN","pobj",11,"bottom"]],"beam":[[1,"det>1 nsubj>2 ccomp>5 acomp>2 punct>5 ROOT>5 det>8 compound>8 dobj>5 prep>5 pobj>9 prep>5 pobj>11"]]},
  "I'd like the marker outlines thick on the order scatter": {"tokens":[["I",0,"PRON","PRP","nsubj",2,"I"],["'d",1,"AUX","MD","aux",2,"would"],["like",4,"VERB","VB","ROOT",2,"like"],["the",9,"DET","DT","det",5,"the"],["marker",13,"NOUN","NN","compound",5,"marker"],["outlines",20,"NOUN","NNS","dobj",2,"outline"],["thick",29,"ADJ","JJ","amod",5,"thick"],["on",35,"ADP","IN","prep",6,"on"],["the",38,"DET","DT","det",10,"the"],["order",42,"NOUN","NN","compound",10,"order"],["scatter",48,"NOUN","NN","pobj",7,"scatter"]],"beam":[[0.5827,"nsubj>2 aux>2 ROOT>2 det>5 compound>5 dobj>2 amod>5 prep>5 det>10 compound>10 pobj>7"],[0.3455,"nsubj>2 aux>2 ROOT>2 det>5 compound>5 dobj>2 amod>5 prep>6 det>10 compound>10 pobj>7"],[0.0451,"nsubj>2 aux>2 ROOT>2 det>5 compound>5 dobj>2 advmod>5 prep>5 det>10 compound>10 pobj>7"]]},
  "make the x-axis label bold": {"tokens":[["make",0,"VERB","VB","ROOT",0,"make"],["the",5,"DET","DT","det",5,"the"],["x",9,"NOUN","NN","compound",5,"x"],["-",10,"NOUN","NN","compound",5,"-"],["axis",11,"NOUN","NN","compound",5,"axis"],["label",16,"NOUN","NN","nsubj",6,"label"],["bold",22,"ADJ","JJ","ccomp",0,"bold"]],"beam":[[0.9768,"ROOT>0 det>5 compound>5 compound>5 compound>5 nsubj>6 ccomp>0"],[0.0125,"ROOT>0 det>5 compound>5 compound>4 compound>5 nsubj>6 ccomp>0"],[0.0086,"ROOT>0 det>5 compound>5 punct>5 compound>5 nsubj>6 ccomp>0"]]},
  "put the box on the box": {"tokens":[["put",0,"VERB","VB","ROOT",0,"put"],["the",4,"DET","DT","det",2,"the"],["box",8,"NOUN","NN","dobj",0,"box"],["on",12,"ADP","IN","prep",0,"on"],["the",15,"DET","DT","det",5,"the"],["box",19,"NOUN","NN","pobj",3,"box"]],"beam":[[0.9999,"ROOT>0 det>2 dobj>0 prep>0 det>5 pobj>3"],[0.0001,"ROOT>0 det>2 dobj>0 dative>0 det>5 pobj>3"]]},
  "how about a painting": {"tokens":[["how",0,"SCONJ","WRB","advmod",3,"how"],["about",4,"SCONJ","IN","mark",3,"about"],["a",10,"DET","DT","det",3,"a"],["painting",12,"NOUN","NN","ROOT",3,"painting"]],"beam":[[0.9254,"advmod>1 ROOT>1 det>3 pobj>1"],[0.0746,"advmod>1 ROOT>1 det>3 nsubj>1"]]}
}

// ---------------------------------------------------------------------------------------------
// The recorded parser, and how a circuit is read back
// ---------------------------------------------------------------------------------------------

const tokensOf = text => {
  if (!recorded[text]) throw new Error('No recorded parse for: ' + text)
  return recorded[text].tokens.map(([word, start, pos, tag, dep, head, lemma], i) => ({i, text: word, start, end: start + word.length, pos, tag, dep, head, lemma}))
}
const beamOf = text => {
  const tokens = tokensOf(text)
  const alternatives = recorded[text].beam.map(([score, arcs]) => ({score,
    tokens: arcs.split(' ').map((arc, i) => ({...tokens[i], dep: arc.split('>')[0], head: Number(arc.split('>')[1])}))}))
  return {tokens, alternatives}
}
/** A dependency provider that replays the recorded parses: no Python, no model. */
const replay = {async open() {
  return {metadata: {library: 'recorded'}, parse: async text => tokensOf(text), parseBeam: async text => beamOf(text), close: async () => {}}
}}
const strategies = [neuralDependencies, spacyDirect, spacyBeam]
const messages = Object.keys(recorded)

/** The wires of a circuit: {id, type, form, words(key) → [text], refs(key) → [wire]}. */
function read(sop) {
  const byId = new Map()
  const wires = parseCircuit(sop).map(wire => {
    const values = key => wire.slots.filter(slot => slot[0] === key).map(slot => slot[1])
    return {id: wire.id, type: wire.type.slice('syntax.'.length), form: values('form')[0], attachment: values('attachment')[0],
      words: key => values(key).map(value => JSON.parse(value)), refs: key => values(key).map(value => byId.get(value.slice(1)))}
  })
  for (const wire of wires) byId.set(wire.id, wire)
  const of = type => wires.filter(wire => wire.type === type)
  return {
    wires, clauses: of('clause'), nominals: of('nominal'), relations: of('relation'), coordinations: of('coordination'),
    clause: verb => of('clause').find(wire => wire.words('verb')[0] === verb),
    nominal: head => of('nominal').find(wire => wire.words('head')[0] === head),
    relation: marker => of('relation').find(wire => wire.words('marker')[0] === marker)
  }
}
async function circuits(strategy, texts, options = {}) {
  const reader = await createReader({strategy, syntaxModel: replay, ...options})
  try {
    const out = new Map()
    for (const text of texts) out.set(text, await reader.propose(text))
    return out
  } finally {
    await reader.close()
  }
}

// ---------------------------------------------------------------------------------------------
// Every strategy returns one valid circuit, with no knowledge repository
// ---------------------------------------------------------------------------------------------

test('the dependency strategies are run with no knowledge repository', () => {
  assert.equal(process.env.SOP_KNOWLEDGE_DIR, undefined, 'run this test with SOP_KNOWLEDGE_DIR unset')
  assert.ok(messages.length >= 12)
  for (const strategy of strategies) assert.equal(strategy.schema, 'syntax', strategy.name)
  assert.deepEqual(strategies.map(strategy => strategy.name), ['neural-dependencies', 'spacy-direct', 'spacy-beam'])
})

for (const strategy of strategies) {
  test(`${strategy.name} returns one valid syntax circuit for each of ${messages.length} messages`, async () => {
    const results = await circuits(strategy, messages)
    for (const [text, result] of results) {
      assert.equal(result.engine, strategy.name)
      assert.equal(result.schema, 'syntax')
      assert.equal(result.error, null, text)
      assert.equal(result.candidates.length, 1, text)
      assert.deepEqual(result.rejected, [], text)
      const [{sop, check}] = result.candidates
      assert.equal(check.valid, true, text)
      // checked again here, by the contract alone: every word once, punctuation in no wire
      const again = validateSyntax(text, sop)
      assert.deepEqual(again.findings, [], text)
      assert.equal(again.placements.reduce((sum, place) => sum + place.last - place.first + 1, 0), wordsOf(text).length, text)
      assert.doesNotMatch(sop, /\bnlu\.|w\.request/u, text)
      assert.ok(sop.split('\n').every(line => /^@[a-z]\d+ syntax\.(?:clause|nominal|relation|coordination) /u.test(line)), sop)
    }
  })

  test(`${strategy.name} writes what the parse shows: clauses, nominals, relations, coordinations`, async () => {
    const results = await circuits(strategy, messages)
    const of = text => read(results.get(text).candidates[0].sop)

    // two commands joined by "and"; "next to" is one marker; "bigger" modifies the clause of "make"
    let c = of('move the blue box next to the red circle and make it bigger')
    assert.deepEqual(c.clauses.map(wire => [wire.form, wire.words('verb')[0]]), [['imperative', 'move'], ['imperative', 'make']])
    assert.deepEqual(c.coordinations[0].refs('conjunct'), [c.clause('move'), c.clause('make')])
    assert.deepEqual(c.coordinations[0].words('conjunction'), ['and'])
    assert.deepEqual(c.nominal('box').words('dependent'), ['the', 'blue'])
    assert.deepEqual(c.clause('move').refs('complement'), [c.nominal('box')])
    assert.equal(c.relation('next to').refs('to')[0], c.nominal('circle'))
    assert.deepEqual(c.clause('make').words('modifier'), ['bigger'])
    assert.deepEqual(c.clause('make').refs('complement'), [c.nominal('it')])

    // Rule 3: the second pair shares the verb of the first
    c = of('make A blue and B green')
    const [shared] = c.clauses.filter(wire => wire.form === 'fragment')
    assert.deepEqual(shared.refs('ellipsis'), [c.clause('make')])
    assert.deepEqual([shared.words('modifier'), shared.refs('complement')], [['green'], [c.nominal('B')]])
    assert.deepEqual([c.clause('make').words('modifier'), c.clause('make').refs('complement')], [['blue'], [c.nominal('A')]])
    assert.deepEqual(c.coordinations[0].refs('conjunct'), [c.clause('make'), shared])

    // Rule 4: the measure is a complement and the relation starts at it
    c = of('put the lamp two inches from the edge')
    assert.deepEqual(c.clause('put').refs('complement'), [c.nominal('lamp'), c.nominal('inches')])
    assert.deepEqual(c.nominal('inches').words('dependent'), ['two'])
    assert.deepEqual([c.relation('from').refs('from')[0], c.relation('from').refs('to')[0]], [c.nominal('inches'), c.nominal('edge')])

    // two relations joined by "but"; "not" negates the second only
    c = of('put it near Ben but not behind Jo')
    assert.deepEqual(c.coordinations[0].refs('conjunct'), [c.relation('near'), c.relation('behind')])
    assert.deepEqual(c.coordinations[0].words('conjunction'), ['but'])
    assert.deepEqual([c.relation('near').words('negation'), c.relation('behind').words('negation')], [[], ['not']])
    assert.deepEqual(c.clause('put').words('negation'), [])
    assert.equal(c.relation('behind').refs('from')[0], c.clause('put'))

    // Rule 5: the "to" of an infinitive marks the relation to the nonfinite clause
    c = of('I want to delete it')
    assert.deepEqual([c.clause('want').form, c.clause('delete').form], ['declarative', 'nonfinite'])
    assert.deepEqual([c.relation('to').refs('from')[0], c.relation('to').refs('to')[0]], [c.clause('want'), c.clause('delete')])
    assert.deepEqual(c.clause('want').refs('subject'), [c.nominal('I')])
    c = of('to fix the details, edit the members')
    assert.deepEqual([c.relation('to').refs('from')[0], c.relation('to').refs('to')[0]], [c.clause('edit'), c.clause('fix')])
    assert.deepEqual([c.clause('edit').form, c.clause('fix').form], ['imperative', 'nonfinite'])

    // the grammatical subject, the auxiliary, and the agent as the end of a relation marked "by"
    c = of('the box was moved by Ana')
    assert.deepEqual([c.clause('moved').form, c.clause('moved').words('auxiliary'), c.clause('moved').refs('subject')], ['declarative', ['was'], [c.nominal('box')]])
    assert.deepEqual([c.relation('by').refs('from')[0], c.relation('by').refs('to')[0]], [c.clause('moved'), c.nominal('Ana')])

    // a question word stands where its grammar puts it
    c = of('what colour is the castle?')
    assert.equal(c.clause('is').form, 'interrogative')
    assert.deepEqual(c.nominal('colour').words('dependent'), ['what'])
    assert.deepEqual([c.clause('is').refs('complement'), c.clause('is').refs('subject')], [[c.nominal('colour')], [c.nominal('castle')]])
    c = of('where is it?')
    assert.deepEqual([c.clause('is').form, c.clause('is').words('modifier'), c.clause('is').refs('subject')], ['interrogative', ['where'], [c.nominal('it')]])
    c = of('how many groups have I made?')
    assert.deepEqual(c.nominal('groups').words('dependent'), ['how', 'many'])
    assert.deepEqual([c.clause('made').form, c.clause('made').words('auxiliary')], ['interrogative', ['have']])
    c = of('Could you move it?')
    assert.deepEqual([c.clause('move').form, c.clause('move').words('auxiliary'), c.clause('move').refs('subject'), c.clause('move').refs('complement')],
      ['interrogative', ['Could'], [c.nominal('you')], [c.nominal('it')]])

    // negation and discourse have their own keys
    c = of('do not move it, please')
    assert.deepEqual([c.clause('move').form, c.clause('move').words('auxiliary'), c.clause('move').words('negation'), c.clause('move').words('discourse')],
      ['imperative', ['do'], ['not'], ['please']])

    // a word of thanks is discourse and shares no verb
    c = of('move the box, and thanks')
    const [thanks] = c.clauses.filter(wire => wire.form === 'fragment')
    assert.deepEqual([thanks.words('discourse'), thanks.refs('ellipsis'), thanks.refs('complement')], [['thanks'], [], []])
    assert.deepEqual(c.coordinations[0].refs('conjunct'), [c.clause('move'), thanks])
    c = of('Thanks!')
    assert.deepEqual(c.wires.map(wire => [wire.type, wire.form, wire.words('discourse')]), [['clause', 'fragment', ['Thanks']]])

    // a fragment has no verb; its nominal is a complement, the word after it a modifier
    c = of('pie radius smaller')
    assert.deepEqual(c.clauses.map(wire => [wire.form, wire.words('verb'), wire.words('modifier')]), [['fragment', [], ['smaller']]])
    assert.deepEqual([c.nominal('radius').words('dependent'), c.clauses[0].refs('complement')], [['pie'], [c.nominal('radius')]])

    // a participle that describes a nominal: a nonfinite clause, tied with no marker
    c = of('a bird facing left')
    assert.deepEqual([c.clause('facing').form, c.clause('facing').words('modifier')], ['nonfinite', ['left']])
    const [tie] = c.relations
    assert.deepEqual([tie.words('marker'), tie.refs('from')[0], tie.refs('to')[0]], [[], c.nominal('bird'), c.clause('facing')])

    // two complements, no roles
    c = of('give the avatar a hat')
    assert.deepEqual(c.clause('give').refs('complement'), [c.nominal('avatar'), c.nominal('hat')])
    assert.deepEqual(c.relations, [])

    c = of('the title is too long')
    assert.deepEqual([c.clause('is').form, c.clause('is').words('modifier'), c.clause('is').refs('subject')], ['declarative', ['too', 'long'], [c.nominal('title')]])

    // a subordinator and the possessive "'s" are markers
    c = of('move it if it fits')
    assert.deepEqual([c.relation('if').refs('from')[0], c.relation('if').refs('to')[0]], [c.clause('move'), c.clause('fits')])
    assert.equal(c.clause('fits').form, 'declarative')
    c = of("point me to the Publish oval's position")
    assert.deepEqual([c.relation("'s").refs('from')[0], c.relation("'s").refs('to')[0]], [c.nominal('position'), c.nominal('oval')])
    assert.deepEqual(c.nominal('oval').words('dependent'), ['the', 'Publish'])
    assert.equal(c.relation('to').refs('to')[0], c.nominal('position'))

    // a quotation is one nominal; a hyphenated compound is one value
    c = of('add a heading called Newsletter; then create a paragraph saying "We will review the draft tomorrow."')
    assert.ok(c.nominal('We will review the draft tomorrow'))
    assert.deepEqual(c.clause('saying').refs('complement'), [c.nominal('We will review the draft tomorrow')])
    assert.deepEqual([c.clause('called').form, c.clause('called').refs('complement')], ['nonfinite', [c.nominal('Newsletter')]])
    assert.equal(c.clause('review'), undefined)
    c = of('make the x-axis label bold')
    assert.deepEqual([c.nominal('label').words('dependent'), c.clause('make').words('modifier')], [['the', 'x-axis'], ['bold']])

    // a marker before a nominal that stands alone: the nominal ends a relation from the fragment
    c = of('how about a painting')
    assert.deepEqual([c.clauses[0].form, c.clauses[0].words('modifier'), c.clauses[0].refs('complement')], ['fragment', ['how'], []])
    assert.deepEqual([c.relation('about').refs('from')[0], c.relation('about').refs('to')[0]], [c.clauses[0], c.nominal('painting')])

    // Rule 1: repeated words are claimed in the order of the message
    const text = 'put the box on the box'
    const {placements} = validateSyntax(text, results.get(text).candidates[0].sop)
    const heads = placements.filter(place => place.key === 'head').map(place => place.first)
    assert.deepEqual(heads, [2, 5])
    c = of(text)
    assert.equal(c.clause('put').refs('complement')[0], c.nominals[0])
    assert.equal(c.relation('on').refs('to')[0], c.nominals[1])
  })
}

// ---------------------------------------------------------------------------------------------
// What each strategy adds to the plain parse
// ---------------------------------------------------------------------------------------------

test('neural-dependencies writes the parse as it stands; spacy-direct sets run-on clauses side by side', async () => {
  const statement = 'the gaps are uneven, distribute each round node from top to bottom'
  const sequence = 'add a heading called Newsletter; then create a paragraph saying "We will review the draft tomorrow."'
  const plain = await circuits(neuralDependencies, [statement, sequence])
  const direct = await circuits(spacyDirect, [statement, sequence])
  const between = (circuit, a, b) => circuit.relations.filter(wire => wire.refs('from')[0] === circuit.clause(a) && wire.refs('to')[0] === circuit.clause(b))

  // the parser hangs the statement on the command as its complement clause
  let c = read(plain.get(statement).candidates[0].sop)
  assert.equal(between(c, 'distribute', 'are').length, 1)
  assert.deepEqual(c.coordinations, [])
  // a statement before a command is no complement of it: two clauses side by side
  c = read(direct.get(statement).candidates[0].sop)
  assert.equal(between(c, 'distribute', 'are').length, 0)
  assert.deepEqual(c.coordinations.map(wire => wire.refs('conjunct')), [[c.clause('are'), c.clause('distribute')]])
  assert.deepEqual([c.clause('are').form, c.clause('distribute').form], ['declarative', 'imperative'])

  // across a semicolon: the plain parse subordinates, the corrected one coordinates, and "then" joins
  c = read(plain.get(sequence).candidates[0].sop)
  assert.equal(between(c, 'create', 'add').length, 1)
  assert.deepEqual(c.clause('create').words('modifier'), ['then'])
  c = read(direct.get(sequence).candidates[0].sop)
  assert.equal(between(c, 'create', 'add').length, 0)
  assert.deepEqual(c.coordinations.map(wire => [wire.refs('conjunct'), wire.words('conjunction')]), [[[c.clause('add'), c.clause('create')], ['then']]])
  assert.deepEqual(c.clause('create').words('modifier'), [])
})

test('spacy-beam leaves an attachment unsettled where the parses of the beam disagree', async () => {
  const text = "I'd like the marker outlines thick on the order scatter"
  const direct = read((await circuits(spacyDirect, [text])).get(text).candidates[0].sop)
  assert.equal(direct.relation('on').attachment, undefined)
  const result = (await circuits(spacyBeam, [text])).get(text)
  const beam = read(result.candidates[0].sop)
  assert.equal(beam.relation('on').attachment, 'ambiguous')
  // Rule 2: an unsettled relation starts at the clause
  assert.equal(beam.relation('on').refs('from')[0], beam.clause('like'))
  assert.equal(beam.relation('on').refs('to')[0], beam.nominal('scatter'))
  assert.equal(result.candidates[0].unsettled, 1)
  assert.equal(result.candidates[0].source, 'greedy')
  // where the beam agrees, nothing is marked: one circuit, the same as spacy-direct
  const settled = 'the box was moved by Ana'
  assert.equal((await circuits(spacyBeam, [settled])).get(settled).candidates[0].sop, (await circuits(spacyDirect, [settled])).get(settled).candidates[0].sop)
})

test('spacy-beam falls back on a parse of the beam when the greedy parse leaves words unplaced', async () => {
  const source = 'Add the box.'
  const lexical = [['Add', 0, 'VERB', 'VB'], ['the', 4, 'DET', 'DT'], ['box', 8, 'NOUN', 'NN'], ['.', 11, 'PUNCT', '.']]
  const parse = arcs => lexical.map(([text, start, pos, tag], i) => ({i, text, start, end: start + text.length, pos, tag, lemma: text.toLowerCase(), dep: arcs[i][0], head: arcs[i][1]}))
  // the greedy parse hangs the noun on the verb by a relation that gives a noun no place
  const greedy = parse([['ROOT', 0], ['det', 2], ['mark', 0], ['punct', 0]])
  const complete = parse([['ROOT', 0], ['det', 2], ['dobj', 0], ['punct', 0]])
  const provider = alternatives => ({async open() { return {metadata: {}, parseBeam: async () => ({tokens: greedy, alternatives}), parse: async () => greedy, close: async () => {}} }})
  const propose = async alternatives => {
    const reader = await createReader({strategy: spacyBeam, syntaxModel: provider(alternatives)})
    try { return await reader.propose(source) } finally { await reader.close() }
  }
  const fallback = await propose([{score: 0.3, tokens: greedy}, {score: 0.7, tokens: complete}])
  assert.equal(fallback.candidates.length, 1)
  assert.equal(fallback.candidates[0].source, 'beam')
  assert.equal(fallback.candidates[0].beamScore, 0.7)
  const c = read(fallback.candidates[0].sop)
  assert.deepEqual([c.clause('Add').form, c.clause('Add').refs('complement')], ['imperative', [c.nominal('box')]])
  // with no better parse the greedy one stands, still as one valid circuit that covers every word
  const alone = await propose([{score: 1, tokens: greedy}])
  assert.equal(alone.candidates.length, 1)
  assert.equal(alone.candidates[0].source, 'greedy')
  assert.deepEqual(alone.candidates[0].loose, ['box'])
  assert.equal(alone.candidates[0].check.valid, true)
  // direct access to the choice
  assert.equal(beamCircuit(source, greedy, [{score: 0.7, tokens: complete}]).source, 'beam')
  assert.equal(directCircuit(source, complete).sop, fallback.candidates[0].sop)
})

test('a failure of the parser is an error, never a circuit', async () => {
  const failing = {async open() { return {metadata: {}, parse: async () => { throw new Error('parser stopped') }, parseBeam: async () => { throw new Error('parser stopped') }, close: async () => {}} }}
  for (const strategy of strategies) {
    const reader = await createReader({strategy, syntaxModel: failing})
    const result = await reader.propose('move it')
    assert.deepEqual([result.candidates, result.error], [[], 'parser stopped'], strategy.name)
    const empty = await reader.propose('   ')
    assert.deepEqual(empty.candidates, [])
    // a message with no words gets no circuit
    const marks = await (await createReader({strategy, syntaxModel: {async open() {
      const tokens = [{i: 0, text: '?', start: 0, end: 1, pos: 'PUNCT', tag: '.', dep: 'ROOT', head: 0, lemma: '?'}]
      return {metadata: {}, parse: async () => tokens, parseBeam: async () => ({tokens, alternatives: []}), close: async () => {}}
    }}})).propose('?')
    assert.deepEqual([marks.candidates, marks.error], [[], 'The message has no words.'], strategy.name)
    await reader.close()
  }
  await assert.rejects(createReader({strategy: spacyBeam, syntaxModel: {async open() { return {metadata: {}, parse: async () => [], close: async () => {}} }}}), /requires a dependency backend with parseBeam/u)
})

test('the strategies read nothing outside this package and write no other schema', () => {
  const files = ['neural-dependencies/index.mjs', 'neural-dependencies/syntax-circuit.mjs', 'spacy-direct/index.mjs', 'spacy-direct/clause-repairs.mjs', 'spacy-beam/index.mjs']
  for (const file of files) {
    const source = readFileSync(new URL('../strategies/' + file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /knowledgeDir|sop-knowledge-worlds|SOP_KNOWLEDGE_DIR|check-analysis|schemaPaths|worldPaths/u, file)
    assert.doesNotMatch(source, /['"`]nlu\.|w\.request|project\.mjs|nominal-roles|predicate-attachments/u, file)
    for (const [, from] of source.matchAll(/^import .* from '([^']+)'/gmu)) {
      assert.match(from, /^(?:node:(?:child_process|readline|url)|\.\.\/\.\.\/lib\/syntax\.mjs|\.\.?\/(?:neural-dependencies|spacy-direct)\/[a-z-]+\.mjs|\.\/[a-z-]+\.mjs)$/u, `${file} imports ${from}`)
    }
  }
})

// ---------------------------------------------------------------------------------------------
// The local parser, when one is configured
// ---------------------------------------------------------------------------------------------

test('with the local spaCy model, each strategy returns a valid circuit for every message', {
  skip: !(process.env.SOP_NLU_SYNTAX_PYTHON && process.env.SOP_NLU_SYNTAX_MODEL) && 'Set SOP_NLU_SYNTAX_PYTHON and SOP_NLU_SYNTAX_MODEL to run the parser itself'
}, async () => {
  for (const strategy of strategies) {
    const reader = await createReader({strategy})
    try {
      for (const text of messages) {
        const result = await reader.propose(text)
        assert.equal(result.candidates.length, 1, `${strategy.name}: ${text}: ${result.error}`)
        assert.equal(result.candidates[0].check.valid, true)
      }
    } finally {
      await reader.close()
    }
  }
})
