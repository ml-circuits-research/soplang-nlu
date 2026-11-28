"""rvss DESIGN 10: prototypes of well-formed constellations, for the beam scored by the fit of what it builds.

  python fitproto.py <model dir> <export.jsonl> [--workers 4] [--stride 8]

For every closed constellation X of the gold trees of training messages (the adopted oracle's moves replayed), its
kind constellation is

    K_X = sum over X's words      key(k) (x) kind(word)
        + sum over X's children   key(child's key) (x) type(child) (x) kind(child's opener)

(fixed key and type stars, the model's kinds), and the prototype of its type t (nominal, relation, coordination, or
clause with its form) is the phase of the sum of phase(K_X) over every such X: a constellation prototype made by
superposition, nothing trained. fit(X) = sim(phase(K_X), Pi_t) - mu_t, where mu_t is the mean fit of the gold
constellations of type t, so that a typical gold constellation adds nothing and an atypical one subtracts.
Writes <model dir>/fit.npz (types, Pi, mu, sd, count).
"""
import json, os, sys, functools
os.environ.setdefault('OMP_NUM_THREADS', '1'); os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import State, VIEW


def ftype(nd):
    if nd.t == 'clause':
        form = [v for k, v in nd.atoms if k == 'form']
        return 'clause:' + (form[0] if form else 'fragment')
    return nd.t


def kind_constellation(S, h, kap, atom):
    nd = S.nodes[h]; v = 0
    for q, k in nd.words: v = v + atom('fit-key:' + k) * kap[q]
    for c in nd.children:
        ch = S.nodes[c]; v = v + atom('fit-key:' + str(ch.key)) * atom('fit-type:' + ch.t) * kap[S.opener(ch)]
    a = np.abs(v)
    return np.where(a > 1e-9, v / np.maximum(a, 1e-9), 0).astype(np.complex64)


def work(lines, model_dir):
    from decode import Pilot
    P = Pilot(model_dir); atom = P.sc.stars.atom
    sums, sims = {}, {}
    vecs = []
    for o in lines:
        words = o['words']
        try: kap = P.sc.kinds(words, P.stations(words) if getattr(P.sc, 'hmm', False) else None)
        except Exception: continue
        S = State(words, o['gaps'])
        try:
            for m in o['moves']:
                S.apply(m)
                if m['op'] == 'close':
                    h = S.last_closed; t = ftype(S.nodes[h]); K = kind_constellation(S, h, kap, atom)
                    sums[t] = sums.get(t, 0) + K; vecs.append((t, K))
        except Exception: continue
    return sums, vecs


def main():
    md, src = sys.argv[1:3]; args = sys.argv[3:]
    opt = lambda k, d: type(d)(args[args.index('--' + k) + 1]) if '--' + k in args else d
    workers, stride = opt('workers', 4), opt('stride', 8)
    import torch
    VIEW['version'] = torch.load(os.path.join(md, 'model.pt'), map_location='cpu', weights_only=False)['args'].get('view', 1)
    lines = [o for o in (json.loads(l) for l in open(src)) if o['split'] == 'train' and o['origin'] == 'spacy'][::stride]
    chunks = [lines[i:i + 500] for i in range(0, len(lines), 500)]
    from multiprocessing import Pool
    sums = {}; vecs = []
    with Pool(workers) as pool:
        for s, v in pool.imap(functools.partial(work, model_dir=md), chunks):
            for t, x in s.items(): sums[t] = sums.get(t, 0) + x
            vecs.extend(v[::4])
    types = sorted(sums)
    Pi = np.stack([sums[t] / np.maximum(np.abs(sums[t]), 1e-9) for t in types]).astype(np.complex64)
    D = Pi.shape[1]; ix = {t: i for i, t in enumerate(types)}
    sim = {t: [] for t in types}
    for t, K in vecs: sim[t].append(float((K @ np.conj(Pi[ix[t]])).real / D))
    mu = np.array([np.mean(sim[t]) if sim[t] else 0 for t in types], np.float32)
    sd = np.array([np.std(sim[t]) if sim[t] else 1 for t in types], np.float32)
    cnt = np.array([len(sim[t]) for t in types])
    np.savez(os.path.join(md, 'fit.npz'), types=np.array(types), Pi=Pi, mu=mu, sd=sd, count=cnt)
    print(json.dumps({t: {'mu': round(float(mu[i]), 4), 'sd': round(float(sd[i]), 4), 'n': int(cnt[i])} for i, t in enumerate(types)}, indent=1))


if __name__ == '__main__':
    main()
