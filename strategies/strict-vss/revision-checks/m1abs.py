"""Critic variant of hierarchy-checks/m1probe.py (read-only on the design's files).
Atlas items carry their wire's identity: item(Y) = Z^(a_Y) (x) c(Y) (one item per wire, distinct even for
identical wires), so a child is found by one unbinding conj(R_k) (x) Z^(a_X) and a cleanup over the items,
taking every item above the threshold, with no scan over offsets. Optional: the type atom is moved from inside
the constellation to the holder's term (R_k (x) T_type(Y) (x) Z^d (x) c(Y)), and children are cleaned up per type.
Usage: python m1abs.py trees.json D[,D] [inner|holder] [theta_sigma] [limit]
"""
import json, sys, time
import numpy as np
sys_argv = sys.argv[:]
sys.argv = ['x']
exec(open('/home/salboaie/work/sopworlds/soplang-nlu/strategies/strict-vss/hierarchy-checks/m1probe.py').read().replace("if __name__ == '__main__':\n    main()", ""))
sys.argv = sys_argv


def encode2(S, m, mode):
    W = m['wires']; stars = [None] * len(W)
    def star(i, guard=0):
        if stars[i] is not None: return stars[i]
        if guard > 60: raise RecursionError
        w = W[i]; a = w['a']
        C = S.R['type'] * S.T[TYPES.index(w['t'])] if mode == 'inner' else np.zeros(S.D, np.complex64)
        for p, k in w['w']: C = C + S.R[k] * S.Z(p - a) * S.f(m['words'][p])
        for k, c in w['c'] + w['p']:
            t = S.T[TYPES.index(W[c]['t'])] if mode == 'holder' else 1
            C = C + S.R[k] * t * S.Z(W[c]['a'] - a) * star(c, guard + 1)
        if w['amb']: C = C + S.R['att'] * S.amb
        stars[i] = S.condense(C)
        return stars[i]
    for i in range(len(W)): star(i)
    C = sum(S.R['top'] * (S.T[TYPES.index(W[t]['t'])] if mode == 'holder' else 1) * S.Z(W[t]['a']) * stars[t] for t in m['top'])
    return S.condense(C), stars


def decode2(S, top, m, stars, mode, th):
    D = S.D; n = m['n']; W = m['wires']
    items = np.stack([S.Z(W[i]['a']) * stars[i] for i in range(len(W))])        # identity = star bound with its origin
    itype = [TYPES.index(W[i]['t']) for i in range(len(W))]
    Tconj = np.conj(S.T)
    nodes, amb, edges, vecs = {}, set(), set(), {}
    frontier = [(('M', 0), S.expand(top), 'M', 0)]
    seen = set(); steps = 0
    while frontier:
        nid, C, t, a = frontier.pop(); steps += 1
        if steps > 400: break
        for k in REF_KEYS[t.split('.')[0]]:
            U = C * np.conj(S.R[k]) * S.Z(a)
            if mode == 'holder':
                # one cleanup per type: unbind the type atom, compare with the items of that type
                sc = np.full(len(W), -9.0)
                for ti in set(itype):
                    idx = [i for i in range(len(W)) if itype[i] == ti]
                    sc[idx] = ((U * Tconj[ti]) @ np.conj(items[idx]).T).real / D
            else:
                sc = (U @ np.conj(items).T).real / D
            for j in np.nonzero(sc > th)[0]:
                child = (int(j),)
                edges.add((nid, k, child))
                if child not in seen:
                    seen.add(child)
                    v = S.expand(stars[j])
                    if mode == 'holder': tt = TYPES[itype[j]]          # the holder's term said the type
                    else: tt = TYPES[int(np.argmax(((v * np.conj(S.R['type'])) @ Tconj.T).real))]
                    nodes[child] = tt; vecs[child] = (v, W[j]['a'])
                    if ((v * np.conj(S.R['att'])) @ np.conj(S.amb)).real / D > 5.0 / np.sqrt(2 * D): amb.add(child)
                    frontier.append((child, v, tt, W[j]['a']))
    words = {}
    for p in range(n):
        fw = S.f(m['words'][p]); best = (-9, None)
        for nid, (v, a) in vecs.items():
            for k in WORD_KEYS[nodes[nid].split('.')[0]]:
                s = (np.vdot(S.R[k] * S.Z(p - a) * fw, v)).real / D
                if s > best[0]: best = (s, (nid, k))
        words[p] = best[1]
    return nodes, amb, edges, words


def gold2(m):
    W = m['wires']
    nodes = {(i,): W[i]['t'] for i in range(len(W))}
    amb = {(i,) for i in range(len(W)) if W[i]['amb']}
    edges = {(('M', 0), 'top', (t,)) for t in m['top']}
    for i, w in enumerate(W):
        for k, c in w['c'] + w['p']: edges.add(((i,), k, (c,)))
    words = {}
    for i, w in enumerate(W):
        for p, k in w['w']: words[p] = ((i,), k)
    return nodes, amb, edges, words


path, Ds = sys.argv[1], [int(x) for x in sys.argv[2].split(',')]
mode = sys.argv[3] if len(sys.argv) > 3 else 'inner'
ths = float(sys.argv[4]) if len(sys.argv) > 4 else 5.0
limit = int(sys.argv[5]) if len(sys.argv) > 5 else None
data = json.load(open(path))
if limit: data = data[:limit]
for D in Ds:
    S = Space(D); t0 = time.time(); th = ths / np.sqrt(2 * D)
    res = {}; tot = dict(msgs=0, exact=0, extra=0, missing=0)
    for m in data:
        try: top, stars = encode2(S, m, mode)
        except RecursionError: continue
        gn, ga, ge, gw = gold2(m)
        # identical wires (same star, same origin) cannot occur: origins differ, or they are the same wire
        dn, da, de, dw = decode2(S, top, m, stars, mode, th)
        exact = gn == dn and ga == da and ge == de and all(dw.get(p) == gw[p] for p in gw)
        b = '<10' if m['n'] < 10 else '10-24' if m['n'] < 25 else '25-39' if m['n'] < 40 else '40+'
        r = res.setdefault(b, [0, 0]); r[0] += 1; r[1] += exact
        tot['msgs'] += 1; tot['exact'] += exact; tot['extra'] += len(de - ge); tot['missing'] += len(ge - de)
    print(f"D={D} mode={mode} theta={ths}sigma messages {tot['msgs']} exact {tot['exact']} ({tot['exact']/tot['msgs']:.4f}) "
          f"extra edges {tot['extra']} missing edges {tot['missing']} | by length " +
          ', '.join(f"{k}: {v[1]}/{v[0]}" for k, v in sorted(res.items())) + f" | {time.time()-t0:.0f}s", flush=True)
