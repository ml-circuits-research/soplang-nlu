"""Source-grounded native graph heads over the official DistilBERT encoder."""
from collections import Counter, defaultdict
import json
from pathlib import Path

import torch
from torch import nn
from torch.nn import functional as F
from transformers import AutoModel, AutoTokenizer


REQUIRED = {
    "clause": {"form"},
    "relation": {"kind", "from", "to"},
    "coordination": {"kind", "member"},
}
# What a node needs when the label sets of the old annotations are not queried (see decode_one):
# the same structure, without the kind of a tie or of a group.
STRUCTURE = {
    "clause": {"form"},
    "relation": {"from", "to"},
    "coordination": {"member"},
}


def attribute_kind(attribute):
    shapes = [kind for kind, key in [("atom", "atom"), ("span", "start"), ("ref", "target")]
              if key in attribute]
    if len(shapes) != 1:
        raise ValueError("Expected exactly one atom, span, or reference per attribute")
    return shapes[0]


def keyed_nodes(row):
    counts = Counter()
    for node in row["nodes"]:
        anchor, kind = node["anchor"], node["type"]
        key = (anchor, kind)
        ordinal = counts[key]
        counts[key] += 1
        yield node, (kind, ordinal)


def keyed_attributes(node):
    counts = Counter()
    for attribute in node["attrs"]:
        kind = attribute_kind(attribute)
        key = (node["type"], attribute["key"], kind)
        ordinal = counts[key]
        counts[key] += 1
        yield attribute, (*key, ordinal)


def validate_row(row, annotated=True):
    if not isinstance(row["text"], str) or not isinstance(row["tokens"], list):
        raise ValueError("Expected text and its token list")
    source = row["text"].encode("utf-16-le", errors="surrogatepass")
    previous = 0
    for token in row["tokens"]:
        start, end = token["start"], token["end"]
        if type(start) is not int or type(end) is not int or not previous <= start < end <= len(source) // 2:
            raise ValueError("Token boundaries are invalid")
        if source[start*2:end*2].decode("utf-16-le", errors="surrogatepass") != token["text"]:
            raise ValueError("Token spans do not agree with the literal source")
        previous = end
    if not annotated:
        return
    token_count = len(row["tokens"])
    nodes = row["nodes"]
    for node in nodes:
        if type(node["anchor"]) is not int or not 0 <= node["anchor"] < token_count:
            raise ValueError("Invalid native node anchor")
        if not isinstance(node["type"], str) or not isinstance(node["attrs"], list):
            raise ValueError("Invalid native node type or attributes")
        for attribute in node["attrs"]:
            kind = attribute_kind(attribute)
            if not isinstance(attribute["key"], str):
                raise ValueError("Attribute needs a schema slot key")
            if kind == "span" and not 0 <= attribute["start"] < attribute["end"] <= token_count:
                raise ValueError("Invalid token-indexed source span")
            if kind == "ref" and not 0 <= attribute["target"] < len(nodes):
                raise ValueError("Invalid graph reference")
            if kind == "atom" and not isinstance(attribute["atom"], str):
                raise ValueError("Invalid atomic slot value")


class Vocabulary:
    def __init__(self, spec):
        self.spec = spec
        self.nodes = [tuple(item) for item in spec["nodes"]]
        self.attributes = [tuple(item) for item in spec["attributes"]]
        self.atoms = spec["atoms"]
        self.node_ids = {item: i for i, item in enumerate(self.nodes)}
        self.attribute_ids = {item: i for i, item in enumerate(self.attributes)}
        self.atom_ids = {item: i for i, item in enumerate(self.atoms)}
        self.by_node = defaultdict(list)
        self.span_slots = defaultdict(list)
        self.span_limits = Counter()
        for i, (owner, key, kind, ordinal) in enumerate(self.attributes):
            self.by_node[owner].append(i)
            if kind == "span":
                self.span_slots[owner].append(i)
                self.span_limits[owner, key] = max(self.span_limits[owner, key], ordinal + 1)

    @classmethod
    def build(cls, rows):
        nodes = set()
        slots = set()
        atoms = set()
        allowed_atoms = defaultdict(set)
        target_types = defaultdict(set)
        width = 1
        for row in rows:
            for node, node_slot in keyed_nodes(row):
                nodes.add(node_slot)
                for attribute, slot in keyed_attributes(node):
                    slots.add(slot)
                    if slot[2] == "atom":
                        value = attribute["atom"]
                        atoms.add(value)
                        allowed_atoms[slot].add(value)
                    elif slot[2] == "ref":
                        target_types[slot].add(row["nodes"][attribute["target"]]["type"])
                    else:
                        width = max(width, attribute["end"] - attribute["start"])
        nodes, slots, atoms = sorted(nodes), sorted(slots), sorted(atoms)
        if not nodes or not slots:
            raise ValueError("Training contains no native graph labels")
        atom_ids = {atom: i for i, atom in enumerate(atoms)}
        return cls({
            "nodes": nodes, "attributes": slots, "atoms": atoms, "max_span": width,
            "allowed_atoms": [sorted(atom_ids[value] for value in allowed_atoms[s]) for s in slots],
            "target_types": [sorted(target_types[s]) for s in slots],
        })


