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
  "how about a painting": {"tokens":[["how",0,"SCONJ","WRB","advmod",3,"how"],["about",4,"SCONJ","IN","mark",3,"about"],["a",10,"DET","DT","det",3,"a"],["painting",12,"NOUN","NN","ROOT",3,"painting"]],"beam":[[0.9254,"advmod>1 ROOT>1 det>3 pobj>1"],[0.0746,"advmod>1 ROOT>1 det>3 nsubj>1"]]},
  "tell me where Verify is in the row": {"tokens":[["tell",0,"VERB","VB","ROOT",0,"tell"],["me",5,"PRON","PRP","dobj",0,"I"],["where",8,"SCONJ","WRB","advmod",4,"where"],["Verify",14,"PROPN","NNP","nsubj",4,"Verify"],["is",21,"AUX","VBZ","ccomp",0,"be"],["in",24,"ADP","IN","prep",4,"in"],["the",27,"DET","DT","det",7,"the"],["row",31,"NOUN","NN","pobj",5,"row"]],"beam":[[0.9141,"ROOT>0 dobj>0 advmod>4 nsubj>4 ccomp>0 prep>4 det>7 pobj>5"],[0.0011,"ROOT>0 dobj>0 advmod>4 nsubj>4 advcl>0 prep>4 det>7 pobj>5"],[0.0002,"ROOT>0 ccomp>0 advmod>4 nsubj>4 ccomp>0 prep>4 det>7 pobj>5"]]},
  "drop in a library, would you": {"tokens":[["drop",0,"VERB","VB","ROOT",0,"drop"],["in",5,"ADP","IN","prep",0,"in"],["a",8,"DET","DT","det",3,"a"],["library",10,"NOUN","NN","pobj",1,"library"],[",",17,"PUNCT",",","punct",5,","],["would",19,"AUX","MD","aux",0,"would"],["you",25,"PRON","PRP","nsubj",5,"you"]],"beam":[[0.6911,"ROOT>0 prep>0 det>3 pobj>1 punct>5 aux>0 nsubj>5"],[0.1214,"advcl>5 prep>0 det>3 pobj>1 punct>5 ROOT>5 nsubj>5"],[0.0912,"ccomp>5 prep>0 det>3 pobj>1 punct>5 ROOT>5 nsubj>5"]]},
  "put a plane on the board, would you": {"tokens":[["put",0,"VERB","VB","ccomp",7,"put"],["a",4,"DET","DT","det",2,"a"],["plane",6,"NOUN","NN","dobj",0,"plane"],["on",12,"ADP","IN","prep",0,"on"],["the",15,"DET","DT","det",5,"the"],["board",19,"NOUN","NN","pobj",3,"board"],[",",24,"PUNCT",",","punct",7,","],["would",26,"AUX","MD","ROOT",7,"would"],["you",32,"PRON","PRP","nsubj",7,"you"]],"beam":[[0.6662,"ROOT>0 det>2 dobj>0 prep>0 det>5 pobj>3 punct>7 ccomp>0 nsubj>7"],[0.233,"ccomp>7 det>2 dobj>0 prep>0 det>5 pobj>3 punct>7 ROOT>7 nsubj>7"],[0.0863,"advcl>7 det>2 dobj>0 prep>0 det>5 pobj>3 punct>7 ROOT>7 nsubj>7"]]},
  "one more thing: quick check — is anything overlapping the house?": {"tokens":[["one",0,"NUM","CD","nummod",2,"one"],["more",4,"ADJ","JJR","amod",2,"more"],["thing",9,"NOUN","NN","ROOT",2,"thing"],[":",14,"PUNCT",":","punct",2,":"],["quick",16,"ADJ","JJ","amod",5,"quick"],["check",22,"NOUN","NN","appos",2,"check"],["—",28,"PUNCT",":","punct",9,"—"],["is",30,"AUX","VBZ","aux",9,"be"],["anything",33,"PRON","NN","nsubj",9,"anything"],["overlapping",42,"VERB","VBG","acl",5,"overlap"],["the",54,"DET","DT","det",11,"the"],["house",58,"NOUN","NN","dobj",9,"house"],["?",63,"PUNCT",".","punct",2,"?"]],"beam":[[0.8447,"advmod>1 amod>2 ROOT>2 punct>2 amod>5 appos>2 punct>9 aux>9 nsubj>9 acl>5 det>11 dobj>9 punct>2"],[0.1,"advmod>1 amod>2 ROOT>2 punct>2 amod>5 appos>2 punct>9 aux>9 nsubj>9 acl>5 det>11 dobj>9 punct>5"],[0.0491,"advmod>1 amod>2 ROOT>2 punct>2 amod>5 appos>2 punct>9 aux>9 nsubj>9 acl>5 det>11 dobj>9 punct>9"]]},
  "a little black cat curled up near the bench, then make the shiny parts of the surfboard by the water clear pale blue and keep the rest of the object as it is, and the shape of the object does not change": {"tokens":[["a",0,"DET","DT","det",3,"a"],["little",2,"ADJ","JJ","amod",3,"little"],["black",9,"ADJ","JJ","amod",3,"black"],["cat",15,"NOUN","NN","nsubj",11,"cat"],["curled",19,"VERB","VBN","acl",3,"curl"],["up",26,"ADP","RP","prt",4,"up"],["near",29,"ADP","IN","prep",4,"near"],["the",34,"DET","DT","det",8,"the"],["bench",38,"NOUN","NN","pobj",6,"bench"],[",",43,"PUNCT",",","punct",11,","],["then",45,"ADV","RB","advmod",11,"then"],["make",50,"VERB","VB","ROOT",11,"make"],["the",55,"DET","DT","det",14,"the"],["shiny",59,"ADJ","JJ","amod",14,"shiny"],["parts",65,"NOUN","NNS","nsubj",21,"part"],["of",71,"ADP","IN","prep",14,"of"],["the",74,"DET","DT","det",17,"the"],["surfboard",78,"NOUN","NN","pobj",15,"surfboard"],["by",88,"ADP","IN","prep",14,"by"],["the",91,"DET","DT","det",20,"the"],["water",95,"NOUN","NN","pobj",18,"water"],["clear",101,"ADJ","JJ","amod",23,"clear"],["pale",107,"ADJ","JJ","amod",23,"pale"],["blue",112,"ADJ","JJ","oprd",11,"blue"],["and",117,"CCONJ","CC","cc",11,"and"],["keep",121,"VERB","VB","conj",11,"keep"],["the",126,"DET","DT","det",27,"the"],["rest",130,"NOUN","NN","dobj",25,"rest"],["of",135,"ADP","IN","prep",27,"of"],["the",138,"DET","DT","det",30,"the"],["object",142,"NOUN","NN","pobj",28,"object"],["as",149,"SCONJ","IN","mark",33,"as"],["it",152,"PRON","PRP","nsubj",33,"it"],["is",155,"AUX","VBZ","advcl",25,"be"],[",",157,"PUNCT",",","punct",11,","],["and",159,"CCONJ","CC","cc",11,"and"],["the",163,"DET","DT","det",37,"the"],["shape",167,"NOUN","NN","nsubj",43,"shape"],["of",173,"ADP","IN","prep",37,"of"],["the",176,"DET","DT","det",40,"the"],["object",180,"NOUN","NN","pobj",38,"object"],["does",187,"AUX","VBZ","aux",43,"do"],["not",192,"PART","RB","neg",43,"not"],["change",196,"VERB","VB","conj",11,"change"]],"beam":[[0.8995,"det>3 amod>3 amod>3 ROOT>3 acl>3 prt>4 prep>4 det>8 pobj>6 punct>11 advmod>11 conj>3 det>14 amod>14 nsubj>21 prep>14 det>17 pobj>15 prep>14 det>20 pobj>18 amod>23 amod>23 oprd>11 cc>11 conj>11 det>27 dobj>25 prep>27 det>30 pobj>28 mark>33 nsubj>33 advcl>25 punct>11 cc>11 det>37 nsubj>43 prep>37 det>40 pobj>38 aux>43 neg>43 conj>11"],[0.022,"det>3 amod>3 amod>3 ROOT>3 acl>3 prt>4 prep>4 det>8 pobj>6 punct>11 advmod>11 conj>3 det>14 amod>14 nsubj>21 prep>14 det>17 pobj>15 prep>17 det>20 pobj>18 amod>23 amod>23 oprd>11 cc>11 conj>11 det>27 dobj>25 prep>27 det>30 pobj>28 mark>33 nsubj>33 advcl>25 punct>11 cc>11 det>37 nsubj>43 prep>37 det>40 pobj>38 aux>43 neg>43 conj>11"],[0.0189,"det>3 amod>3 amod>3 ROOT>3 acl>3 prt>4 prep>5 det>8 pobj>6 punct>11 advmod>11 conj>3 det>14 amod>14 nsubj>21 prep>14 det>17 pobj>15 prep>14 det>20 pobj>18 amod>23 amod>23 oprd>11 cc>11 conj>11 det>27 dobj>25 prep>27 det>30 pobj>28 mark>33 nsubj>33 advcl>25 punct>11 cc>11 det>37 nsubj>43 prep>37 det>40 pobj>38 aux>43 neg>43 conj>11"]]},
  "I would like the avatar back to default, so please reset it and remember that for the next session.": {"tokens":[["I",0,"PRON","PRP","nsubj",2,"I"],["would",2,"AUX","MD","aux",2,"would"],["like",8,"VERB","VB","ROOT",2,"like"],["the",13,"DET","DT","det",4,"the"],["avatar",17,"NOUN","NN","nsubj",5,"avatar"],["back",24,"ADV","RB","ccomp",2,"back"],["to",29,"ADP","IN","prep",5,"to"],["default",32,"NOUN","NN","pobj",6,"default"],[",",39,"PUNCT",",","punct",2,","],["so",41,"CCONJ","CC","cc",2,"so"],["please",44,"INTJ","UH","intj",11,"please"],["reset",51,"VERB","VB","conj",2,"reset"],["it",57,"PRON","PRP","dobj",11,"it"],["and",60,"CCONJ","CC","cc",11,"and"],["remember",64,"VERB","VB","conj",11,"remember"],["that",73,"PRON","DT","dobj",14,"that"],["for",78,"ADP","IN","prep",14,"for"],["the",82,"DET","DT","det",19,"the"],["next",86,"ADJ","JJ","amod",19,"next"],["session",91,"NOUN","NN","pobj",16,"session"],[".",98,"PUNCT",".","punct",11,"."]],"beam":[[0.953,"nsubj>2 aux>2 ROOT>2 det>4 nsubj>5 ccomp>2 prep>5 pobj>6 punct>2 cc>2 intj>11 conj>2 dobj>11 cc>11 conj>11 dobj>14 prep>14 det>19 amod>19 pobj>16 punct>11"],[0.0369,"nsubj>2 aux>2 ROOT>2 det>4 nsubj>5 ccomp>2 prep>5 pobj>6 punct>2 cc>2 intj>11 conj>2 dobj>11 cc>11 conj>11 dobj>14 prep>14 det>19 amod>19 pobj>16 punct>14"],[0.0051,"nsubj>2 aux>2 ROOT>2 det>4 nsubj>5 advmod>2 prep>5 pobj>6 punct>2 cc>2 intj>11 conj>2 dobj>11 cc>11 conj>11 dobj>14 prep>14 det>19 amod>19 pobj>16 punct>11"]]},
  "connect a link from Start to Review": {"tokens":[["connect",0,"VERB","VB","ROOT",0,"connect"],["a",8,"DET","DT","det",2,"a"],["link",10,"NOUN","NN","dobj",0,"link"],["from",15,"ADP","IN","prep",2,"from"],["Start",20,"VERB","VB","pcomp",3,"start"],["to",26,"PART","TO","prep",4,"to"],["Review",29,"VERB","VB","pobj",5,"review"]],"beam":[[0.3731,"ROOT>0 det>2 dobj>0 prep>2 pcomp>3 prep>4 pobj>5"],[0.2227,"ROOT>0 det>2 dobj>0 prep>2 pobj>3 prep>4 pobj>5"],[0.1936,"ROOT>0 det>2 dobj>0 prep>2 pcomp>3 prep>4 pcomp>5"]]},
  "make Valid? a rounded rectangle": {"tokens":[["make",0,"VERB","VB","ROOT",0,"make"],["Valid",5,"ADJ","JJ","ccomp",0,"valid"],["?",10,"PUNCT",".","punct",1,"?"],["a",12,"DET","DT","det",5,"a"],["rounded",14,"ADJ","JJ","amod",5,"rounded"],["rectangle",22,"NOUN","NN","dobj",0,"rectangle"]],"beam":[[0.5805,"ROOT>0 ccomp>0 punct>1 det>5 amod>5 dep>1"],[0.0559,"ROOT>0 dep>0 punct>1 det>5 amod>5 dep>1"],[0.053,"ROOT>0 attr>0 punct>1 det>5 amod>5 dep>1"]]},
  "add a circle called Retry and connect Valid? to it": {"tokens":[["add",0,"VERB","VB","ROOT",0,"add"],["a",4,"DET","DT","det",2,"a"],["circle",6,"NOUN","NN","dobj",0,"circle"],["called",13,"VERB","VBN","acl",2,"call"],["Retry",20,"PROPN","NNP","oprd",3,"Retry"],["and",26,"CCONJ","CC","cc",0,"and"],["connect",30,"VERB","VB","conj",0,"connect"],["Valid",38,"PROPN","NNP","dobj",6,"Valid"],["?",43,"PUNCT",".","dobj",6,"?"],["to",45,"ADP","IN","prep",6,"to"],["it",48,"PRON","PRP","pobj",9,"it"]],"beam":[[0.5794,"ROOT>0 det>2 dobj>0 acl>2 oprd>3 cc>0 conj>0 dobj>6 punct>7 prep>6 pobj>9"],[0.2398,"ROOT>0 det>2 dobj>0 acl>2 oprd>3 cc>0 conj>0 dobj>6 dobj>7 prep>6 pobj>9"],[0.0951,"ROOT>0 det>2 dobj>0 acl>2 oprd>3 cc>0 conj>0 dep>6 punct>7 prep>6 pobj>9"]]},
  "dissolve Process": {"tokens":[["dissolve",0,"PROPN","NNP","compound",1,"dissolve"],["Process",9,"NOUN","NN","ROOT",1,"process"]],"beam":[[0.8429,"compound>1 ROOT>1"],[0.0898,"amod>1 ROOT>1"],[0.0512,"ROOT>0 dobj>0"]]},
  "update a pipe neck tiny": {"tokens":[["update",0,"VERB","VB","ROOT",0,"update"],["a",7,"DET","DT","det",4,"a"],["pipe",9,"NOUN","NN","compound",4,"pipe"],["neck",14,"NOUN","NN","compound",4,"neck"],["tiny",19,"ADJ","JJ","dobj",0,"tiny"]],"beam":[[0.7249,"ROOT>0 det>2 compound>3 ROOT>3 quantmod>3"],[0.2383,"ROOT>0 det>2 compound>3 ROOT>3 amod>3"],[0.0253,"ROOT>0 det>2 compound>3 compound>4 ROOT>4"]]},
  "group an object Plan Backup": {"tokens":[["group",0,"NOUN","NN","dep",4,"group"],["an",6,"DET","DT","det",2,"an"],["object",9,"NOUN","NN","appos",0,"object"],["Plan",16,"PROPN","NNP","compound",4,"Plan"],["Backup",21,"PROPN","NNP","ROOT",4,"Backup"]],"beam":[[0.8243,"dep>1 det>2 ROOT>2 compound>4 appos>2"],[0.173,"dep>1 det>2 ROOT>2 compound>4 ROOT>4"],[0.0025,"dep>1 det>2 ROOT>2 ROOT>3 appos>3"]]},
  "set r1 width 180 height 90": {"tokens":[["set",0,"VERB","VBN","amod",2,"set"],["r1",4,"NOUN","NN","compound",2,"r1"],["width",7,"NOUN","NN","ROOT",2,"width"],["180",13,"NUM","CD","nummod",4,"180"],["height",17,"NOUN","NN","appos",2,"height"],["90",24,"NUM","CD","nummod",4,"90"]],"beam":[[0.4162,"amod>1 compound>2 ROOT>2 nummod>4 appos>2 nummod>4"],[0.2127,"compound>1 compound>2 ROOT>2 nummod>4 appos>2 nummod>4"],[0.2105,"dep>1 compound>2 ROOT>2 nummod>4 appos>2 nummod>4"]]},
  "add a person Hub Core": {"tokens":[["add",0,"VERB","VB","ROOT",0,"add"],["a",4,"DET","DT","det",2,"a"],["person",6,"NOUN","NN","dobj",0,"person"],["Hub",13,"PROPN","NNP","compound",4,"Hub"],["Core",17,"PROPN","NNP","npadvmod",0,"Core"]],"beam":[[0.9486,"ROOT>0 det>2 dobj>0 compound>4 appos>2"],[0.0501,"ROOT>0 det>2 dobj>0 compound>4 npadvmod>2"],[0.0008,"ROOT>0 det>2 dobj>0 compound>4 ROOT>4"]]},
  "our rectangle 220 by 140": {"tokens":[["our",0,"PRON","PRP$","poss",1,"our"],["rectangle",4,"NOUN","NN","ROOT",1,"rectangle"],["220",14,"NUM","CD","quantmod",4,"220"],["by",18,"ADP","IN","quantmod",4,"by"],["140",21,"NUM","CD","appos",1,"140"]],"beam":[[0.9307,"poss>1 nsubj>2 nummod>3 ROOT>3 pobj>3"],[0.0424,"poss>1 nsubj>2 nummod>3 ROOT>3 nummod>3"],[0.0269,"poss>1 nsubj>2 dep>3 ROOT>3 pobj>3"]]},
  "a boy in the blue jacket just left of the woman in the green dress": {"tokens":[["a",0,"DET","DT","det",1,"a"],["boy",2,"NOUN","NN","ROOT",1,"boy"],["in",6,"ADP","IN","prep",1,"in"],["the",9,"DET","DT","det",5,"the"],["blue",13,"ADJ","JJ","amod",5,"blue"],["jacket",18,"NOUN","NN","pobj",2,"jacket"],["just",25,"ADV","RB","advmod",7,"just"],["left",30,"ADV","RB","advmod",1,"left"],["of",35,"ADP","IN","prep",1,"of"],["the",38,"DET","DT","det",10,"the"],["woman",42,"NOUN","NN","pobj",8,"woman"],["in",48,"ADP","IN","prep",10,"in"],["the",51,"DET","DT","det",14,"the"],["green",55,"ADJ","JJ","amod",14,"green"],["dress",61,"NOUN","NN","pobj",11,"dress"]],"beam":[[0.2651,"det>1 nsubj>7 prep>1 det>5 amod>5 pobj>2 advmod>7 ROOT>7 prep>7 det>10 pobj>8 prep>10 det>14 amod>14 pobj>11"],[0.1366,"det>1 ROOT>1 prep>1 det>5 amod>5 pobj>2 advmod>7 advmod>1 prep>1 det>10 pobj>8 prep>10 det>14 amod>14 pobj>11"],[0.095,"det>1 nsubj>7 prep>1 det>5 amod>5 pobj>2 advmod>7 ROOT>7 dep>7 det>10 pobj>8 prep>10 det>14 amod>14 pobj>11"]]},
  "Make a gazelle left of the hill.": {"tokens":[["Make",0,"VERB","VB","ROOT",0,"make"],["a",5,"DET","DT","det",2,"a"],["gazelle",7,"NOUN","NN","dobj",0,"gazelle"],["left",15,"VERB","VBN","ccomp",0,"leave"],["of",20,"ADP","IN","prep",3,"of"],["the",23,"DET","DT","det",6,"the"],["hill",27,"NOUN","NN","pobj",4,"hill"],[".",31,"PUNCT",".","punct",0,"."]],"beam":[[0.5327,"ROOT>0 det>2 dobj>0 relcl>2 prep>3 det>6 pobj>4 punct>3"],[0.1929,"ROOT>0 det>2 dobj>0 amod>2 prep>3 det>6 pobj>4 punct>3"],[0.1839,"ROOT>0 det>2 dobj>0 npadvmod>2 prep>3 det>6 pobj>4 punct>3"]]},
  "let's go linear on y axis scale": {"tokens":[["let",0,"VERB","VB","ROOT",0,"let"],["'s",3,"PRON","PRP","nsubj",2,"us"],["go",6,"VERB","VB","ccomp",0,"go"],["linear",9,"ADJ","JJ","acomp",2,"linear"],["on",16,"ADP","IN","prep",2,"on"],["y",19,"NOUN","NN","compound",6,"y"],["axis",21,"NOUN","NN","compound",7,"axis"],["scale",26,"NOUN","NN","pobj",4,"scale"]],"beam":[[0.5969,"ROOT>0 nsubj>2 ccomp>0 acomp>2 prep>2 compound>6 compound>7 pobj>4"],[0.2064,"ROOT>0 nsubj>2 ccomp>0 oprd>2 prep>2 compound>6 compound>7 pobj>4"],[0.1358,"ROOT>0 nsubj>2 ccomp>0 advmod>2 prep>2 compound>6 compound>7 pobj>4"]]},
  "place both cats at the left side, keeping everything else where it is": {"tokens":[["place",0,"VERB","VB","ROOT",0,"place"],["both",6,"DET","DT","det",2,"both"],["cats",11,"NOUN","NNS","dobj",0,"cat"],["at",16,"ADP","IN","prep",0,"at"],["the",19,"DET","DT","det",6,"the"],["left",23,"ADJ","JJ","amod",6,"left"],["side",28,"NOUN","NN","pobj",3,"side"],[",",32,"PUNCT",",","punct",0,","],["keeping",34,"VERB","VBG","advcl",0,"keep"],["everything",42,"PRON","NN","dobj",8,"everything"],["else",53,"ADJ","JJ","amod",9,"else"],["where",58,"SCONJ","WRB","advmod",13,"where"],["it",64,"PRON","PRP","nsubj",13,"it"],["is",67,"AUX","VBZ","relcl",9,"be"]],"beam":[[0.4921,"ROOT>0 det>2 dobj>0 prep>0 det>6 amod>6 pobj>3 punct>0 advcl>0 dobj>8 amod>9 advmod>13 nsubj>13 ccomp>8"],[0.151,"ROOT>0 det>2 dobj>0 prep>0 det>6 amod>6 pobj>3 punct>0 advcl>0 dobj>8 advmod>9 advmod>13 nsubj>13 ccomp>8"],[0.116,"ROOT>0 det>2 dobj>0 prep>0 det>6 amod>6 pobj>3 punct>0 advcl>0 dobj>8 amod>9 advmod>13 nsubj>13 relcl>9"]]},
  "From now on, data labels on.": {"tokens":[["From",0,"ADP","IN","prep",5,"from"],["now",5,"ADV","RB","advmod",2,"now"],["on",9,"ADV","RB","pcomp",0,"on"],[",",11,"PUNCT",",","punct",5,","],["data",13,"NOUN","NNS","compound",5,"datum"],["labels",18,"NOUN","NNS","ROOT",5,"label"],["on",25,"ADP","RP","prt",5,"on"],[".",27,"PUNCT",".","punct",5,"."]],"beam":[[0.6957,"prep>5 advmod>2 pcomp>0 punct>5 compound>5 ROOT>5 prt>5 punct>5"],[0.2887,"prep>5 advmod>2 pcomp>0 punct>5 compound>5 ROOT>5 advmod>5 punct>5"],[0.0075,"prep>5 pcomp>0 advmod>1 punct>5 compound>5 ROOT>5 prt>5 punct>5"]]},
  "the marker borders on Revenue trend should be thicker. flip the x axis": {"tokens":[["the",0,"DET","DT","det",1,"the"],["marker",4,"NOUN","NN","nsubj",2,"marker"],["borders",11,"NOUN","NNS","nsubj",7,"border"],["on",19,"ADP","IN","prep",2,"on"],["Revenue",22,"NOUN","NN","pobj",3,"revenue"],["trend",30,"NOUN","NN","appos",2,"trend"],["should",36,"AUX","MD","aux",7,"should"],["be",43,"AUX","VB","ROOT",7,"be"],["thicker",46,"ADJ","JJR","acomp",7,"thick"],[".",53,"PUNCT",".","punct",7,"."],["flip",55,"VERB","VB","ROOT",10,"flip"],["the",60,"DET","DT","det",13,"the"],["x",64,"NOUN","NN","compound",13,"x"],["axis",66,"NOUN","NN","dobj",10,"axis"]],"beam":[[0.3712,"det>1 nsubj>2 ccomp>10 prep>2 pobj>3 appos>4 aux>7 dep>2 acomp>7 punct>7 ROOT>10 det>13 compound>13 dobj>10"],[0.2743,"det>1 nsubj>2 ccomp>10 prep>2 pobj>3 appos>4 aux>7 acl>2 acomp>7 punct>7 ROOT>10 det>13 compound>13 dobj>10"],[0.1581,"det>1 nsubj>2 ROOT>2 prep>2 pobj>3 appos>4 aux>7 dep>2 acomp>7 punct>7 ROOT>10 det>13 compound>13 dobj>10"]]},
  "place one bird on the top of the tree, then one kite on top of it, then one cloud on top of the kite": {"tokens":[["place",0,"VERB","VB","ROOT",0,"place"],["one",6,"NUM","CD","nummod",2,"one"],["bird",10,"NOUN","NN","dobj",0,"bird"],["on",15,"ADP","IN","prep",0,"on"],["the",18,"DET","DT","det",5,"the"],["top",22,"NOUN","NN","pobj",3,"top"],["of",26,"ADP","IN","prep",5,"of"],["the",29,"DET","DT","det",8,"the"],["tree",33,"NOUN","NN","pobj",6,"tree"],[",",37,"PUNCT",",","punct",0,","],["then",39,"ADV","RB","advmod",12,"then"],["one",44,"NUM","CD","nummod",12,"one"],["kite",48,"NOUN","NN","dep",0,"kite"],["on",53,"ADP","IN","prep",12,"on"],["top",56,"NOUN","NN","pobj",13,"top"],["of",60,"ADP","IN","prep",14,"of"],["it",63,"PRON","PRP","pobj",15,"it"],[",",65,"PUNCT",",","punct",0,","],["then",67,"ADV","RB","advmod",20,"then"],["one",72,"NUM","CD","nummod",20,"one"],["cloud",76,"NOUN","NN","dep",0,"cloud"],["on",82,"ADP","IN","prep",20,"on"],["top",85,"NOUN","NN","pobj",21,"top"],["of",89,"ADP","IN","prep",22,"of"],["the",92,"DET","DT","det",25,"the"],["kite",96,"NOUN","NN","pobj",23,"kite"]],"beam":[[0.5435,"ROOT>0 nummod>2 dobj>0 prep>0 det>5 pobj>3 prep>5 det>8 pobj>6 punct>0 advmod>12 nummod>12 dep>0 prep>12 pobj>13 prep>14 pobj>15 punct>12 advmod>20 nummod>20 conj>12 prep>20 pobj>21 prep>22 det>25 pobj>23"],[0.4565,"ROOT>0 nummod>2 dobj>0 prep>0 det>5 pobj>3 prep>5 det>8 pobj>6 punct>0 advmod>12 nummod>12 dep>0 prep>12 pobj>13 prep>14 pobj>15 punct>0 advmod>20 nummod>20 dep>0 prep>20 pobj>21 prep>22 det>25 pobj>23"]]},
  "instead, a yellow column the same size between the two blue columns": {"tokens":[["instead",0,"ADV","RB","advmod",4,"instead"],[",",7,"PUNCT",",","punct",4,","],["a",9,"DET","DT","det",4,"a"],["yellow",11,"ADJ","JJ","amod",4,"yellow"],["column",18,"NOUN","NN","ROOT",4,"column"],["the",25,"DET","DT","det",7,"the"],["same",29,"ADJ","JJ","amod",7,"same"],["size",34,"NOUN","NN","appos",4,"size"],["between",39,"ADP","IN","prep",4,"between"],["the",47,"DET","DT","det",12,"the"],["two",51,"NUM","CD","nummod",12,"two"],["blue",55,"ADJ","JJ","amod",12,"blue"],["columns",60,"NOUN","NNS","pobj",8,"column"]],"beam":[[0.9839,"advmod>4 punct>4 det>4 amod>4 ROOT>4 det>7 amod>7 appos>4 prep>4 det>12 nummod>12 amod>12 pobj>8"],[0.0081,"advmod>4 punct>4 det>4 amod>4 ROOT>4 det>7 amod>7 npadvmod>4 prep>4 det>12 nummod>12 amod>12 pobj>8"],[0.0067,"advmod>4 punct>4 det>4 amod>4 ROOT>4 det>7 amod>7 appos>4 prep>4 det>12 amod>12 amod>12 pobj>8"]]},
  "mirror the boat in both directions then blur the waterline a little": {"tokens":[["mirror",0,"VERB","VB","ROOT",0,"mirror"],["the",7,"DET","DT","det",2,"the"],["boat",11,"NOUN","NN","dobj",0,"boat"],["in",16,"ADP","IN","prep",0,"in"],["both",19,"DET","DT","det",5,"both"],["directions",24,"NOUN","NNS","pobj",3,"direction"],["then",35,"ADV","RB","advmod",0,"then"],["blur",40,"VERB","VB","dep",0,"blur"],["the",45,"DET","DT","det",9,"the"],["waterline",49,"NOUN","NN","dobj",7,"waterline"],["a",59,"DET","DT","det",11,"a"],["little",61,"ADJ","JJ","npadvmod",7,"little"]],"beam":[[0.791,"ROOT>0 det>2 dobj>0 prep>2 det>5 pobj>3 advmod>0 dep>0 det>9 dobj>7 det>11 npadvmod>7"],[0.0212,"ROOT>0 det>2 dobj>0 prep>0 det>5 pobj>3 advmod>0 dep>0 det>9 dobj>7 det>11 npadvmod>7"],[0.0207,"ROOT>0 det>2 dobj>0 prep>2 det>5 pobj>3 advmod>0 dep>0 det>9 dobj>7 advmod>11 npadvmod>7"]]},
  "make it the next day exactly as i said": {"tokens":[["make",0,"VERB","VB","ROOT",0,"make"],["it",5,"PRON","PRP","dobj",0,"it"],["the",8,"DET","DT","det",4,"the"],["next",12,"ADJ","JJ","amod",4,"next"],["day",17,"NOUN","NN","npadvmod",0,"day"],["exactly",21,"ADV","RB","advmod",8,"exactly"],["as",29,"SCONJ","IN","mark",8,"as"],["i",32,"PRON","PRP","nsubj",8,"I"],["said",34,"VERB","VBD","advcl",0,"say"]],"beam":[[0.5227,"ROOT>0 dobj>0 det>4 amod>4 npadvmod>0 advmod>8 mark>8 nsubj>8 relcl>4"],[0.0645,"ROOT>0 dobj>0 det>4 amod>4 npadvmod>1 advmod>8 mark>8 nsubj>8 advcl>0"],[0.0051,"ROOT>0 dobj>0 det>4 amod>4 npadvmod>0 advmod>8 mark>8 nsubj>8 advcl>0"]]},
  "clear everything": {"tokens":[["clear",0,"ADJ","JJ","amod",1,"clear"],["everything",6,"PRON","NN","ROOT",1,"everything"]],"beam":[[0.9912,"amod>1 ROOT>1"],[0.0066,"ROOT>0 dobj>0"],[0.0022,"compound>1 ROOT>1"]]},
  "how about three birds in a row along the fence all facing left? — right where the scene needs it": {"tokens":[["how",0,"SCONJ","WRB","advmod",3,"how"],["about",4,"SCONJ","IN","mark",3,"about"],["three",10,"NUM","CD","nummod",3,"three"],["birds",16,"NOUN","NNS","dep",19,"bird"],["in",22,"ADP","IN","prep",3,"in"],["a",25,"DET","DT","det",6,"a"],["row",27,"NOUN","NN","pobj",4,"row"],["along",31,"ADP","IN","prep",3,"along"],["the",37,"DET","DT","det",9,"the"],["fence",41,"NOUN","NN","pobj",7,"fence"],["all",47,"PRON","DT","nsubj",11,"all"],["facing",51,"VERB","VBG","advcl",3,"face"],["left",58,"ADV","RB","advmod",11,"left"],["?",62,"PUNCT",".","punct",12,"?"],["—",64,"PUNCT",":","punct",19,"—"],["right",66,"ADV","RB","advmod",16,"right"],["where",72,"SCONJ","WRB","advmod",19,"where"],["the",78,"DET","DT","det",18,"the"],["scene",82,"NOUN","NN","nsubj",19,"scene"],["needs",88,"VERB","VBZ","ROOT",19,"need"],["it",94,"PRON","PRP","dobj",19,"it"]],"beam":[[0.7228,"advmod>1 mark>2 nummod>3 ROOT>3 prep>3 det>6 pobj>4 prep>3 det>9 pobj>7 nsubj>11 advcl>3 advmod>11 punct>12 punct>3 advmod>19 advmod>19 det>18 nsubj>19 advcl>3 dobj>19"],[0.1153,"advmod>1 mark>2 nummod>3 ROOT>3 prep>3 det>6 pobj>4 prep>3 det>9 pobj>7 nsubj>11 advcl>3 advmod>11 punct>12 punct>3 advmod>16 advmod>19 det>18 nsubj>19 relcl>14 dobj>19"],[0.0887,"advmod>1 mark>2 nummod>3 ROOT>3 prep>3 det>6 pobj>4 prep>3 det>9 pobj>7 nsubj>11 advcl>3 advmod>11 punct>12 punct>3 advmod>16 advmod>19 det>18 nsubj>19 advcl>14 dobj>19"]]},
  "same session, next ask: Who leads on profit, and how far clear is it?": {"tokens":[["same",0,"ADJ","JJ","amod",1,"same"],["session",5,"NOUN","NN","npadvmod",4,"session"],[",",12,"PUNCT",",","punct",4,","],["next",14,"ADV","RB","advmod",4,"next"],["ask",19,"VERB","VB","ROOT",4,"ask"],[":",22,"PUNCT",":","punct",4,":"],["Who",24,"PRON","WP","nsubj",7,"who"],["leads",28,"VERB","VBZ","ccomp",4,"lead"],["on",34,"ADP","IN","prep",7,"on"],["profit",37,"NOUN","NN","pobj",8,"profit"],[",",43,"PUNCT",",","punct",7,","],["and",45,"CCONJ","CC","cc",7,"and"],["how",49,"SCONJ","WRB","advmod",13,"how"],["far",53,"ADV","RB","advmod",14,"far"],["clear",57,"ADJ","JJ","acomp",15,"clear"],["is",63,"AUX","VBZ","conj",7,"be"],["it",66,"PRON","PRP","nsubj",15,"it"],["?",68,"PUNCT",".","punct",15,"?"]],"beam":[[0.3502,"amod>1 npadvmod>4 punct>4 advmod>4 ROOT>4 punct>4 nsubj>7 ccomp>4 prep>7 pobj>8 punct>7 cc>7 advmod>13 advmod>14 acomp>15 conj>7 nsubj>15 punct>15"],[0.2207,"amod>1 dep>4 punct>4 advmod>4 ROOT>4 punct>4 nsubj>7 ccomp>4 prep>7 pobj>8 punct>7 cc>7 advmod>13 advmod>14 acomp>15 conj>7 nsubj>15 punct>15"]]},
  "put a level 2 heading Results after Chapter and name the object Findings": {"tokens":[["put",0,"VERB","VB","ROOT",0,"put"],["a",4,"DET","DT","det",4,"a"],["level",6,"NOUN","NN","nmod",4,"level"],["2",12,"NUM","CD","nummod",2,"2"],["heading",14,"NOUN","NN","dobj",0,"heading"],["Results",22,"NOUN","NNS","appos",4,"result"],["after",30,"ADP","IN","prep",0,"after"],["Chapter",36,"NOUN","NN","pobj",6,"chapter"],["and",44,"CCONJ","CC","cc",0,"and"],["name",48,"VERB","VB","conj",0,"name"],["the",53,"DET","DT","det",11,"the"],["object",57,"NOUN","NN","dobj",9,"object"],["Findings",64,"NOUN","NNS","dep",9,"finding"]],"beam":[[0.5504,"ROOT>0 det>4 nmod>4 nummod>2 dobj>0 appos>4 prep>5 pobj>6 cc>0 conj>0 det>11 dobj>9 appos>11"],[0.4496,"ROOT>0 det>4 nmod>4 nummod>2 dobj>0 appos>4 prep>0 pobj>6 cc>0 conj>0 det>11 dobj>9 appos>11"]]},
  "undo the last document edit": {"tokens":[["undo",0,"X","XX","ROOT",0,"undo"],["the",5,"DET","DT","det",3,"the"],["last",9,"ADJ","JJ","amod",3,"last"],["document",14,"NOUN","NN","pobj",0,"document"],["edit",23,"NOUN","NN","dep",0,"edit"]],"beam":[[0.2683,"dep>3 det>3 amod>3 nsubj>4 ROOT>4"],[0.2073,"det>3 det>3 amod>3 nsubj>4 ROOT>4"],[0.1958,"nmod>3 det>3 amod>3 nsubj>4 ROOT>4"]]},
  "bring the deleted shape back into the row and exchange it with the figure immediately to its right": {"tokens":[["bring",0,"VERB","VB","ROOT",0,"bring"],["the",6,"DET","DT","det",3,"the"],["deleted",10,"VERB","VBN","amod",3,"delete"],["shape",18,"NOUN","NN","dobj",0,"shape"],["back",24,"ADV","RB","advmod",0,"back"],["into",29,"ADP","IN","prep",4,"into"],["the",34,"DET","DT","det",7,"the"],["row",38,"NOUN","NN","pobj",5,"row"],["and",42,"CCONJ","CC","cc",0,"and"],["exchange",46,"VERB","VB","conj",0,"exchange"],["it",55,"PRON","PRP","dobj",9,"it"],["with",58,"ADP","IN","prep",9,"with"],["the",63,"DET","DT","det",13,"the"],["figure",67,"NOUN","NN","pobj",11,"figure"],["immediately",74,"ADV","RB","advmod",15,"immediately"],["to",86,"ADP","IN","prep",13,"to"],["its",89,"PRON","PRP$","poss",17,"its"],["right",93,"NOUN","NN","pobj",15,"right"]],"beam":[[0.9391,"ROOT>0 det>3 amod>3 dobj>0 advmod>0 prep>4 det>7 pobj>5 cc>0 conj>0 dobj>9 prep>9 det>13 pobj>11 advmod>9 prep>14 poss>17 pobj>15"],[0.0384,"ROOT>0 det>3 amod>3 dobj>0 advmod>0 prep>4 det>7 pobj>5 cc>0 conj>0 dobj>9 prep>9 det>13 pobj>11 advmod>11 prep>14 poss>17 pobj>15"],[0.0131,"ROOT>0 det>3 amod>3 dobj>0 advmod>0 prep>4 det>7 pobj>5 cc>0 conj>0 dobj>9 prep>9 det>13 pobj>11 npadvmod>9 prep>14 poss>17 pobj>15"]]},
  "turn the garden path slick and reflective": {"tokens":[["turn",0,"VERB","VB","ROOT",0,"turn"],["the",5,"DET","DT","det",3,"the"],["garden",9,"NOUN","NN","compound",3,"garden"],["path",16,"NOUN","NN","dobj",0,"path"],["slick",21,"ADJ","JJ","oprd",0,"slick"],["and",27,"CCONJ","CC","cc",4,"and"],["reflective",31,"ADJ","JJ","conj",4,"reflective"]],"beam":[[0.9214,"ROOT>0 det>3 compound>3 dobj>0 oprd>0 cc>4 conj>4"],[0.0684,"ROOT>0 det>3 compound>3 dobj>0 oprd>0 cc>4 amod>5"],[0.0102,"ROOT>0 det>3 compound>3 dobj>0 advcl>0 cc>4 conj>4"]]},
  "Could you make Cake orange. Thanks!": {"tokens":[["Could",0,"AUX","MD","aux",2,"could"],["you",6,"PRON","PRP","nsubj",2,"you"],["make",10,"VERB","VB","ROOT",2,"make"],["Cake",15,"PROPN","NNP","compound",4,"Cake"],["orange",20,"NOUN","NN","ccomp",2,"orange"],[".",26,"PUNCT",".","punct",2,"."],["Thanks",28,"NOUN","NNS","ROOT",6,"thank"],["!",34,"PUNCT",".","punct",6,"!"]],"beam":[[0.3896,"aux>2 nsubj>2 ROOT>2 compound>4 ccomp>2 punct>2 ROOT>6 punct>6"],[0.2342,"aux>2 nsubj>2 ROOT>2 nsubj>4 ccomp>2 punct>2 ROOT>6 punct>6"],[0.0136,"aux>2 nsubj>2 ROOT>2 compound>4 dobj>2 punct>2 ROOT>6 punct>6"]]},
  "change a circle Follow-up": {"tokens":[["change",0,"VERB","VB","ROOT",0,"change"],["a",7,"DET","DT","det",2,"a"],["circle",9,"NOUN","NN","dobj",0,"circle"],["Follow",16,"NOUN","NN","compound",5,"follow"],["-",22,"PUNCT","HYPH","punct",5,"-"],["up",23,"NOUN","NN","prt",0,"up"]],"beam":[[0.5748,"ROOT>0 det>2 dobj>0 appos>2 punct>5 prt>3"],[0.4098,"ROOT>0 det>2 dobj>0 nmod>2 punct>5 prt>3"],[0.0104,"nmod>3 det>2 dobj>0 ROOT>3 punct>5 prt>3"]]},
  "the big cat: face left": {"tokens":[["the",0,"DET","DT","det",2,"the"],["big",4,"ADJ","JJ","amod",2,"big"],["cat",8,"NOUN","NN","ROOT",2,"cat"],[":",11,"PUNCT",":","punct",2,":"],["face",13,"NOUN","NN","appos",2,"face"],["left",18,"VERB","VBN","acl",4,"leave"]],"beam":[[0.6652,"det>2 amod>2 ROOT>2 punct>2 appos>2 acl>4"],[0.3302,"det>2 amod>2 ROOT>2 punct>2 appos>2 amod>4"]]},
  "run the boy in the blue coat and yellow cap left one place, same as the other": {"tokens":[["run",0,"X","XX","dep",10,"run"],["the",4,"DET","DT","det",2,"the"],["boy",8,"NOUN","NN","dobj",0,"boy"],["in",12,"ADP","IN","prep",2,"in"],["the",15,"DET","DT","det",6,"the"],["blue",19,"ADJ","JJ","amod",6,"blue"],["coat",24,"NOUN","NN","pobj",3,"coat"],["and",29,"CCONJ","CC","cc",6,"and"],["yellow",33,"ADJ","JJ","amod",9,"yellow"],["cap",40,"NOUN","NN","conj",6,"cap"],["left",44,"VERB","VBD","ROOT",10,"leave"],["one",49,"NUM","CD","nummod",12,"one"],["place",53,"NOUN","NN","dobj",10,"place"],[",",58,"PUNCT",",","punct",12,","],["same",60,"ADJ","JJ","npadvmod",10,"same"],["as",65,"ADP","IN","prep",14,"as"],["the",68,"DET","DT","det",17,"the"],["other",72,"ADJ","JJ","pobj",15,"other"]],"beam":[[0.7557,"dep>10 det>2 dobj>0 prep>2 det>6 amod>6 pobj>3 cc>6 amod>9 conj>6 ROOT>10 nummod>12 dobj>10 punct>12 amod>12 prep>14 det>17 pobj>15"],[0.2262,"dep>10 det>2 dobj>0 prep>2 det>6 amod>6 pobj>3 cc>6 amod>9 conj>6 ROOT>10 nummod>12 dobj>10 punct>12 appos>12 prep>14 det>17 pobj>15"],[0.0125,"dep>10 det>2 dobj>0 prep>2 det>6 amod>6 pobj>3 cc>6 amod>9 conj>6 ROOT>10 nummod>12 dobj>10 punct>10 npadvmod>10 prep>14 det>17 pobj>15"]]},
  "add a cirrcle Rough Take 2": {"tokens":[["add",0,"VERB","VB","ROOT",0,"add"],["a",4,"DET","DT","det",4,"a"],["cirrcle",6,"NOUN","NN","dep",4,"cirrcle"],["Rough",14,"PROPN","NNP","compound",4,"Rough"],["Take",20,"PROPN","NNP","dobj",0,"Take"],["2",25,"NUM","CD","nummod",4,"2"]],"beam":[[0.5086,"ROOT>0 det>2 dobj>0 compound>4 appos>2 nummod>4"],[0.2302,"ROOT>0 det>4 nmod>4 compound>4 dobj>0 nummod>4"],[0.1073,"ROOT>0 det>4 compound>4 compound>4 dobj>0 nummod>4"]]},
  "position one doughnut Second Pass": {"tokens":[["position",0,"NOUN","NN","ROOT",0,"position"],["one",9,"NUM","CD","nummod",0,"one"],["doughnut",13,"NOUN","NN","appos",0,"doughnut"],["Second",22,"PROPN","NNP","compound",4,"Second"],["Pass",29,"NOUN","NN","appos",0,"pass"]],"beam":[[0.5885,"nmod>2 nummod>0 ROOT>2 amod>4 appos>2"],[0.3755,"nmod>2 nummod>0 ROOT>2 compound>4 appos>2"],[0.0129,"nmod>2 nummod>0 compound>4 amod>4 ROOT>4"]]},
  "Let us what colour is bubbles?. That would help.": {"tokens":[["Let",0,"VERB","VB","ROOT",0,"let"],["us",4,"PRON","PRP","dobj",0,"we"],["what",7,"PRON","WP","det",3,"what"],["colour",12,"NOUN","NN","attr",4,"colour"],["is",19,"AUX","VBZ","relcl",1,"be"],["bubbles",22,"NOUN","NNS","nsubj",4,"bubble"],["?",29,"PUNCT",".","punct",0,"?"],[".",30,"PUNCT",".","punct",0,"."],["That",32,"PRON","DT","nsubj",10,"that"],["would",37,"AUX","MD","aux",10,"would"],["help",43,"VERB","VB","ROOT",10,"help"],[".",47,"PUNCT",".","punct",10,"."]],"beam":[[0.5206,"ROOT>0 nsubj>0 det>3 attr>4 relcl>1 nsubj>4 punct>4 punct>4 nsubj>10 aux>10 ROOT>10 punct>10"],[0.4794,"ROOT>0 dobj>0 det>3 attr>4 relcl>1 nsubj>4 punct>4 punct>4 nsubj>10 aux>10 ROOT>10 punct>10"]]},
  "I need you to what values does League show?. I appreciate it.": {"tokens":[["I",0,"PRON","PRP","nsubj",1,"I"],["need",2,"VERB","VBP","ROOT",1,"need"],["you",7,"PRON","PRP","dobj",1,"you"],["to",11,"PART","TO","prep",8,"to"],["what",14,"DET","WDT","det",5,"what"],["values",19,"NOUN","NNS","dobj",8,"value"],["does",26,"AUX","VBZ","aux",8,"do"],["League",31,"PROPN","NNP","nsubj",8,"League"],["show",38,"VERB","VB","ccomp",1,"show"],["?",42,"PUNCT",".","punct",8,"?"],[".",43,"PUNCT",".","punct",1,"."],["I",45,"PRON","PRP","nsubj",12,"I"],["appreciate",47,"VERB","VBP","ROOT",12,"appreciate"],["it",58,"PRON","PRP","dobj",12,"it"],[".",60,"PUNCT",".","punct",12,"."]],"beam":[[0.9077,"nsubj>1 ROOT>1 dobj>1 prep>8 det>5 pcomp>3 aux>8 nsubj>8 relcl>2 punct>8 punct>8 nsubj>12 ROOT>12 dobj>12 punct>12"],[0.082,"nsubj>1 ROOT>1 dobj>1 prep>8 det>5 pcomp>3 aux>8 nsubj>8 relcl>2 punct>8 punct>8 nsubj>12 ccomp>1 dobj>12 punct>12"],[0.0036,"nsubj>1 ROOT>1 dobj>1 prep>8 det>5 pcomp>3 aux>8 nsubj>8 relcl>2 punct>8 punct>8 nsubj>12 parataxis>1 dobj>12 punct>12"]]},
  "add a small crown to the girl, next, a red cape over her dress, and finish with white gloves under the cape": {"tokens":[["add",0,"VERB","VB","ROOT",0,"add"],["a",4,"DET","DT","det",3,"a"],["small",6,"ADJ","JJ","amod",3,"small"],["crown",12,"NOUN","NN","dobj",0,"crown"],["to",18,"ADP","IN","prep",0,"to"],["the",21,"DET","DT","det",6,"the"],["girl",25,"NOUN","NN","pobj",4,"girl"],[",",29,"PUNCT",",","punct",0,","],["next",31,"ADV","RB","advmod",0,"next"],[",",35,"PUNCT",",","punct",12,","],["a",37,"DET","DT","det",12,"a"],["red",39,"ADJ","JJ","amod",12,"red"],["cape",43,"NOUN","NN","dep",0,"cape"],["over",48,"ADP","IN","prep",12,"over"],["her",53,"PRON","PRP$","poss",15,"her"],["dress",57,"NOUN","NN","pobj",13,"dress"],[",",62,"PUNCT",",","punct",12,","],["and",64,"CCONJ","CC","cc",0,"and"],["finish",68,"VERB","VB","conj",0,"finish"],["with",75,"ADP","IN","prep",18,"with"],["white",80,"ADJ","JJ","amod",21,"white"],["gloves",86,"NOUN","NNS","pobj",19,"glove"],["under",93,"ADP","IN","prep",21,"under"],["the",99,"DET","DT","det",24,"the"],["cape",103,"NOUN","NN","pobj",22,"cape"]],"beam":[[0.3589,"ROOT>0 det>3 amod>3 dobj>0 prep>0 det>6 pobj>4 punct>0 advmod>12 punct>12 det>12 amod>12 conj>0 prep>12 poss>15 pobj>13 punct>0 cc>0 conj>0 prep>18 amod>21 pobj>19 prep>21 det>24 pobj>22"],[0.1872,"ROOT>0 det>3 amod>3 dobj>0 prep>0 det>6 pobj>4 punct>0 advmod>12 punct>12 det>12 amod>12 conj>0 prep>12 poss>15 pobj>13 punct>12 cc>12 conj>12 prep>18 amod>21 pobj>19 prep>21 det>24 pobj>22"],[0.0034,"ROOT>0 det>3 amod>3 dobj>0 prep>0 det>6 pobj>4 punct>0 advmod>12 punct>12 det>12 amod>12 conj>0 prep>12 poss>15 pobj>13 punct>12 cc>12 conj>12 prep>18 amod>21 pcomp>19 prep>21 det>24 pobj>22"]]},
  "put the red barn away from the road, so nothing blocks the lane.": {"tokens":[["put",0,"VERB","VB","advcl",11,"put"],["the",4,"DET","DT","det",3,"the"],["red",8,"ADJ","JJ","amod",3,"red"],["barn",12,"NOUN","NN","dobj",0,"barn"],["away",17,"ADV","RB","advmod",0,"away"],["from",22,"ADP","IN","prep",4,"from"],["the",27,"DET","DT","det",7,"the"],["road",31,"NOUN","NN","pobj",5,"road"],[",",35,"PUNCT",",","punct",11,","],["so",37,"ADV","RB","advmod",11,"so"],["nothing",40,"PRON","NN","nsubj",11,"nothing"],["blocks",48,"VERB","VBZ","ROOT",11,"block"],["the",55,"DET","DT","det",13,"the"],["lane",59,"NOUN","NN","dobj",11,"lane"],[".",63,"PUNCT",".","punct",11,"."]],"beam":[[0.5438,"ROOT>0 det>3 amod>3 dobj>0 advmod>0 prep>4 det>7 pobj>5 punct>11 advmod>11 nsubj>11 ccomp>0 det>13 dobj>11 punct>11"],[0.4527,"ROOT>0 det>3 amod>3 dobj>0 advmod>0 prep>4 det>7 pobj>5 punct>11 advmod>11 nsubj>11 advcl>0 det>13 dobj>11 punct>11"],[0.0019,"ROOT>0 det>3 amod>3 dobj>0 advmod>0 prep>4 det>7 pobj>5 punct>11 advmod>11 nsubj>11 ccomp>0 det>13 dobj>11 dobj>11"]]},
  "it is a hierarchy, so lay out the diagram horizoontally": {"tokens":[["it",0,"PRON","PRP","nsubj",1,"it"],["is",3,"AUX","VBZ","ROOT",1,"be"],["a",6,"DET","DT","det",3,"a"],["hierarchy",8,"NOUN","NN","attr",1,"hierarchy"],[",",17,"PUNCT",",","punct",1,","],["so",19,"CCONJ","CC","advmod",6,"so"],["lay",22,"VERB","VB","conj",1,"lay"],["out",26,"ADP","RP","prt",6,"out"],["the",30,"DET","DT","det",9,"the"],["diagram",34,"NOUN","NN","dobj",6,"diagram"],["horizoontally",42,"ADV","RB","advmod",6,"horizoontally"]],"beam":[[0.5985,"nsubj>1 ROOT>1 det>3 attr>1 punct>1 advmod>6 conj>1 prt>6 det>9 dobj>6 advmod>6"],[0.0377,"nsubj>1 ROOT>1 det>3 attr>1 punct>1 cc>1 conj>1 prt>6 det>9 dobj>6 advmod>6"],[0.0266,"nsubj>1 ROOT>1 det>3 attr>1 punct>1 advmod>6 conj>1 prt>6 det>9 dobj>6 npadvmod>6"]]},
  "change a raiised eyebrow pink": {"tokens":[["change",0,"VERB","VB","ROOT",0,"change"],["a",7,"DET","DT","det",3,"a"],["raiised",9,"ADJ","JJ","amod",3,"raiised"],["eyebrow",17,"NOUN","NN","dobj",0,"eyebrow"],["pink",25,"NOUN","NN","dobj",0,"pink"]],"beam":[[0.7058,"ROOT>0 det>3 amod>3 dobj>0 appos>3"],[0.2942,"ROOT>0 det>3 amod>3 dobj>0 amod>3"]]},
  "just take the trees out but keep the ones beside the house": {"tokens":[["just",0,"ADV","RB","advmod",1,"just"],["take",5,"VERB","VB","ROOT",1,"take"],["the",10,"DET","DT","det",3,"the"],["trees",14,"NOUN","NNS","dobj",1,"tree"],["out",20,"ADP","RP","prt",1,"out"],["but",24,"CCONJ","CC","cc",1,"but"],["keep",28,"VERB","VB","conj",1,"keep"],["the",33,"DET","DT","det",8,"the"],["ones",37,"NOUN","NNS","dobj",6,"one"],["beside",42,"ADP","IN","oprd",6,"beside"],["the",49,"DET","DT","det",11,"the"],["house",53,"NOUN","NN","pobj",9,"house"]],"beam":[[0.6294,"advmod>1 ROOT>1 det>3 dobj>1 prt>3 cc>1 conj>1 det>8 dobj>6 oprd>6 det>11 pobj>9"],[0.2094,"advmod>1 ROOT>1 det>3 dobj>1 prt>3 cc>1 conj>1 det>8 dobj>6 prep>8 det>11 pobj>9"],[0.0816,"advmod>1 ROOT>1 det>3 dobj>1 prt>3 cc>1 conj>1 det>8 dobj>6 prep>6 det>11 pobj>9"]]},
  "how about small marker size?": {"tokens":[["how",0,"SCONJ","WRB","advmod",4,"how"],["about",4,"ADP","IN","dep",4,"about"],["small",10,"ADJ","JJ","amod",4,"small"],["marker",16,"NOUN","NN","compound",4,"marker"],["size",23,"NOUN","NN","ROOT",4,"size"],["?",27,"PUNCT",".","punct",4,"?"]],"beam":[[0.9556,"advmod>1 ROOT>1 amod>3 compound>4 pobj>1 punct>4"],[0.0444,"advmod>1 ROOT>1 amod>4 compound>4 pobj>1 punct>4"]]},
  "please to place flow along the curve": {"tokens":[["please",0,"INTJ","UH","intj",2,"please"],["to",7,"PART","TO","aux",2,"to"],["place",10,"VERB","VB","ROOT",2,"place"],["flow",16,"NOUN","NN","dobj",2,"flow"],["along",21,"ADP","IN","prep",2,"along"],["the",27,"DET","DT","det",6,"the"],["curve",31,"NOUN","NN","pobj",4,"curve"]],"beam":[[0.4118,"intj>2 aux>2 ROOT>2 dobj>2 prep>2 det>6 pobj>4"],[0.3356,"intj>2 aux>2 ROOT>2 dobj>2 prep>3 det>6 pobj>4"],[0.1321,"intj>1 aux>2 ROOT>2 dobj>2 prep>2 det>6 pobj>4"]]},
  "o — the cloud in the sky is small, not big": {"tokens":[["o",0,"INTJ","UH","intj",7,"o"],["—",2,"PUNCT",":","punct",7,"—"],["the",4,"DET","DT","det",3,"the"],["cloud",8,"NOUN","NN","nsubj",7,"cloud"],["in",14,"ADP","IN","prep",3,"in"],["the",17,"DET","DT","det",6,"the"],["sky",21,"NOUN","NN","pobj",4,"sky"],["is",25,"AUX","VBZ","ROOT",7,"be"],["small",28,"ADJ","JJ","amod",11,"small"],[",",33,"PUNCT",",","punct",11,","],["not",35,"PART","RB","neg",11,"not"],["big",39,"ADJ","JJ","acomp",7,"big"]],"beam":[[1,"intj>7 punct>7 det>3 nsubj>7 prep>3 det>6 pobj>4 ROOT>7 amod>11 punct>11 neg>11 acomp>7"]]},
  "no — have the blue-dress woman take the next turn, not the man in the green jacket": {"tokens":[["no",0,"INTJ","UH","intj",2,"no"],["—",3,"PUNCT",":","punct",2,"—"],["have",5,"VERB","VB","ROOT",2,"have"],["the",10,"DET","DT","det",7,"the"],["blue",14,"ADJ","JJ","amod",6,"blue"],["-",18,"PUNCT","HYPH","punct",6,"-"],["dress",19,"NOUN","NN","compound",7,"dress"],["woman",25,"NOUN","NN","nsubj",8,"woman"],["take",31,"VERB","VB","ccomp",2,"take"],["the",36,"DET","DT","det",11,"the"],["next",40,"ADJ","JJ","amod",11,"next"],["turn",45,"NOUN","NN","dobj",8,"turn"],[",",49,"PUNCT",",","punct",8,","],["not",51,"PART","RB","neg",15,"not"],["the",55,"DET","DT","det",15,"the"],["man",59,"NOUN","NN","dep",8,"man"],["in",63,"ADP","IN","prep",15,"in"],["the",66,"DET","DT","det",19,"the"],["green",70,"ADJ","JJ","amod",19,"green"],["jacket",76,"NOUN","NN","pobj",16,"jacket"]],"beam":[[0.3839,"intj>2 punct>2 ROOT>2 det>7 amod>6 punct>6 compound>7 nsubj>8 ccomp>2 det>11 amod>11 dobj>8 punct>8 neg>15 det>15 dep>8 prep>15 det>19 amod>19 pobj>16"],[0.3418,"intj>2 punct>2 ROOT>2 det>7 amod>6 punct>6 compound>7 nsubj>8 ccomp>2 det>11 amod>11 dobj>8 punct>8 neg>8 det>15 dobj>8 prep>15 det>19 amod>19 pobj>16"],[0.0332,"intj>2 punct>2 ROOT>2 det>7 amod>6 punct>6 compound>7 nsubj>8 ccomp>2 det>11 amod>11 dobj>8 punct>11 neg>15 det>15 dobj>8 prep>15 det>19 amod>19 pobj>16"]]}
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

