# How much does one wrong word move the message star, by the depth of the wire it is in?
import json, sys, copy, numpy as np
H = '/home/salboaie/work/sopworlds/soplang-nlu/strategies/strict-vss/hierarchy-checks/'
src = open(H + 'm1probe.py').read().replace("if __name__ == '__main__':\n    main()", "")
sys.argv = ['x']; exec(src)
data = json.load(open('/tmp/claude-1000/-home-salboaie-work-sopworlds/e235462f-8553-42ea-b357-85307b023a32/scratchpad/strict-vss/h/trees-h.json'))
rng = np.random.default_rng(1)
S = Space(1024)
def depths(m):
    W = m['wires']; d = {}
    par = {}
    for i, w in enumerate(W):
        for k, c in w['c']: par[c] = i
    for i in range(len(W)):
        x, k = i, 1
        while x in par: x = par[x]; k += 1
        d[i] = k
    return d
res = {}
idx = rng.permutation(len(data))[:1500]
for j in idx:
    m = data[j]
    try: top, _ = encode(S, m)
    except RecursionError: continue
    d = depths(m)
    for i, w in enumerate(m['wires']):
        if not w['w']: continue
        p, k = w['w'][0]
        m2 = copy.deepcopy(m); m2['words'] = list(m['words']); m2['words'][p] = 'zzq' + str(rng.integers(1e9))
        t2, _ = encode(S, m2)
        sim = float(np.real(np.vdot(top, t2)) / S.D)
        res.setdefault(min(d[i], 7), []).append(sim)
    # a wrong key: first word of the top wire placed at another key
for k in sorted(res):
    v = np.array(res[k]); print(f'one word replaced in a wire at depth {k}{"+" if k==7 else ""}: n={len(v)} message-star similarity median {np.median(v):.3f}  p10 {np.percentile(v,10):.3f}')
