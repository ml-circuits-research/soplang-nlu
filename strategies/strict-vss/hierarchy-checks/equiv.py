"""Equivalence check: message stars of the accepted and the rejected circuit of the same message (registry,
outside the benchmark). cos = 1 exactly when the two holding trees are the same; how far below 1, against the
number of core lines that differ."""
import json, sys, numpy as np
sys.argv = ['x']
exec(open('m1probe.py').read().replace("if __name__ == '__main__':\n    main()", ""))
pairs = json.load(open('pairs.json'))
for D in (1024,):
    S = Space(D)
    cs, ds, same = [], [], 0
    for p in pairs:
        a, _ = encode(S, {**p['acc'], 'words': p['acc']['words']})
        r, _ = encode(S, {**p['rej'], 'words': p['rej']['words']})
        c = float(np.real(np.vdot(a, r)) / D)
        cs.append(c); ds.append(p['diff'])
    cs, ds = np.array(cs), np.array(ds)
    rank = lambda x: np.argsort(np.argsort(x))
    rho = np.corrcoef(rank(cs), rank(ds))[0, 1]
    print(f'D={D} pairs {len(cs)}  cos: min {cs.min():.3f} median {np.median(cs):.3f} max {cs.max():.3f}; cos=1: {(cs>0.9999).sum()}')
    for lo, hi in [(1, 2), (3, 4), (5, 8), (9, 1000)]:
        m = (ds >= lo) & (ds <= hi)
        if m.any(): print(f'  core lines differing {lo}-{hi}: n={m.sum()} median cos {np.median(cs[m]):.3f}')
    print(f'  Spearman(cos, differing lines) = {rho:.3f}')
