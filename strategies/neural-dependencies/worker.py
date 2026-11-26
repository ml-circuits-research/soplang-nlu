"""Persistent, source-only dependency parser. stdout is a JSON Lines stream."""
import json
import sys


def write(value):
    print(json.dumps(value, ensure_ascii=True, separators=(",", ":")), flush=True)


def tokenize(parser, source):
    document = parser(source)
    # JavaScript offsets count UTF-16 code units. Python indexes code points.
    units = [0]
    for character in source:
        units.append(units[-1] + (2 if ord(character) > 0xffff else 1))
    return [
        dict(i=word.i, text=word.text, start=units[word.idx],
             end=units[word.idx + len(word)], pos=word.pos_, tag=word.tag_,
             dep=word.dep_, head=word.head.i, lemma=word.lemma_)
        for word in document
    ]


def main():
    import spacy
    parser = spacy.load(sys.argv[1], exclude=["ner", "textcat"])
    if "parser" not in parser.pipe_names or parser.lang != "en":
        raise ValueError("The selected pipeline must provide an English dependency parser")
    write(dict(metadata=dict(library="spacy", version=spacy.__version__,
                             model=parser.meta["name"], modelVersion=parser.meta["version"],
                             pipeline=parser.pipe_names, sources=parser.meta.get("sources", []))))
    for line in sys.stdin:
        try:
            source = json.loads(line)
            if not isinstance(source, str):
                raise ValueError("Expected a source string")
            write(dict(tokens=tokenize(parser, source)))
        except Exception as error:
            write(dict(error=str(error)))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        write(dict(error=str(error)))
        sys.exit(1)
