"""Give constructed trees the parts of speech and lemmas the pipeline would give them.

python realize.py <model> <in.jsonl> <out.jsonl>
Each input line: {key, text, tokens} (worker format; tag, head, dep are the constructed ones). The pipeline's
attribute_ruler and lemmatizer run on a Doc with those tags and arcs; the output tokens carry their pos and lemma.
"""
import json
import sys


def main():
    model, source, target = sys.argv[1:4]
    import spacy
    from spacy.tokens import Doc
    nlp = spacy.load(model, exclude=["ner", "textcat"])
    ruler = nlp.get_pipe("attribute_ruler")
    lemmatizer = nlp.get_pipe("lemmatizer")
    with open(target, "w") as out:
        for line in open(source):
            if not line.strip():
                continue
            row = json.loads(line)
            tokens = row["tokens"]
            text = row["text"]
            words = [token["text"] for token in tokens]
            spaces = []
            for i, token in enumerate(tokens):
                nxt = tokens[i + 1]["start"] if i + 1 < len(tokens) else None
                spaces.append(nxt > token["end"] if nxt is not None else False)
            try:
                doc = Doc(nlp.vocab, words=words, spaces=spaces, tags=[t["tag"] for t in tokens],
                          heads=[t["head"] for t in tokens], deps=[t["dep"] for t in tokens])
                doc = lemmatizer(ruler(doc))
                for token, word in zip(tokens, doc):
                    token["pos"] = word.pos_
                    token["lemma"] = word.lemma_
                row["ok"] = True
            except Exception as error:  # a tree spaCy refuses
                row["ok"] = False
                row["error"] = str(error)
            out.write(json.dumps(row, ensure_ascii=True) + "\n")


if __name__ == "__main__":
    main()
