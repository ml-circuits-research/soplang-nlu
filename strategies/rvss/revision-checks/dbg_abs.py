import sys, json, numpy as np
sys.argv = ['m1abs.py', '../h/trees-h.json', '1024', 'inner', '5', '0']
src = open('m1abs.py').read()
src = src[:src.index("path, Ds = sys.argv[1]")]
exec(src)
data = json.load(open('../h/trees-h.json'))
S = Space(1024); th = 5 / np.sqrt(2048); shown = 0
for m in data:
    top, stars = encode2(S, m, 'inner')
    gn, ga, ge, gw = gold2(m)
    dn, da, de, dw = decode2(S, top, m, stars, 'inner', th)
    ex = de - ge
    if ex:
        W = m['wires']
        for (p, k, c) in list(ex)[:2]:
            j = c[0]; i = p[0] if p != ('M', 0) else None
            true = [e for e in ge if e[0] == p and e[1] == k]
            print('extra', k, 'parent', W[i]['t'] if i is not None else 'M', 'child', j, W[j]['t'], 'a', W[j]['a'], 'terms', len(W[j]['w']) + len(W[j]['c']) + len(W[j]['p']),
                  '| true children at key:', [(t[2][0], W[t[2][0]]['t'], W[t[2][0]]['a'], float(np.vdot(stars[t[2][0]], stars[j]).real / 1024)) for t in true])
        shown += 1
        if shown > 6: break
