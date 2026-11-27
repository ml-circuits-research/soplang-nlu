import sys, json
import spacy
from spacy.tokens import DocBin
nlp = spacy.blank("en")
for path, out in zip(sys.argv[1::2], sys.argv[2::2]):
    db = DocBin().from_disk(path)
    n = 0
    with open(out, "w") as f:
        for doc in db.get_docs(nlp.vocab):
            f.write(json.dumps({"text": doc.text}) + "\n"); n += 1
    print(path, n)
