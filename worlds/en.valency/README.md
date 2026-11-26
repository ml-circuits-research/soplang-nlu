# English verb frames

The world records syntactic complements licensed by at least one sense of an English lemma in Princeton WordNet 3.1. Each fact pairs a lemma with one or more argument structures. The frame inventory contains grammatical descriptions only. It has no utterances, SOP readings, frequencies estimated from the evaluation corpus, or information about which sense is intended in a particular sentence.

For example, an object followed by an infinitive is a licensed structure for “want”. A parser can use that evidence when choosing how to split “I want the square to move”. An absent licence does not establish ungrammaticality. WordNet's frame inventory is incomplete, and the records here merge senses.

Regenerate with `node worlds/en.valency/import.mjs /path/to/wordnet31/data.verb`. The importer reads the verb database's frame column. A zero word number applies the frame to all lemmas in the synset. Other word numbers apply it only to the designated lemma. The mapping of the 35 WordNet frame numbers to syntactic families is in the importer. It ignores glosses, example sentences, and semantic links. The source database and derived facts are distributed under the accompanying [WordNet licence](LICENSE).
