"""rvss M2c: the pilot reads alone (its own moves), greedy or with a small beam scored by fit, and the
circuit is read back from the pilot's own stars (m1star.py decoder on the pilot's atlas).

  python decode.py <model dir> <in.jsonl> <out.jsonl> [--workers 16] [--limit N] [--beam 1]
in: lines {text, file, row, words, gaps}; out: lines {file, row, text, nodes, moves, readback, ms, error}
Also importable: Pilot(model_dir).read(words, gaps) -> dict (used by worker.py).
"""
import json, math, os, sys, time, zlib
if __name__ == '__main__': os.environ.setdefault('OMP_NUM_THREADS', '1'); os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import State, Stars, seeded, legal, label_of, NOFF, OFFCLIP, can_take, VIEW
import importlib.util

_spec = importlib.util.spec_from_file_location('m1star', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'hierarchy-checks', 'v2', 'm1star.py'))
m1star = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(m1star)

TYPES = ['M', 'nominal', 'relation', 'clause', 'coordination']
KIND = {'claim': 0, 'reopen': 1, 'point': 2, 'gather': 3}
BEAM_SYNC = os.environ.get('RVSS_BEAM_SYNC') == '1'; BEAM_NORM = os.environ.get('RVSS_BEAM_NORM') == '1'
ACT_PARTS = [0, 1, 2, 3, 4, 5, 6]; BOUND = [1, 2, 3]; NPARTS = 8


def atom_id(a):
    return zlib.crc32(a.encode()) & ((1 << 20) - 1)


def lse(x, axis=-1):
    m = x.max(axis, keepdims=True); return (m + np.log(np.exp(x - m).sum(axis, keepdims=True))).squeeze(axis)


