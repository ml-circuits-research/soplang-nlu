"""Fit a small cross-encoder to score complete source/circuit pairs."""
import argparse
from collections import defaultdict
import gzip
import hashlib
import json
from pathlib import Path
import random
import time
from contextlib import nullcontext

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer


def load(path, tokenizer):
    items=defaultdict(set)
    with gzip.open(path,'rt') as stream:
        for line in stream:
            r=json.loads(line)
            items[(r["text"], r["graph"])].add(r["accepted"])
    rows=[(text,graph,int(next(iter(labels)))) for (text,graph),labels in items.items() if len(labels)==1]
    groups=defaultdict(list)
    for start in range(0,len(rows),512):
        batch=rows[start:start+512]
        tx,graphs,labels=zip(*batch)
        enc=tokenizer(list(tx),list(graphs),truncation=True,max_length=512)
        for i,(text,label) in enumerate(zip(tx,labels)):
            groups[text].append(({k:v[i] for k,v in enc.items()},label))
    return groups


def batches(groups,size,rng):
    chunks=[]
    for group in groups.values():
        items=list(group)
        if rng: rng.shuffle(items)
        chunks.extend(items[i:i+size] for i in range(0,len(items),size))
    if rng: rng.shuffle(chunks)
    result=[]
    for offset in range(0,len(chunks),size*12):
        bucket=sorted(chunks[offset:offset+size*12],key=lambda c:max(len(x[0]["input_ids"]) for x in c))
        batch=[]
        for chunk in bucket:
            if sum(map(len,batch))+len(chunk)>size:
                result.append(batch)
                batch=[]
            batch.append(chunk)
        if batch:result.append(batch)
    if rng:rng.shuffle(result)
    return result


def run(model,tok,groups,args,optim=None,rng=None):
    model.train(optim is not None)
    correct=pairs=higher=total=0
    total_bce=0.
    for batch in batches(groups,args.batch,rng):
        features,labels=zip(*(example for chunk in batch for example in chunk))
        x=tok.pad(list(features),padding=True,pad_to_multiple_of=8,return_tensors="pt").to(args.device)
        y=torch.tensor(labels,dtype=torch.float32,device=args.device)
        precision=torch.autocast("cuda",dtype=torch.bfloat16) if args.device=="cuda" else nullcontext()
        with torch.set_grad_enabled(optim is not None), precision:
            z=model(**x).logits[:,0].float()
            bce=torch.nn.functional.binary_cross_entropy_with_logits(z,y)
            wins=[]; losses=[]; offset=0
            for chunk in batch:
                pos=[offset+i for i,(_,label) in enumerate(chunk) if label]
                neg=[offset+i for i,(_,label) in enumerate(chunk) if not label]
                for a in pos:
                    wins.extend([a]*len(neg))
                    losses.extend(neg)
                offset+=len(chunk)
            delta=z[wins]-z[losses] if wins else None
            loss=bce+.35*torch.nn.functional.softplus(-delta).mean() if wins else bce
        if optim is not None:
            optim.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(),1.)
            optim.step()
        if wins:
            pairs+=len(wins)
            higher+=int(delta.gt(0).sum())
        total+=len(labels)
        total_bce+=bce.item()*len(labels)
        correct+=int(z.gt(0).eq(y.bool()).sum())
    return dict(rows=total,accuracy=correct/total,bce=total_bce/total,
                comparisons=pairs,withinSourceRanking=higher/pairs if pairs else 0.)


def main():
    p=argparse.ArgumentParser()
    for name in ["data","base","output"]:p.add_argument(name,type=Path)
    p.add_argument("--device",choices=["cpu","cuda"],default="cuda")
    p.add_argument("--epochs",type=int,default=4)
    p.add_argument("--batch",type=int,default=26)
    args=p.parse_args()
    args.output.mkdir(parents=True,exist_ok=False)
    seed=2842
    torch.manual_seed(seed)
    torch.set_num_threads(2)
    rng=random.Random(seed)
    if args.device=="cuda":
        from torch._native.registry import deregister_op_overrides
        deregister_op_overrides(disable_dsl_names="triton")
    tokenizer=AutoTokenizer.from_pretrained(args.base,local_files_only=True)
    model=AutoModelForSequenceClassification.from_pretrained(args.base,num_labels=1,local_files_only=True).to(args.device)
    train,dev=[load(args.data/(split+".jsonl.gz"),tokenizer) for split in ["train","dev"]]
    if set(train)&set(dev):raise ValueError("Exact source overlap")
    opt=torch.optim.AdamW(model.parameters(),lr=3e-5,weight_decay=.01,fused=args.device=="cuda")
    history=[]
    meta=dict(seed=seed,base=str(args.base),dataSha256=hashlib.sha256((args.data/"manifest.json").read_bytes()).hexdigest(),
              trainTexts=len(train),devTexts=len(dev),selection="within-source ranking then binary cross-entropy",batch=args.batch)
    best=(-1.,float("-inf"))
    for i in range(args.epochs):
        start=time.monotonic()
        tr=run(model,tokenizer,train,args,opt,rng)
        dv=run(model,tokenizer,dev,args)
        history.append(dict(epoch=i+1,train=tr,dev=dv,seconds=time.monotonic()-start))
        print(json.dumps(history[-1]),flush=True)
        criterion=(dv["withinSourceRanking"],-dv["bce"])
        if criterion>best:
            best=criterion
            model.save_pretrained(args.output/"checkpoint")
            tokenizer.save_pretrained(args.output/"checkpoint")
            (args.output/"checkpoint"/"verifier.json").write_text(json.dumps(dict(**meta,epoch=i+1)))
        (args.output/"history.json").write_text(json.dumps(history,indent=2))

if __name__=="__main__":
    main()
