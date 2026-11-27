"""Parse texts with a spaCy pipeline on the GPU and write the tokens exactly as the strategy's worker does.

python parse.py <model> <in.jsonl> <out.jsonl> [--beam] [--cpu]
Each input line has `text`; each output line is {text, tokens[, alternatives]} (worker.py's format).
"""
import json
import sys
import time

sys.path.insert(0, "/home/salboaie/work/sopworlds/soplang-nlu/strategies/neural-dependencies")
from worker import tokenize, parse_beam  # noqa: E402


def main():
    model, source, target = sys.argv[1:4]
    beam = "--beam" in sys.argv
    import spacy
    if "--cpu" not in sys.argv:
        spacy.require_gpu()
    nlp = spacy.load(model, exclude=["ner", "textcat"])
    rows = [json.loads(line) for line in open(source) if line.strip()]
    texts = [row["text"] for row in rows]
    started = time.time()
    with open(target, "w") as out:
        for text, doc in zip(texts, nlp.pipe(texts, batch_size=128)):
            tokens = tokenize(doc, text)
            line = dict(text=text, tokens=tokens)
            if beam:
                line["alternatives"] = parse_beam(nlp, text, doc, tokens)
            out.write(json.dumps(line, ensure_ascii=True) + "\n")
    print(json.dumps(dict(texts=len(texts), seconds=round(time.time() - started, 1))), file=sys.stderr)


if __name__ == "__main__":
    main()