class VSAScorer:
    def __init__(self, ck):
        import torch
        st = {k: v.cpu().numpy() if hasattr(v, 'cpu') else v for k, v in ck['state'].items()}
        a = ck['args']; self.D = D = a['D']
        self.stars = Stars(D); self.acache = {}
        self.lam = st['lam']; self.K = np.exp(1j * st['K']).astype(np.complex64); self.beta_k = float(st['beta_k'])
        self.rho = st['rho']; self.Zs = st['Zs']
        Pr = st['Pr']; L, NPp, P, _ = Pr.shape; self.L, self.P = L, P
        # Re(v . conj(P)) = [Re v, Im v] . [cos P; sin P]: one real matrix per part, (parts, 2D, L*P)
        # per label: (parts, 2D, P), so that only the legal labels are read
        # all labels at once: (parts, 2D, L*P), one matrix-vector product per part (faster than gathering the legal ones)
        # per label (L, parts, 2D, P): only the legal labels' prototypes are read (memory traffic is the cost)
        self.PRL = np.ascontiguousarray(np.concatenate([np.cos(Pr), np.sin(Pr)], 3).transpose(0, 1, 3, 2)).astype(np.float32)
        self.u, self.beta, self.bias = st['u'], st['beta'], st['bias']
        G = np.exp(1j * st['G']).astype(np.complex64)                  # (4, 3, P, D)
        self.Gc = [[np.conj(G[k, q]).T.copy() for q in range(3)] for k in range(4)]
        self.ug, self.betag, self.biasg = st['ug'], st['betag'], st['biasg']
        self.sq = math.sqrt(D)
        self.sit = a.get('sit', 0)
        if self.sit:
            self.Sk = st['Sk']; self.SQc = np.conj(np.exp(1j * st['SQ'])).T.astype(np.complex64).copy(); self.SV = np.exp(1j * st['SV']).astype(np.complex64)
            self.beta_s = float(st['beta_s'])

    def to_device(self, dev):
        import torch
        self.torch, self.dev = torch, torch.device(dev)
        self.tPRL = torch.as_tensor(self.PRL, device=self.dev)
        self.tbias, self.tu, self.tbeta = (torch.as_tensor(np.asarray(x, np.float32), device=self.dev) for x in (self.bias, self.u, self.beta))

    def atom(self, a):
        v = self.acache.get(a)
        if v is None: v = self.acache[a] = seeded('rvss-atom-id:%d' % a, self.D)
        return v

    def kinds(self, words):
        n = len(words); W = np.stack([self.stars.f(w) for w in words])
        x = np.zeros((n, self.D), np.complex64)
        for j, d in enumerate(range(-3, 4)):
            for k in range(n):
                q = k + d
                if 0 <= q < n: x[k] += self.lam[j] * W[q][self.rho[j]]
        x = x / np.maximum(np.abs(x), 1e-6)
        sim = (x @ np.conj(self.K).T).real / self.D
        z = self.beta_k * sim; z = np.exp(z - z.max(1, keepdims=True)); pi = z / z.sum(1, keepdims=True)
        kap = (pi.astype(np.complex64) @ self.K)
        return np.concatenate([kap, np.ones((1, self.D), np.complex64)])

    def bundle(self, kap, terms):
        V = np.zeros((NPARTS, self.D), np.complex64); cnt = np.zeros(NPARTS)
        for pt, a, off, tok in terms:
            v = self.atom(atom_id(a))
            if off != NOFF: v = v * self.Zs[off + OFFCLIP]
            if tok >= 0: v = v * kap[tok]
            V[pt] += v; cnt[pt] += 1
        return V / np.sqrt(np.maximum(cnt, 1))[:, None]

    def act(self, kap, terms, bw, bt, ok=None):
        V = self.bundle(kap, terms)
        kw = kap[bw]
        parts = np.stack([V[j] for j in ACT_PARTS] + [V[b] * kw for b in BOUND])
        if self.sit:
            Vall = (parts * self.Sk).sum(0) / math.sqrt(len(parts))
            z = self.beta_s * (Vall @ self.SQc).real * (self.sq / self.D); z = np.exp(z - z.max()); z = z / z.sum()
            parts = np.concatenate([parts, (z.astype(np.complex64) @ self.SV)[None]])
        X = np.concatenate([parts.real, parts.imag], 1).astype(np.float32)          # (parts, 2D)
        idx = np.nonzero(ok)[0] if ok is not None else np.arange(self.L)
        if getattr(self, 'tPRL', None) is not None:
            # the same scores on the GPU (worker --device cuda): one batched product over the legal labels
            T = self.torch
            Xt = T.as_tensor(X, device=self.dev); it = T.as_tensor(idx, device=self.dev)
            s = T.einsum('pd,ipdq->ipq', Xt, self.tPRL[it]) * (self.sq / self.D)
            sc = self.tbias[it] + (self.tu[None, :] * T.logsumexp(self.tbeta[None, :, None] * s, -1) / self.tbeta[None, :]).sum(1)
            out = np.full(self.L, -1e30); out[idx] = sc.cpu().numpy()
            return out
        Xr = X[:, None, :]
        s = np.stack([np.matmul(Xr, self.PRL[i])[:, 0] for i in idx]) * (self.sq / self.D)   # (n, parts, P)
        b = self.beta[None, :, None]
        sc = self.bias[idx] + (self.u[None, :] * lse(b * s) / self.beta[None, :]).sum(1)
        out = np.full(self.L, -1e30); out[idx] = sc
        return out

    def cands(self, kap, kind, cterms, bw, bt):
        k = KIND[kind]; out = []
        for terms in cterms:
            V = self.bundle(kap, terms)[7]
            vs = [V, V * kap[bt], V * kap[bw]]
            sc = self.biasg[k]
            for q in range(3):
                s = (vs[q] @ self.Gc[k][q]).real / self.D * self.sq
                sc += self.ug[k, q] * lse(self.betag[k, q] * s) / self.betag[k, q]
            out.append(sc)
        return np.array(out)


def h64(x):
    return (x * 2654435761 + 97) & ((1 << 21) - 1)


