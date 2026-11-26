"""Stream draft-conditioned graph predictions from a frozen experiment checkpoint."""
import argparse
import json
import sys

import torch

from repair_model import is_graph_row, load_repair


def emit(message):
    print(json.dumps(message, ensure_ascii=True), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoint")
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--threads", type=int, default=2)
    args = parser.parse_args()
    device = torch.device(args.device)
    if device.type == "cpu":
        torch.set_num_threads(args.threads)
    model, tokenizer, metadata = load_repair(args.checkpoint, device)
    dev = metadata["dev"]
    emit({"ready": True, "device": str(device), "selectedEpoch": metadata["selectedEpoch"]})
    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            is_graph_row(request)
            if request["tokens"]:
                with torch.inference_mode():
                    encoded = model.batch(tokenizer, [request], device)
                    nodes, = model.decode(encoded, dev["nodeThreshold"], dev["attributeThreshold"],
                                          ownership_threshold=dev["ownershipThreshold"])
            else:
                nodes = []
            emit({"id": request.get("id"), "nodes": nodes})
        except (KeyError, TypeError, ValueError, RuntimeError) as error:
            emit({"id": request.get("id") if isinstance(request, dict) else None,
                  "error": str(error)})


if __name__ == "__main__":
    main()
