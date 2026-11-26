"""Draft-conditioned residual native graph heads for the isolated repair experiment."""
from collections import Counter
import json
from pathlib import Path
import sys

import torch
from torch import nn
from transformers import AutoModel, AutoTokenizer

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "strategies" / "distilbert"))

from model import NativeDistilBert, Vocabulary, keyed_attributes, keyed_nodes, save_checkpoint, tokenize_batch


class DraftResidual(NativeDistilBert):
    """Add typed draft events to source tokens, with a learned soft anchor-copy bias."""

    def __init__(self, encoder, vocabulary, hidden=192):
        super().__init__(encoder, vocabulary, hidden, ownership=True)
        self.events = nn.Embedding(
            len(vocabulary.nodes) + 4 * len(vocabulary.attributes) + len(vocabulary.atoms), hidden
        )
        self.neighbor = nn.Embedding(33, hidden)
        self.endpoint = nn.Embedding(len(vocabulary.nodes) + 1, hidden, padding_idx=0)
        self.context = nn.Sequential(nn.Linear(hidden, hidden), nn.GELU(), nn.LayerNorm(hidden))
        self.gate = nn.Linear(2 * hidden, 1)
        nn.init.constant_(self.gate.bias, -1.0)
        self.copy_logit = nn.Parameter(torch.ones(len(vocabulary.nodes)))

    def draft_events(self, rows, width, device):
        examples, positions, labels, distances, endpoints = [], [], [], [], []
        seen = []
        vocab = self.vocab
        slot_base = len(vocab.nodes)
        atom_base = slot_base + 4 * len(vocab.attributes)
        for i, row in enumerate(rows):
            indexed = list(keyed_nodes({"nodes": row["draftNodes"]}))

            def emit(position, label, neighbor, other_slot=None):
                examples.append(i)
                positions.append(position)
                labels.append(label)
                distances.append(max(-16, min(16, neighbor - position)) + 16)
                endpoints.append(0 if other_slot is None else other_slot + 1)

            for node, key in indexed:
                anchor = node["anchor"]
                owner = vocab.node_ids.get(key)
                if owner is not None:
                    emit(anchor, owner, anchor)
                    seen.append((i, anchor, owner))
                for attribute, slot_key in keyed_attributes(node):
                    slot = vocab.attribute_ids.get(slot_key)
                    if slot is None:
                        continue
                    value = slot_base + 4 * slot
                    kind = slot_key[2]
                    if kind == "span":
                        for position in range(attribute["start"], attribute["end"]):
                            offset = 0 if position == attribute["start"] else 1
                            emit(position, value + offset, anchor, owner)
                    elif kind == "ref":
                        target, target_key = indexed[attribute["target"]]
                        emit(anchor, value + 2, target["anchor"], vocab.node_ids.get(target_key))
                        emit(target["anchor"], value + 3, anchor, owner)
                    else:
                        atom = vocab.atom_ids.get(attribute["atom"])
                        if atom is not None:
                            emit(anchor, atom_base + atom, anchor, owner)
        flat = [example * width + position for example, position in zip(examples, positions)]
        return tuple(torch.tensor(items, dtype=torch.long, device=device)
                     for items in (flat, labels, distances, endpoints, seen))

    def encode(self, batch):
        source, (positions, labels, distances, endpoints, seen) = batch
        words, source_logits, valid = super().encode(source)
        if not labels.numel():
            return words, source_logits, valid
        events = self.events(labels) + self.neighbor(distances) + self.endpoint(endpoints)
        size = words.shape[0] * words.shape[1]
        combined = events.new_zeros(size, self.hidden).index_add(0, positions, events)
        counts = events.new_zeros(size).index_add(0, positions, events.new_ones(len(positions)))
        context = self.context(combined / counts.clamp_min(1).sqrt().unsqueeze(1)).reshape_as(words)
        gate = self.gate(torch.cat((words, context), dim=-1)).sigmoid()
        conditioned = words + gate * context * counts.reshape(*valid.shape, 1).gt(0)
        logits = self.detect(conditioned)
        if seen.numel():
            copy = torch.zeros_like(logits, dtype=torch.bool)
            copy[tuple(seen.T)] = True
            logits = logits + copy * self.copy_logit.clamp(-3, 3)
        return conditioned, logits, valid

    def batch(self, tokenizer, rows, device):
        source = tokenize_batch(tokenizer, rows, device)
        return source, self.draft_events(rows, source[-1].shape[1], device)


def save_repair(model, tokenizer, path, metadata):
    save_checkpoint(model, tokenizer, path, {**metadata, "format": "native-distilbert-draft-residual-v1"})


def load_repair(path, device):
    path = Path(path)
    metadata = json.loads((path / "manifest.json").read_text())
    if metadata["format"] != "native-distilbert-draft-residual-v1":
        raise ValueError("Expected native DistilBERT draft residual checkpoint")
    tokenizer = AutoTokenizer.from_pretrained(path / "tokenizer", local_files_only=True)
    encoder = AutoModel.from_pretrained(path / "encoder", local_files_only=True)
    model = DraftResidual(encoder, Vocabulary(metadata["vocabulary"]), metadata["hidden"])
    heads = torch.load(path / "heads.pt", map_location="cpu", weights_only=True)
    missing, extra = model.load_state_dict(heads, strict=False)
    if extra or set(missing) != {name for name in model.state_dict() if name.startswith("encoder.")}:
        raise ValueError("Checkpoint repair-head weights are incomplete")
    return model.to(device).eval(), tokenizer, metadata


def is_graph_row(row):
    from model import validate_row

    validate_row(dict(text=row["text"], tokens=row["tokens"], nodes=row["draftNodes"]))
    return row
