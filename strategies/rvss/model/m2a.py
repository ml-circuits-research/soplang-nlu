"""rvss M2a: placing stars with the grouping given (DESIGN section 7). Every star (a word, or a held wire Y
placed in its holder X) gets its key from the route book's drawings inside X's constellation:
  from the opener   A( q(kind(opener X), kind(s)) )
  pair of neighbours B( q(kind(previous star of X), kind(s)) ) (x) key(previous star)   (its own estimate, in order)
  path              exp(i sum_{j=opener..s} pi_j . theta_P)
  backward          L( q(kind(opener X), kind(opener Y) (x) T_type(Y)) )   (held wires only)
  beacon            phase( sum_{keys still empty in X} b_{t,key} R_key )
voted with weights g(kind(s)); the key is read by cleanup against the named key stars of X's domain.
A, B, L are key-value memories over pair codes (M = 256 slots). Loss: cross-entropy of the cleanup.
Positions cancel when the key is read (addr (x) Z^-(p - a_X)), so the drawings are written as key estimates.
Control: a logistic regression on the same view (opener, previous star and its key, the star, distance; lowercased
forms and type atoms as symbolic features).
  python m2a.py --out <dir> [--minutes 8]
"""
import argparse, json, math, os, sys, time, zlib
import numpy as np
import torch, torch.nn as nn
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import State, Stars, seeded

L_ = '/home/salboaie/work/sopworlds/soplang-nlu/.local-data/rvss/model/'
KEYS = ['head', 'dependent', 'marker', 'negation', 'conjunction', 'verb', 'auxiliary', 'modifier', 'discourse',
        'rel', 'to', 'conjunct', 'subject', 'complement', 'ellipsis']
DOM = {'nominal': ['head', 'dependent', 'rel'], 'relation': ['marker', 'negation', 'to'], 'coordination': ['conjunction', 'conjunct', 'rel'],
       'clause': ['verb', 'auxiliary', 'negation', 'modifier', 'discourse', 'subject', 'complement', 'rel', 'ellipsis']}
TYP = ['nominal', 'relation', 'coordination', 'clause', 'word']


def stars_of(o):
    """every star placed in a wire, in order: (wire id, type of wire, opener pos, star pos, star type, key)"""
    S = State(o['words'], o['gaps'])
    for m in o['moves']: S.apply(m)
    out = []
    for h, nd in S.nodes.items():
        items = [(p, 'word', k) for p, k in nd.words]
        for c in nd.children:
            cn = S.nodes[c]; items.append((S.opener(cn), cn.t, cn.key))
        items.sort()
        o_ = S.opener(nd)
        for i, (p, t, k) in enumerate(items):
            out.append((h, nd.t, o_, p, t, k, i, items[i - 1][0] if i else -1, items[i - 1][2] if i else None))
    return out


def build(split, limit):
    rows = []; msgs = []
    for l in open(L_ + 'distill.jsonl'):
        o = json.loads(l)
        if o['split'] != split: continue
        msgs.append(o['words'])
        mi = len(msgs) - 1
        for h, wt, op, p, st, k, i, pp, pk in stars_of(o):
            if wt not in DOM or k not in DOM[wt]: continue
            rows.append((mi, TYP.index(wt), op, p, TYP.index(st), KEYS.index(k), i, pp, -1 if pk is None else KEYS.index(pk)))
        if len(msgs) >= limit: break
    return msgs, np.array(rows, np.int64)


class Mem(nn.Module):
    def __init__(self, D, M=256):
        super().__init__(); self.Q = nn.Parameter(torch.rand(M, D) * 6.283); self.V = nn.Parameter(torch.rand(M, D) * 6.283)
        self.beta = nn.Parameter(torch.tensor(20.0)); self.D = D
    def forward(self, q):
        Qc = torch.polar(torch.ones_like(self.Q), self.Q); Vc = torch.polar(torch.ones_like(self.V), self.V)
        a = torch.softmax(self.beta * (q @ Qc.conj().T).real / self.D * math.sqrt(self.D), -1)
        v = a.to(torch.complex64) @ Vc
        return v / v.abs().clamp_min(1e-6)


