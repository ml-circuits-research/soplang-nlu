"""M1 read-back for the rvss design (DESIGN.md section 3 and 6), grouping given, nothing learned.

Representation (revised after the critic, the "holder" variant of critic/m1abs.py extended to words):
  word term of wire X:   R_key (x) T_word (x) Z^(p - a_X) (x) f(w_p)
  child / pointer term:  R_key (x) T_type(Y) (x) Z^(a_Y - a_X) (x) c(Y)        (the type atom sits at the holder)
  ambiguity:             R_att (x) V_amb
  condensing:            c(X) = rho( phase(C_X) )
  message:               C_M = sum_top R_top (x) T_type(Y) (x) Z^(a_Y) (x) c(Y);  m = rho(phase(C_M))
  atlas item of Y:       I(Y) = Z^(a_Y) (x) c(Y)     (the wire's identity: the same wire is the same item anywhere)

Read-back (the strategy's output path, here on the label's own atlas):
  from the message star, for every open node X (origin a_X, type t) and every key of t's domain:
    U = conj(R_key) (x) Z^(a_X) (x) expand(C_X)
    one cleanup over the union  {T_word (x) Z^p (x) f(w_p) : words of the message}  U  {T_t(Y) (x) I(Y) : atlas}
    every candidate above one threshold (5 sigma, sigma = 1/sqrt(2D), fixed in advance) is a member;
  a word accepted at several places keeps the best (every word exactly one place);
  a child found for the first time is expanded from its atlas star (cleanup = exact star) and read in turn.
Exact = every wire, type, ambiguity mark, reference (holding and re-entrant) and word placement as in the label.

Usage: python m1star.py trees.json D[,D...] [workers] [limit]     (trees from ../export-trees.mjs)
"""
import json, sys, hashlib, time
import numpy as np
from multiprocessing import Pool

WORD_KEYS = {'nominal': ['head', 'dependent'], 'relation': ['marker', 'negation'], 'coordination': ['conjunction'],
             'clause': ['verb', 'auxiliary', 'negation', 'modifier', 'discourse']}
REF_KEYS = {'nominal': ['rel'], 'relation': ['to'], 'coordination': ['conjunct', 'rel'],
            'clause': ['subject', 'complement', 'rel', 'ellipsis', 'conjunct', 'to'], 'M': ['top']}
TYPES = ['nominal', 'relation', 'coordination', 'clause.imperative', 'clause.declarative', 'clause.interrogative',
         'clause.fragment', 'clause.nonfinite']
ALLKEYS = sorted({k for v in WORD_KEYS.values() for k in v} | {k for v in REF_KEYS.values() for k in v} | {'att'})
THETA_SIGMA = 5.0


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
        self.T = {t: seeded('sop-stars-v1:type:' + t, D) for t in TYPES}
        self.TW = seeded('sop-stars-v1:type:word', D)
        self.amb = seeded('sop-stars-v1:value:ambiguous', D)
        self.phi = np.angle(seeded('sop-stars-v1:position', D))
        rng = np.random.default_rng(7)
        self.perm = rng.permutation(D); self.inv = np.argsort(self.perm)
        self.cache = {}

    def Z(self, d):
        return np.exp(1j * d * self.phi).astype(np.complex64)

    def f(self, w):
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
        C = np.zeros(S.D, np.complex64)
        for p, k in w['w']: C = C + S.R[k] * S.TW * S.Z(p - a) * S.f(m['words'][p])
        for k, c in w['c'] + w['p']: C = C + S.R[k] * S.T[W[c]['t']] * S.Z(W[c]['a'] - a) * star(c, guard + 1)
        if w['amb']: C = C + S.R['att'] * S.amb
        stars[i] = S.condense(C)
        return stars[i]
    for i in range(len(W)): star(i)
    C = sum(S.R['top'] * S.T[W[t]['t']] * S.Z(W[t]['a']) * stars[t] for t in m['top'])
    return S.condense(C), stars