test('the form of a clause: embedded questions, question tags, names that end in a question mark', async () => {
  const texts = ['tell me where Verify is in the row', 'same session, next ask: Who leads on profit, and how far clear is it?',
    'how about three birds in a row along the fence all facing left? — right where the scene needs it',
    'drop in a library, would you', 'put a plane on the board, would you', 'one more thing: quick check — is anything overlapping the house?',
    'I would like the avatar back to default, so please reset it and remember that for the next session.',
    'make Valid? a rounded rectangle', 'add a circle called Retry and connect Valid? to it']
  const results = await circuits(spacyDirect, texts)
  const of = text => read(results.get(text).candidates[0].sop)

  // an embedded question keeps the order of a statement: no question; one that a question mark closes after a colon asks
  let c = of('tell me where Verify is in the row')
  assert.deepEqual([c.clause('tell').form, c.clause('is').form], ['imperative', 'declarative'])
  c = of('same session, next ask: Who leads on profit, and how far clear is it?')
  assert.deepEqual([c.clause('leads').form, c.clause('is').form], ['interrogative', 'interrogative'])
  // a question word with the order of a statement and no question mark opens a relative clause; "right" grades "where"
  c = of('how about three birds in a row along the fence all facing left? — right where the scene needs it')
  assert.deepEqual([c.clause('needs').form, c.clause('needs').words('modifier')], ['declarative', ['right', 'where']])

  // a question tag is an elliptical question set beside the command, also when the parser hung its auxiliary on the verb
  for (const text of ['drop in a library, would you', 'put a plane on the board, would you']) {
    c = of(text)
    assert.deepEqual([c.clause('would').form, c.clause('would').refs('subject'), c.coordinations[0].refs('conjunct')],
      ['interrogative', [c.nominal('you')], [c.clauses[0], c.clause('would')]], text)
    assert.deepEqual(c.clauses[0].words('auxiliary'), [], text)
  }
  // an auxiliary before its subject makes a question, which only a main clause can be
  c = of('one more thing: quick check — is anything overlapping the house?')
  assert.deepEqual([c.clause('overlapping').form, c.clause('overlapping').words('auxiliary')], ['interrogative', ['is']])

  // "please" before a joined verb: a command of its own, not a second verb of "would like"
  c = of('I would like the avatar back to default, so please reset it and remember that for the next session.')
  assert.deepEqual([c.clause('like').form, c.clause('reset').form, c.clause('remember').form], ['declarative', 'imperative', 'imperative'])

  // a question mark between a capitalised word and words that go on is part of a name: the command stays a command
  c = of('make Valid? a rounded rectangle')
  assert.deepEqual([c.clause('make').form, c.clause('make').refs('complement')], ['imperative', [c.nominal('Valid'), c.nominal('rectangle')]])
  c = of('add a circle called Retry and connect Valid? to it')
  assert.deepEqual([c.clause('add').form, c.clause('connect').form, c.clause('connect').refs('complement')], ['imperative', 'imperative', [c.nominal('Valid')]])
})