class LogRegScorer:
    def __init__(self, ck):
        st = {k: v.cpu().numpy() for k, v in ck['state'].items()}
        atoms = ck.get('atoms') or np.load(ck['_dir'] + '/atoms.npy').tolist()
        self.amap = {int(x): i for i, x in enumerate(atoms)}       # the trainer hashed the atom's row, not its crc
        self.triples = ck['args'].get('triples', False)
        self.E = st['E.weight']; self.Ec = st['Ec.weight']; self.bias = st['bias']

    def kinds(self, words):
        self.low = [zlib.crc32(w.lower().encode()) & 0x7fffffff for w in words] + [-1]
        self.suf = [zlib.crc32(('suf:' + w.lower()[-3:]).encode()) & 0x7fffffff for w in words] + [-1]
        return None

    def feats(self, terms, bindw):
        F = []
        bwl = self.low[bindw] if bindw >= 0 else -1
        for pt, a, off, tok in terms:
            A = np.int64(self.amap.get(atom_id(a), -7)) * 1000003 + pt * 7919; o = (off if off != NOFF else NOFF) + 50
            ao = A * 31 + o
            F.append(ao)
            if tok >= 0:
                lw, sf = self.low[tok], self.suf[tok]
                F += [ao * 1000033 + lw * 17 + 1, A * 1000037 + lw * 13 + 2, A * 1000039 + sf * 11 + 3]
            F += [ao * 1000081 + bwl * 19 + 4, A * 1000099 + bwl * 23 + 5]
            if self.triples and tok >= 0: F.append((A * 1000117 + lw * 29 + 6) * 1000121 + bwl * 31)
        with np.errstate(over='ignore'):
            return h64(np.array(F, np.int64))

    def act(self, kap, terms, bw, bt, ok=None):
        return self.E[self.feats(terms, bw if bw < len(self.low) - 1 else -1)].sum(0) + self.bias

    def cands(self, kap, kind, cterms, bw, bt):
        k = KIND[kind]
        return np.array([self.Ec[self.feats(t, bt if bt < len(self.low) - 1 else -1), k].sum() for t in cterms])


