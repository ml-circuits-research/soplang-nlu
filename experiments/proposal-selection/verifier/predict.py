"""Score proposals without access to their source provenance, order or evaluation labels."""
import argparse
import gzip
import json
import time
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification


def main():
    p=argparse.ArgumentParser()
    p.add_argument("checkpoint");p.add_argument("inputs");p.add_argument("scores")
    args=p.parse_args()
    torch.set_num_threads(2)
    tok=AutoTokenizer.from_pretrained(args.checkpoint,local_files_only=True)
    model=AutoModelForSequenceClassification.from_pretrained(args.checkpoint,local_files_only=True).eval()
    with gzip.open(args.inputs,"rt") as f,gzip.open(args.scores,"xt") as out,torch.inference_mode():
        for line in f:
            r=json.loads(line)
            choices=r["choices"]
            start=time.monotonic()
            scores=[]
            for i in range(0,len(choices),8):
                batch=choices[i:i+8]
                enc=tok([r["text"]]*len(batch),[c["graph"] for c in batch],padding=True,
                        max_length=512,truncation=True,return_tensors="pt")
                scores.extend(model(**enc).logits[:,0].tolist())
            print(json.dumps(dict(id=r["id"],scores=scores,ms=(time.monotonic()-start)*1000)),file=out)


if __name__=="__main__":
    main()
