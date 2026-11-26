"""A compact graph grammar with pointers into the exact input tokens."""
import re

POINTER = re.compile(r"<extra_id_([0-9]+)>")
MAX_POINTER = 99


def pointer(i):
    if not 0 <= i <= MAX_POINTER:
        raise ValueError("Pointer exceeds model vocabulary")
    return f"<extra_id_{i}>"


def index(token, maximum):
    match = POINTER.fullmatch(token)
    if not match or int(match[1]) >= maximum:
        raise ValueError("Invalid pointer")
    return int(match[1])


def source(tokens):
    return " ".join(pointer(i) + " " + t["text"] for i, t in enumerate(tokens))


def encode(nodes):
    order = sorted(range(len(nodes)), key=lambda i: (nodes[i]["anchor"], nodes[i]["type"], i))
    position = {original: i for i, original in enumerate(order)}
    symbols = []
    for i in order:
        n = nodes[i]
        symbols.extend(["<node:" + n["type"] + ">", pointer(n["anchor"])])
        # Preserve repeated keys in their original order (including sequence members).
        for a in sorted(n["attrs"], key=lambda a: a["key"]):
            key = a["key"]
            if "target" in a:
                symbols.extend(["<ref:" + key + ">", pointer(position[a["target"]])])
            elif "atom" in a:
                symbols.append("<atom:" + key + ":" + a["atom"] + ">")
            else:
                wide = a["end"] > a["start"] + 1
                symbols.extend([("<range:" if wide else "<word:") + key + ">", pointer(a["start"])])
                if wide:
                    symbols.append(pointer(a["end"] - 1))
    return symbols


def decode(symbols, token_count):
    nodes = []
    it = iter(symbols)
    try:
        for token in it:
            if not token.startswith("<") or not token.endswith(">"):
                raise ValueError("Expected a graph symbol")
            mode, payload = token[1:-1].split(":", 1)
            if mode == "node":
                nodes.append(dict(type=payload, anchor=index(next(it), token_count), attrs=[]))
                continue
            if not nodes:
                raise ValueError("Expected node before attributes")
            if mode == "atom":
                key, atom = payload.split(":", 1)
                attr = dict(key=key, atom=atom)
            elif mode == "ref":
                attr = dict(key=payload, target=index(next(it), MAX_POINTER + 1))
            elif mode in ("word", "range"):
                start = index(next(it), token_count)
                end = index(next(it), token_count) + 1 if mode == "range" else start + 1
                if end <= start:
                    raise ValueError("Reversed source span")
                attr = dict(key=payload, start=start, end=end)
            else:
                raise ValueError("Unexpected symbol type")
            nodes[-1]["attrs"].append(attr)
    except StopIteration as error:
        raise ValueError("Missing attribute value") from error
    if any(a.get("target", 0) >= len(nodes) for n in nodes for a in n["attrs"]):
        raise ValueError("Missing edge target")
    return nodes
