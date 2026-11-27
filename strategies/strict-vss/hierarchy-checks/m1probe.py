"""M1 probe for the hierarchical strict-vss design (oracle grouping, nothing learned).

Each wire of a label circuit becomes a constellation of its own few terms; a finished constellation is
condensed into one star (phase projection, then a fixed permutation) and that star is placed into the
constellation that holds the wire. The message star holds the top wires. The circuit is then read back
from the message star alone, with the message's words and the unordered set of condensed stars of this
message (the atlas, a clean-up memory in Plate's sense):
  type by unbinding R_type and cleanup over the type/form codebook;
  children by unbinding R_key (x) Z^d for every reference key and offset, cleanup over the atlas, threshold;
  every word by the best (node, word key) score over all decoded nodes (every word exactly one place).
Variant `noatlas`: children are not cleaned up; the noisy unbound vector is decoded further as it is,
and a child is accepted when its type term is found (Plate's decoding without clean-up memory).
Usage: python m1probe.py trees-h.json D[,D...] [atlas|noatlas] [limit]
"""
import json, sys, hashlib, time
import numpy as np

WORD_KEYS = {'nominal': ['head', 'dependent'], 'relation': ['marker', 'negation'], 'coordination': ['conjunction'],
             'clause': ['verb', 'auxiliary', 'negation', 'modifier', 'discourse']}
REF_KEYS = {'nominal': ['rel'], 'relation': ['to'], 'coordination': ['conjunct', 'rel'],
            'clause': ['subject', 'complement', 'rel', 'ellipsis', 'conjunct', 'to'], 'M': ['top']}
TYPES = ['nominal', 'relation', 'coordination', 'clause.imperative', 'clause.declarative', 'clause.interrogative',
         'clause.fragment', 'clause.nonfinite']
ALLKEYS = sorted({k for v in WORD_KEYS.values() for k in v} | {k for v in REF_KEYS.values() for k in v} | {'type', 'att'})


def seeded(s, D):
    seed = int.from_bytes(hashlib.sha256(s.encode()).digest()[:8], 'little')
    return np.exp(1j * np.random.default_rng(seed).uniform(-np.pi, np.pi, D)).astype(np.complex64)


def phase(x):
    a = np.abs(x)
    return np.where(a > 1e-9, x / np.maximum(a, 1e-9), 1).astype(np.complex64)


class Space:
    def __init__(self, D):
        self.D = D
        self.R = {k: seeded('sop-stars-v1:key:' + k, D) for k in ALLKEYS}
        self.T = np.stack([seeded('sop-stars-v1:type:' + t, D) for t in TYPES])
        self.amb = seeded('sop-stars-v1:value:ambiguous', D)
        self.phi = np.angle(seeded('sop-stars-v1:position', D))
        rng = np.random.default_rng(7)
        self.perm = rng.permutation(D); self.inv = np.argsort(self.perm)
        self.cache = {}

    def Z(self, d):
        return np.exp(1j * d * self.phi).astype(np.complex64)

    def f(self, w):
        """word star: the form plus its letter trigrams (with boundary marks), bundled, phase-projected"""
        if w in self.cache: return self.cache[w]
        g = '#' + w + '#'
        tri = [g[i:i + 3] for i in range(max(1, len(g) - 2))]
        v = seeded('sop-stars-v1:id:' + w, self.D) + sum(seeded('sop-stars-v1:tri:' + t, self.D) for t in tri) / np.sqrt(len(tri))
        self.cache[w] = phase(v)
        return self.cache[w]

    def condense(self, C):
        return phase(C)[self.perm]

    def expand(self, s):
        return s[self.inv]


def encode(S, m):
    W = m['wires']; stars = [None] * len(W)
    def star(i, guard=0):
        if stars[i] is not None: return stars[i]
        if guard > 60: raise RecursionError
        w = W[i]; a = w['a']
        C = S.R['type'] * S.T[TYPES.index(w['t'])]
        for p, k in w['w']: C = C + S.R[k] * S.Z(p - a) * S.f(m['words'][p])
        for k, c in w['c'] + w['p']: C = C + S.R[k] * S.Z(W[c]['a'] - a) * star(c, guard + 1)
        if w['amb']: C = C + S.R['att'] * S.amb
        stars[i] = S.condense(C)
        return stars[i]
    for i in range(len(W)): star(i)
    C = sum(S.R['top'] * S.Z(W[t]['a']) * stars[t] for t in m['top'])
    return S.condense(C), stars


def classes(stars):
    """identical stars (same content and layout) are one identity"""
    cls, reps = [], []
    for s in stars:
        for j, r in enumerate(reps):
            if np.abs(np.vdot(r, s)) / len(s) > 0.999: cls.append(j); break
        else: cls.append(len(reps)); reps.append(s)
    return cls, np.stack(reps)


def gold_graph(m, cls):
    W = m['wires']
    node = lambda i: (cls[i], W[i]['a'])
    nodes = {node(i): W[i]['t'] for i in range(len(W))}
    amb = {node(i) for i in range(len(W)) if W[i]['amb']}
    edges = {(('M', 0), 'top', node(t)) for t in m['top']}
    for i, w in enumerate(W):
        for k, c in w['c'] + w['p']: edges.add((node(i), k, node(c)))
    words = {}
    for i, w in enumerate(W):
        for p, k in w['w']: words[p] = (node(i), k)
    return nodes, amb, edges, words


