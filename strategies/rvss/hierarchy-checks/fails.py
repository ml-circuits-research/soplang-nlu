import json, sys, numpy as np
D = int(sys.argv[1]); sys.argv = ['x']
exec(open('m1probe.py').read().replace("if __name__ == '__main__':\n    main()", ""))
data = json.load(open('trees-h.json'))
S = Space(D)
for m in data:
    if m['n'] < 25: continue
    top, stars = encode(S, m); cls, reps = classes(stars)
    g = gold_graph(m, cls); d = decode(S, top, reps, m)
    gn, ga, ge, gw = g; dn, da, de, dw = d
    if gn == dn and ga == da and ge == de and all(dw.get(p) == gw[p] for p in gw): continue
    nterms = max(1 + len(w['w']) + len(w['c']) + len(w['p']) + w['amb'] for w in m['wires'])
    print('n', m['n'], 'wires', len(m['wires']), 'max terms', nterms, 'missing edges', len(ge - de), 'extra', len(de - ge), 'words wrong', sum(dw.get(p) != gw[p] for p in gw), 'amb', ga == da, 'atlas', len(reps))
    for e in list(ge - de)[:3]: print('   missing', e)
    for e in list(de - ge)[:3]: print('   extra', e)