class RouteBook(nn.Module):
    def __init__(self, D, C, W, perm):
        super().__init__()
        self.D = D
        self.register_buffer('W', W); self.register_buffer('perm', perm)
        self.lam = nn.Parameter(torch.tensor([0.35, 0.6, 1.0, 2.0, 1.0, 0.6, 0.35]))
        self.K = nn.Parameter(torch.rand(C, D) * 6.283); self.beta_k = nn.Parameter(torch.tensor(30.0))
        self.A, self.B, self.Lm = Mem(D), Mem(D), Mem(D)
        self.thP = nn.Parameter(torch.randn(C, D) * 0.1)
        self.b = nn.Parameter(torch.zeros(4, len(KEYS)))
        self.g = nn.Linear(C, 5)
        self.beta = nn.Parameter(torch.tensor(10.0))
        R = torch.stack([torch.as_tensor(seeded('sop-stars-v1:key:' + k, D)) for k in KEYS]); self.register_buffer('R', R)
        T = torch.stack([torch.as_tensor(seeded('sop-stars-v1:type:' + t, D)) for t in TYP]); self.register_buffer('T', T)
        rp = [torch.arange(D)]
        for _ in range(3): rp.append(perm[rp[-1]])
        inv = torch.argsort(perm); ip = [torch.arange(D)]
        for _ in range(3): ip.append(inv[ip[-1]])
        self.register_buffer('rho', torch.stack([ip[3], ip[2], ip[1], rp[0], rp[1], rp[2], rp[3]]))
        dom = torch.zeros(4, len(KEYS), dtype=torch.bool)
        for t, ks in DOM.items():
            for k in ks: dom[TYP.index(t), KEYS.index(k)] = True
        self.register_buffer('dom', dom)

    def kinds(self, wid, left, right):
        x = 0
        for j, d in enumerate(range(-3, 4)):
            ok = (left >= -d) if d < 0 else (right >= d) if d > 0 else torch.ones_like(left, dtype=torch.bool)
            idx = (torch.arange(len(wid), device=wid.device) + d).clamp(0, len(wid) - 1)
            x = x + self.lam[j] * self.W[wid[idx]][:, self.rho[j]] * ok[:, None]
        x = x / x.abs().clamp_min(1e-6)
        Kc = torch.polar(torch.ones_like(self.K), self.K)
        pi = torch.softmax(self.beta_k * (x @ Kc.conj().T).real / self.D, -1)
        return pi.to(torch.complex64) @ Kc, pi

    def forward(self, b, drop=None):
        kap, pi = self.kinds(b['wid'], b['left'], b['right'])
        ko, ks = kap[b['op']], kap[b['p']] * self.T[b['st']]
        qrho = lambda x: x[:, self.perm]
        d_open = self.A(ko * qrho(ks))
        kprev = torch.where(b['pp'][:, None] >= 0, kap[b['pp'].clamp_min(0)], torch.ones_like(ks))
        Rprev = torch.where(b['pk'][:, None] >= 0, self.R[b['pk'].clamp_min(0)], torch.ones_like(ks))   # teacher forced: the previous star's key
        d_pair = self.B(kprev * qrho(ks)) * Rprev
        cum = torch.cumsum(pi @ self.thP, 0)
        path = cum[b['p']] - cum[b['op']] + (pi @ self.thP)[b['op']]
        d_path = torch.polar(torch.ones_like(path), path)
        d_back = self.Lm(ko * qrho(ks)) * (b['st'] != 4)[:, None]
        empty = self.dom[b['wt']] & ~b['filled']
        d_beac = (empty.float() * self.b[b['wt']]).to(torch.complex64) @ self.R
        d_beac = d_beac / d_beac.abs().clamp_min(1e-6)
        Dr = torch.stack([d_open, d_pair, d_path, d_back, d_beac], 1)
        g = torch.softmax(self.g(pi[b['p']]), -1)
        if drop is not None: g = g.clone(); g[:, drop] = 0
        addr = (g.to(torch.complex64)[:, :, None] * Dr).sum(1)
        addr = addr / addr.abs().clamp_min(1e-6)
        sim = (addr @ self.R.conj().T).real / self.D * math.sqrt(self.D)
        return (self.beta * sim).masked_fill(~self.dom[b['wt']], -1e9)


class LogRegA(nn.Module):
    def __init__(self, bits=20):
        super().__init__(); self.E = nn.EmbeddingBag(1 << bits, len(KEYS), mode='sum'); nn.init.zeros_(self.E.weight); self.bits = bits

    def forward(self, b, low):
        m = (1 << self.bits) - 1
        wt = b['wt']; st = b['st']; Lw = low[b['wid']]; lw = Lw[b['p']]; lo = Lw[b['op']]; lp = torch.where(b['pp'] >= 0, Lw[b['pp'].clamp_min(0)], -1)
        dist = (b['p'] - b['op']).clamp(-8, 8)
        f = [wt * 7 + st, (wt * 7 + st) * 1000003 + lw, wt * 1000033 + lo * 3 + 1, wt * 1000037 + lp * 5 + 2, wt * 1000039 + dist * 11 + 3,
             wt * 1000081 + (b['pk'] + 2) * 13 + 4, (wt * 1000099 + lw) * 7 + (b['pk'] + 2), wt * 1000117 + b['idx'].clamp_max(8) * 17]
        F = torch.stack([(x * 2654435761 + 97) & m for x in f], 1)
        return self.E(F).masked_fill(~DOMT[wt], -1e9)