test('word classes: a command opens with its verb, a capitalised word inside a sentence is a name', async () => {
  const texts = ['dissolve Process', 'update a pipe neck tiny', 'set r1 width 180 height 90', 'undo the last document edit', 'clear everything',
    'connect a link from Start to Review', 'group an object Plan Backup', 'add a person Hub Core',
    'put a level 2 heading Results after Chapter and name the object Findings']
  const results = await circuits(spacyDirect, texts)
  const of = text => read(results.get(text).candidates[0].sop)

  // the first word of a message with no verb, before a name, a determiner or a pronoun, is the verb
  let c = of('dissolve Process')
  assert.deepEqual([c.clause('dissolve').form, c.clause('dissolve').refs('complement')], ['imperative', [c.nominal('Process')]])
  c = of('clear everything')
  assert.deepEqual([c.clause('clear').form, c.clause('clear').refs('complement')], ['imperative', [c.nominal('everything')]])
  // and an adjective after the nouns is said of them: the last noun is the head
  c = of('update a pipe neck tiny')
  assert.deepEqual([c.clause('update').words('modifier'), c.clause('update').refs('complement'), c.nominal('neck').words('dependent')],
    [['tiny'], [c.nominal('neck')], ['a', 'pipe']])
  // a word tagged as a base form of a verb opens a command whatever follows it
  c = of('set r1 width 180 height 90')
  assert.deepEqual([c.clause('set').form, c.clause('set').refs('complement')], ['imperative', [c.nominal('width')]])
  // a bare noun right after the object belongs to it
  c = of('undo the last document edit')
  assert.deepEqual([c.clause('undo').refs('complement'), c.nominal('edit').words('dependent')], [[c.nominal('edit')], ['the', 'last', 'document']])

  // a capitalised verb form inside a sentence is a name
  c = of('connect a link from Start to Review')
  assert.deepEqual(c.clauses.map(wire => wire.words('verb')), [['connect']])
  assert.deepEqual([c.relation('from').refs('to')[0], c.relation('to').refs('to')[0]], [c.nominal('Start'), c.nominal('Review')])

  // a name right after a noun that brings in a new thing names it (Rule 5.5); after a known thing it is what the verb gives it
  c = of('add a person Hub Core')
  assert.deepEqual(c.clause('add').refs('complement'), [c.nominal('person')])
  assert.deepEqual(c.relations.map(wire => [wire.words('marker'), wire.refs('from')[0], wire.refs('to')[0]]), [[[], c.nominal('person'), c.nominal('Core')]])
  c = of('group an object Plan Backup')
  assert.deepEqual([c.clause('group').refs('complement'), c.relations[0].refs('from')[0], c.relations[0].refs('to')[0]], [[c.nominal('object')], c.nominal('object'), c.nominal('Backup')])
  c = of('put a level 2 heading Results after Chapter and name the object Findings')
  assert.deepEqual(c.clause('name').refs('complement'), [c.nominal('object'), c.nominal('Findings')])
})

