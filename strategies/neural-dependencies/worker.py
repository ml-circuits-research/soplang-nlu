"""Persistent, source-only dependency parser. stdout is a JSON Lines stream."""
import json
import sys


def write(value):
    print(json.dumps(value, ensure_ascii=True, separators=(",", ":")), flush=True)


def tokenize(document, source):
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


def parse_beam(pipeline, source, document, greedy):
    # Use the same lexical evidence and encoded features as the greedy pass.
    # A new document avoids inheriting greedy sentence boundaries.
    before = pipeline.make_doc(source)
    before.tensor = document.tensor
    if document.has_extension("trf_data"):
        before._.trf_data = document._.trf_data
    for first, second in zip(before, document):
        first.tag = second.tag
    parser = pipeline.get_pipe("parser")
    beam = parser.beam_parse([before], beam_width=8, beam_density=0.0001)[0]
    alternatives = []
    seen = set()
    for score, arcs in parser.moves.get_beam_parses(beam):
        tokens = [dict(token, dep="ROOT", head=token["i"]) for token in greedy]
        for head, index, dependency in arcs:
            tokens[index]["head"] = head
            tokens[index]["dep"] = dependency
        signature = tuple((token["head"], token["dep"]) for token in tokens)
        if signature in seen:
            continue
        seen.add(signature)
        alternatives.append(dict(score=score, tokens=tokens))
        if len(alternatives) == 3:
            break
    return alternatives


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
            request = json.loads(line)
            beam = isinstance(request, dict) and request.get("beam") is True
            source = request.get("text") if beam else request
            if not isinstance(source, str):
                raise ValueError("Expected a source string")
            document = parser(source)
            tokens = tokenize(document, source)
            if beam:
                write(dict(tokens=tokens, alternatives=parse_beam(parser, source, document, tokens)))
            else:
                write(dict(tokens=tokens))
        except Exception as error:
            write(dict(error=str(error)))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        write(dict(error=str(error)))
        sys.exit(1)
