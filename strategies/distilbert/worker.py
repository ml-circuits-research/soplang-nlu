"""Persistent JSONL worker for a frozen native DistilBERT graph checkpoint."""
import argparse
import json
import sys
from time import perf_counter

import torch

from model import load_checkpoint, tokenize_batch, validate_row


def emit(value):
    print(json.dumps(value, separators=(",", ":"), ensure_ascii=True), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    args = parser.parse_args()
    device = args.device
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but is not available")
    if device == "cpu":
        torch.set_num_threads(2)
    start = perf_counter()
    model, tokenizer, metadata = load_checkpoint(args.model, device)
    settings = metadata.get("dev", {})
    model_name = metadata["base"]
    emit({"ready": True, "device": device, "model": model_name,
          "metadata": {"model": model_name, "baseRevision": metadata["baseRevision"],
                       "device": device, "format": metadata["format"],
                       "selectedEpoch": metadata.get("selectedEpoch"),
                       "loadMs": (perf_counter() - start) * 1000}})
    for line in sys.stdin:
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            validate_row(request, annotated=False)
            if not request["tokens"]:
                emit({"id": request_id, "nodes": []})
                continue
            with torch.inference_mode():
                batch = tokenize_batch(tokenizer, [request], device)
                nodes, = model.decode(batch, settings.get("nodeThreshold", .55),
                                      settings.get("attributeThreshold", .55),
                                      ownership_threshold=settings.get("ownershipThreshold", .65))
            emit({"id": request_id, "nodes": nodes})
        except ValueError as error:
            if str(error).startswith("Source needs more than "):
                emit({"id": request_id, "nodes": [], "status": "input-too-long"})
            else:
                emit({"id": request_id, "error": str(error)})
        except (KeyError, TypeError, AttributeError, RuntimeError) as error:
            emit({"id": request_id, "error": str(error)})


if __name__ == "__main__":
    main()
