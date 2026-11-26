"""Check exact UTF-8 source exclusion using the frozen sample and training archives."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load(path):
    payload = gzip.decompress(path.read_bytes())
    if path.name.endswith(".jsonl.gz"):
        return [json.loads(line) for line in payload.splitlines() if line]
    return json.loads(payload)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("run", type=Path)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[3])
    args = parser.parse_args()
    archive = args.root / "eval-results"
    env = json.loads((args.run / "environment.json").read_text())
    sample_path = args.run / "sample.json.gz"
    sample_sha = hashlib.sha256(sample_path.read_bytes()).hexdigest()
    sample = {digest(row["text"]) for row in load(sample_path)}
    reserved = load(args.root / "tests/benchmark/next-evaluation/reserved-exact-texts.json.gz")
    if sample_sha != env["sampleSha256"] or len(sample) != env["sample"] or sorted(sample) != reserved:
        raise SystemExit("The sample does not match the prospective reservation.")
    distilled = archive / "2026-11-26-distilbert-expanded-study-100/labels"
    syntax = archive / "2026-11-26-spacy-compact-adaptation-pilot/training"
    ranker = archive / "2026-11-26-neuro-selector-proposal-pools/train"
    inputs = {
        "ownership training": distilled / "train.jsonl.gz",
        "ownership development": distilled / "dev.jsonl.gz",
        "adapted spaCy training and development": syntax / "corrected-graphs.json.gz",
        "selector training and validation proposal sources": ranker / "sources.jsonl.gz",
    }
    selection = json.loads((args.run / "model-selection.json").read_text())
    if hashlib.sha256(inputs["ownership training"].read_bytes()).hexdigest() != selection["trainSha256"]:
        raise SystemExit("Training labels differ from the selected model manifest.")
    report = {"sampleSha256": sample_sha, "sampleExactTexts": len(sample), "archives": {}}
    for name, path in inputs.items():
        sources = {digest(row["text"]) for row in load(path)}
        report["archives"][name] = {
            "path": str(path.relative_to(archive)),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "exactTexts": len(sources),
            "overlap": len(sources & sample),
        }
    print(json.dumps(report, indent=2))
    if any(item["overlap"] for item in report["archives"].values()):
        raise SystemExit("Training or model selection used reserved source texts.")


if __name__ == "__main__":
    main()
