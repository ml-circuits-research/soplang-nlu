"""Training documents for spaCy from the converted trees.

python docbin.py <model> <out.spacy> <trees.jsonl> [<trees.jsonl> ...]
Each tree line: {text, tokens: [{text, start, end, tag, head, dep}]} over the parser's own tokens.
"""
import json
import sys


def main():
    model, target, *sources = sys.argv[1:]
    import spacy
    from spacy.tokens import Doc, DocBin
    nlp = spacy.blank("en")
    known = set(spacy.load(model, exclude=["ner"]).get_pipe("tagger").labels)  # a tag the tagger has no label for is left missing
    store = DocBin(attrs=["TAG", "HEAD", "DEP", "SENT_START"])
    count = refused = 0
    for source in sources:
        for line in open(source):
            if not line.strip():
                continue
            row = json.loads(line)
            tokens = row["tokens"]
            spaces = [tokens[i + 1]["start"] > t["end"] if i + 1 < len(tokens) else False for i, t in enumerate(tokens)]
            try:
                doc = Doc(nlp.vocab, words=[t["text"] for t in tokens], spaces=spaces, tags=[t["tag"] if t["tag"] in known else "" for t in tokens],
                          heads=[t["head"] for t in tokens], deps=[t["dep"] for t in tokens])
            except Exception as error:
                refused += 1
                print("refused:", row["text"][:80], error, file=sys.stderr)
                continue
            store.add(doc)
            count += 1
    store.to_disk(target)
    print(json.dumps(dict(documents=count, refused=refused, target=target)))


if __name__ == "__main__":
    main()