def decode(S, top, reps, m, use_atlas=True, theta=None):
    D = S.D; n = m['n']
    sig = 1 / np.sqrt(2 * D)
    import os
    th_child = theta if theta is not None else float(os.environ.get("THETA", "5.0")) * sig
    th_amb = 5.0 * sig
    Tconj = np.conj(S.T)
    nodes, amb, edges, vecs = {}, set(), set(), {}
    frontier = [(('M', 0), S.expand(top), 'M')]
    seen = set(); steps = 0
    while frontier:
        nid, C, t = frontier.pop()
        steps += 1
        if steps > 400: break
        kinds = t.split('.')[0]
        for k in REF_KEYS[kinds]:
            a = nid[1]
            ds = np.arange(-a, n - a + 1)
            U = (C * np.conj(S.R[k]))[None, :] * np.exp(-1j * ds[:, None] * S.phi[None, :]).astype(np.complex64)
            if use_atlas:
                sc = (U @ np.conj(reps).T).real / D            # offsets x atlas
                best = sc.argmax(1)                              # one star per (key, offset) slot: the best of the atlas
                for di in np.nonzero(sc[np.arange(len(ds)), best] > th_child)[0]:
                    j = best[di]
                    child = (int(j), int(a + ds[di]))
                    edges.add((nid, k, child))
                    if child not in seen:
                        seen.add(child)
                        v = S.expand(reps[j])
                        tt = TYPES[int(np.argmax((v * np.conj(S.R['type'])) @ Tconj.T).real)] if False else TYPES[int(np.argmax(((v * np.conj(S.R['type'])) @ Tconj.T).real))]
                        nodes[child] = tt; vecs[child] = v
                        if ((v * np.conj(S.R['att'])) @ np.conj(S.amb)).real / D > th_amb: amb.add(child)
                        frontier.append((child, v, tt))
            else:
                for di in range(len(ds)):
                    v = S.expand(phase(U[di]))
                    ts = ((v * np.conj(S.R['type'])) @ Tconj.T).real / D
                    if ts.max() > th_child:
                        j = int(np.argmax(ts))
                        # identity of a noisy child: the gold class it is closest to (for scoring only)
                        cj = int(np.argmax(np.abs(np.conj(reps) @ phase(U[di]))))
                        child = (cj, int(a + ds[di]))
                        edges.add((nid, k, child))
                        if child not in seen:
                            seen.add(child); nodes[child] = TYPES[j]; vecs[child] = v
                            frontier.append((child, v, TYPES[j]))
    # words: each word to the best (node, key)
    words = {}
    for p in range(n):
        fw = S.f(m['words'][p]); best = (-9, None)
        for nid, v in vecs.items():
            for k in WORD_KEYS[nodes[nid].split('.')[0]]:
                s = (np.vdot(S.R[k] * S.Z(p - nid[1]) * fw, v)).real / D
                if s > best[0]: best = (s, (nid, k))
        words[p] = best[1]
    return nodes, amb, edges, words


def main():
    path, Ds = sys.argv[1], [int(x) for x in sys.argv[2].split(',')]
    mode = sys.argv[3] if len(sys.argv) > 3 else 'atlas'
    limit = int(sys.argv[4]) if len(sys.argv) > 4 else None
    data = json.load(open(path))
    if limit: data = data[:limit]
    for D in Ds:
        S = Space(D); t0 = time.time()
        res = {}
        tot = dict(msgs=0, exact=0, words=0, words_ok=0, edges=0, edges_ok=0, nodes=0, types_ok=0)
        for m in data:
            try:
                top, stars = encode(S, m)
            except RecursionError:
                continue
            cls, reps = classes(stars)
            g = gold_graph(m, cls)
            d = decode(S, top, reps, m, use_atlas=(mode == 'atlas'))
            gn, ga, ge, gw = g; dn, da, de, dw = d
            ok_words = sum(1 for p in gw if dw.get(p) == gw[p])
            ok_types = sum(1 for x in gn if dn.get(x) == gn[x])
            exact = (gn == dn and ga == da and ge == de and ok_words == len(gw))
            b = '<10' if m['n'] < 10 else '10-24' if m['n'] < 25 else '25-39' if m['n'] < 40 else '40+'
            r = res.setdefault(b, [0, 0]); r[0] += 1; r[1] += exact
            tot['msgs'] += 1; tot['exact'] += exact; tot['words'] += len(gw); tot['words_ok'] += ok_words
            tot['edges'] += len(ge); tot['edges_ok'] += len(ge & de) - 0; tot['nodes'] += len(gn); tot['types_ok'] += ok_types
            tot.setdefault('extra_edges', 0); tot['extra_edges'] += len(de - ge)
        print(f"D={D} mode={mode} messages {tot['msgs']} exact {tot['exact']} ({tot['exact']/tot['msgs']:.4f}) "
              f"words {tot['words_ok']/tot['words']:.5f} edges {tot['edges_ok']/tot['edges']:.5f} extra edges {tot['extra_edges']} "
              f"types {tot['types_ok']/tot['nodes']:.5f} | by length " + ', '.join(f"{k}: {v[1]}/{v[0]}" for k, v in sorted(res.items())) +
              f" | {time.time()-t0:.0f}s", flush=True)


if __name__ == '__main__':
    main()