test('nominals and relations: numbers, "left of", "let\'s", "else", "from now on", nouns side by side', async () => {
  const texts = ['our rectangle 220 by 140', 'a boy in the blue jacket just left of the woman in the green dress', 'Make a gazelle left of the hill.',
    "let's go linear on y axis scale", 'place both cats at the left side, keeping everything else where it is', 'From now on, data labels on.',
    'the marker borders on Revenue trend should be thicker. flip the x axis']
  const results = await circuits(spacyDirect, texts)
  const of = text => read(results.get(text).candidates[0].sop)

  // a preposition between two numbers marks a relation from the first to the second
  let c = of('our rectangle 220 by 140')
  assert.deepEqual([c.relation('by').refs('from')[0], c.relation('by').refs('to')[0]], [c.nominal('220'), c.nominal('140')])
  // "of" goes with "left", never with the thing placed; "left" before "of" is no participle
  c = of('a boy in the blue jacket just left of the woman in the green dress')
  assert.deepEqual([c.clauses[0].words('modifier'), c.relation('of').refs('from')[0], c.relation('of').refs('to')[0]], [['just', 'left'], c.clauses[0], c.nominal('woman')])
  c = of('Make a gazelle left of the hill.')
  assert.deepEqual([c.clauses.length, c.clause('Make').words('modifier'), c.relation('of').refs('from')[0]], [1, ['left'], c.clause('Make')])
  // the "'s" of "let's" is the object of "let", not the subject of the verb after it
  c = of("let's go linear on y axis scale")
  assert.deepEqual([c.clause('let').refs('complement'), c.clause('go').refs('subject')], [[c.nominal("'s")], []])
  // "else" belongs to its pronoun
  c = of('place both cats at the left side, keeping everything else where it is')
  assert.deepEqual([c.nominal('everything').words('dependent'), c.clause('keeping').words('modifier')], [['else'], []])
  // "from now on": "from" governs "now", "on" grades it; set before the nominal by a comma, the phrase belongs to the clause
  c = of('From now on, data labels on.')
  assert.deepEqual([c.relation('From').refs('from')[0], c.relation('From').refs('to')[0], c.clauses[0].words('modifier')], [c.clauses[0], c.nominal('now'), ['on', 'on']])
  // a noun the parser made the subject of the noun after it forms one nominal with it
  c = of('the marker borders on Revenue trend should be thicker. flip the x axis')
  assert.deepEqual([c.nominal('borders').words('dependent'), c.clause('be').refs('subject')], [['the', 'marker'], [c.nominal('borders')]])
})

