"""A DistilBERT encoder with heads that predict a circuit of the syntax schema.

For the tokens of one message the model predicts
  nodes   one for every wire, standing at a token (see targets.mjs for where a wire stands);
  owners  for every token, the node and the key that hold it, or that nothing holds it;
  edges   the references between nodes;
  atoms   the keys with a value from a list (the form of a clause, attachment on a relation).
The wire types, their keys and what a reference may point to are not written here: they come
from the schema of the package, through the layout that targets.mjs writes.
"""
import json
from pathlib import Path

import torch
from torch import nn
from torch.nn import functional as F
from transformers import AutoModel, AutoTokenizer

FORMAT = "syntax-distilbert-v1"


class Layout:
    """The wire types with their keys, and the node slots (a type and its rank at one token)."""

    def __init__(self, types, node_slots):
        self.types = types
        self.names = list(types)
        self.node_slots = [tuple(slot) for slot in node_slots]
        self.node_ids = {slot: i for i, slot in enumerate(self.node_slots)}
        self.word_slots = [(name, key) for name in self.names for key in types[name]["words"]]
        self.word_ids = {slot: i for i, slot in enumerate(self.word_slots)}
        self.edge_slots = [(name, key) for name in self.names for key in types[name]["edges"]]
        self.edge_ids = {slot: i for i, slot in enumerate(self.edge_slots)}
        self.atom_slots = [(name, key) for name in self.names for key in types[name]["atoms"]]

    def edge(self, slot):
        name, key = self.edge_slots[slot]
        return self.types[name]["edges"][key]

    def atom_values(self, slot):
        """The values of an atom; a key that may be absent has the value None last."""
        name, key = self.atom_slots[slot]
        spec = self.types[name]["atoms"][key]
        return list(spec["options"]) + ([] if spec["required"] else [None])

    def spec(self):
        return {"types": self.types, "nodeSlots": [list(slot) for slot in self.node_slots]}

    @staticmethod
    def node_keys(nodes):
        """For the nodes of one message, in order: (type, rank among the nodes of that type at that token)."""
        seen = {}
        keys = []
        for node in nodes:
            place = (node["anchor"], node["type"])
            keys.append((node["type"], seen.get(place, 0)))
            seen[place] = seen.get(place, 0) + 1
        return keys


def validate_tokens(row):
    if not isinstance(row.get("text"), str) or not isinstance(row.get("tokens"), list):
        raise ValueError("Expected text and its token list")
    source = row["text"].encode("utf-16-le", errors="surrogatepass")
    previous = 0
    for token in row["tokens"]:
        start, end = token["start"], token["end"]
        if type(start) is not int or type(end) is not int or not previous <= start < end <= len(source) // 2:
            raise ValueError("Token boundaries are invalid")
        if source[start * 2:end * 2].decode("utf-16-le", errors="surrogatepass") != token["text"]:
            raise ValueError("Token spans do not agree with the text")
        previous = end


def tokenize_batch(tokenizer, rows, device, window=512):
    words = [[token["text"] for token in row["tokens"]] for row in rows]
    encoded = tokenizer(words, is_split_into_words=True, padding=True, return_tensors="pt", verbose=False)
    if encoded["input_ids"].shape[1] > window:
        raise ValueError(f"The message needs more than {window} word pieces")
    width = max(map(len, words))
    index = [[-1 if word is None else word for word in encoded.word_ids(i)] for i in range(len(rows))]
    index = torch.tensor(index, device=device)
    size = torch.tensor(list(map(len, words)), device=device)
    valid = torch.arange(width, device=device).unsqueeze(0) < size.unsqueeze(1)
    return encoded["input_ids"].to(device), encoded["attention_mask"].to(device), index, valid


