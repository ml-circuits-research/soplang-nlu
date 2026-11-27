"""Train the syntax model: a pretrained DistilBERT encoder and new heads, on circuits of the syntax schema.

The rows are written by retrain.mjs with targets.mjs: {text, tokens, nodes, owners, edges, weight}.
The encoder starts from the pretrained base model, never from an earlier checkpoint of this package.
"""
import argparse
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import random
import time

import torch
from transformers import AutoModel, AutoTokenizer

from syntax_model import Layout, SyntaxDistilBert, save_checkpoint, tokenize_batch, validate_tokens

THRESHOLDS = (.3, .4, .5, .6, .7)


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("train", type=Path)
    parser.add_argument("dev", type=Path)
    parser.add_argument("layout", type=Path, help="the wire types and their keys, written from the schema")
    parser.add_argument("output", type=Path)
    parser.add_argument("--base", default="distilbert-base-uncased")
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cuda")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--patience", type=int, default=8)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--hidden", type=int, default=256)
    parser.add_argument("--seed", type=int, default=20261127)
    return parser.parse_args()


def read_rows(path):
    opening = gzip.open if path.suffix == ".gz" else open
    with opening(path, "rt", encoding="utf-8") as source:
        rows = [json.loads(line) for line in source if line.strip()]
    for row in rows:
        validate_tokens(row)
    if not rows or any(not row["tokens"] or not row["nodes"] for row in rows):
        raise ValueError(f"Expected messages with their targets in {path}")
    return rows