test('clause boundaries: "then", adverbs set off by a comma, a comma after a subject, a word that grades a subordinator', async () => {
  const texts = ['place one bird on the top of the tree, then one kite on top of it, then one cloud on top of the kite',
    'instead, a yellow column the same size between the two blue columns', 'mirror the boat in both directions then blur the waterline a little',
    'make it the next day exactly as i said',
    'a little black cat curled up near the bench, then make the shiny parts of the surfboard by the water clear pale blue and keep the rest of the object as it is, and the shape of the object does not change']
  const results = await circuits(spacyDirect, texts)
  const of = text => read(results.get(text).candidates[0].sop)

  // "then" before a group of words with no verb joins it to what stands before; it is no word of the nominal
  let c = of('place one bird on the top of the tree, then one kite on top of it, then one cloud on top of the kite')
  assert.deepEqual([c.coordinations[0].words('conjunction'), c.nominal('kite').words('dependent'), c.nominal('cloud').words('dependent')], [['then', 'then'], ['one'], ['one']])
  // an adverb set off by a comma before a nominal modifies the clause
  c = of('instead, a yellow column the same size between the two blue columns')
  assert.deepEqual([c.clauses[0].words('modifier'), c.nominal('column').words('dependent')], [['instead'], ['a', 'yellow']])
  // "then" opens the clause it stands before, also with no comma
  c = of('mirror the boat in both directions then blur the waterline a little')
  assert.deepEqual([c.coordinations[0].refs('conjunct'), c.coordinations[0].words('conjunction'), c.clause('mirror').words('modifier')],
    [[c.clause('mirror'), c.clause('blur')], ['then'], []])
  // a word that grades the subordinator modifies the clause the relation starts at
  c = of('make it the next day exactly as i said')
  assert.deepEqual([c.clause('make').words('modifier'), c.clause('said').words('modifier'), c.relation('as').refs('from')[0]], [['exactly'], [], c.clause('make')])
  // no comma stands between a subject and its verb: the cat is a group of words of its own, and "make" commands
  c = of('a little black cat curled up near the bench, then make the shiny parts of the surfboard by the water clear pale blue and keep the rest of the object as it is, and the shape of the object does not change')
  assert.deepEqual([c.clause('make').form, c.clause('make').refs('subject'), c.clause('keep').form], ['imperative', [], 'imperative'])
})

