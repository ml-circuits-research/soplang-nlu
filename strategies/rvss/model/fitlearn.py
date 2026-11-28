"""rvss DESIGN 10: learned prototypes of well-formed constellations, for the beam scored by the fit of what it builds.

  python fitlearn.py <model dir> <export.jsonl> [--workers 4] [--stride 40] [--beam 4] [--epochs 30]

The pilot reads training messages with a beam (decode.py); every constellation closed in a final hypothesis is a
gold one (the same type and form, the same words under the same keys, the same held constellations under the same keys)
or not. Its kind constellation K_X is fitproto.py's. One prototype Pi_t per type t (nominal, relation, coordination,
clause with its form) and two scalars a_t, b_t are learned by logistic regression:

    p(X is gold) = sigmoid(a_t * Re<K_X, Pi_t> / sqrt(D) + b_t)

and the beam adds fit * log p(X is gold) for every constellation a hypothesis closes (decode.py --fit). The prototypes
start from fitproto.py's superposition (fit.npz). Writes <model dir>/fit-learned.npz (types, Pi, a, b) and the counts.
"""
import json, os, sys, functools, math
os.environ.setdefault('OMP_NUM_THREADS', '1'); os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import State, VIEW
from fitproto import ftype, kind_constellation


def sig(S, h):
    nd = S.nodes[h]
    return (ftype(nd), tuple(sorted((q, k) for q, k in nd.words)),
            tuple(sorted((S.nodes[c].key, ftype(S.nodes[c]), S.opener(S.nodes[c])) for c in nd.children)))


def work(lines, model_dir, beam):
    from decode import Pilot
    P = Pilot(model_dir); P.keep_beam = True; atom = P.sc.stars.atom
    out = []
    for o in lines:
        words = o['words']
        G = State(words, o['gaps'])
        try:
            for m in o['moves']: G.apply(m)
        except Exception: continue
        gold = {sig(G, h) for h, nd in G.nodes.items() if nd.status == 'closed'}
        try: P.read(words, o['gaps'], beam)
        except Exception: continue
        kap, states = P.last_beam; seen = set()
        for S in states:
            for h, nd in S.nodes.items():
                if nd.status != 'closed': continue
                s = sig(S, h)
                if s in seen: continue
                seen.add(s); out.append((s[0], int(s in gold), kind_constellation(S, h, kap, atom)))
    return out


def main():
    md, src = sys.argv[1:3]; args = sys.argv[3:]
    opt = lambda k, d: type(d)(args[args.index('--' + k) + 1]) if '--' + k in args else d
    workers, stride, beam, epochs = opt('workers', 4), opt('stride', 40), opt('beam', 4), opt('epochs', 30)
    import torch
    VIEW['version'] = torch.load(os.path.join(md, 'model.pt'), map_location='cpu', weights_only=False)['args'].get('view', 1)
    # every stride-th training message, shifted by half a stride so that train-inputs-s80.jsonl (tuning) is not among them
    lines = [o for o in (json.loads(l) for l in open(src)) if o['split'] == 'train' and o['origin'] == 'spacy'][stride // 2::stride]
    chunks = [lines[i:i + 100] for i in range(0, len(lines), 100)]
    from multiprocessing import Pool
    rows = []
    with Pool(workers) as pool:
        for r in pool.imap(functools.partial(work, model_dir=md, beam=beam), chunks): rows.extend(r)
    z = np.load(os.path.join(md, 'fit.npz')); types = z['types'].tolist(); ix = {t: i for i, t in enumerate(types)}
    rows = [r for r in rows if r[0] in ix]
    T = torch.tensor([ix[r[0]] for r in rows]); Y = torch.tensor([float(r[1]) for r in rows])
    K = torch.as_tensor(np.stack([r[2] for r in rows]))
    D = K.shape[1]
    th = torch.nn.Parameter(torch.as_tensor(np.angle(z['Pi'])).float())
    a = torch.nn.Parameter(torch.full((len(types),), 4.0)); b = torch.nn.Parameter(torch.zeros(len(types)))
    opt_ = torch.optim.Adam([{'params': [th], 'lr': 0.02}, {'params': [a, b], 'lr': 0.05}])
    w = torch.ones(len(rows))     # unweighted, so that sigmoid stays a probability the beam can add as a log
    perm = torch.randperm(len(rows)); nv = len(rows) // 10; va, tr = perm[:nv], perm[nv:]
    def logits(idx):
        Pc = torch.polar(torch.ones_like(th), th)[T[idx]]
        return a[T[idx]] * (K[idx] * Pc.conj()).sum(1).real / math.sqrt(D) + b[T[idx]]
    for ep in range(epochs):
        for s in range(0, len(tr), 4096):
            idx = tr[s:s + 4096]
            loss = (torch.nn.functional.binary_cross_entropy_with_logits(logits(idx), Y[idx], reduction='none') * w[idx]).mean()
            opt_.zero_grad(); loss.backward(); opt_.step()
    with torch.no_grad():
        lv = logits(va); acc = ((lv > 0).float() == Y[va]).float().mean().item()
        # how often a gold constellation outscores a wrong one of the same type (held-out tenth)
        auc = {}
        for t in range(len(types)):
            m = T[va] == t; p, n = lv[m & (Y[va] == 1)], lv[m & (Y[va] == 0)]
            if len(p) and len(n): auc[types[t]] = round(float((p[:, None] > n[None, :]).float().mean()), 3)
    np.savez(os.path.join(md, 'fit-learned.npz'), types=np.array(types), Pi=torch.polar(torch.ones_like(th), th).detach().numpy().astype(np.complex64),
             a=a.detach().numpy(), b=b.detach().numpy())
    res = {'constellations': len(rows), 'gold': int(Y.sum()), 'messages': len(lines), 'held-out accuracy': round(acc, 4), 'held-out AUC by type': auc}
    json.dump(res, open(os.path.join(md, 'fit-learned.json'), 'w'), indent=1); print(json.dumps(res))


if __name__ == '__main__':
    main()
