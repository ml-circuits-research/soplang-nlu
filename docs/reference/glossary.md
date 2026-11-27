[Home](../README.md) › [Reference](README.md) › Glossary

# Glossary

This page: every term of the project defined once, in plain words, each with a link to the page that explains it. Kind: Reference.

## How to use this page

The terms are grouped by subject. Each group is one table, in alphabetical order. The second column says what the term means here, links the page that explains it, and links Wikipedia where the term is established in its field. Other pages link to the group headings.

This page is longer than the others on purpose: it is a list to look things up in, not to read through.

Groups: [Project terms](#project-terms) · [Trials and training](#trials-and-training) · [Notation terms](#notation-terms) · [Grammar terms](#grammar-terms) · [NLP and statistics](#nlp-and-statistics) · [hmm-rules' own names](#hmm-rules-own-names)

## Project terms

| Term | Meaning |
| --- | --- |
| `accepted_by` | The column of a syntactic file that says how its circuit was accepted: `agreement`, `judge` or `written`. Empty when the message has no circuit yet. Page: [Storage](storage.md#syntactic-files). |
| agreement | Strategies of different families wrote the circuit of a message alike. The circuit is then accepted with no judge (`accepted_by` agreement), and a judge reads a random share as a control (the audit). Page: [Agreement](../evaluation/agreement.md). Related standard ideas: [co-training](https://en.wikipedia.org/wiki/Co-training), [inter-rater reliability](https://en.wikipedia.org/wiki/Inter-rater_reliability). |
| audit | The agreed circuits a judge reads all the same: a random share picked with a seed (`chooseAudit`), mixed with the other circuits so that the judge cannot tell them apart. It measures how often agreement is wrong. The share is 2% in the batch conversion and 5% by default in a round. Page: [The audit](../evaluation/audit.md); the idea: [acceptance sampling](https://en.wikipedia.org/wiki/Acceptance_sampling). |
| batch conversion | The conversion of every remaining source file of the dataset in one pass. Two families must agree, and an audit replaces a judge for most messages. Scripts `batch-run.sh`, `batch-settle.sh`, `batch-write.sh`; output in `eval-results/conversion/`, which git ignores. Page: [Converting the dataset](../evaluation/conversion.md). |
| benchmark | A run of the strategies over a sample of messages, the judging of their circuits and a table of levels. "The benchmark" is the random 1%: 1,831 messages drawn at random from the whole dataset (`eval-results/2026-11-27-syntax-benchmark-random`). Every circuit of every strategy on it is judged. Page: [The benchmark](../evaluation/benchmark.md). |
| checkpoint | The saved weights of a trained model, for example the DistilBERT checkpoint `syntax-v2`. Page: [DistilBERT details](../formalizers/distilbert-details.md). |
| circuit | The set of wires written for one message: a small [graph](https://en.wikipedia.org/wiki/Graph_(discrete_mathematics)) of facts; in NLP terms, a syntactic analysis of the sentence. Every word of the message has exactly one place in it. Page: [SOP Lang](../concepts/sop-lang.md). |
| conversion round | One pass that gives one or more source files of the dataset their syntactic file and measures the strategies on them: start, run, settle, judge, write the missing circuits, write the files (`round.mjs`). Page: [Converting the dataset](../evaluation/conversion.md). |
| core | A text computed from the normal form of a circuit that says what the circuit says, with wire names and line order set aside (`coreOf` in `lib/syntax.mjs`). Equal cores mean the same circuit. Page: [When two circuits are the same](../evaluation/normal-form.md). |
| experimental | The status of a strategy that is measured on the benchmark, kept runnable and still a voice in agreement for its own family, but not improved for now (owner's decision of 2026-11-27): hmm-rules, distilbert, prolog and z3. spacy is the one active strategy. Page: [Formalizers](../formalizers/README.md). |
| family | The source a strategy reads a message from, declared in `tests/benchmark/syntax/strategies.mjs`: hmm-rules, parser, prolog, z3, distilbert. Agreement counts only between different families. Page: [Agreement](../evaluation/agreement.md). |
| `first-run/` | A folder inside a run or round folder. It keeps the strategy files of the first run, the circuits the judges saw, from before later reruns overwrote the files beside it. Page: [Storage](storage.md#a-run-folder). |
| fixer | A judge in the role of writing the circuit of a message for which no circuit was accepted. The code calls this step rewriting (`round.mjs rewrite-prepare`); the label then has `accepted_by` written. Page: [Judges](../evaluation/judging.md). |
| formalizer | A program that reads one message alone, with no context and no knowledge base, and writes its circuit. The code says strategy; the schema also says reader. In NLP terms, a [parser](https://en.wikipedia.org/wiki/Parsing). Page: [Formalizers](../formalizers/README.md). |
| GOAL | The score of a strategy on a sample: the share of messages at L8, L9 or L10. The aim is as high as possible, ideally over 99%. Page: [Levels and GOAL](../evaluation/levels.md). |
| `gold-only/` | A folder of the benchmark folder with a DistilBERT output that, by its name, comes from the checkpoint trained without silver labels. Which checkpoint wrote it is not recorded. Page: [Storage](storage.md#a-run-folder). |
| grade | The level a judge gives one circuit: L8 accepts it; L1 to L6 reject it. The judge gives the first of L1 to L6 that applies, so the number names a kind of fault, not how bad the circuit is. Page: [Judges](../evaluation/judging.md). |
| held out | Kept out of training on labels, so that a measurement on those messages shows how a model does on text it has not seen. From the DistilBERT checkpoint `syntax-v2` on, the benchmark messages are held out of training. Page: [Limits of the measurements](../evaluation/validity.md); [Wikipedia](https://en.wikipedia.org/wiki/Training,_validation,_and_test_data_sets). |
| hmm-rules | The formalizer built in this project (`strategies/hmm-rules/`), experimental: word classes learned from raw text by a hidden Markov model, then rules that name only function words. Called `vss` until 2026-11-27, renamed because it is an HMM plus rules, not a vector-symbolic reader. Pages: [hmm-rules](../formalizers/hmm-rules.md), [hmm-rules in depth](../hmm-rules/README.md). |
| item number | The running number `n` of a circuit in `key/items.jsonl`, shared by all packets of a run. The packet number `k` is another number. Page: [Benchmark tools](run-tools.md). |
| judge | A language-model agent that reads a message and one circuit, without knowing which strategy wrote it, and accepts or rejects the circuit by written rules (`tests/benchmark/syntax/rules.md`). Pages: [How circuits are judged](../concepts/making-and-judging.md), [Judges](../evaluation/judging.md). |
| knowledge repository | `sop-knowledge-worlds`, the sibling repository of world schemas and knowledge worlds written in SOP Lang, named by the environment variable `SOP_KNOWLEDGE_DIR`. Until the morning of 2026-11-27 the old checker of the nlu schema needed it. The formalizers no longer read it: `run.mjs` removes that variable. Page: [Worlds](../concepts/worlds.md). |
| L9 | A level: the circuit equals the label its message had before the run, so no judge was needed. Page: [Levels](../evaluation/levels.md). |
| L10 | A level: the circuit was accepted in this run (by a judge, or in a round by agreement) and the message had another label before the run. A benchmark publication then replaces the label; a round does not. Page: [Levels](../evaluation/levels.md). |
| label | The accepted circuit of a message, in the `sop` cell of its row of the syntactic files, the only store of labels. Gold: accepted or written by a judge. Silver: settled by agreement; DistilBERT trains on silver at a lower weight. Page: [The dataset](../evaluation/dataset.md); [Wikipedia](https://en.wikipedia.org/wiki/Labeled_data). |
| labels before | The labels the messages of a run had when the run was first prepared, kept once in `key/labels-before.jsonl`. L9 and L10 compare with them, so a run's table does not change when later runs replace labels. Page: [Levels](../evaluation/levels.md). |
| levels | Where one circuit stands: L0 no valid circuit; L1 to L6 rejected, with the judge's grade; L7 unused; L8 accepted; L9 equal to the label before the run; L10 accepted while the message had another label; waiting, not judged yet. Page: [Levels](../evaluation/levels.md). |
| message | One text a user typed to the WebMeet application; one row of a dataset file. Page: [The dataset](../evaluation/dataset.md). |
| message id | `<tab>/<file>#<record>`, with the record counted from 1 after the header, for example `diagram/charts-01.csv#232`. Page: [The dataset](../evaluation/dataset.md). |
| next layer | Whatever reads the circuit afterwards, with context and knowledge, to decide what the message means. It is not part of this repository. A circuit passes when that layer only has to complete it, not undo it. Page: [Syntax and semantics](../concepts/syntax-and-semantics.md). |
| normal form | A circuit rewritten so that wire names, wire order and key order no longer show (`normalForm` in `tests/benchmark/syntax/lib.mjs`). Packets, the registry and the syntactic files hold circuits in this form. Page: [When two circuits are the same](../evaluation/normal-form.md); the idea: [canonical form](https://en.wikipedia.org/wiki/Canonical_form). |
| packet | A file of circuits for one judge, `judging/packet-<k>.jsonl`. A line is `{n, text, sop}` and does not say which strategy wrote the circuit. 200 lines by default, 170 in the random benchmark and the batch conversion; a rewriting packet holds 100 messages by default. Page: [Judge a packet](../guides/judge-a-packet.md). |
| parked | The former word for experimental, used for prolog and z3 until 2026-11-27. Page: [Formalizers](../formalizers/README.md). |
| registry | The folder of judge decisions, `webmeet-dataset/annotations/syntax/v1/judged/`: one line per circuit a judge read or wrote, with the reason. A circuit it holds is never judged again. Page: [Storage](storage.md#the-registry). |
| retired | A strategy listed in `retiredModules`: left out of rounds and benchmark, because it writes nearly the same circuits as one of the five that take part. Its code is kept and still runs by name (`run.mjs --only`). Page: [Retired formalizers](../formalizers/retired.md). |
| rvss | The vector-symbolic reader being designed now, in the folder `strategies/rvss/` (first called strict-vss). Page: [Formalizers](../formalizers/README.md). |
| semantic layer | `webmeet-dataset/semantic/`: the messages with their semantic circuits, which say what was asked. Page: [The dataset](../evaluation/dataset.md). |
| settle | The step `round.mjs settle`: it accepts circuits by agreement, picks the audit share and prepares packets for a judge. Page: [Converting the dataset](../evaluation/conversion.md). |
| syntactic layer | `webmeet-dataset/syntactic/`: the same messages, in the same files and order, with their syntactic circuits, the labels. Page: [The dataset](../evaluation/dataset.md). |
| tab | The top folder of a dataset file: `calendar`, `diagram`, `document` or `drawing`, one per area of the application. Page: [The dataset](../evaluation/dataset.md). |
| verdict | A judge's decision on one circuit: accepted (grade L8) or rejected (L1 to L6), with a one-sentence note. A rejection quotes words of the message. Page: [Judges](../evaluation/judging.md). |
| vss | The former name of [hmm-rules](#project-terms), until 2026-11-27; old run folders (`vss.jsonl`) and registry lines written before the rename still say `vss`, and the benchmark tools read it as hmm-rules. Not to be confused with rvss, the real vector-symbolic reader. Page: [hmm-rules: Name](../formalizers/hmm-rules.md#name). |
| waiting | A circuit no judge has read yet. It counts in the denominator of GOAL but not in the numerator, so GOAL can only rise as waiting circuits are judged. Page: [Levels](../evaluation/levels.md). |
| written alike | Two circuits count as the same under an agreement key: `core` (equal cores), `relaxed` (equal up to where each relation with a marker starts) or `variants` (also up to the other choices the judges' rules let pass either way). Page: [Agreement](../evaluation/agreement.md). |

## Trials and training

| Term | Meaning |
| --- | --- |
| development messages | Labelled messages kept out of training, to choose settings and check progress while training. They are not the benchmark. Page: [DistilBERT details](../formalizers/distilbert-details.md); [Wikipedia](https://en.wikipedia.org/wiki/Training,_validation,_and_test_data_sets). |
| DistilBERT evidence | A lever trial. A per-word table, learned from DistilBERT's circuits, says how a word is used: verb, word of a nominal, modifier, marker, other. Where the table is sure and hmm-rules disagrees, hmm-rules keeps the word off the stations the table rules out. "On the verb" uses it for the verb only; "on roles" for all five uses. Results: [Progress over time](../STATUS.md#progress-over-time). |
| epoch | One pass of training over all training examples. Page: [Retrain the DistilBERT model](../guides/retrain-distilbert.md). |
| lever trial | An experiment on a copy of hmm-rules that adds one learned aid, judged against the same copy without it on the same benchmark messages. A lever is a change beyond adding single rules. Results: [Progress over time](../STATUS.md#progress-over-time). |
| station prior | A lever trial: the station tagger of hmm-rules trained again, with the accepted circuits mapped to stations as a weighted starting point. Results: [Progress over time](../STATUS.md#progress-over-time). |

## Notation terms

| Term | Meaning |
| --- | --- |
| `core.module` | A built-in type of SOP Lang that declares a module, such as a schema, and the types it exports: `@syntax core.module name=syntax version=3 exports=clause …`. Pages: [Schemas](../concepts/schemas.md), [exact rules](sop-lang.md#the-built-in-schema-types). |
| `core.slot` | Declares one key of a type: the kind of value (`kind=string`, or `kind=ref` with `type=…`), whether it may repeat (`many=true`), whether it must be there (`required=true present=true`), the allowed atoms (`enum=…`). Page: [Schemas](../concepts/schemas.md). |
| `core.type` | Declares a type of wire. `closed=true` means that wires of the type accept only declared keys. Page: [Schemas](../concepts/schemas.md). |
| knowledge world | A world of facts true for everyone (`k.*`), such as `k.animals` ("a rabbit is a mammal") or `k.colours`. Page: [Worlds](../concepts/worlds.md). |
| live world | One running instance of a world schema in a session, such as the meetings a user has made today. Page: [Worlds](../concepts/worlds.md). |
| schema | The declaration of which wire types exist, which keys each may have and what kind of value each key takes. In SOP Lang it is itself written in wires. Page: [Schemas](../concepts/schemas.md); the idea: [database schema](https://en.wikipedia.org/wiki/Database_schema). |
| SOP Lang | The project's declarative notation: one statement per wire, `@id type key=value …`. Defined in `soplang-words-lib/docs/language.md` (v1.1). Pages: [SOP Lang](../concepts/sop-lang.md), [exact rules](sop-lang.md). |
| value | What stands after `=`. A string, in double quotes: here, words of the message. An atom: any other unquoted value, whose meaning the slot's kind decides (`form=imperative`). A reference `$id` to another wire. A variable `?name`, only in [matrix wires](sop-lang.md#facts-and-the-matrix) (rules, schemas) and in queries, never in a circuit. Page: [Exact rules](sop-lang.md#values). |
| wire | One statement of SOP Lang: `@id type key=value …`. In a circuit it is one clause, nominal, relation or coordination. Page: [SOP Lang](../concepts/sop-lang.md). |
| world schema | A world that says what a kind of world is (`w.*`): its kinds of things, their attributes, the acts. Examples: `w.calendar`, `w.request`. Page: [Worlds](../concepts/worlds.md). |

## Grammar terms

| Term | Meaning |
| --- | --- |
| attachment | Which word or phrase another phrase belongs to. In "put the cat on the table", "on the table" may go with "put" or with "the cat". In a circuit, a relation with a marker starts at its attachment site (`from`); `attachment=ambiguous` says that the words do not settle it. Page: [Phrases](../concepts/grammar-phrases.md); [Wikipedia](https://en.wikipedia.org/wiki/Syntactic_ambiguity). |
| auxiliary | A helping verb: "can", "do", "was", "would" (key `auxiliary` of a clause). Page: [The clause](../concepts/grammar-clause.md); [Wikipedia](https://en.wikipedia.org/wiki/Auxiliary_verb). |
| clause | One verb with what belongs to it: one command, statement or question; or a group of words with no verb (a fragment). Wire type `syntax.clause`. Page: [The clause](../concepts/grammar-clause.md); [Wikipedia](https://en.wikipedia.org/wiki/Clause). |
| complement | The other nominals the verb takes: its objects and its predicative complement (key `complement`). It does not say what the nominal is to the verb. Page: [The clause](../concepts/grammar-clause.md); [Wikipedia](https://en.wikipedia.org/wiki/Complement_(linguistics)). |
| conjunct | One of the things put side by side in a coordination (key `conjunct`). Page: [Phrases](../concepts/grammar-phrases.md). |
| coordination | Things or clauses put side by side with a conjunction such as "and", "or", "but", "then". Wire type `syntax.coordination`. Page: [Phrases](../concepts/grammar-phrases.md); [Wikipedia](https://en.wikipedia.org/wiki/Coordination_(linguistics)). |
| dependent | A word that depends on a head. In a nominal, every word other than the head: determiners, numerals, adjectives, nouns that modify the head (key `dependent`). Page: [Phrases](../concepts/grammar-phrases.md); [Wikipedia](https://en.wikipedia.org/wiki/Dependency_grammar). |
| discourse | A word said to the listener, outside the grammar of the clause: "please", "hey", "thanks" (key `discourse`). Page: [The clause](../concepts/grammar-clause.md); [Wikipedia](https://en.wikipedia.org/wiki/Discourse_marker). |
| ellipsis | Words left out because they can be recovered from elsewhere. The key `ellipsis` on a fragment names the clause whose verb, auxiliaries and negation it shares, as in "make A blue and B green"; this kind is called gapping. Page: [The clause](../concepts/grammar-clause.md); [Wikipedia](https://en.wikipedia.org/wiki/Ellipsis_(linguistics)). |
| form | What kind of clause it is by its build: `imperative` (a command), `declarative` (a statement), `interrogative` (a question), `nonfinite` or `fragment` (key `form`). The related property of the verb is its [mood](https://en.wikipedia.org/wiki/Grammatical_mood). Page: [The clause](../concepts/grammar-clause.md). |
| fragment | A clause with no verb: "pie radius smaller", "a fireplace" (`form=fragment`). Page: [The clause](../concepts/grammar-clause.md). |
| function word | One of the small closed set of words that build the grammar: "the", "a", "to", "of", "and", "if", "it", "can". The project's rules may name these, never content words. Page: [Phrases](../concepts/grammar-phrases.md); [Wikipedia](https://en.wikipedia.org/wiki/Function_word). |
| head | The main word of a group, the one the others describe: "boxes" in "the two small red boxes" (key `head`). Page: [Phrases](../concepts/grammar-phrases.md); [Wikipedia](https://en.wikipedia.org/wiki/Head_(linguistics)). |
| marker | The linking word of a relation: a preposition ("on", "next to", "of"), the possessive "'s", a subordinator ("if", "because"), or the "to" of an infinitive (key `marker`). Page: [Phrases](../concepts/grammar-phrases.md); [Wikipedia](https://en.wikipedia.org/wiki/Adposition). |
| modifier | A word that adds to the meaning without being required: "slowly" in "move it slowly", "red" in "make it red", "up" in "tidy up" (key `modifier` of a clause). Page: [The clause](../concepts/grammar-clause.md); [Wikipedia](https://en.wikipedia.org/wiki/Grammatical_modifier). |
| negation | The word that says no: "not", "n't", "never". Key `negation` of a clause, or of a relation alone, as "not" in "not behind Jo". Page: [The clause](../concepts/grammar-clause.md). |
| nominal | The words that describe one thing (a noun phrase), or a pronoun, name or number that stands in its place; the term of Universal Dependencies. Wire type `syntax.nominal`. Page: [Phrases](../concepts/grammar-phrases.md); [Wikipedia](https://en.wikipedia.org/wiki/Noun_phrase). |
| nonfinite | A verb form that cannot make a sentence by itself: "facing left", "delete" after "to" (`form=nonfinite`). Page: [The clause](../concepts/grammar-clause.md); [Wikipedia](https://en.wikipedia.org/wiki/Nonfinite_verb). |
| relation | A tie between two wires (`from`, `to`), usually through a marker. Wire type `syntax.relation`. In dependency grammar, a dependency relation. Page: [Phrases](../concepts/grammar-phrases.md); [Wikipedia](https://en.wikipedia.org/wiki/Dependency_grammar). |
| subject | Who or what the verb is said of, when the words show one: "the box" in "the box was moved by Ana" (key `subject`). Page: [The clause](../concepts/grammar-clause.md); [Wikipedia](https://en.wikipedia.org/wiki/Subject_(grammar)). |
| verb | The word that says what is done or what is the case: "move", "is" (key `verb`). Page: [The clause](../concepts/grammar-clause.md); [Wikipedia](https://en.wikipedia.org/wiki/Verb). |

## NLP and statistics

| Term | Meaning |
| --- | --- |
| 95% interval | A range around a measured share, computed from how many messages were measured, such that ranges built this way contain the true share in 95% of samples (here the Wilson score interval). On 1,831 messages a GOAL is known to about ±2 points, so a difference of 1 or 2 points between two separate measurements can be chance. Page: [Limits of the measurements](../evaluation/validity.md); [Wikipedia](https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Wilson_score_interval). |
| acceptance sampling | A method of quality control: read a random sample of a batch to decide whether to accept the batch. The audit applies it to circuits accepted by agreement. Page: [The audit](../evaluation/audit.md); [Wikipedia](https://en.wikipedia.org/wiki/Acceptance_sampling). |
| Baum–Welch | Expectation–maximization in its form for hidden Markov models. hmm-rules trains its stations with it. Page: [Methods hmm-rules uses](../hmm-rules/methods.md); [Wikipedia](https://en.wikipedia.org/wiki/Baum%E2%80%93Welch_algorithm). |
| chunking | Grouping the words of a sentence into flat, non-overlapping phrases (noun groups, verb groups) without building a full tree; also called shallow parsing. A nominal of the syntax schema is close to such a flat noun phrase. Page: [How grammar is written down](../concepts/grammar-notation.md); [Wikipedia](https://en.wikipedia.org/wiki/Shallow_parsing). |
| co-training | Learning from two different views of the data that confirm each other. Labels by agreement of strategies with different sources rest on the same idea. Page: [Agreement](../evaluation/agreement.md); [Wikipedia](https://en.wikipedia.org/wiki/Co-training). |
| data leakage | A score inflated because the model saw, in training, the answers of the messages it is measured on. Page: [Limits of the measurements](../evaluation/validity.md); [Wikipedia](https://en.wikipedia.org/wiki/Leakage_(machine_learning)). |
| dependency parse | A tree in which every word points to the word it depends on (its head), with a name for the kind of tie. spaCy's parser builds one, and the spacy strategy starts from it. Page: [How grammar is written down](../concepts/grammar-notation.md); [Wikipedia](https://en.wikipedia.org/wiki/Dependency_grammar). |
| EM | Expectation–maximization: training without labels. Guess the parameters, compute the expected counts under the guess, re-estimate the parameters from them, and repeat. Page: [Methods hmm-rules uses](../hmm-rules/methods.md); [Wikipedia](https://en.wikipedia.org/wiki/Expectation%E2%80%93maximization_algorithm). |
| forward–backward | An algorithm that gives, for every word, the probability of each state given the whole sentence: the posterior. It computes the expected counts of EM. hmm-rules calls the posterior of the chosen station its "confidence". Page: [Methods hmm-rules uses](../hmm-rules/methods.md); [Wikipedia](https://en.wikipedia.org/wiki/Forward%E2%80%93backward_algorithm). |
| HMM | Hidden Markov model: a model of a sequence in which each word is produced by a hidden state, and each state depends only on the state before it. It has transition, emission, start and end probabilities. The stations of hmm-rules are its states. Page: [Methods hmm-rules uses](../hmm-rules/methods.md); [Wikipedia](https://en.wikipedia.org/wiki/Hidden_Markov_model). |
| LLM as judge | Using a large language model to evaluate outputs by written criteria. The project's judges work this way; how often two judges, or a judge and a person, agree on this schema has not been measured. Page: [Judges](../evaluation/judging.md); [Wikipedia: large language model](https://en.wikipedia.org/wiki/Large_language_model). |
| POS tag | Part-of-speech tag: the word class of a word in context, such as noun, verb or preposition. A station of hmm-rules is close to a fine-grained one. Page: [Methods hmm-rules uses](../hmm-rules/methods.md); [Wikipedia](https://en.wikipedia.org/wiki/Part-of-speech_tagging). |
| PPMI | Positive pointwise mutual information: how much more often than chance two words stand together, with negative values set to zero. hmm-rules uses it to build its word vectors. Page: [Methods hmm-rules uses](../hmm-rules/methods.md); [Wikipedia](https://en.wikipedia.org/wiki/Pointwise_mutual_information). |
| UD | Universal Dependencies: the most widely used scheme for annotating syntax, with one set of dependency relation names for many languages (Nivre et al. 2016; de Marneffe et al. 2021). The syntax schema takes several of its names from it, such as nominal and discourse. Page: [How grammar is written down](../concepts/grammar-notation.md); [Wikipedia](https://en.wikipedia.org/wiki/Universal_Dependencies). |
| Viterbi | Finding the single most probable state sequence of a sentence by dynamic programming. hmm-rules tags a message with it. Page: [Methods hmm-rules uses](../hmm-rules/methods.md); [Wikipedia](https://en.wikipedia.org/wiki/Viterbi_algorithm). |

## hmm-rules' own names

The hmm-rules reader uses names of its own. Each one is defined, with the established term it corresponds to, on [hmm-rules' own names](../hmm-rules/names.md). The three met most often on other pages:

| Term | Meaning |
| --- | --- |
| legend | the hand-written file of hmm-rules in SOP Lang, `strategies/hmm-rules/legend.sop`: the stations, a starting guess of which station follows which, the closed lists of function words, word endings and irregular forms. Page: [The legend](../hmm-rules/legend.md). |
| linker | The part of hmm-rules that builds clauses, relations and coordinations from the words and their stations, by rules with thresholds, in one pass. Page: [Linking](../hmm-rules/linking.md). |
| station | One of the 25 kinds of position a word can stand in, which hmm-rules learns from raw text: the hidden state of its HMM, close to a fine-grained part-of-speech tag. Page: [The stations](../hmm-rules/stations.md). |

Next: [SOP Lang: exact rules](sop-lang.md) · Up: [Reference](README.md)
