"""Fine-tune DistilBERT and native graph heads using source-only inputs and split labels."""
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

from model import (
    NativeDistilBert, Vocabulary, attribute_kind, keyed_nodes, save_checkpoint,
    tokenize_batch, validate_row,
)


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("train", type=Path)
    parser.add_argument("dev", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--base", required=True)
    parser.add_argument("--base-revision", default="12040accade4e8a0f71eabdb258fecc2e7e948be")
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cuda")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--patience", type=int, default=3)
    parser.add_argument("--batch", type=int, default=24)
    parser.add_argument("--seed", type=int, default=74113)
    parser.add_argument("--disable-triton", action="store_true")
    return parser.parse_args()


def read_rows(path):
    opening = gzip.open if path.suffix == ".gz" else open
    with opening(path, "rt", encoding="utf-8") as source:
        rows = [json.loads(line) for line in source if line.strip()]
    for row in rows:
        validate_row(row)
    if not rows or any(not row["tokens"] for row in rows):
        raise ValueError(f"Expected nonempty labeled sources in {path}")
    if len({row["text"] for row in rows}) != len(rows):
        raise ValueError(f"Found repeated source text in {path}")
    return rows


def file_sha(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def graph_keys(graph):
    row = dict(nodes=graph)
    indexed = [(node["anchor"], *slot) for node, slot in keyed_nodes(row)]
    facts = Counter()
    for node, owner in zip(graph, indexed):
        facts[(owner, "<node>")] += 1
        for attribute in node["attrs"]:
            kind = attribute_kind(attribute)
            if kind == "span":
                value = (attribute["start"], attribute["end"])
            elif kind == "atom":
                value = attribute["atom"]
            else:
                value = indexed[attribute["target"]]
            facts[(owner, attribute["key"], kind, value)] += 1
    return facts


def characterize(model, tokenizer, rows, device, batch_size):
    thresholds = [(.45, .45), (.55, .55), (.65, .65), (.60, .45), (.70, .50)]
    totals = {threshold: Counter() for threshold in thresholds}
    model.eval()
    with torch.inference_mode():
        for start in range(0, len(rows), batch_size):
            items = rows[start:start + batch_size]
            encoded = tokenize_batch(tokenizer, items, device)
            features, logits, mask = model.encode(encoded)
            expected = [graph_keys(row["nodes"]) for row in items]
            for thresholds_pair in thresholds:
                metrics = totals[thresholds_pair]
                for words, scores, valid, gold in zip(features, logits, mask, expected):
                    predicted = graph_keys(model.decode_one(words[valid], scores[valid], *thresholds_pair, 64))
                    intersection = predicted & gold
                    metrics["tp"] += sum(intersection.values())
                    metrics["predicted"] += sum(predicted.values())
                    metrics["gold"] += sum(gold.values())
                    metrics["exact"] += int(predicted == gold)
                    metrics["nonempty"] += int(bool(predicted))
    results = []
    for (node_at, slot_at), values in totals.items():
        recall = values["tp"] / max(1, values["gold"])
        precision = values["tp"] / max(1, values["predicted"])
        results.append(dict(values, graphExact=values["exact"] / len(rows),
                            precision=precision, recall=recall,
                            f1=2 * precision * recall / max(1e-8, precision + recall),
                            nodeThreshold=node_at, attributeThreshold=slot_at))
    return sorted(results, key=lambda result: (-result["f1"], -result["graphExact"]))


def batches(rows, size, rng):
    # Local length bucketing reduces padding while keeping the global example order random.
    order = rows.copy()
    rng.shuffle(order)
    for start in range(0, len(order), size * 12):
        chunk = sorted(order[start:start + size * 12], key=lambda row: len(row["tokens"]))
        group = [chunk[i:i + size] for i in range(0, len(chunk), size)]
        rng.shuffle(group)
        yield from group


def main():
    args = arguments()
    if args.output.exists():
        raise SystemExit("Output already exists")
    args.output.mkdir(parents=True)
    start = time.monotonic()
    device = torch.device(args.device)
    if device.type == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("Requested CUDA but it is unavailable")
    if args.disable_triton:
        from torch._native.registry import deregister_op_overrides
        deregister_op_overrides(disable_dsl_names="triton")
    torch.manual_seed(args.seed)
    rng = random.Random(args.seed)
    if device.type == "cuda":
        torch.cuda.manual_seed_all(args.seed)
        torch.set_float32_matmul_precision("high")
    else:
        torch.set_num_threads(2)
    train = read_rows(args.train)
    dev = read_rows(args.dev)
    overlap = {row["text"] for row in train} & {row["text"] for row in dev}
    if overlap:
        raise ValueError("Training and development sources overlap")
    tokenizer = AutoTokenizer.from_pretrained(args.base, local_files_only=True)
    encoder = AutoModel.from_pretrained(args.base, local_files_only=True)
    if encoder.config.model_type != "distilbert":
        raise ValueError("Expected the official DistilBERT architecture")
    vocabulary = Vocabulary.build(train)
    model = NativeDistilBert(encoder, vocabulary).to(device)
    groups = [
        {"params": model.encoder.parameters(), "lr": 3e-5},
        {"params": [parameter for name, parameter in model.named_parameters() if not name.startswith("encoder.")],
         "lr": 8e-4},
    ]
    optimizer = torch.optim.AdamW(groups, weight_decay=.01, fused=device.type == "cuda")
    training = {
        "base": "distilbert/distilbert-base-uncased", "baseRevision": args.base_revision,
        "device": str(device), "accelerator": torch.cuda.get_device_name(device) if device.type == "cuda" else "CPU",
        "torchVersion": torch.__version__, "seed": args.seed,
        "trainRows": len(train), "devRows": len(dev), "trainSha256": file_sha(args.train),
        "devSha256": file_sha(args.dev), "exactTrainDevTextOverlap": 0,
        "tritonOverridesDisabled": args.disable_triton, "maximumEpochs": args.epochs, "patience": args.patience, "batchSize": args.batch,
        "vocabularyCounts": {"nodeSlots": len(vocabulary.nodes), "attributeSlots": len(vocabulary.attributes),
                             "atoms": len(vocabulary.atoms)},
    }
    print(json.dumps(training), flush=True)
    best = None
    stopped = 0
    history = []
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
            losses.append(float(loss.detach()))
        metrics = characterize(model, tokenizer, dev, device, args.batch)
        best_choice = metrics[0]
        log = {"epoch": epoch, "loss": sum(losses) / len(losses), "dev": best_choice,
               "thresholds": metrics, "elapsedSeconds": time.monotonic() - epoch_started}
        history.append(log)
        print(json.dumps(log), flush=True)
        if best is None or best_choice["f1"] > best["f1"]:
            best = best_choice
            saved_epoch = epoch
            save_checkpoint(model, tokenizer, args.output / "checkpoint",
                            {**training, "selectedEpoch": epoch, "dev": best_choice})
            stopped = 0
        else:
            stopped += 1
            if stopped >= args.patience:
                break
    files = {str(path.relative_to(args.output / "checkpoint")): file_sha(path)
             for path in sorted((args.output / "checkpoint").rglob("*")) if path.is_file()}
    report = {**training, "selectedEpoch": saved_epoch, "dev": best, "epochs": history,
              "elapsedSeconds": time.monotonic() - start, "checkpointFiles": files,
              "checkpointSha256": hashlib.sha256(json.dumps(files, separators=(",", ":")).encode()).hexdigest()}
    (args.output / "training-summary.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: report[key] for key in ("selectedEpoch", "dev", "elapsedSeconds", "checkpointSha256")}),
          flush=True)


if __name__ == "__main__":
    main()