def file_sha(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def facts(nodes, owners, edges, atoms):
    """What a set of targets or a prediction says, with nodes named by where they stand."""
    keys = [(node["anchor"], *key) for node, key in zip(nodes, Layout.node_keys(nodes))]
    said = Counter(("node", key) for key in keys)
    said.update(("owner", token, keys[owner[0]], owner[1]) for token, owner in enumerate(owners) if owner is not None)
    said.update(("edge", keys[edge[0]], edge[1], keys[edge[2]]) for edge in edges)
    said.update(("atom", keys[i], key, value) for i, key, value in atoms)
    return said


def gold_facts(row):
    atoms = [(i, key, value) for i, node in enumerate(row["nodes"]) for key, value in node["atoms"].items()]
    return facts(row["nodes"], row["owners"], row["edges"], atoms)


def predicted_facts(prediction, layout, tie=.5):
    """The first choices of a prediction, with no repair: the measure by which an epoch is chosen."""
    nodes = prediction["nodes"]
    owners = []
    for ranked in prediction["owners"]:
        owners.append([ranked[0][0], ranked[0][1]] if ranked and ranked[0][2] >= .5 else None)
    edges, atoms = [], []
    for i, node in enumerate(nodes):
        for key, ranked in node["edges"].items():
            spec = layout.types[node["type"]]["edges"][key]
            if spec["required"] and not spec["many"]:
                edges.extend([[i, key, ranked[0][0]]] if ranked else [])
            else:
                edges.extend([i, key, j] for j, p in ranked if p >= tie)
        for key, values in node["atoms"].items():
            value, p = max(values.items(), key=lambda item: item[1])
            if layout.types[node["type"]]["atoms"][key]["required"] or p >= tie:
                atoms.append((i, key, value))
    return facts(nodes, owners, edges, atoms)


def characterize(model, tokenizer, rows, device, batch_size):
    """For each node threshold: how many messages come out exactly as their targets, and the F1 of what is said."""
    totals = {threshold: Counter() for threshold in THRESHOLDS}
    model.eval()
    with torch.inference_mode():
        for start in range(0, len(rows), batch_size):
            items = rows[start:start + batch_size]
            encoded = tokenize_batch(tokenizer, items, device)
            tokens, logits, valid = model.encode(encoded)
            for threshold in THRESHOLDS:
                counts = totals[threshold]
                for row, row_tokens, row_logits, mask in zip(items, tokens, logits, valid):
                    gold = gold_facts(row)
                    predicted = predicted_facts(model.predict_one(row_tokens[mask], row_logits[mask], threshold, 96, 4, .02), model.layout)
                    shared = predicted & gold
                    counts["tp"] += sum(shared.values())
                    counts["predicted"] += sum(predicted.values())
                    counts["gold"] += sum(gold.values())
                    counts["exact"] += int(predicted == gold)
    results = []
    for threshold, counts in totals.items():
        precision = counts["tp"] / max(1, counts["predicted"])
        recall = counts["tp"] / max(1, counts["gold"])
        results.append({"nodeThreshold": threshold, "exact": counts["exact"] / len(rows), "precision": precision, "recall": recall,
                        "f1": 2 * precision * recall / max(1e-8, precision + recall)})
    return sorted(results, key=lambda result: (-result["exact"], -result["f1"]))


def batches(rows, size, rng):
    # messages of similar length share a batch; the order of the batches is random
    order = rows.copy()
    rng.shuffle(order)
    for start in range(0, len(order), size * 12):
        chunk = sorted(order[start:start + size * 12], key=lambda row: len(row["tokens"]))
        group = [chunk[i:i + size] for i in range(0, len(chunk), size)]
        rng.shuffle(group)
        yield from group


def main():
    args = arguments()
    started = time.monotonic()
    device = torch.device(args.device)
    if device.type == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but is not available")
    torch.manual_seed(args.seed)
    rng = random.Random(args.seed)
    if device.type == "cuda":
        torch.cuda.manual_seed_all(args.seed)
        torch.set_float32_matmul_precision("high")
    train = read_rows(args.train)
    dev = read_rows(args.dev)
    if {row["text"] for row in train} & {row["text"] for row in dev}:
        raise ValueError("A development message is among the training messages")
    # the pretrained base model, from the local cache: no weight of an earlier checkpoint is read
    tokenizer = AutoTokenizer.from_pretrained(args.base, local_files_only=True)
    encoder = AutoModel.from_pretrained(args.base, local_files_only=True)
    if encoder.config.model_type != "distilbert":
        raise ValueError("Expected a DistilBERT base model")
    base_revision = getattr(encoder.config, "_commit_hash", None)
    node_slots = sorted({key for row in train for key in Layout.node_keys(row["nodes"])})
    layout = Layout(json.loads(args.layout.read_text()), node_slots)
    # a development message may hold a node slot that training never showed: it cannot be predicted
    dev = [row for row in dev if all(key in layout.node_ids for key in Layout.node_keys(row["nodes"]))] or dev
    model = SyntaxDistilBert(encoder, layout, hidden=args.hidden).to(device)
    groups = [
        {"params": model.encoder.parameters(), "lr": 3e-5},
        {"params": [parameter for name, parameter in model.named_parameters() if not name.startswith("encoder.")], "lr": 8e-4},
    ]
    optimizer = torch.optim.AdamW(groups, weight_decay=.01, fused=device.type == "cuda")
    steps = args.epochs * ((len(train) + args.batch - 1) // args.batch)
    schedule = torch.optim.lr_scheduler.OneCycleLR(optimizer, max_lr=[3e-5, 8e-4], total_steps=steps, pct_start=.1, anneal_strategy="linear")
    training = {
        "base": args.base, "baseRevision": base_revision, "encoderStartsFrom": "the pretrained base model",
        "device": str(device), "accelerator": torch.cuda.get_device_name(device) if device.type == "cuda" else "CPU",
        "torchVersion": torch.__version__, "seed": args.seed, "trainRows": len(train), "devRows": len(dev),
        "trainWeight": sum(float(row.get("weight", 1.)) for row in train),
        "trainSha256": file_sha(args.train), "devSha256": file_sha(args.dev),
        "maximumEpochs": args.epochs, "patience": args.patience, "batchSize": args.batch,
        "nodeSlots": len(layout.node_slots),
    }
    print(json.dumps(training), flush=True)
    best, saved_epoch, waited, history = None, None, 0, []
    for epoch in range(1, args.epochs + 1):
        epoch_started = time.monotonic()
        model.train()
        losses = []
        for batch in batches(train, args.batch, rng):
            encoded = tokenize_batch(tokenizer, batch, device)
            optimizer.zero_grad(set_to_none=True)
            with torch.autocast(device_type=device.type, dtype=torch.bfloat16, enabled=device.type == "cuda"):
                loss = model.loss(encoded, batch)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            schedule.step()
            losses.append(float(loss.detach()))
        results = characterize(model, tokenizer, dev, device, args.batch)
        log = {"epoch": epoch, "loss": sum(losses) / len(losses), "dev": results[0], "seconds": time.monotonic() - epoch_started}
        history.append(log)
        print(json.dumps(log), flush=True)
        if best is None or (results[0]["exact"], results[0]["f1"]) > (best["exact"], best["f1"]):
            best, saved_epoch, waited = results[0], epoch, 0
            save_checkpoint(model, tokenizer, args.output, {**training, "selectedEpoch": epoch, "nodeThreshold": results[0]["nodeThreshold"], "devFirstChoices": results[0]})
        else:
            waited += 1
            if waited >= args.patience:
                break
    print(json.dumps({"selectedEpoch": saved_epoch, "devFirstChoices": best, "epochs": history,
                      "seconds": time.monotonic() - started, **training}), flush=True)


if __name__ == "__main__":
    main()