def main():
    global DOMT
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); ap.add_argument('--minutes', type=float, default=8)
    ap.add_argument('--D', type=int, default=1024); ap.add_argument('--limit', type=int, default=60000)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    dev = torch.device('cuda'); torch.manual_seed(1)
    t0 = time.time()
    trm, trr = build('train', a.limit); dvm, dvr = build('dev-B', 5000)
    print('stars train', len(trr), 'dev-B', len(dvr), f'{time.time()-t0:.0f}s', flush=True)
    vocab = {}
    for ws in trm + dvm:
        for w in ws: vocab.setdefault(w, len(vocab))
    S = Stars(a.D)
    W = torch.as_tensor(np.stack([S.f(w) for w in vocab])).to(dev)
    low = torch.as_tensor(np.array([zlib.crc32(w.lower().encode()) & 0x7fffffff for w in vocab])).to(dev)
    DOMT = torch.zeros(4, len(KEYS), dtype=torch.bool, device=dev)
    for t, ks in DOM.items():
        for k in ks: DOMT[TYP.index(t), KEYS.index(k)] = True

    def prepare(msgs, rows):
        r = rows; filled = np.zeros((len(r), len(KEYS)), bool); acc = set()
        for i in range(len(r)):        # keys already filled in the same wire by earlier stars (teacher forced)
            if r[i, 6] == 0: acc = set()
            for x in acc: filled[i, x] = True
            acc.add(r[i, 5])
        tok = np.array([vocab[w] for ws in msgs for w in ws]); nt = np.array([len(w) for w in msgs])
        base = np.concatenate([[0], np.cumsum(nt)[:-1]])
        return dict(r=r, filled=filled, tok=tok, nt=nt, base=base, bym=np.searchsorted(r[:, 0], np.arange(len(msgs) + 1)))

    def batch(P, ms):
        ms = np.sort(ms); nt = P['nt'][ms]; nb = np.concatenate([[0], np.cumsum(nt)[:-1]])
        tidx = np.concatenate([np.arange(P['base'][m], P['base'][m] + P['nt'][m]) for m in ms])
        ridx = np.concatenate([np.arange(P['bym'][m], P['bym'][m + 1]) for m in ms])
        r = P['r'][ridx]; loc = np.searchsorted(ms, r[:, 0]); B = nb[loc]
        left = np.concatenate([np.arange(n) for n in nt]); right = np.concatenate([np.arange(n)[::-1] for n in nt])
        g = lambda c: torch.as_tensor(np.asarray(c)).to(dev)
        return dict(wid=g(P['tok'][tidx]), left=g(left), right=g(right), op=g(B + r[:, 2]), p=g(B + r[:, 3]), st=g(r[:, 4]), wt=g(r[:, 1]),
                    y=g(r[:, 5]), idx=g(r[:, 6]), pp=g(np.where(r[:, 7] >= 0, B + r[:, 7], -1)), pk=g(r[:, 8]), filled=g(P['filled'][ridx]), msg=g(loc))
    TR = prepare(trm, trr); DV = prepare(dvm, dvr)

    rb = RouteBook(a.D, 64, W, torch.as_tensor(S.perm)).to(dev); lr = LogRegA().to(dev)
    o1 = torch.optim.Adam(rb.parameters(), lr=0.01); o2 = torch.optim.Adam(lr.parameters(), lr=0.003)
    n = len(trr); res = {}
    t1 = time.time(); step = 0; bs = 8192
    # the kinds need whole messages: batches are message ranges
    order = np.arange(len(trm))
    while (time.time() - t1) / 60 < a.minutes:
        np.random.shuffle(order)
        for s in range(0, len(order), 256):
            b = batch(TR, order[s:s + 256])
            l1 = nn.functional.cross_entropy(rb(b), b['y']); l2 = nn.functional.cross_entropy(lr(b, low), b['y'])
            o1.zero_grad(); o2.zero_grad(); (l1 + l2).backward(); o1.step(); o2.step(); step += 1
            if step % 100 == 0: print(f'step {step} rb {l1.item():.4f} lr {l2.item():.4f} {time.time()-t1:.0f}s', flush=True)
            if (time.time() - t1) / 60 > a.minutes: break
    rb.eval()
    with torch.no_grad():
        b = batch(DV, np.arange(len(dvm)))
        out = {}
        for name, pred in [('routebook', rb(b).argmax(1)), ('logreg', lr(b, low).argmax(1))] + [('routebook without ' + d, rb(b, drop=i).argmax(1)) for i, d in enumerate(['opener', 'pair', 'path', 'backward', 'beacon'])]:
            ok = pred == b['y']; w = b['st'] == 4
            per = {KEYS[k]: round(float(ok[b['y'] == k].float().mean()), 4) for k in range(len(KEYS)) if (b['y'] == k).any()}
            wrong_msg = torch.zeros(len(dvm), device=dev).index_add_(0, b['msg'], (~ok).float())
            out[name] = {'all': round(float(ok.float().mean()), 4), 'words': round(float(ok[w].float().mean()), 4), 'held wires': round(float(ok[~w].float().mean()), 4),
                         'messages all keys right': round(float((wrong_msg == 0).float().mean()), 4), 'per key': per}
        out['stars'] = {'train': int(n), 'dev-B': int(len(dvr)), 'train messages': len(trm), 'dev-B messages': len(dvm), 'steps': step, 'minutes': a.minutes}
    print(json.dumps(out, indent=1)); json.dump(out, open(a.out + '/m2a.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