class Pilot:
    def __init__(self, model_dir, device='cpu'):
        import torch
        ck = torch.load(os.path.join(model_dir, 'model.pt'), map_location='cpu', weights_only=False); ck['_dir'] = model_dir
        self.labels = ck['labels']; self.allowed = {t: set(v) for t, v in ck['allowed'].items()}
        self.kind = ck['args']['model']; VIEW['version'] = ck['args'].get('view', 1)
        self.sc = VSAScorer(ck) if self.kind == 'vsa' else LogRegScorer(ck)
        self.device = 'cpu'
        if device != 'cpu' and self.kind == 'vsa':
            self.sc.to_device(device); self.device = device
        self.rb = m1star.Space(1024)

    def read(self, words, gaps, beam=1):
        t0 = time.perf_counter()
        n = len(words)
        kap = self.sc.kinds(words)
        NT = n  # index of the "no token" row
        S0 = State(words, gaps)
        beam_ = [(0.0, S0, [], 0)]        # (log score, state, moves, next handle)
        steps = 0; forced = [0]
        while True:
            if all(b[1].done() for b in beam_): break
            steps += 1
            if steps > (10 * n + 40) * (beam if BEAM_SYNC else 1): raise RuntimeError('too many moves')
            nxt = []
            live = [b[1].p for b in beam_ if not b[1].done()]
            pmin = min(live) if live else None
            for sc0, S, mv, h in beam_:
                if S.done() or (BEAM_SYNC and S.p > pmin): nxt.append((sc0, S, mv, h)); continue
                for lp, m, h2 in self.expand(S, kap, NT, h, k=1 if beam == 1 else 3, forced=forced):
                    S2 = S if beam == 1 else S.clone()
                    S2.apply(m); nxt.append((sc0 + lp, S2, mv + [m], h2))
            if not nxt: raise RuntimeError('no legal move')
            # word-synchronous pruning (BEAM_SYNC=1): hypotheses compete only with those at the same word, so
            # that one with fewer moves so far is not preferred for having fewer log probabilities summed
            if BEAM_SYNC:
                buckets = {}
                for b in sorted(nxt, key=lambda b: -b[0]): buckets.setdefault(('done' if b[1].done() else b[1].p), []).append(b)
                beam_ = [b for v in buckets.values() for b in v[:beam]]
            else:
                nxt.sort(key=lambda b: -b[0]); beam_ = nxt[:beam]
        best = max(beam_, key=lambda b: b[0] / (BEAM_NORM and max(1, len(b[2])) or 1)); S, moves = best[1], best[2]; forced = forced[0]
        t1 = time.perf_counter()
        nodes = {str(k): {'type': nd.t, 'words': nd.words, 'atoms': nd.atoms, 'refs': nd.refs, 'parent': nd.parent, 'key': nd.key}
                 for k, nd in S.nodes.items()}
        rb, rb_nodes = self.readback(S)
        t2 = time.perf_counter()
        return {'moves': moves, 'nodes': rb_nodes if rb_nodes is not None else nodes, 'explicit': nodes if rb != 'same' else None,
                'readback': rb, 'forced': forced, 'ms_pilot': round((t1 - t0) * 1000, 3), 'ms_readback': round((t2 - t1) * 1000, 3)}

    def expand(self, S, kap, NT, h, k=1, forced=None):
        """the k best next moves with their log probabilities (softmax over the legal labels; a pointer takes its
        best candidate, a gather every candidate above 0)"""
        def tok(x): return x if x >= 0 else NT
        ok = legal(S, self.labels, self.allowed)
        if not any(ok):
            ok = legal(S, self.labels, self.allowed, max_since=10 ** 9); forced[0] += 1
            if not any(ok): ok = legal(S, self.labels, self.allowed, max_since=10 ** 9, relax=True)
            if not any(ok): return []
        bw, bt = S.binders(); bw, bt = tok(bw), tok(bt)
        lg = self.sc.act(kap, S.view(), bw, bt, ok)
        lg = np.where(ok, lg, -1e30); lp = lg - lse(lg)
        out = []
        for li in np.argsort(-lg)[:k]:
            if not ok[li]: break
            lab = self.labels[int(li)]; h2 = h
            op, _, rest = lab.partition(':')
            if op == 'place': m = {'op': 'place', 'key': rest}
            elif op == 'close': m = {'op': 'close', 'atoms': [x.split('=') for x in rest.split(',')] if rest else []}
            elif op == 'open':
                t, at = rest.split(':'); m = {'op': 'open', 't': t, 'at': at, 'h': h}; h2 = h + 1
            elif op == 'coord':
                cs = [c for c in S.gather_cands() if S.nodes[c[0]].t != 'coordination']
                sc = self.sc.cands(kap, 'gather', [S.cand_terms('gather', c, d, how, rest) for c, d, how in cs], bw, bt)
                g = [cs[i][0] for i in range(len(cs)) if sc[i] > 0]
                if not g and cs: g = [cs[int(np.argmax(sc))][0]]      # a coordination gathers at least one star
                g.sort(key=lambda x: S.opener(S.nodes[x]))
                m = {'op': 'coord', 'h': h, 'at': rest, 'gather': g}; h2 = h + 1
            else:
                cs = S.held_items() if op == 'claim' else S.point_cands() if op == 'point' else S.closed_reachable()
                X = S.node(S.top().h)
                if op == 'claim': cs = [c for c in cs if c[1] > 0 and can_take(S, X, rest, S.nodes[c[0]].t)]
                if op == 'point': cs = [c for c in cs if can_take(S, X, rest, S.nodes[c[0]].t)]
                if not cs: continue
                sc = self.sc.cands(kap, op, [S.cand_terms(op, c, d, how, rest if op != 'reopen' else '') for c, d, how in cs], bw, bt)
                best = cs[int(np.argmax(sc))][0]
                if op == 'claim': m = {'op': 'claim', 'item': best, 'key': rest}
                elif op == 'point': m = {'op': 'point', 'key': rest, 'target': best}
                else: m = {'op': 'reopen', 'chain': S.chain_to(best)}
            out.append((float(lp[li]), m, h2))
        return out

    def readback(self, S):
        """encode the pilot's own constellations and atlas (m1star.encode), read the circuit back from the message
        star (m1star.decode) and compare with the pilot's explicit tree; the read-back is the output."""
        hs = sorted(S.nodes); ix = {x: i for i, x in enumerate(hs)}
        def origin(x, guard=0):
            nd = S.nodes[x]; a = min([p for p, _ in nd.words], default=10 ** 9)
            for c in nd.children: a = min(a, origin(c, guard + 1))
            return a
        W = []
        for x in hs:
            nd = S.nodes[x]
            t = nd.t
            if t == 'clause':
                form = [v for k, v in nd.atoms if k == 'form']; t = 'clause.' + (form[0] if form else 'fragment')
            W.append({'t': t, 'a': origin(x), 'w': [[p, k] for p, k in nd.words],
                      'c': [[S.nodes[c].key, ix[c]] for c in nd.children], 'p': [[k, ix[y]] for k, y in nd.refs],
                      'amb': any(k == 'attachment' and v == 'ambiguous' for k, v in nd.atoms)})
        m = {'n': S.n, 'words': S.words, 'wires': W, 'top': [ix[c] for c in S.M.children]}
        try:
            top, stars = m1star.encode(self.rb, m)
        except RecursionError:
            return 'cycle', None
        gn, ga, ge, gw = m1star.gold(m)
        dn, da, de, dw = m1star.decode(self.rb, top, m, stars)
        if (gn, ga, ge, gw) == (dn, da, de, dw): return 'same', None
        # the read-back differs: write the read-back (holding edge = the explicit one when it is read back, else the first)
        if len(dw) < S.n: return 'differs (word lost; explicit kept)', None
        hold = {}; refs = {}
        gold_hold = {(ix[S.nodes[x].parent] if S.nodes[x].parent != 'M' else 'M', S.nodes[x].key, ix[x]) for x in hs if S.nodes[x].parent is not None}
        for e in sorted(de, key=lambda e: (e not in gold_hold, str(e))):
            x, k, y = e
            if y not in hold: hold[y] = (x, k)
            else: refs.setdefault(x, []).append((k, y))
        nodes = {}
        for i, x in enumerate(hs):
            if i not in dn: continue
            t = dn[i]; base = t.split('.')[0]
            atoms = [['form', t.split('.')[1]]] if base == 'clause' else []
            if i in da: atoms.append(['attachment', 'ambiguous'])
            par = hold.get(i)
            nodes[str(i)] = {'type': base, 'words': sorted([p, k] for p, (nid, k) in dw.items() if nid == i), 'atoms': atoms,
                             'refs': [[k, y] for k, y in refs.get(i, [])], 'parent': None if par is None else ('M' if par[0] == 'M' else par[0]),
                             'key': None if par is None else par[1]}
        if any(v['parent'] is None for v in nodes.values()): return 'differs (unheld wire; explicit kept)', None
        return 'differs', nodes


