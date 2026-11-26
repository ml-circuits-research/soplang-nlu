"""Fit draft-conditioned native SOP heads, selecting solely on development graph facts."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import random
import time

from repair_model import DraftResidual, Vocabulary, is_graph_row, save_repair

import torch
from transformers import AutoModel, AutoTokenizer

from train import batches, file_sha, graph_keys, read_rows


THRESHOLDS = ((.45, .45), (.55, .55), (.65, .65), (.60, .45), (.70, .50))
OWNERSHIP_THRESHOLDS = (.5, .65, .8)


def evaluate(model, tokenizer, rows, device, batch_size):
    thresholds = [(node, slot, owner) for node, slot in THRESHOLDS
                  for owner in OWNERSHIP_THRESHOLDS]
    totals = {threshold: Counter() for threshold in thresholds}
    draft_totals = Counter()
    model.eval()
    with torch.inference_mode():
        for start in range(0, len(rows), batch_size):
            items = rows[start:start + batch_size]
            words, logits, mask = model.encode(model.batch(tokenizer, items, device))
            for features, scores, valid, row in zip(words, logits, mask, items):
                gold = graph_keys(row["nodes"])
                draft = graph_keys(row["draftNodes"])
                draft_exact = draft == gold
                count_facts(draft_totals, draft, gold)
                for at in thresholds:
                    decoded = model.decode_one(features[valid], scores[valid], *at[:2], 64, at[2])
                    edit = graph_keys(decoded)
                    stats = totals[at]
                    edited_exact = edit == gold
                    count_facts(stats, edit, gold)
                    stats["pairExact"] += int(draft_exact or edited_exact)
                    stats["gainedExact"] += int(edited_exact and not draft_exact)
                    stats["lostExact"] += int(draft_exact and not edited_exact)
                    stats["unchanged"] += int(edit == draft)
    results = [
        {**rates(stats, len(rows)), "nodeThreshold": node, "attributeThreshold": slot,
         "ownershipThreshold": owner} for (node, slot, owner), stats in totals.items()
    ]
    return rates(draft_totals, len(rows)), sorted(results, key=lambda r: (-r["f1"], -r["exact"]))


def count_facts(stats, predicted, gold):
    stats["tp"] += sum((predicted & gold).values())
    stats["predicted"] += sum(predicted.values())
    stats["gold"] += sum(gold.values())
    stats["exact"] += int(predicted == gold)
    stats["nonempty"] += int(bool(predicted))


def rates(stats, rows):
    precision = stats["tp"] / max(1, stats["predicted"])
    recall = stats["tp"] / max(1, stats["gold"])
    return {**stats, "rows": rows, "precision": precision, "recall": recall,
            "f1": 2 * precision * recall / max(1e-8, precision + recall)}


def fit(args):
    args.output.mkdir(parents=True, exist_ok=False)
    start = time.monotonic()
    torch.manual_seed(args.seed)
    rng = random.Random(args.seed)
    device = torch.device(args.device)
    if device.type == "cuda":
        from torch._native.registry import deregister_op_overrides

        deregister_op_overrides(disable_dsl_names="triton")
        torch.cuda.manual_seed_all(args.seed)
        torch.set_float32_matmul_precision("high")
    else:
        torch.set_num_threads(args.threads)
    train, dev = ([is_graph_row(row) for row in read_rows(path)] for path in (args.train, args.dev))
    if {row["text"] for row in train} & {row["text"] for row in dev}:
        raise ValueError("Exact source overlap between train and dev")
    tokenizer = AutoTokenizer.from_pretrained(args.base, local_files_only=True)
    encoder = AutoModel.from_pretrained(args.base, local_files_only=True)
    if encoder.config.model_type != "distilbert":
        raise ValueError("Expected the official DistilBERT architecture")
    model = DraftResidual(encoder, Vocabulary.build(train)).to(device)
    groups = [
        {"params": model.encoder.parameters(), "lr": 3e-5},
        {"params": [p for n, p in model.named_parameters() if not n.startswith("encoder.")], "lr": 8e-4},
    ]
    optimizer = torch.optim.AdamW(groups, weight_decay=.01, fused=device.type == "cuda")
    metadata = {
        "base": str(args.base), "trainRows": len(train), "devRows": len(dev), "seed": args.seed,
        "trainSha256": file_sha(args.train), "devSha256": file_sha(args.dev), "device": str(device),
        "accelerator": torch.cuda.get_device_name(device) if device.type == "cuda" else "CPU",
        "torchVersion": torch.__version__, "batchSize": args.batch, "maxEpochs": args.epochs,
        "patience": args.patience, "selection": "dev graph fact F1, then exact count within epoch",
    }
    print(json.dumps(metadata), flush=True)
    history = []
    best_f1 = -1
    checkpoint = args.output / "checkpoint"
    for epoch in range(1, args.epochs + 1):
        epoch_start = time.monotonic()
        model.train()
        losses = []
        for items in batches(train, args.batch, rng):
            encoded = model.batch(tokenizer, items, device)
            optimizer.zero_grad(set_to_none=True)
            with torch.autocast(device_type=device.type, dtype=torch.bfloat16, enabled=device.type == "cuda"):
                loss = model.loss(encoded, items)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            losses.append(float(loss.detach()))
        draft, choices = evaluate(model, tokenizer, dev, device, args.batch)
        choice = choices[0]
        entry = {"epoch": epoch, "loss": sum(losses) / len(losses), "draft": draft, "edit": choice,
                 "elapsedSeconds": time.monotonic() - epoch_start}
        history.append({**entry, "thresholds": choices})
        print(json.dumps(entry), flush=True)
        if choice["f1"] > best_f1:
            best_f1 = choice["f1"]
            selected = entry
            save_repair(model, tokenizer, checkpoint,
                        {**metadata, "selectedEpoch": epoch, "dev": choice})
        elif epoch - selected["epoch"] >= args.patience:
            break
    files = {str(path.relative_to(checkpoint)): file_sha(path)
             for path in sorted(checkpoint.rglob("*")) if path.is_file()}
    report = {**metadata, "selected": selected, "epochs": history, "checkpointFiles": files,
              "checkpointSha256": hashlib.sha256(json.dumps(files, separators=(",", ":")).encode()).hexdigest(),
              "elapsedSeconds": time.monotonic() - start}
    (args.output / "training-summary.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({field: report[field] for field in ("selected", "checkpointSha256", "elapsedSeconds")}),
          flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("train", type=Path)
    parser.add_argument("dev", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--base", type=Path, required=True)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cuda")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--patience", type=int, default=3)
    parser.add_argument("--seed", type=int, default=74113)
    parser.add_argument("--batch", type=int, default=24)
    parser.add_argument("--threads", type=int, default=2)
    args = parser.parse_args()
    if min(args.epochs, args.patience, args.batch, args.threads) < 1:
        parser.error("Epochs, patience, batch size and threads must be positive")
    fit(args)


if __name__ == "__main__":
    main()