test('second round: words of the clause, names after nouns, "left", restarts, shared verbs, "so", "not"', async () => {
  const texts = ['bring the deleted shape back into the row and exchange it with the figure immediately to its right', 'turn the garden path slick and reflective',
    'Could you make Cake orange. Thanks!', 'change a circle Follow-up', 'the big cat: face left', 'run the boy in the blue coat and yellow cap left one place, same as the other',
    'add a cirrcle Rough Take 2', 'position one doughnut Second Pass', 'Let us what colour is bubbles?. That would help.',
    'I need you to what values does League show?. I appreciate it.', 'add a small crown to the girl, next, a red cape over her dress, and finish with white gloves under the cape',
    'place one bird on the top of the tree, then one kite on top of it, then one cloud on top of the kite',
    'put the red barn away from the road, so nothing blocks the lane.', 'it is a hierarchy, so lay out the diagram horizoontally', 'change a raiised eyebrow pink',
    'just take the trees out but keep the ones beside the house', 'how about small marker size?', 'please to place flow along the curve',
    'o — the cloud in the sky is small, not big', 'no — have the blue-dress woman take the next turn, not the man in the green jacket']
  const results = await circuits(spacyDirect, texts)
  const of = text => read(results.get(text).candidates[0].sop)

  // a word that grades a marker modifies the clause, also when the relation starts at a nominal
  let c = of('bring the deleted shape back into the row and exchange it with the figure immediately to its right')
  assert.deepEqual([c.clause('exchange').words('modifier'), c.nominal('figure').words('dependent')], [['immediately'], ['the']])
  // a conjunction between two words that modify a clause is a word of discourse
  c = of('turn the garden path slick and reflective')
  assert.deepEqual([c.clause('turn').words('modifier'), c.clause('turn').words('discourse')], [['slick', 'reflective'], ['and']])
  // a noun with no verb hung on a verb as its clause: the noun before it is the object, the last word what it is made
  c = of('Could you make Cake orange. Thanks!')
  assert.deepEqual([c.clause('make').words('modifier'), c.clause('make').refs('complement')], [['orange'], [c.nominal('Cake')]])
  // a hyphenated compound is no particle; capitalised, it names the noun before it
  c = of('change a circle Follow-up')
  assert.deepEqual([c.relations[0].refs('from')[0], c.relations[0].refs('to')[0]], [c.nominal('circle'), c.nominal('Follow-up')])
  // "left" after a verb of motion the tagger read as a noun is the direction
  c = of('the big cat: face left')
  assert.deepEqual([c.clause('face').form, c.clause('face').words('modifier')], ['imperative', ['left']])
  c = of('run the boy in the blue coat and yellow cap left one place, same as the other')
  assert.deepEqual([c.clause('run').form, c.clause('run').refs('complement')[0], c.clauses.length], ['imperative', c.nominal('boy'), 1])
  // a small-lettered word between a determiner and a name is the noun the name names
  c = of('add a cirrcle Rough Take 2')
  assert.deepEqual([c.clause('add').refs('complement'), c.nominal('cirrcle').words('dependent'), c.relations[0].refs('to')[0]], [[c.nominal('cirrcle')], ['a'], c.nominal('Take')])
  // a numeral written as a word before a noun opens the nominal: the word before it is the verb
  c = of('position one doughnut Second Pass')
  assert.deepEqual([c.clause('position').refs('complement'), c.nominal('doughnut').words('dependent')], [[c.nominal('doughnut')], ['one']])
  // a question word after a pronoun or "to" starts a question of its own
  c = of('Let us what colour is bubbles?. That would help.')
  assert.deepEqual([c.clause('Let').form, c.clause('is').form, c.coordinations[0].refs('conjunct')], ['imperative', 'interrogative', [c.clause('Let'), c.clause('is')]])
  c = of('I need you to what values does League show?. I appreciate it.')
  assert.deepEqual([c.clause('need').form, c.clause('show').form, c.relation('to').refs('from')[0], c.relation('to').refs('to')[0]],
    ['declarative', 'interrogative', c.clause('need'), c.clause('show')])
  // a group of words opened by a linking word of sequence after a verb shares that verb
  c = of('add a small crown to the girl, next, a red cape over her dress, and finish with white gloves under the cape')
  assert.deepEqual(c.clauses.find(wire => wire.refs('complement')[0] === c.nominal('cape')).refs('ellipsis'), [c.clause('add')])
  c = of('place one bird on the top of the tree, then one kite on top of it, then one cloud on top of the kite')
  assert.deepEqual(c.clauses.filter(wire => wire.form === 'fragment').map(wire => wire.refs('ellipsis')), [[c.clause('place')], [c.clause('place')]])
  // "so" after a comma joins its clause to the one before
  c = of('put the red barn away from the road, so nothing blocks the lane.')
  assert.deepEqual([c.relation('so').refs('from')[0], c.relation('so').refs('to')[0], c.clause('blocks').words('modifier')], [c.clause('put'), c.clause('blocks'), []])
  c = of('it is a hierarchy, so lay out the diagram horizoontally')
  assert.deepEqual([c.coordinations[0].words('conjunction'), c.clause('lay').form], [['so'], 'imperative'])
  // a bare singular noun ending the clause after the object is what the object is made
  c = of('change a raiised eyebrow pink')
  assert.deepEqual([c.clause('change').words('modifier'), c.nominals.length], [['pink'], 1])
  // a preposition that governs an object marks a relation, whatever relation it was hung by
  c = of('just take the trees out but keep the ones beside the house')
  assert.deepEqual([c.relation('beside').refs('from')[0], c.relation('beside').refs('to')[0]], [c.clause('keep'), c.nominal('house')])
  c = of('how about small marker size?')
  assert.deepEqual([c.clauses[0].words('modifier'), c.relation('about').refs('to')[0]], [['how'], c.nominal('size')])
  // "to" after nothing but a word said to the listener ties the infinitive to that word
  c = of('please to place flow along the curve')
  assert.deepEqual([c.clauses[0].words('discourse'), c.relation('to').refs('to')[0], c.clause('place').form], [['please'], c.clause('place'), 'nonfinite'])
  // a word set after a comma with "not" is a fragment that shares the verb, with its own negation
  c = of('o — the cloud in the sky is small, not big')
  assert.deepEqual([c.clause('is').words('modifier'), c.clauses.find(wire => wire.form === 'fragment').words('negation'), c.clauses.find(wire => wire.form === 'fragment').refs('ellipsis')],
    [['small'], ['not'], [c.clause('is')]])
  c = of('no — have the blue-dress woman take the next turn, not the man in the green jacket')
  const contrast = c.clauses.find(wire => wire.refs('complement')[0] === c.nominal('man'))
  assert.deepEqual([contrast.words('negation'), contrast.refs('ellipsis'), c.nominal('man').words('dependent')], [['not'], [c.clause('take')], ['the']])
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
  const files = ['neural-dependencies/index.mjs', 'neural-dependencies/syntax-circuit.mjs', 'spacy-direct/index.mjs', 'spacy-direct/clause-repairs.mjs',
    'spacy-direct/word-repairs.mjs', 'spacy-beam/index.mjs', 'spacy/index.mjs']
  for (const file of files) {
    const source = readFileSync(new URL('../strategies/' + file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /knowledgeDir|sop-knowledge-worlds|SOP_KNOWLEDGE_DIR|check-analysis|schemaPaths|worldPaths/u, file)
    assert.doesNotMatch(source, /['"`]nlu\.|w\.request|project\.mjs|nominal-roles|predicate-attachments/u, file)
    for (const [, from] of source.matchAll(/^import .* from '([^']+)'/gmu)) {
      assert.match(from, /^(?:node:(?:child_process|readline|url)|\.\.\/\.\.\/lib\/syntax\.mjs|\.\.?\/(?:neural-dependencies|spacy-direct|spacy-beam)\/[a-z-]+\.mjs|\.\/[a-z-]+\.mjs)$/u, `${file} imports ${from}`)
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