def run_chunk(args):
    model_dir, lines, beam = args
    P = Pilot(model_dir); out = []
    for o in lines:
        t0 = time.perf_counter()
        try:
            r = P.read(o['words'], o['gaps'], beam); r['error'] = None
        except Exception as e:
            r = {'error': 'no circuit: ' + str(e)[:100], 'nodes': None, 'moves': None}
        r['ms'] = round((time.perf_counter() - t0) * 1000, 3)
        out.append({'file': o.get('file'), 'row': o.get('row'), 'id': o.get('id'), 'text': o['text'], **r})
    return out


def main():
    md, src, dst = sys.argv[1:4]; args = sys.argv[4:]
    workers = int(args[args.index('--workers') + 1]) if '--workers' in args else 16
    limit = int(args[args.index('--limit') + 1]) if '--limit' in args else None
    split = args[args.index('--split') + 1] if '--split' in args else None
    beam = int(args[args.index('--beam') + 1]) if '--beam' in args else 1
    lines = [json.loads(l) for l in open(src)]
    if split: lines = [o for o in lines if o.get('split') == split]
    if limit: lines = lines[:limit]
    chunks = [(md, lines[i:i + 100], beam) for i in range(0, len(lines), 100)]
    from multiprocessing import Pool
    t0 = time.time()
    with Pool(workers) as pool: res = [r for part in pool.imap(run_chunk, chunks) for r in part]
    with open(dst, 'w') as f:
        for r in res: f.write(json.dumps(r) + '\n')
    from collections import Counter
    print(len(res), 'messages', f'{time.time()-t0:.0f}s', Counter(r.get('readback') for r in res), Counter((r['error'] or 'ok')[:40] for r in res),
          'median ms', np.median([r['ms'] for r in res]))


if __name__ == '__main__':
    main()