def tokenize_batch(tokenizer, rows, device, window=512):
    words = [[token["text"] for token in row["tokens"]] for row in rows]
    encoded = tokenizer(words, is_split_into_words=True, padding=True, return_tensors="pt",
                        verbose=False)
    if encoded["input_ids"].shape[1] > window:
        raise ValueError(f"Source needs more than {window} DistilBERT wordpieces")
    width = max(map(len, words))
    index = [[-1 if word is None else word for word in encoded.word_ids(i)]
             for i in range(len(rows))]
    index = torch.tensor(index, device=device)
    size = torch.tensor(list(map(len, words)), device=device)
    valid = torch.arange(width, device=device).unsqueeze(0) < size.unsqueeze(1)
    return encoded["input_ids"].to(device), encoded["attention_mask"].to(device), index, valid


class NativeDistilBert(nn.Module):
    def __init__(self, encoder, vocabulary, hidden=192, ownership=False):
        super().__init__()
        self.encoder = encoder
        self.vocab = vocabulary
        self.hidden = hidden
        self.words = nn.Sequential(nn.Linear(encoder.config.hidden_size, hidden), nn.GELU(), nn.LayerNorm(hidden))
        self.detect = nn.Linear(hidden, len(vocabulary.nodes))
        self.node_slot = nn.Embedding(len(vocabulary.nodes), hidden)
        self.node_repr = nn.Sequential(nn.Linear(hidden, hidden), nn.GELU(), nn.LayerNorm(hidden))
        self.attributes = nn.Linear(hidden, len(vocabulary.attributes))
        self.attribute_slot = nn.Embedding(len(vocabulary.attributes), hidden)
        self.pointer_start = nn.Linear(hidden, hidden, bias=False)
        self.pointer_end = nn.Linear(hidden, hidden, bias=False)
        self.reference = nn.Linear(hidden, hidden, bias=False)
        self.atom = nn.Linear(hidden, max(1, len(vocabulary.atoms)))
        self.scale = hidden ** -.5
        self.ownership = ownership
        if ownership:
            self.owner_words = nn.Linear(hidden, hidden, bias=False)
            self.owner_begin = nn.Linear(hidden, hidden, bias=False)
            self.owner_inside = nn.Linear(hidden, hidden, bias=False)
            self.unassigned = nn.Linear(hidden, 1)

    def encode(self, batch):
        ids, attention, index, valid = batch
        pieces = self.encoder(input_ids=ids, attention_mask=attention).last_hidden_state
        active = index >= 0
        token_ids = index.clamp(min=0)
        pooled = pieces.new_zeros(pieces.shape[0], valid.shape[1], pieces.shape[2])
        counts = pieces.new_zeros(pieces.shape[0], valid.shape[1])
        pooled.scatter_add_(1, token_ids.unsqueeze(-1).expand_as(pieces), pieces * active.unsqueeze(-1))
        counts.scatter_add_(1, token_ids, active.to(pieces.dtype))
        words = self.words(pooled / counts.clamp(min=1).unsqueeze(-1))
        return words, self.detect(words), valid

    def node_features(self, words, positions, slots):
        return self.node_repr(words[positions] + self.node_slot(slots))

    def attr_features(self, owners, slots):
        return owners + self.attribute_slot(slots)

    def loss(self, batch, rows):
        words, logits, valid = self.encode(batch)
        gold_detection = torch.zeros_like(logits)
        attr_logits, attr_gold, attr_mask = [], [], []
        span_queries, span_batch, span_gold = [], [], []
        atom_queries, atom_slots, atom_gold = [], [], []
        ref_logits, ref_gold = [], []
        ownership_losses = []
        device = words.device
        for i, row in enumerate(rows):
            if not row["nodes"]:
                continue
            ordered = list(keyed_nodes(row))
            positions = torch.tensor([node["anchor"] for node, _ in ordered], device=device)
            slots = torch.tensor([self.vocab.node_ids[key] for _, key in ordered], device=device)
            gold_detection[i, positions, slots] = 1
            nodes = self.node_features(words[i], positions, slots)
            output = self.attributes(nodes)
            if self.ownership:
                ownership_losses.append(self.ownership_loss(words[i, valid[i]], nodes, ordered))
            gold = torch.zeros_like(output)
            mask = torch.zeros_like(output, dtype=torch.bool)
            for j, (node, _) in enumerate(ordered):
                mask[j, self.vocab.by_node[node["type"]]] = True
                attributes = list(keyed_attributes(node))
                if not attributes:
                    continue
                ids = torch.tensor([self.vocab.attribute_ids[key] for _, key in attributes], device=device)
                gold[j, ids] = 1
                features = self.attr_features(nodes[j], ids)
                for k, (attribute, key) in enumerate(attributes):
                    kind = key[2]
                    if kind == "span":
                        span_queries.append(features[k])
                        span_batch.append(i)
                        span_gold.append([attribute["start"], attribute["end"] - 1])
                    elif kind == "atom":
                        atom_queries.append(features[k])
                        atom_slots.append(self.vocab.attribute_ids[key])
                        atom_gold.append(self.vocab.atom_ids[attribute["atom"]])
                    else:
                        allowed = self.vocab.spec["target_types"][self.vocab.attribute_ids[key]]
                        invalid = torch.tensor([n["type"] not in allowed for n, _ in ordered], device=device)
                        logits_ref = (nodes @ self.reference(features[k])) * self.scale
                        ref_logits.append(logits_ref.masked_fill(invalid, -1e4))
                        ref_gold.append(attribute["target"])
            attr_logits.append(output)
            attr_gold.append(gold)
            attr_mask.append(mask)
        loss = F.binary_cross_entropy_with_logits(logits[valid], gold_detection[valid],
                                                   pos_weight=words.new_tensor(5.))
        if attr_logits:
            mask = torch.cat(attr_mask)
            loss = loss + F.binary_cross_entropy_with_logits(torch.cat(attr_logits)[mask], torch.cat(attr_gold)[mask],
                                                              pos_weight=words.new_tensor(2.))
        if span_queries:
            query = torch.stack(span_queries)
            batch_ids = torch.tensor(span_batch, device=device)
            target = torch.tensor(span_gold, device=device)
            for head, endpoint in [(self.pointer_start, 0), (self.pointer_end, 1)]:
                scores = torch.einsum("nd,nwd->nw", head(query), words[batch_ids]) * self.scale
                scores = scores.masked_fill(~valid[batch_ids], -1e4)
                loss = loss + .5 * F.cross_entropy(scores, target[:, endpoint])
        if atom_queries:
            scores = self.atom(torch.stack(atom_queries))
            mask = torch.zeros_like(scores, dtype=torch.bool)
            for i, slot in enumerate(atom_slots):
                mask[i, self.vocab.spec["allowed_atoms"][slot]] = True
            loss = loss + F.cross_entropy(scores.masked_fill(~mask, -1e4), torch.tensor(atom_gold, device=device))
        if ref_logits:
            losses = [-scores.log_softmax(-1)[target] for scores, target in zip(ref_logits, ref_gold)]
            loss = loss + torch.stack(losses).mean()
        if ownership_losses:
            loss = loss + .6 * torch.stack(ownership_losses).mean()
        return loss

    def owner_logits(self, words, nodes, pairs):
        device = words.device
        owners, slots = zip(*pairs) if pairs else ((), ())
        queries = self.attr_features(nodes[torch.tensor(owners, dtype=torch.long, device=device)],
                                     torch.tensor(slots, dtype=torch.long, device=device))
        keys = self.owner_words(words)
        start = (keys @ self.owner_begin(queries).T) * self.scale
        inside = (keys @ self.owner_inside(queries).T) * self.scale
        roles = torch.stack((start, inside), dim=-1).flatten(1)
        return torch.cat((self.unassigned(words), roles), dim=1)

    def ownership_loss(self, words, nodes, ordered):
        pairs = [(i, slot) for i, (node, _) in enumerate(ordered)
                 for slot in self.vocab.span_slots[node["type"]]]
        labels = [0] * len(words)
        pair_ids = {pair: i for i, pair in enumerate(pairs)}
        conflicts = set()
        for i, (node, _) in enumerate(ordered):
            for attr, key in keyed_attributes(node):
                if key[2] != "span":
                    continue
                pair_idx = pair_ids[i, self.vocab.attribute_ids[key]]
                for token in range(attr["start"], attr["end"]):
                    if labels[token]:
                        conflicts.add(token)
                    labels[token] = 1 + 2 * pair_idx + int(token != attr["start"])
        for token in conflicts:
            labels[token] = -100
        return F.cross_entropy(self.owner_logits(words, nodes, pairs), torch.tensor(labels, device=words.device))

    def decode(self, batch, node_threshold=.55, attribute_threshold=.55, max_nodes=64, ownership_threshold=.65,
               detail=False):
        words, logits, valid = self.encode(batch)
        return [self.decode_one(w[m], l[m], node_threshold, attribute_threshold, max_nodes, ownership_threshold, detail)
                for w, l, m in zip(words, logits, valid)]

    def decode_one(self, words, logits, node_threshold, attribute_threshold, max_nodes, ownership_threshold=.65,
                   detail=False):
        """The predicted nodes. With detail, the structure alone, together with what the heads say
        beside their first choice: {"nodes", "owners"}. A reference then carries "ranked", its
        possible targets with their probabilities, the chosen one first; a clause form carries its
        "scores"; "owners" lists, for every token, the node slots the ownership head ranks first.
        With detail the only atom that is predicted is the form of a clause: the other label sets of
        the old annotations (kinds of things, of ties and of groups, colours, acts, polarity) are
        not queried and not returned. The nodes, their spans and their references do not change."""
        device = words.device
        scores = logits.sigmoid()
        detected = [(a, s) for a, s in (scores >= node_threshold).nonzero().tolist()]
        if not detected:
            return {"nodes": [], "owners": []} if detail else []
        if len(detected) > max_nodes:
            values = scores.detach().cpu()
            detected = sorted(detected, key=lambda pair: -float(values[pair]))[:max_nodes]
        detected.sort()
        positions, slots = zip(*detected)
        features = self.node_features(words, torch.tensor(positions, device=device), torch.tensor(slots, device=device))
        node_types = [self.vocab.nodes[slot][0] for slot in slots]
        nodes = [dict(anchor=position, type=kind, attrs=[]) for position, kind in zip(positions, node_types)]
        attrs = self.attributes(features).sigmoid().detach().cpu()
        span_requests = []
        for i, node in enumerate(nodes):
            required = REQUIRED.get(node["type"].split(".")[-1], set())
            used_refs = defaultdict(set)
            used_atom = set()
            for slot in self.vocab.by_node[node["type"]]:
                _, key, kind, ordinal = self.vocab.attributes[slot]
                confidence = float(attrs[i, slot])
                if confidence < attribute_threshold and not (ordinal == 0 and key in required):
                    continue
                if ordinal and key in used_atom:
                    continue
                query = features[i] + self.attribute_slot.weight[slot]
                if kind == "span":
                    span_requests.append((confidence, i, key, ordinal, query))
                elif kind == "atom":
                    if detail and key != "form":
                        continue
                    allowed = self.vocab.spec["allowed_atoms"][slot]
                    if allowed:
                        atom_scores = self.atom(query)[allowed]
                        value = allowed[atom_scores.argmax().item()]
                        attribute = {"key": key, "atom": self.vocab.atoms[value]}
                        if detail and key == "form":
                            attribute["scores"] = {self.vocab.atoms[atom]: float(p) for atom, p
                                                   in zip(allowed, atom_scores.softmax(-1).tolist())}
                        node["attrs"].append(attribute)
                        used_atom.add(key)
                else:
                    allowed = self.vocab.spec["target_types"][slot]
                    targets = [j for j, node_kind in enumerate(node_types)
                               if j != i and node_kind in allowed and j not in used_refs[key]]
                    if targets:
                        target_scores = features[targets] @ self.reference(query)
                        best = target_scores.argmax().item()
                        target = targets[best]
                        attribute = {"key": key, "target": target}
                        if detail:
                            # the scale of training turns the scores into the probabilities the head learned
                            probabilities = (target_scores * self.scale).softmax(-1).tolist()
                            ranked = sorted(zip(probabilities, targets), key=lambda pair: -pair[0])
                            attribute["ranked"] = [{"target": j, "p": p} for p, j in ranked[:6]]
                        node["attrs"].append(attribute)
                        used_refs[key].add(target)
        if span_requests:
            self.assign_spans(words, nodes, span_requests)
        if self.ownership:
            self.recover_spans(words, features, nodes, ownership_threshold)
        if not detail:
            return prune(nodes)
        owners = self.token_owners(words, features, nodes) if self.ownership else []
        kept, remap = prune(nodes, with_map=True, required=STRUCTURE)
        for node in kept:
            for attribute in node["attrs"]:
                if "ranked" in attribute:
                    attribute["ranked"] = [{"target": remap[entry["target"]], "p": entry["p"]}
                                           for entry in attribute["ranked"] if entry["target"] in remap]
        owners = [[{**entry, "node": remap[entry["node"]]} for entry in ranked if entry["node"] in remap]
                  for ranked in owners]
        return {"nodes": kept, "owners": owners}

    def token_owners(self, words, features, nodes, top=4):
        """For every token, the node slots the ownership head ranks first, with their probabilities.
        The label that says a token belongs to no slot is left out."""
        pairs = [(i, slot) for i, node in enumerate(nodes)
                 for slot in self.vocab.span_slots[node["type"]]]
        if not pairs:
            return [[] for _ in range(len(words))]
        probabilities = self.owner_logits(words, features, pairs).softmax(-1)
        values, labels = probabilities.topk(min(top + 1, probabilities.shape[1]), dim=-1)
        owners = []
        for row_values, row_labels in zip(values.tolist(), labels.tolist()):
            ranked = []
            for p, label in zip(row_values, row_labels):
                if not label:
                    continue
                i, slot = pairs[(label - 1) // 2]
                ranked.append({"node": i, "key": self.vocab.attributes[slot][1],
                               "inside": bool((label - 1) % 2), "p": p})
            owners.append(ranked[:top])
        return owners

    def recover_spans(self, words, features, nodes, threshold):
        pairs = [(i, slot) for i, node in enumerate(nodes)
                 for slot in self.vocab.span_slots[node["type"]]]
        if not pairs:
            return
        labels = self.owner_logits(words, features, pairs).softmax(-1).max(-1)
        confidences = labels.values.tolist()
        winners = labels.indices.tolist()
        allowed = []
        covered = set()
        counts = Counter()
        for i, node in enumerate(nodes):
            for attr in node["attrs"]:
                if "start" in attr:
                    covered.update(range(attr["start"], attr["end"]))
                    counts[i, attr["key"]] += 1
        for start, (label, confidence) in enumerate(zip(winners, confidences)):
            if not label or (label - 1) % 2 or confidence < threshold or start in covered:
                continue
            i, slot = pairs[(label - 1) // 2]
            owner, key, _, _ = self.vocab.attributes[slot]
            if key in ("filler", "unresolved"):
                continue
            end = start + 1
            while (end < len(words) and end - start < self.vocab.spec["max_span"] and
                   winners[end] == label + 1 and end not in covered):
                if confidences[end] < threshold * .7:
                    break
                end += 1
            if end < len(words) and winners[end] == label + 1:
                continue  # The boundary ended inside a single uncertain or conflicting span.
            allowed.append((min(confidences[start:end]), start, end, i, owner, key))
        for _, start, end, i, owner, key in sorted(allowed, key=lambda item: (-item[0], item[1])):
            if counts[i, key] >= self.vocab.span_limits[owner, key] or any(
                    position in covered for position in range(start, end)):
                continue
            counts[i, key] += 1
            covered.update(range(start, end))
            nodes[i]["attrs"].append({"key": key, "start": start, "end": end})

    def assign_spans(self, words, nodes, requests):
        requests.sort(key=lambda entry: (-entry[0], entry[1], entry[2], entry[3]))
        vectors = torch.stack([entry[-1] for entry in requests])
        starts = (self.pointer_start(vectors) @ words.T) * self.scale
        ends = (self.pointer_end(vectors) @ words.T) * self.scale
        starts = starts.log_softmax(-1)
        ends = ends.log_softmax(-1)
        length = len(words)
        # A global ownership constraint prevents reuse of a source occurrence.
        joint = (starts.unsqueeze(2) + ends.unsqueeze(1)).detach().cpu()
        used = set()
        for row, (_, owner, key, _, _) in enumerate(requests):
            candidates = []
            for start in range(length):
                for end in range(start, min(length, start + self.vocab.spec["max_span"])):
                    if end in used:
                        break
                    candidates.append((float(joint[row, start, end]), start, end + 1))
            if not candidates:
                continue
            score, start, end = max(candidates, key=lambda item: (item[0], -item[1], -item[2]))
            # Skip a span when the only available tokens had negligible pointer support.
            unrestricted = float(starts[row].max() + ends[row].max())
            if score < unrestricted - 4.0:
                continue
            used.update(range(start, end))
            nodes[owner]["attrs"].append({"key": key, "start": start, "end": end})


def prune(nodes, with_map=False, required=REQUIRED):
    live = set(range(len(nodes)))
    while True:
        active = set()
        for i in sorted(live):
            node = nodes[i]
            kind = node["type"].split(".")[-1]
            attrs = [a for a in node["attrs"] if "target" not in a or a["target"] in live]
            keys = {a["key"] for a in attrs}
            evidence = [a for a in attrs if a["key"] not in ("unresolved", "filler") and "atom" not in a]
            if required.get(kind, set()) <= keys and evidence:
                active.add(i)
        if active == live:
            break
        live = active
    remap = {before: after for after, before in enumerate(sorted(live))}
    kept = [
        {**nodes[i], "attrs": [
            {**a, "target": remap[a["target"]]} if "target" in a else a
            for a in nodes[i]["attrs"] if "target" not in a or a["target"] in live
        ]}
        for i in sorted(live)
    ]
    return (kept, remap) if with_map else kept


def save_checkpoint(model, tokenizer, output, metadata):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    model.encoder.save_pretrained(output / "encoder", safe_serialization=True)
    tokenizer.save_pretrained(output / "tokenizer")
    torch.save({key: value.detach().cpu() for key, value in model.state_dict().items()
                if not key.startswith("encoder.")}, output / "heads.pt")
    package = {"format": "native-distilbert-v2" if model.ownership else "native-distilbert-v1", "hidden": model.hidden,
               "vocabulary": model.vocab.spec, **metadata}
    (output / "manifest.json").write_text(json.dumps(package, indent=2) + "\n")


def load_checkpoint(path, device):
    path = Path(path)
    metadata = json.loads((path / "manifest.json").read_text())
    if metadata["format"] not in ("native-distilbert-v1", "native-distilbert-v2"):
        raise ValueError("Unsupported native DistilBERT checkpoint")
    tokenizer = AutoTokenizer.from_pretrained(path / "tokenizer", local_files_only=True)
    encoder = AutoModel.from_pretrained(path / "encoder", local_files_only=True)
    model = NativeDistilBert(encoder, Vocabulary(metadata["vocabulary"]), hidden=metadata["hidden"],
                             ownership=metadata["format"] == "native-distilbert-v2")
    heads = torch.load(path / "heads.pt", map_location="cpu", weights_only=True)
    missing, extra = model.load_state_dict(heads, strict=False)
    if extra or set(missing) != {key for key in model.state_dict() if key.startswith("encoder.")}:
        raise ValueError("Checkpoint graph-head weights are incomplete")
    return model.to(device).eval(), tokenizer, metadata