class SyntaxDistilBert(nn.Module):
    def __init__(self, encoder, layout, hidden=256, dropout=.1):
        super().__init__()
        self.encoder = encoder
        self.layout = layout
        self.hidden = hidden
        self.scale = hidden ** -.5
        self.tokens = nn.Sequential(nn.Linear(encoder.config.hidden_size, hidden), nn.GELU(), nn.LayerNorm(hidden))
        self.drop = nn.Dropout(dropout)
        self.detect = nn.Linear(hidden, len(layout.node_slots))
        self.node_slot = nn.Embedding(len(layout.node_slots), hidden)
        self.node_repr = nn.Sequential(nn.Linear(hidden, hidden), nn.GELU(), nn.LayerNorm(hidden))
        self.word_slot = nn.Embedding(len(layout.word_slots), hidden)
        self.owner_token = nn.Linear(hidden, hidden, bias=False)
        self.owner_node = nn.Linear(hidden, hidden, bias=False)
        self.unowned = nn.Linear(hidden, 1)
        self.edge_slot = nn.Embedding(len(layout.edge_slots), hidden)
        self.edge_from = nn.Linear(hidden, hidden, bias=False)
        self.edge_to = nn.Linear(hidden, hidden, bias=False)
        self.edge_bias = nn.Parameter(torch.zeros(len(layout.edge_slots)))
        self.atoms = nn.ModuleList([nn.Linear(hidden, len(layout.atom_values(i))) for i in range(len(layout.atom_slots))])

    def encode(self, batch):
        ids, attention, index, valid = batch
        pieces = self.encoder(input_ids=ids, attention_mask=attention).last_hidden_state
        active = index >= 0
        token_ids = index.clamp(min=0)
        pooled = pieces.new_zeros(pieces.shape[0], valid.shape[1], pieces.shape[2])
        counts = pieces.new_zeros(pieces.shape[0], valid.shape[1])
        pooled.scatter_add_(1, token_ids.unsqueeze(-1).expand_as(pieces), pieces * active.unsqueeze(-1))
        counts.scatter_add_(1, token_ids, active.to(pieces.dtype))
        tokens = self.drop(self.tokens(pooled / counts.clamp(min=1).unsqueeze(-1)))
        return tokens, self.detect(tokens), valid

    def node_features(self, tokens, positions, slots):
        return self.node_repr(tokens[positions] + self.node_slot(slots))

    def owner_pairs(self, types):
        """Every (node, word key) a token could belong to, for nodes of the given types."""
        return [(i, self.layout.word_ids[name, key]) for i, name in enumerate(types) for key in self.layout.types[name]["words"]]

    def owner_logits(self, tokens, nodes, pairs):
        device = tokens.device
        owners = torch.tensor([pair[0] for pair in pairs], dtype=torch.long, device=device)
        slots = torch.tensor([pair[1] for pair in pairs], dtype=torch.long, device=device)
        queries = self.owner_node(nodes[owners] + self.word_slot(slots))
        held = (self.owner_token(tokens) @ queries.T) * self.scale
        return torch.cat((self.unowned(tokens), held), dim=1)

    def edge_logits(self, nodes, types, slot):
        """For the nodes of the type of this edge slot: scores over all nodes, and which targets the schema allows."""
        name, _ = self.layout.edge_slots[slot]
        sources = [i for i, kind in enumerate(types) if kind == name]
        if not sources:
            return sources, None, None
        device = nodes.device
        index = torch.tensor(sources, dtype=torch.long, device=device)
        queries = self.edge_from(nodes[index] + self.edge_slot.weight[slot])
        scores = (queries @ self.edge_to(nodes).T) * self.scale + self.edge_bias[slot]
        targets = self.layout.edge(slot)["targets"]
        allowed = torch.tensor([[kind in targets and j != i for j, kind in enumerate(types)] for i in sources], device=device)
        return sources, scores, allowed

    def targets(self, row, device):
        """The targets of one message as tensors. They are built once and kept with the row."""
        kept = row.get("_targets")
        if kept is not None and kept["device"] == device:
            return kept
        nodes = row["nodes"]
        keys = Layout.node_keys(nodes)
        types = [node["type"] for node in nodes]
        long = lambda values: torch.tensor(values, dtype=torch.long, device=device)
        pairs = self.owner_pairs(types)
        place = {pair: i + 1 for i, pair in enumerate(pairs)}
        owned = [0 if owner is None else place[owner[0], self.layout.word_ids[types[owner[0]], owner[1]]] for owner in row["owners"]]
        edges = []
        for slot, (name, key) in enumerate(self.layout.edge_slots):
            spec = self.layout.edge(slot)
            sources = [i for i, kind in enumerate(types) if kind == name]
            if not sources:
                continue
            allowed = torch.tensor([[kind in spec["targets"] and j != i for j, kind in enumerate(types)] for i in sources], device=device)
            if not bool(allowed.any()):
                continue
            wanted = {(edge[0], edge[2]) for edge in row["edges"] if edge[1] == key}
            if spec["required"] and not spec["many"]:
                target = {source: to for source, to in wanted}
                rows_with = [i for i, source in enumerate(sources) if source in target and bool(allowed[i].any())]
                if rows_with:
                    edges.append((slot, long(sources), allowed, long(rows_with), long([target[sources[i]] for i in rows_with])))
            else:
                truth = torch.tensor([[float((source, j) in wanted) for j in range(len(nodes))] for source in sources], device=device)
                edges.append((slot, long(sources), allowed, None, truth[allowed]))
        atoms = []
        for slot, (name, key) in enumerate(self.layout.atom_slots):
            holders = [i for i, kind in enumerate(types) if kind == name]
            if holders:
                values = self.layout.atom_values(slot)
                atoms.append((slot, long(holders), long([values.index(nodes[i]["atoms"].get(key)) for i in holders])))
        kept = {"device": device, "positions": long([node["anchor"] for node in nodes]),
                "slots": long([self.layout.node_ids[key] for key in keys]), "owned": long(owned),
                "pair_nodes": long([pair[0] for pair in pairs]), "pair_slots": long([pair[1] for pair in pairs]),
                "edges": edges, "atoms": atoms}
        row["_targets"] = kept
        return kept

    def loss(self, batch, rows):
        tokens, logits, valid = self.encode(batch)
        device = tokens.device
        total = tokens.new_zeros(())
        weight_sum = 0.
        for b, row in enumerate(rows):
            weight = float(row.get("weight", 1.))
            size = int(valid[b].sum())
            row_tokens = tokens[b, :size]
            wanted = self.targets(row, device)
            gold = torch.zeros_like(logits[b, :size])
            gold[wanted["positions"], wanted["slots"]] = 1
            parts = [F.binary_cross_entropy_with_logits(logits[b, :size], gold, pos_weight=tokens.new_tensor(3.))]
            features = self.node_features(row_tokens, wanted["positions"], wanted["slots"])
            # the owner of every token
            queries = self.owner_node(features[wanted["pair_nodes"]] + self.word_slot(wanted["pair_slots"]))
            held = (self.owner_token(row_tokens) @ queries.T) * self.scale
            parts.append(F.cross_entropy(torch.cat((self.unowned(row_tokens), held), dim=1), wanted["owned"]))
            # the references
            edge_parts = []
            reached = self.edge_to(features)
            for slot, sources, allowed, rows_with, truth in wanted["edges"]:
                scores = (self.edge_from(features[sources] + self.edge_slot.weight[slot]) @ reached.T) * self.scale + self.edge_bias[slot]
                if rows_with is not None:
                    edge_parts.append(F.cross_entropy(scores[rows_with].masked_fill(~allowed[rows_with], -1e4), truth))
                else:
                    edge_parts.append(F.binary_cross_entropy_with_logits(scores[allowed], truth, pos_weight=tokens.new_tensor(2.)))
            if edge_parts:
                parts.append(torch.stack(edge_parts).mean())
            # the keys with a value from a list
            atom_parts = [F.cross_entropy(self.atoms[slot](features[holders]), truth) for slot, holders, truth in wanted["atoms"]]
            if atom_parts:
                parts.append(torch.stack(atom_parts).mean())
            total = total + weight * torch.stack(parts).sum()
            weight_sum += weight
        return total / max(weight_sum, 1e-8)

    @torch.no_grad()
    def predict(self, batch, node_threshold=.5, max_nodes=96, top=4, floor=.02):
        """What the model says of each message, as the output stage reads it:
        {"nodes": [{"type", "anchor", "p", "atoms": {key: {value: p}}, "edges": {key: [[node, p]]}}],
         "owners": for every token [[node, key, p]]}, every list ranked, the best first."""
        tokens, logits, valid = self.encode(batch)
        return [self.predict_one(row_tokens[mask], row_logits[mask], node_threshold, max_nodes, top, floor)
                for row_tokens, row_logits, mask in zip(tokens, logits, valid)]

    def predict_one(self, tokens, logits, node_threshold, max_nodes, top, floor):
        device = tokens.device
        scores = logits.sigmoid()
        found = (scores >= node_threshold).nonzero().tolist()
        if not found:
            # a message has at least one wire: the one the model thinks most likely
            best = int(scores.argmax())
            found = [[best // scores.shape[1], best % scores.shape[1]]]
        if len(found) > max_nodes:
            found = sorted(found, key=lambda pair: -float(scores[pair[0], pair[1]]))[:max_nodes]
        found.sort()
        positions = torch.tensor([pair[0] for pair in found], dtype=torch.long, device=device)
        slots = torch.tensor([pair[1] for pair in found], dtype=torch.long, device=device)
        types = [self.layout.node_slots[pair[1]][0] for pair in found]
        features = self.node_features(tokens, positions, slots)
        nodes = [{"type": kind, "anchor": pair[0], "p": float(scores[pair[0], pair[1]]), "atoms": {}, "edges": {}}
                 for kind, pair in zip(types, found)]
        for slot, (name, key) in enumerate(self.layout.atom_slots):
            holders = [i for i, kind in enumerate(types) if kind == name]
            if not holders:
                continue
            values = self.layout.atom_values(slot)
            for i, row in zip(holders, self.atoms[slot](features[holders]).softmax(-1).tolist()):
                nodes[i]["atoms"][key] = {value: p for value, p in zip(values, row) if value is not None}
        for slot, (_, key) in enumerate(self.layout.edge_slots):
            sources, edge_scores, allowed = self.edge_logits(features, types, slot)
            if not sources:
                continue
            spec = self.layout.edge(slot)
            if spec["required"] and not spec["many"]:
                table = edge_scores.masked_fill(~allowed, -1e4).softmax(-1)
            else:
                table = edge_scores.sigmoid()
            table = table.masked_fill(~allowed, 0.).tolist()
            for source, row in zip(sources, table):
                ranked = sorted(((p, j) for j, p in enumerate(row) if p >= floor), reverse=True)[:2 * top]
                nodes[source]["edges"][key] = [[j, p] for p, j in ranked]
        pairs = self.owner_pairs(types)
        owners = [[] for _ in range(tokens.shape[0])]
        if pairs:
            table = self.owner_logits(tokens, features, pairs).softmax(-1)[:, 1:]
            values, indices = table.topk(min(top, table.shape[1]), dim=-1)
            for token, (row_values, row_indices) in enumerate(zip(values.tolist(), indices.tolist())):
                owners[token] = [[pairs[i][0], self.layout.word_slots[pairs[i][1]][1], p] for p, i in zip(row_values, row_indices)]
        return {"nodes": nodes, "owners": owners}


def save_checkpoint(model, tokenizer, output, manifest):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    model.encoder.save_pretrained(output / "encoder", safe_serialization=True)
    tokenizer.save_pretrained(output / "tokenizer")
    torch.save({key: value.detach().cpu() for key, value in model.state_dict().items()
                if not key.startswith("encoder.")}, output / "heads.pt")
    package = {"format": FORMAT, "hidden": model.hidden, "layout": model.layout.spec(), **manifest}
    (output / "manifest.json").write_text(json.dumps(package, indent=2) + "\n")


def load_checkpoint(path, device):
    path = Path(path)
    manifest = json.loads((path / "manifest.json").read_text())
    if manifest.get("format") != FORMAT:
        raise ValueError(f"This is no checkpoint of the syntax model (format {manifest.get('format')!r}; expected {FORMAT!r})")
    tokenizer = AutoTokenizer.from_pretrained(path / "tokenizer", local_files_only=True)
    encoder = AutoModel.from_pretrained(path / "encoder", local_files_only=True)
    layout = Layout(manifest["layout"]["types"], manifest["layout"]["nodeSlots"])
    model = SyntaxDistilBert(encoder, layout, hidden=manifest["hidden"])
    heads = torch.load(path / "heads.pt", map_location="cpu", weights_only=True)
    missing, extra = model.load_state_dict(heads, strict=False)
    if extra or set(missing) != {key for key in model.state_dict() if key.startswith("encoder.")}:
        raise ValueError("The head weights of the checkpoint are incomplete")
    return model.to(device).eval(), tokenizer, manifest
