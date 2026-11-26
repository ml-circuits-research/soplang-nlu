import argparse
import gzip
import json
from pathlib import Path
from statistics import median

def rows(path):
    with gzip.open(path,"rt") as f: return [json.loads(line) for line in f]

def main():
    p=argparse.ArgumentParser()
    for field in ["inputs","scores","evidence","output"]:p.add_argument(field,type=Path)
    args=p.parse_args()
    stats={name:dict(any=0,all=0,mixed=0,none=0,gainVsBase=0,lossVsBase=0) for name in ["highestTwo","preserveFirst"]}
    times=[];available=base=pair=0
    for r,s,e in zip(rows(args.inputs),rows(args.scores),rows(args.evidence),strict=True):
        if r["id"]!=s["id"] or s["id"]!=e["id"] or len(r["choices"])!=len(s["scores"]) or len(s["scores"])!=len(e["accepted"]):
            raise ValueError("Unpaired score")
        rank=sorted(range(len(s["scores"])),key=lambda i:-s["scores"][i])
        first=next((i for i,c in enumerate(r["choices"]) if c["family"]=="base"),None)
        protected=([first]+[i for i in rank if i!=first]) if first is not None else rank
        times.append(s["ms"]);base+=e["base"];pair+=e["deployedPair"];available+=any(e["accepted"])
        for name,indices in [("highestTwo",rank),("preserveFirst",protected)]:
            selected=[e["accepted"][i] for i in indices[:2]]
            any_ok=any(selected)
            report=stats[name]
            report["any"]+=any_ok
            report["none" if not any_ok else "all" if all(selected) else "mixed"]+=1
            report["gainVsBase"]+=any_ok and not e["base"]
            report["lossVsBase"]+=not any_ok and e["base"]
    args.output.write_text(json.dumps(dict(texts=len(times),baselineAny=base,pairedAny=pair,poolAny=available,
                                     cpuRankingMedianMs=median(times),policies=stats),indent=2)+"\n")

if __name__=="__main__":main()
