"""Generate a native graph with a bounded decoder alphabet on CPU."""
import argparse
import json
import sys
import torch
from transformers import AutoTokenizer, T5ForConditionalGeneration
from codec import decode, source


def emit(data):
    print(json.dumps(data),flush=True)


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--model", required=True)
    p.add_argument("--device", choices=["cpu","cuda","auto"], default="cpu")
    args=p.parse_args()
    device=args.device if args.device!="auto" else "cuda" if torch.cuda.is_available() else "cpu"
    torch.set_num_threads(2)
    tokenizer=AutoTokenizer.from_pretrained(args.model,local_files_only=True)
    model=T5ForConditionalGeneration.from_pretrained(args.model,local_files_only=True).to(device).eval()
    with open(args.model+"/graph.json") as stream:
        meta=json.load(stream)
    allowed=torch.tensor([tokenizer.eos_token_id]+tokenizer.convert_tokens_to_ids(meta["symbols"]),device=device)
    head=model.lm_head.weight[allowed].detach()
    emit(dict(ready=True,device=device,model="native-sequence-graph",metadata={"epoch":meta["epoch"]}))
    for line in sys.stdin:
        req={}
        try:
            req=json.loads(line)
            tokens=req["tokens"]
            if len(tokens)>100 or not tokens:
                emit(dict(id=req["id"],nodes=[]))
                continue
            x=tokenizer(source(tokens),return_tensors="pt").input_ids.to(device)
            with torch.inference_mode():
                enc=model.encoder(input_ids=x).last_hidden_state
                step=torch.tensor([[model.config.decoder_start_token_id]],device=device)
                cache=None
                sequence=[]
                # Each step produces only an atom, structural marker or source pointer.
                # Exhaustion abstains, preventing a cut-off prefix from becoming a graph.
                for _ in range(min(1024,32+18*len(tokens))):
                    dec=model.decoder(input_ids=step,encoder_hidden_states=enc,past_key_values=cache,use_cache=True)
                    cache=dec.past_key_values
                    state=dec.last_hidden_state[:,-1]
                    if model.config.tie_word_embeddings:
                        state=state*(model.config.d_model**-.5)
                    step=allowed[(state @ head.T).argmax(-1)].reshape(1,1)
                    idx=step.item()
                    if idx==tokenizer.eos_token_id:
                        break
                    sequence.append(idx)
                else:
                    sequence=[]
            try:
                nodes=decode(tokenizer.convert_ids_to_tokens(sequence),len(tokens))
            except ValueError:
                nodes=[]
            emit(dict(id=req["id"],nodes=nodes))
        except Exception as error:
            emit(dict(id=req.get("id"),error=str(error)))


if __name__=="__main__":
    main()
