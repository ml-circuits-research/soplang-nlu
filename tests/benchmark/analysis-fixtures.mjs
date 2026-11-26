// Independently authored expectations for the integrated nlu schema.
// A "$label" matches a reference to another node in the same expected graph.
export const fixtureVersion = 'nlu-breadth-v1'

const node = (type, label, slots) => ({type: 'nlu.' + type, label, slots})
const entity = (label, slots) => node('entity', label, slots)
const clause = (label, form, slots) => node('clause', label, {form, ...slots})
const relation = (label, cue, from, to, kind) => node('relation', label, {
  cue, from, to, ...(kind ? {kind} : {})
})
const conjunction = (label, cue, member, kinds) => node('coordination', label, {
  cue, member, ...(kinds ? {kind: {oneOf: kinds}} : {})
})
const example = (id, category, text, ...alternatives) => ({id, category, text, alternatives})

export const fixtures = [
  example('draw-circle', 'imperative', 'Draw a red circle.', [
    clause('c', 'imperative', {predicate: 'Draw', direct_object: '$circle', terminator: '.', subject: null}),
    entity('circle', {determiner: 'a', modifier: 'red', head: 'circle', color: 'red'})
  ]),
  example('result-colour', 'result complement', 'Make the circle blue.', [
    clause('c', 'imperative', {predicate: 'Make', direct_object: '$circle', result_complement: 'blue'}),
    entity('circle', {determiner: 'the', head: 'circle', modifier: null})
  ]),
  example('declarative-state', 'declarative', 'The circle looks red.', [
    clause('c', 'declarative', {subject: '$circle', predicate: 'looks', result_complement: 'red', direct_object: null}),
    entity('circle', {determiner: 'The', head: 'circle'})
  ]),
  example('declarative-place', 'declarative', 'The cat sat on the mat.', [
    clause('c', 'declarative', {subject: '$cat', predicate: 'sat', direct_object: null}),
    entity('cat', {head: 'cat', determiner: 'The'}), entity('mat', {head: 'mat', determiner: 'the'}),
    relation('r', 'on', '$c', '$mat')
  ]),
  example('where-question', 'interrogative', 'Where is the blue square?', [
    clause('c', 'interrogative', {question: 'Where', predicate: 'is', subject: '$square', terminator: '?'}),
    entity('square', {determiner: 'the', modifier: 'blue', head: 'square'})
  ]),
  example('yes-no-question', 'interrogative', 'Can you move the circle?', [
    clause('c', 'interrogative', {auxiliary: 'Can', subject: '$you', predicate: 'move', direct_object: '$circle', terminator: '?'}),
    entity('you', {pronoun: 'you'}), entity('circle', {head: 'circle', determiner: 'the'})
  ]),
  example('nothing-fragment', 'fragment', 'Nothing!', ...['head', 'pronoun'].map(key => [
    clause('c', 'fragment', {topic: '$topic', direct_object: null, subject: null, predicate: null, act: null, terminator: '!'}),
    entity('topic', {[key]: 'Nothing'})
  ])),
  example('nominal-fragment', 'fragment', 'The left circle.', [
    clause('c', 'fragment', {topic: '$circle', direct_object: null, subject: null, predicate: null}),
    entity('circle', {determiner: 'The', modifier: 'left', head: 'circle'})
  ]),
  example('scope-ambiguity', 'attachment ambiguity', 'Move the circle near the wall.', ...['$c', '$circle'].map(from => [
    clause('c', 'imperative', {predicate: 'Move', direct_object: '$circle'}),
    entity('circle', {head: 'circle'}), entity('wall', {head: 'wall'}),
    relation('r', 'near', from, '$wall')
  ])),
  example('qualifying-pp', 'noun attachment', 'The book on the desk fell.', [
    clause('c', 'declarative', {predicate: 'fell', subject: '$book'}),
    entity('book', {head: 'book'}), entity('desk', {head: 'desk'}),
    relation('r', 'on', '$book', '$desk')
  ]),
  example('temporal-pp', 'temporal', 'Move the chair after lunch.', [
    clause('c', 'imperative', {predicate: 'Move', direct_object: '$chair'}),
    entity('chair', {head: 'chair'}), entity('lunch', {head: 'lunch'}),
    relation('r', 'after', '$c', '$lunch')
  ]),
  example('temporal-adverb', 'adverb', 'Move the chair now.', [
    clause('c', 'imperative', {predicate: 'Move', direct_object: '$chair', adverb: 'now'}),
    entity('chair', {head: 'chair'})
  ]),
  example('manner-adverb', 'adverb', 'Slowly move the chair.', [
    clause('c', 'imperative', {predicate: 'move', direct_object: '$chair', adverb: 'Slowly'}),
    entity('chair', {head: 'chair'})
  ]),
  example('phrasal-particle', 'particle', 'Pick up the book.', [
    clause('c', 'imperative', {predicate: 'Pick', particle: 'up', direct_object: '$book'}),
    entity('book', {head: 'book'})
  ], [
    clause('c', 'imperative', {predicate: 'Pick up', direct_object: '$book', particle: null}),
    entity('book', {head: 'book'})
  ]),
  example('complement-clause', 'complement clause', 'I think the dog runs.', [
    clause('main', 'declarative', {predicate: 'think', subject: '$speaker', clausal_complement: '$embedded'}),
    entity('speaker', {pronoun: 'I'}),
    clause('embedded', 'declarative', {predicate: 'runs', subject: '$dog'}),
    entity('dog', {head: 'dog', determiner: 'the'})
  ]),
  example('comparison', 'comparison', 'Make the tower taller than the gate.', ...['$c', '$tower'].map(from => [
    clause('c', 'imperative', {predicate: 'Make', direct_object: '$tower', result_complement: 'taller'}),
    entity('tower', {head: 'tower'}), entity('gate', {head: 'gate'}),
    relation('r', 'than', from, '$gate')
  ])),
  example('negative-command', 'negation', 'Do not move the blue square.', [
    clause('c', 'imperative', {auxiliary: 'Do', negation: 'not', polarity: 'negative', predicate: 'move', direct_object: '$square'}),
    entity('square', {head: 'square', modifier: 'blue'})
  ]),
  example('negative-declarative', 'negation', 'It did not move.', [
    clause('c', 'declarative', {subject: '$it', auxiliary: 'did', negation: 'not', polarity: 'negative', predicate: 'move'}),
    entity('it', {pronoun: 'It'})
  ]),
  example('possessive', 'possessive', 'Paint its door green.', ...['determiner', 'modifier'].map(key => [
    clause('c', 'imperative', {predicate: 'Paint', direct_object: '$door', result_complement: 'green'}),
    entity('door', {head: 'door', [key]: 'its'})
  ])),
  example('unfamiliar-noun', 'unknown vocabulary', 'Draw a flurble.', [
    clause('c', 'imperative', {predicate: 'Draw', direct_object: '$thing'}),
    entity('thing', {head: 'flurble', kind: null})
  ], [
    clause('c', 'imperative', {predicate: 'Draw', direct_object: null, unresolved: {oneOf: ['a flurble', 'flurble']}})
  ]),
  example('unfamiliar-verb', 'unknown vocabulary', 'Glorp the circle.', [
    clause('c', 'imperative', {predicate: 'Glorp', act: null, direct_object: '$circle'}),
    entity('circle', {head: 'circle'})
  ], [
    clause('c', 'fragment', {predicate: null, act: null, unresolved: {includes: 'Glorp'}})
  ]),
  example('source-and-destination', 'proper names and direction', 'Move the cabinet from Paris to Zürich.', [
    clause('c', 'imperative', {predicate: 'Move', direct_object: '$box'}),
    entity('box', {head: 'cabinet'}), entity('paris', {name: 'Paris'}), entity('zurich', {name: 'Zürich'}),
    relation('source', 'from', '$c', '$paris'), relation('destination', 'to', '$c', '$zurich')
  ]),
  example('repeated-modifiers', 'repetitions', 'Put the red circle beside the red square.', ...['$c', '$circle'].map(from => [
    clause('c', 'imperative', {predicate: 'Put', direct_object: '$circle', terminator: '.'}),
    entity('circle', {head: 'circle', modifier: 'red', determiner: 'the'}),
    entity('square', {head: 'square', modifier: 'red', determiner: 'the'}),
    relation('r', 'beside', from, '$square')
  ])),
  example('repeat-same-noun', 'repetitions', 'Move the circle beside a circle.', ...['$c', '$moved'].map(from => [
    clause('c', 'imperative', {predicate: 'Move', direct_object: '$moved'}),
    entity('moved', {head: 'circle', determiner: 'the'}),
    entity('anchor', {head: 'circle', determiner: 'a'}),
    relation('r', 'beside', from, '$anchor')
  ])),
  example('clause-coordination', 'coordination', 'Open the door and close the window.', [
    clause('open', 'imperative', {predicate: 'Open', direct_object: '$door'}),
    clause('close', 'imperative', {predicate: 'close', direct_object: '$window'}),
    entity('door', {head: 'door'}), entity('window', {head: 'window'}),
    conjunction('join', 'and', ['$open', '$close'], ['and', 'additive', 'conjunctive'])
  ]),
  example('alternative-coordination', 'coordination', 'Draw a cat or a dog.', [
    clause('c', 'imperative', {predicate: 'Draw', direct_object: '$choice'}),
    entity('cat', {head: 'cat'}), entity('dog', {head: 'dog'}),
    conjunction('choice', 'or', ['$cat', '$dog'], ['or', 'alternative', 'disjunctive'])
  ]),
  example('coordinated-anchor', 'coordination', 'Put the box between the shelf and the wall.', [
    clause('c', 'imperative', {predicate: 'Put', direct_object: '$box'}),
    entity('box', {head: 'box'}), entity('shelf', {head: 'shelf'}), entity('wall', {head: 'wall'}),
    conjunction('pair', 'and', ['$shelf', '$wall'], ['and', 'additive', 'conjunctive']),
    relation('r', 'between', '$c', '$pair')
  ]),
  example('passive-agent', 'passive', 'They were moved by Ada.', [
    clause('c', 'declarative', {subject: '$they', auxiliary: 'were', predicate: 'moved', direct_object: null}),
    entity('they', {pronoun: 'They'}), entity('ada', {name: 'Ada'}),
    relation('r', 'by', '$c', '$ada', {oneOf: ['agent', 'passive_agent']})
  ]),
  example('indirect-object', 'ditransitive', 'Give Alice the red book.', [
    clause('c', 'imperative', {predicate: 'Give', indirect_object: '$alice', direct_object: '$book'}),
    entity('alice', {name: 'Alice'}), entity('book', {head: 'book', modifier: 'red'})
  ]),
  example('count-and-place', 'quantity', 'Place two red circles near the window.', ...['$c', '$circles'].map(from => [
    clause('c', 'imperative', {predicate: 'Place', direct_object: '$circles'}),
    entity('circles', {quantity: 'two', modifier: 'red', head: 'circles'}),
    entity('window', {head: 'window'}), relation('r', 'near', from, '$window')
  ])),
  example('separate-sentences', 'multiple clauses', 'Open the door. Close the window.', [
    clause('open', 'imperative', {predicate: 'Open', direct_object: '$door', terminator: '.'}),
    clause('close', 'imperative', {predicate: 'Close', direct_object: '$window', terminator: '.'}),
    entity('door', {head: 'door'}), entity('window', {head: 'window'})
  ])
]
