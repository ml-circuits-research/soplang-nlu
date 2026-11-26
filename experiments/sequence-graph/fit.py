"""Fit an optional small encoder-decoder on exact source pointers and native graphs."""
import argparse
from contextlib import nullcontext
import gzip
import hashlib
import json
from pathlib import Path
import random
import time
import torch
from torch.nn.utils.rnn import pad_sequence
from transformers import AutoTokenizer, T5ForConditionalGeneration
from codec import encode, decode, source, POINTER


def read(path):
    with gzip.open(path, "rt") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def tensors(rows, tokenizer, lexicon):
    batch = []
    for row in rows:
        symbols = encode(row["nodes"])
        if encode(decode(symbols, len(row["tokens"]))) != symbols:
            raise ValueError("Unstable graph encoding")
        src = tokenizer(source(row["tokens"]), verbose=False).input_ids
        target = [lexicon.get(s, tokenizer.unk_token_id) for s in symbols] + [tokenizer.eos_token_id]
        batch.append((torch.tensor(src), torch.tensor(target)))
    return batch


def groups(data, batch, rng=None):
    ids = list(range(len(data)))
    if rng:
        rng.shuffle(ids)
    result = []
    for offset in range(0, len(ids), 12 * batch):
        pool = sorted(ids[offset:offset + 12 * batch], key=lambda i: len(data[i][1]))
        result.extend(pool[i:i+batch] for i in range(0, len(pool), batch))
    if rng:
        rng.shuffle(result)
    return result


def epoch(model, data, args, allowed, local_ids, optimizer=None, rng=None):
    train = optimizer is not None
    model.train(train)
    loss_sum = hits = tokens = 0
    for ids in groups(data, args.batch, rng):
        src, tgt = zip(*(data[i] for i in ids))
        x = pad_sequence(src, batch_first=True).to(args.device)
        y = pad_sequence(tgt, batch_first=True, padding_value=-100).to(args.device)
        shifted = model._shift_right(y)
        precision = torch.autocast("cuda", dtype=torch.bfloat16) if args.device == "cuda" else nullcontext()
        with torch.set_grad_enabled(train), precision:
            enc = model.encoder(input_ids=x, attention_mask=x.ne(0)).last_hidden_state
            dec = model.decoder(input_ids=shifted, encoder_hidden_states=enc,
                                encoder_attention_mask=x.ne(0), use_cache=False).last_hidden_state
            if model.config.tie_word_embeddings:
                dec = dec * (model.config.d_model ** -.5)
            logits = torch.nn.functional.linear(dec, model.lm_head.weight[allowed])
            targets = local_ids[y.clamp_min(0)].masked_fill(y.eq(-100), -100)
            loss = torch.nn.functional.cross_entropy(logits.flatten(0,1), targets.flatten())
        if train:
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.)
            optimizer.step()
        count = int(y.ne(-100).sum())
        tokens += count
        loss_sum += loss.item() * count
        hits += int(logits.argmax(-1).eq(targets).sum())
    return dict(loss=loss_sum/tokens, tokenAccuracy=hits/tokens)


def main():
    p = argparse.ArgumentParser()
    for arg in ["train", "dev", "base", "out"]:
        p.add_argument(arg, type=Path)
    p.add_argument("--batch", type=int, default=24)
    p.add_argument("--epochs", type=int, default=10)
    p.add_argument("--device", choices=["cpu","cuda"], default="cuda")
    args=p.parse_args()
    args.out.mkdir(parents=True, exist_ok=False)
    torch.manual_seed(18791)
    rng = random.Random(18791)
    torch.set_num_threads(2)
    if args.device == "cuda":
        from torch._native.registry import deregister_op_overrides
        deregister_op_overrides(disable_dsl_names="triton")
    train,dev = read(args.train),read(args.dev)
    if {r["text"] for r in train} & {r["text"] for r in dev}:
        raise ValueError("Training and development overlap")
    tokenizer = AutoTokenizer.from_pretrained(args.base, local_files_only=True)
    model = T5ForConditionalGeneration.from_pretrained(args.base, local_files_only=True)
    labels = sorted({s for row in train for s in encode(row["nodes"]) if not POINTER.fullmatch(s)})
    words = [tokenizer(s[1:-1].replace(":", " ").replace("_"," "), add_special_tokens=False).input_ids for s in labels]
    tokenizer.add_tokens(labels, special_tokens=True)
    model.resize_token_embeddings(len(tokenizer), mean_resizing=False)
    with torch.no_grad():
        for label, pieces in zip(labels, words):
            idx = tokenizer.convert_tokens_to_ids(label)
            model.shared.weight[idx].copy_(model.shared.weight[pieces].mean(0))
            if not model.config.tie_word_embeddings:
                model.lm_head.weight[idx].copy_(model.lm_head.weight[pieces].mean(0))
    symbols = labels + [f"<extra_id_{i}>" for i in range(100)]
    lexicon = {s:tokenizer.convert_tokens_to_ids(s) for s in symbols}
    allowed = torch.tensor([tokenizer.eos_token_id,tokenizer.unk_token_id,*lexicon.values()],device=args.device)
    if allowed.unique().numel() != allowed.numel():
        raise ValueError("Colliding graph symbol IDs")
    local_ids = torch.full((len(tokenizer),),-100,device=args.device)
    local_ids[allowed] = torch.arange(len(allowed),device=args.device)
    encoded_train,encoded_dev = tensors(train,tokenizer,lexicon),tensors(dev,tokenizer,lexicon)
    model.to(args.device)
    opt = torch.optim.AdamW(model.parameters(),lr=3e-4,fused=args.device=="cuda")
    history = []
    manifest = dict(base=str(args.base),seed=18791,trainRows=len(train),devRows=len(dev),
                    trainSha256=hashlib.sha256(args.train.read_bytes()).hexdigest(),
                    devSha256=hashlib.sha256(args.dev.read_bytes()).hexdigest(), symbols=symbols,
                    batch=args.batch, learningRate=3e-4,selection="lowest development teacher-forced token loss")
    best = float("inf")
    for i in range(args.epochs):
        start = time.monotonic()
        tr = epoch(model,encoded_train,args,allowed,local_ids,opt,rng)
        dv = epoch(model,encoded_dev,args,allowed,local_ids)
        history.append(dict(epoch=i+1,train=tr,dev=dv,seconds=time.monotonic()-start))
        print(json.dumps(history[-1]),flush=True)
        if dv["loss"] < best:
            best = dv["loss"]
            model.save_pretrained(args.out/"checkpoint")
            tokenizer.save_pretrained(args.out/"checkpoint")
            (args.out/"checkpoint"/"graph.json").write_text(json.dumps(dict(**manifest,epoch=i+1)))
        (args.out/"history.json").write_text(json.dumps(history,indent=2))


if __name__ == "__main__":
    main()
