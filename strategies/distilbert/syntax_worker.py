"""Persistent JSON Lines worker for a checkpoint of the syntax model.

One line in: {"id", "text", "tokens", "nodeThreshold"?}. One line out: {"id", "nodes", "owners"}
as SyntaxDistilBert.predict writes them, or {"id", "error"}.
"""
import argparse
import json
import sys
from time import perf_counter

import torch

from syntax_model import load_checkpoint, tokenize_batch, validate_tokens


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
    model, tokenizer, manifest = load_checkpoint(args.model, device)
    threshold = manifest.get("nodeThreshold", .5)
    emit({"ready": True, "device": device, "model": manifest["base"],
          "metadata": {"model": manifest["base"], "baseRevision": manifest.get("baseRevision"), "device": device,
                       "format": manifest["format"], "selectedEpoch": manifest.get("selectedEpoch"),
                       "nodeThreshold": threshold, "loadMs": (perf_counter() - start) * 1000}})
    for line in sys.stdin:
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            validate_tokens(request)
            if not request["tokens"]:
                emit({"id": request_id, "nodes": [], "owners": []})
                continue
            with torch.inference_mode():
                batch = tokenize_batch(tokenizer, [request], device)
                prediction, = model.predict(batch, float(request.get("nodeThreshold", threshold)))
            emit({"id": request_id, **prediction})
        except ValueError as error:
            if str(error).startswith("The message needs more than "):
                emit({"id": request_id, "nodes": [], "owners": [], "status": "input-too-long"})
            else:
                emit({"id": request_id, "error": str(error)})
        except (KeyError, TypeError, AttributeError, RuntimeError) as error:
            emit({"id": request_id, "error": str(error)})


if __name__ == "__main__":
    main()