def decode(S, top, m, stars):
    D = S.D; n = m['n']; W = m['wires']; th = THETA_SIGMA / np.sqrt(2 * D)
    words = np.stack([S.TW * S.Z(p) * S.f(m['words'][p]) for p in range(n)])
    items = np.stack([S.T[W[j]['t']] * S.Z(W[j]['a']) * stars[j] for j in range(len(W))])
    cand = np.conj(np.concatenate([words, items]))                        # (n + W) x D
    nodes, amb, edges, best_word = {}, set(), set(), {}
    frontier = [('M', S.expand(top), 'M', 0)]
    seen = set(); steps = 0
    while frontier:
        nid, C, t, a = frontier.pop(); steps += 1
        if steps > 600: break
        kind = t.split('.')[0]
        keys = (WORD_KEYS.get(kind, []) + REF_KEYS[kind])
        U = np.stack([C * np.conj(S.R[k]) for k in keys]) * S.Z(a)[None, :]
        sc = (U @ cand.T).real / D                                         # keys x (words + items)
        for ki, k in enumerate(keys):
            for j in np.nonzero(sc[ki] > th)[0]:
                if j < n:
                    if sc[ki, j] > best_word.get(j, (-9, None))[0]: best_word[j] = (sc[ki, j], (nid, k))
                else:
                    y = int(j - n); edges.add((nid, k, y))
                    if y not in seen:
                        seen.add(y); nodes[y] = W[y]['t']
                        v = S.expand(stars[y])
                        if (np.vdot(S.R['att'] * S.amb, v)).real / D > th: amb.add(y)
                        frontier.append((y, v, W[y]['t'], W[y]['a']))
    return nodes, amb, edges, {p: b[1] for p, b in best_word.items()}


def gold(m):
    W = m['wires']
    nodes = {i: W[i]['t'] for i in range(len(W))}
    amb = {i for i in range(len(W)) if W[i]['amb']}
    edges = {('M', 'top', t) for t in m['top']}
    for i, w in enumerate(W):
        for k, c in w['c'] + w['p']: edges.add((i, k, c))
    words = {}
    for i, w in enumerate(W):
        for p, k in w['w']: words[p] = (i, k)
    return nodes, amb, edges, words


def bucket(n):
    return '<10' if n < 10 else '10-24' if n < 25 else '25-39' if n < 40 else '40+'


def run_chunk(args):
    D, chunk = args
    S = Space(D); out = []
    for m in chunk:
        t0 = time.perf_counter()
        try:
            top, stars = encode(S, m)
        except RecursionError:
            out.append((bucket(m['n']), 0, 'cycle', 0, 0, 0, 0)); continue
        t1 = time.perf_counter()
        gn, ga, ge, gw = gold(m); dn, da, de, dw = decode(S, top, m, stars)
        t2 = time.perf_counter()
        wrong_words = sum(1 for p in gw if dw.get(p) != gw[p])
        why = 'ok'
        if de - ge: why = 'extra edge'
        elif ge - de: why = 'missing edge'
        elif wrong_words: why = 'word misplaced'
        elif gn != dn: why = 'type'
        elif ga != da: why = 'ambiguity'
        out.append((bucket(m['n']), int(why == 'ok'), why, len(de - ge), len(ge - de), wrong_words, (t2 - t1) * 1000))
    return out


def main():
    path, Ds = sys.argv[1], [int(x) for x in sys.argv[2].split(',')]
    workers = int(sys.argv[3]) if len(sys.argv) > 3 else 8
    limit = int(sys.argv[4]) if len(sys.argv) > 4 else None
    data = json.load(open(path))
    if limit: data = data[:limit]
    for m in data:
        for w in m['wires']:
            kind = w['t'].split('.')[0]
            for _, k in w['w']: assert k in WORD_KEYS[kind], (kind, k)
            for k, _ in w['c'] + w['p']: assert k in REF_KEYS[kind], (kind, k)
    chunks = [data[i:i + 200] for i in range(0, len(data), 200)]
    for D in Ds:
        t0 = time.time()
        with Pool(workers) as pool: res = [r for part in pool.map(run_chunk, [(D, c) for c in chunks]) for r in part]
        by = {}; why = {}; extra = missing = wrongw = 0; ms = []
        for b, ok, w, e, mi, ww, t in res:
            r = by.setdefault(b, [0, 0]); r[0] += 1; r[1] += ok
            why[w] = why.get(w, 0) + 1; extra += e; missing += mi; wrongw += ww; ms.append(t)
        n = len(res); ex = sum(r[1] for r in by.values())
        print(f"D={D} theta={THETA_SIGMA}sigma messages {n} exact {ex} ({100*ex/n:.3f}%) | " +
              ', '.join(f"{k}: {v[1]}/{v[0]}" for k, v in sorted(by.items())) +
              f" | outcomes {json.dumps(why, sort_keys=True)} | extra edges {extra} missing edges {missing} misplaced words {wrongw}"
              f" | decode ms/message median {np.median(ms):.2f} p99 {np.percentile(ms, 99):.2f} | {time.time()-t0:.0f}s", flush=True)


if __name__ == '__main__':
    main()
