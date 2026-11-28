"""rvss M2b: train the pilot's decisions under teacher forcing (VSA model or the logistic control).

  python train.py --model vsa|logreg --data d12[,rollin12] --out <dir> [--epochs 2] [--D 1024] [--C 64]
                  [--batch 96] [--max-words N] [--minutes M]
Reads .local-data/rvss/model/<data>.{train,dev-B}.npz (prep.py; rollin.py gives a train part only). dev-B is the
spaCy dev-B of --dev (default d12: the targets of the writer at 195075d, view 2).
--init <dir>: start from that model (fine-tuning); parameters indexed by label are copied row by row (labels.json only
grows), the others where the shapes agree. --data-weight w1,w2,...: how often each data part is drawn (repeats).
"""
import argparse, json, math, os, sys, time
import numpy as np
import torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import Stars, seeded
from net import VSA, LogReg

L = '/home/salboaie/work/sopworlds/soplang-nlu/.local-data/rvss/model/'
TYPES = ['M', 'nominal', 'relation', 'clause', 'coordination']
WEIGHT = {0: 1.0, 1: 1.0, 2: 3.0, 3: 3.0, 4: 1.0}      # spacy, agreement, judge, written (DESIGN 9.3), general (spaCy on syntactic/general)


def load(name, split, maxw):
    R = dict(np.load(L + name + '.' + split + '.npz'))
    words = json.load(open(L + name + '.' + split + '.words.json'))
    R['words'] = words
    if maxw:
        keep = np.array([len(w) <= maxw for w in words])
        R = subset(R, keep)
    return R


def subset(R, keep):
    """keep a subset of messages, re-indexing everything"""
    idx = np.nonzero(keep)[0]
    M = R['msg'][idx]
    out = {'words': [R['words'][i] for i in idx], 'origin': R['origin'][idx]}
    return merge([R], [idx])[0] if False else _reindex(R, idx)


def _ranges(starts, lens):
    lens = np.asarray(lens, np.int64); starts = np.asarray(starts, np.int64)
    if lens.sum() == 0: return np.zeros(0, np.int64)
    ex = np.concatenate([[0], np.cumsum(lens)[:-1]])
    return np.repeat(starts - ex, lens) + np.arange(lens.sum())


def _reindex(R, idx):
    M = R['msg'][idx]
    eidx = _ranges(M[:, 2], M[:, 3]); gidx = _ranges(M[:, 4], M[:, 5])
    out = {'words': [R['words'][i] for i in idx], 'origin': R['origin'][idx]}
    ex_keys = ['ex_label', 'ex_type', 'ex_bw', 'ex_bt']
    for k in ex_keys: out[k] = R[k][eidx]
    tidx = _ranges(R['ex_tstart'][eidx], R['ex_nt'][eidx])
    for k in ('term_part', 'term_atom', 'term_off', 'term_tok'): out[k] = R[k][tidx]
    out['ex_nt'] = R['ex_nt'][eidx]; out['ex_tstart'] = np.concatenate([[0], np.cumsum(out['ex_nt'])[:-1]]).astype(np.int64)
    G = R['grp'][gidx]
    cidx = _ranges(G[:, 4], G[:, 5]); C = R['cand'][cidx]
    ctidx = _ranges(C[:, 1], C[:, 2])
    for k in ('cterm_part', 'cterm_atom', 'cterm_off', 'cterm_tok'): out[k] = R[k][ctidx]
    C2 = C.copy(); C2[:, 1] = np.concatenate([[0], np.cumsum(C[:, 2])[:-1]]); out['cand'] = C2
    G2 = G.copy(); G2[:, 4] = np.concatenate([[0], np.cumsum(G[:, 5])[:-1]])
    nt = np.array([len(w) for w in out['words']])
    M2 = np.zeros((len(idx), 6), np.int64)
    M2[:, 0] = np.concatenate([[0], np.cumsum(nt)[:-1]]); M2[:, 1] = nt
    M2[:, 3] = M[:, 3]; M2[:, 2] = np.concatenate([[0], np.cumsum(M[:, 3])[:-1]])
    M2[:, 5] = M[:, 5]; M2[:, 4] = np.concatenate([[0], np.cumsum(M[:, 5])[:-1]])
    G2[:, 0] = np.repeat(np.arange(len(idx)), M[:, 5])
    out['msg'] = M2; out['grp'] = G2
    return out


def concat(Rs):
    if len(Rs) == 1: return _reindex(Rs[0], np.arange(len(Rs[0]['words'])))
    parts = [_reindex(R, np.arange(len(R['words']))) for R in Rs]
    out = {'words': sum((p['words'] for p in parts), []), 'origin': np.concatenate([p['origin'] for p in parts])}
    for k in ('ex_label', 'ex_type', 'ex_bw', 'ex_bt', 'ex_nt', 'term_part', 'term_atom', 'term_off', 'term_tok',
              'cterm_part', 'cterm_atom', 'cterm_off', 'cterm_tok'):
        out[k] = np.concatenate([p[k] for p in parts])
    out['ex_tstart'] = np.concatenate([[0], np.cumsum(out['ex_nt'])[:-1]])
    C = np.concatenate([p['cand'] for p in parts]); C[:, 1] = np.concatenate([[0], np.cumsum(C[:, 2])[:-1]]); out['cand'] = C
    G = np.concatenate([p['grp'] for p in parts]); G[:, 4] = np.concatenate([[0], np.cumsum(G[:, 5])[:-1]])
    M = np.concatenate([p['msg'] for p in parts])
    M[:, 0] = np.concatenate([[0], np.cumsum(M[:, 1])[:-1]]); M[:, 2] = np.concatenate([[0], np.cumsum(M[:, 3])[:-1]])
    M[:, 4] = np.concatenate([[0], np.cumsum(M[:, 5])[:-1]])
    G[:, 0] = np.repeat(np.arange(len(M)), M[:, 5])
    out['msg'] = M; out['grp'] = G
    return out


def tranges(starts, lens):
    lens = lens.long(); starts = starts.long()
    tot = int(lens.sum().item())
    if tot == 0: return torch.zeros(0, dtype=torch.long, device=lens.device)
    ex = torch.cumsum(lens, 0) - lens
    return torch.repeat_interleave(starts - ex, lens) + torch.arange(tot, device=lens.device)


NST = 25            # hmm-rules' stations
BYDEC = None
STATIONS = None     # key (words joined by U+0001) -> per word [[station, p], ...]


def load_stations(path):
    global STATIONS
    STATIONS = {}
    for line in open(path):
        o = json.loads(line); STATIONS[o['key']] = o['post']


def post_rows(words):
    """(len(words), NST) station posteriors of one message (zeros when unknown)"""
    P = np.zeros((len(words), NST), np.float32)
    for i, lst in enumerate(STATIONS.get('\u0001'.join(words), []) if STATIONS is not None else []):
        for j, p in lst: P[i, j] = p
    return P


class Data:
    def __init__(self, R, wid, aid, dev):
        self.n = len(R['words'])
        t = lambda a, dt=torch.int64: torch.as_tensor(np.asarray(a), dtype=dt, device=dev)
        self.tok = t([wid[w] for ws in R['words'] for w in ws])
        self.post = torch.as_tensor(np.concatenate([post_rows(ws) for ws in R['words']]), device=dev) if STATIONS is not None else None
        self.msg = t(R['msg']); self.origin = t(R['origin'])
        for k in ('ex_label', 'ex_type', 'ex_bw', 'ex_bt', 'ex_tstart', 'ex_nt'): setattr(self, k, t(R[k]))
        self.term_part = t(R['term_part']); self.term_off = t(R['term_off'], torch.int16); self.term_tok = t(R['term_tok'])
        self.term_atom = t(aid(R['term_atom']))
        self.grp = t(R['grp']); self.cand = t(R['cand'])
        self.cterm_part = t(R['cterm_part']); self.cterm_off = t(R['cterm_off'], torch.int16); self.cterm_tok = t(R['cterm_tok'])
        self.cterm_atom = t(aid(R['cterm_atom']))
        self.nwords = t([len(w) for w in R['words']])

    def batch(self, mi):
        M = self.msg[mi]
        B = len(mi)
        tidx = tranges(M[:, 0], M[:, 1]); nt = M[:, 1]
        base = torch.cumsum(nt, 0) - nt
        tmsg = torch.repeat_interleave(torch.arange(B, device=mi.device), nt)
        left = torch.arange(len(tidx), device=mi.device) - base[tmsg]
        right = nt[tmsg] - 1 - left
        NTOK = len(tidx)
        eidx = tranges(M[:, 2], M[:, 3]); emsg = torch.repeat_interleave(torch.arange(B, device=mi.device), M[:, 3])
        trm = tranges(self.ex_tstart[eidx], self.ex_nt[eidx])
        tex = torch.repeat_interleave(torch.arange(len(eidx), device=mi.device), self.ex_nt[eidx])
        tt = self.term_tok[trm]
        ttok = torch.where(tt >= 0, base[emsg[tex]] + tt, torch.full_like(tt, NTOK))
        def bind(x, msgs):
            return torch.where(x >= 0, base[msgs] + x, torch.full_like(x, NTOK))
        b = dict(wid=self.tok[tidx], post=self.post[tidx] if self.post is not None else None, left=left, right=right, NTOK=NTOK,
                 ex=tex, part=self.term_part[trm], atom=self.term_atom[trm], off=self.term_off[trm], tok=ttok,
                 bw=bind(self.ex_bw[eidx], emsg), bt=bind(self.ex_bt[eidx], emsg),
                 label=self.ex_label[eidx], type=self.ex_type[eidx], w=self.origin[mi][emsg], NE=len(eidx), emsg=emsg)
        gidx = tranges(M[:, 4], M[:, 5]); gmsg = torch.repeat_interleave(torch.arange(B, device=mi.device), M[:, 5])
        G = self.grp[gidx]
        cidx = tranges(G[:, 4], G[:, 5]); cg = torch.repeat_interleave(torch.arange(len(gidx), device=mi.device), G[:, 5])
        C = self.cand[cidx]
        ctr = tranges(C[:, 1], C[:, 2]); cc = torch.repeat_interleave(torch.arange(len(cidx), device=mi.device), C[:, 2])
        ct = self.cterm_tok[ctr]
        b.update(cidx=cc, cpart=self.cterm_part[ctr], catom=self.cterm_atom[ctr], coff=self.cterm_off[ctr],
                 ctok=torch.where(ct >= 0, base[gmsg[cg[cc]]] + ct, torch.full_like(ct, NTOK)),
                 cgrp=cg, cgold=C[:, 0], ckind=G[cg, 1], cbw=bind(G[cg, 2], gmsg[cg]), cbt=bind(G[cg, 3], gmsg[cg]),
                 gkind=G[:, 1], NG=len(gidx), NC=len(cidx), gw=self.origin[mi][gmsg])
        return b


def group_loss(logits, b):
    """softmax within each claim / reopen / point group; a yes/no per candidate of a gather group"""
    dev = logits.device
    if b['NC'] == 0: return logits.sum() * 0, (0, 0), (0, 0)
    g = b['cgrp']; kind = b['ckind']; gold = b['cgold'].float()
    gat = kind == 3
    ng = b['NG']
    cnt = torch.bincount(g, minlength=ng); start = torch.cumsum(cnt, 0) - cnt
    pos = torch.arange(len(g), device=dev) - start[g]
    mx = int(cnt.max().item())
    pad = torch.full((ng, mx), -1e9, device=dev)
    pad[g[~gat], pos[~gat]] = logits[~gat]
    gpad = torch.zeros((ng, mx), device=dev); gpad[g, pos] = gold
    sel = b['gkind'] != 3
    w = torch.tensor([WEIGHT[i] for i in range(5)], device=dev)
    loss = 0; ptr = (0, 0); gth = (0, 0)
    if sel.any():
        tgt = gpad[sel].argmax(1)
        lw = w[b['gw'][sel]]
        loss = loss + (torch.nn.functional.cross_entropy(pad[sel], tgt, reduction='none') * lw).sum()
        ptr = (int((pad[sel].argmax(1) == tgt).sum().item()), int(sel.sum().item()))
    if gat.any():
        lw = w[b['gw'][g[gat]]]
        loss = loss + (torch.nn.functional.binary_cross_entropy_with_logits(logits[gat], gold[gat], reduction='none') * lw).sum()
        # a gather group is right when every candidate is right
        wrong = torch.zeros(ng, device=dev).index_add_(0, g[gat], ((logits[gat] > 0).float() != gold[gat]).float())
        gs = b['gkind'] == 3
        gth = (int((wrong[gs] == 0).sum().item()), int(gs.sum().item()))
    return loss, ptr, gth


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='vsa'); ap.add_argument('--data', default='d12'); ap.add_argument('--out', required=True)
    ap.add_argument('--epochs', type=float, default=2); ap.add_argument('--D', type=int, default=1024); ap.add_argument('--C', type=int, default=64)
    ap.add_argument('--P', type=int, default=4)
    ap.add_argument('--batch', type=int, default=96); ap.add_argument('--max-words', type=int, default=0); ap.add_argument('--minutes', type=float, default=1e9)
    ap.add_argument('--lr', type=float, default=0.02); ap.add_argument('--lr-scalar', type=float, default=0.005); ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--dev-limit', type=int, default=4000); ap.add_argument('--triples', action='store_true'); ap.add_argument('--sit', type=int, default=0); ap.add_argument('--lex', action='store_true'); ap.add_argument('--dev', default=''); ap.add_argument('--k2', type=int, default=0); ap.add_argument('--eval-train', type=int, default=0); ap.add_argument('--by-decision', action='store_true'); ap.add_argument('--hmm', default='', help='station posteriors (data/stations.mjs output)')
    ap.add_argument('--init', default=''); ap.add_argument('--data-weight', default=''); ap.add_argument('--dev-split', default='dev-B'); ap.add_argument('--rb', type=int, default=0, help='route book memory slots (DESIGN 7)')
    ap.add_argument('--eval-only', action='store_true'); ap.add_argument('--replace', action='store_true'); ap.add_argument('--confusion', action='store_true')
    a = ap.parse_args()
    torch.manual_seed(a.seed); np.random.seed(a.seed)
    os.makedirs(a.out, exist_ok=True)
    dev = torch.device(os.environ.get('RVSS_TRAIN_DEVICE', 'cuda'))   # cpu for a small --eval-only check
    labels = json.load(open(L + 'labels.json'))
    meta = json.load(open(L + a.data.split(',')[0] + '.meta.json')); a.view = meta.get('view', 1)
    dvname = a.dev or 'd12'
    allowed = {}
    for name in a.data.split(','):
        for k, c in json.load(open(L + name + '.meta.json'))['allowed'].items():
            t, lab = k.split('|', 1); allowed.setdefault(t, set()).add(lab)
    mask = torch.zeros(len(TYPES), len(labels), dtype=torch.bool, device=dev)
    for t, labs in allowed.items():
        for lab in labs: mask[TYPES.index(t), labels.index(lab)] = True
    t0 = time.time()
    if a.hmm: load_stations(a.hmm); print('stations', len(STATIONS), flush=True)
    parts = [load(n, 'train', a.max_words) for n in a.data.split(',')]
    if a.replace and len(parts) == 2:
        # mixed.jsonl.gz: a message with a label is learned from its label only (spaCy's line is dropped)
        lab = {tuple(w) for w in parts[1]['words']}
        keep = np.array([tuple(w) not in lab for w in parts[0]['words']])
        print('replace: spaCy lines kept', int(keep.sum()), 'of', len(keep), flush=True)
        parts[0] = _reindex(parts[0], np.nonzero(keep)[0])
    if a.data_weight:
        reps = [int(x) for x in a.data_weight.split(',')]
        parts = [p for p, r in zip(parts, reps) for _ in range(r)]
    tr = concat(parts)
    dv = load(dvname, a.dev_split, a.max_words)
    dv = _reindex(dv, np.arange(min(len(dv['words']), 10 ** 9)))
    print('loaded', len(tr['words']), 'train messages', len(tr['ex_label']), 'acts;', len(dv['words']), 'dev-B', f'{time.time()-t0:.0f}s', flush=True)
    # vocabularies of fixed stars
    vocab = {}
    for ws in tr['words'] + dv['words']:
        for w in ws: vocab.setdefault(w, len(vocab))
    atoms = np.unique(np.concatenate([tr['term_atom'], tr['cterm_atom'], dv['term_atom'], dv['cterm_atom']]))
    src = a.out if a.eval_only else a.init
    if src:
        # the atom rows of the model read (the control hashes an atom's row): its own atoms first, in its order
        old = torch.load(src + '/model.pt', map_location='cpu', weights_only=False).get('atoms')
        if old is not None:
            known = set(old); atoms = np.array(list(old) + [int(x) for x in atoms if int(x) not in known], np.int64)
    amap = {int(x): i for i, x in enumerate(atoms)}
    lut = np.zeros(int(np.max(atoms)) + 1, np.int64); lut[atoms] = np.arange(len(atoms))
    aid = lambda arr: lut[np.asarray(arr)]
    S = Stars(a.D)
    t1 = time.time()
    if a.model == 'vsa':
        W = np.stack([S.f(w) for w in vocab]); A = np.stack([seeded('rvss-atom-id:%d' % int(x), a.D) for x in atoms])
        print('stars', W.shape, A.shape, f'{time.time()-t1:.0f}s', flush=True)
        model = VSA(len(labels), a.D, a.C, a.P, torch.as_tensor(A), torch.as_tensor(W), torch.as_tensor(S.phi_s), torch.as_tensor(S.perm), sit=a.sit, lex=a.lex, k2=a.k2, hmm=NST if a.hmm else 0, view=a.view, rb=a.rb).to(dev)
        opt = torch.optim.Adam([{'params': model.phase_params(), 'lr': a.lr}, {'params': model.scalar_params(), 'lr': a.lr_scalar}])
    else:
        import zlib
        low = np.array([zlib.crc32(w.lower().encode()) & 0x7fffffff for w in vocab]); sf = np.array([zlib.crc32(('suf:' + w.lower()[-3:]).encode()) & 0x7fffffff for w in vocab])
        model = LogReg(len(labels), 21, torch.as_tensor(low), torch.as_tensor(sf), a.triples).to(dev)
        opt = torch.optim.Adam(model.parameters(), lr=a.lr)
    if a.init:
        ck = torch.load(a.init + '/model.pt', map_location=dev, weights_only=False)
        own = model.state_dict(); old_labels = ck['labels']
        for k, v in ck['state'].items():
            if k not in own: continue
            if own[k].shape == v.shape: own[k].copy_(v)
            elif k in ('Pr', 'bias') and own[k].shape[1:] == v.shape[1:]:
                for i, lab in enumerate(old_labels): own[k][labels.index(lab)] = v[i]
            else: print('init: not copied', k, tuple(v.shape), tuple(own[k].shape), flush=True)
        print('init from', a.init, flush=True)
    T = Data(tr, vocab, aid, dev); Dv = Data(dv, vocab, aid, dev)
    print('on gpu', f'{time.time()-t0:.0f}s', flush=True)
    w_or = torch.tensor([WEIGHT[i] for i in range(5)], device=dev)

    # route book: the receiver below the top, read from the parent part's terms ('opener:<type>' with its token; 'type:M')
    if a.rb:
        import zlib as _z
        RBT = ['M', 'nominal', 'relation', 'clause', 'coordination', 'none']
        opt_ = torch.full((len(atoms),), -1, dtype=torch.long, device=dev)
        for ti, tn in enumerate(RBT[:5]):
            for nm in (('type:M',) if tn == 'M' else ('opener:' + tn,)):
                r_ = amap.get(_z.crc32(nm.encode()) & ((1 << 20) - 1))
                if r_ is not None: opt_[r_] = ti

    def receivers(b):
        NE, NT = b['NE'], b['NTOK']
        t2 = torch.full((NE,), 5, dtype=torch.long, device=dev); o2 = torch.full((NE,), NT, dtype=torch.long, device=dev)
        ty = opt_[b['atom']]; m_ = (b['part'] == 2) & (ty >= 0)
        t2[b['ex'][m_]] = ty[m_]; o2[b['ex'][m_]] = torch.where(ty[m_] == 0, torch.full_like(b['tok'][m_], NT), b['tok'][m_])
        return b['bt'], b['type'], o2, t2

    def forward(b):
        if a.model == 'vsa':
            kap, _ = model.kinds(b['wid'], b['left'], b['right'], b['post'])
            lg = model.act_logits(kap, b['ex'], b['part'], b['atom'], b['off'], b['tok'], b['bw'], b['bt'])
            if a.rb: lg = lg + model.rb_logits(kap, b['bw'], *receivers(b))
            cl = model.cand_logits(kap, b['cidx'], b['cpart'], b['catom'], b['coff'], b['ctok'], b['ckind'], b['cbw'], b['cbt']) if b['NC'] else None
        else:
            wid = torch.cat([b['wid'], torch.full((1,), -1, device=dev, dtype=b['wid'].dtype)])
            lg = model.act_logits(b['ex'], b['part'], b['atom'], b['off'], wid[b['tok']], wid[b['bw']][b['ex']], b['NE'])
            cl = model.cand_logits(b['cidx'], b['cpart'], b['catom'], b['coff'], wid[b['ctok']], wid[b['cbt']][b['cidx']], b['ckind'], b['NC']) if b['NC'] else None
        lg = lg.masked_fill(~mask[b['type']], -1e9)
        return lg, cl

    def evaluate(D, limit):
        model.eval(); ok = tot = 0; pr = [0, 0]; ga = [0, 0]; msg_ok = msg_tot = 0
        with torch.no_grad():
            idx = torch.arange(min(D.n, limit), device=dev)
            for s in range(0, len(idx), 256):
                b = D.batch(idx[s:s + 256])
                lg, cl = forward(b)
                right = lg.argmax(1) == b['label']
                ok += int(right.sum()); tot += len(right)
                if BYDEC is not None:
                    # per decision family (gold label's first part) and distance from the word to the opener of the wire it acts on
                    dist = torch.where((b['bw'] < b['NTOK']) & (b['bt'] < b['NTOK']), b['bw'] - b['bt'], torch.full_like(b['bw'], -1))
                    for g_, r_, d_ in zip(b['label'].tolist(), right.tolist(), dist.tolist()):
                        fam = labels[g_].split(':')[0]
                        db = 'after the last word, or no wire open' if d_ < 0 else '0' if d_ == 0 else '1' if d_ == 1 else '2-3' if d_ <= 3 else '4-7' if d_ <= 7 else '8+'
                        for k_ in ((fam, 'all'), (fam, db), ('all', 'all')):
                            c_ = BYDEC.setdefault(k_, [0, 0]); c_[0] += int(r_); c_[1] += 1
                if CONF is not None:
                    for g_, p_ in zip(b['label'][~right].tolist(), lg.argmax(1)[~right].tolist()): CONF[(labels[g_], labels[p_])] = CONF.get((labels[g_], labels[p_]), 0) + 1
                wrong = torch.zeros(len(idx[s:s + 256]), device=dev).index_add_(0, b['emsg'], (~right).float())
                if cl is not None:
                    _, p_, g_ = group_loss(cl, b); pr[0] += p_[0]; pr[1] += p_[1]; ga[0] += g_[0]; ga[1] += g_[1]
                    if BYDEC is not None:
                        # which item a claim / reopen / point takes, by kind (softmax within the group)
                        for kk, kn in enumerate(['claim (which item)', 'reopen (which wire)', 'point (which wire)']):
                            sel = (b['ckind'] == kk)
                            if not sel.any(): continue
                            gs = torch.unique(b['cgrp'][sel])
                            for gi in gs.tolist():
                                m_ = b['cgrp'] == gi
                                c_ = BYDEC.setdefault((kn, 'all'), [0, 0]); c_[0] += int(b['cgold'][m_][cl[m_].argmax()] == 1); c_[1] += 1
                msg_ok += int((wrong == 0).sum()); msg_tot += len(wrong)
        model.train()
        return {'act': ok / max(tot, 1), 'acts': tot, 'pointer': pr[0] / max(pr[1], 1), 'pointers': pr[1], 'gather': ga[0] / max(ga[1], 1), 'gathers': ga[1],
                'messages_all_acts_right': msg_ok / max(msg_tot, 1)}

    CONF = {} if a.confusion else None
    global BYDEC
    BYDEC = {} if a.by_decision else None
    if a.eval_only:
        ck = torch.load(a.out + '/model.pt', map_location=dev, weights_only=False)
        model.load_state_dict(ck['state'], strict=False)
        res = {}
        nw = np.array([len(w) for w in dv['words']])
        if a.by_decision:
            evaluate(Dv, 10 ** 9)
            out = {f'{k[0]} | {k[1]}': {'right': v[0], 'n': v[1], 'acc': round(v[0] / v[1], 4)} for k, v in sorted(BYDEC.items())}
            print(json.dumps(out, indent=0)); json.dump(out, open(a.out + '/by-decision' + ('-' + a.dev if a.dev and a.dev != 'd12' else '') + ('-' + a.dev_split if a.dev_split != 'dev-B' else '') + '.json', 'w'), indent=1); return
        if a.eval_train:
            # teacher forcing on train messages (every 37th, up to N): fitting against generalising
            sel = np.arange(0, len(tr['words']), 37)[:a.eval_train]
            res['train sample'] = evaluate(Data(_reindex(tr, sel), vocab, aid, dev), 10 ** 9); res['train sample']['messages'] = len(sel)
            sel = np.arange(len(dv['words']))[:a.eval_train]
            res['dev-B sample'] = evaluate(Data(_reindex(dv, sel), vocab, aid, dev), 10 ** 9); res['dev-B sample']['messages'] = len(sel)
            print(json.dumps(res, indent=1)); return
        for name, keep in [('<=12 words', nw <= 12), ('>12 words', nw > 12), ('all', nw > 0)]:
            res[name] = evaluate(Data(_reindex(dv, np.nonzero(keep)[0]), vocab, aid, dev), 10 ** 9); res[name]['messages'] = int(keep.sum())
        print(json.dumps(res, indent=1)); json.dump(res, open(a.out + '/tf-by-length.json', 'w'), indent=1)
        if CONF is not None:
            top = sorted(CONF.items(), key=lambda x: -x[1])[:30]
            json.dump([[g, p_, c // 2] for (g, p_), c in top], open(a.out + '/tf-confusion.json', 'w'), indent=0)
            for (g, p_), c in top: print('confusion', g, '->', p_, c // 2)   # counted twice: the <=12 / >12 parts and all
        return
    steps = int(a.epochs * T.n / a.batch)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=[g['lr'] for g in opt.param_groups], total_steps=steps, pct_start=0.05)
    log = []; best = -1; t2 = time.time()
    perm = torch.randperm(T.n, device=dev); pi = 0
    for step in range(steps):
        if pi + a.batch > T.n: perm = torch.randperm(T.n, device=dev); pi = 0
        mi = perm[pi:pi + a.batch]; pi += a.batch
        b = T.batch(mi)
        lg, cl = forward(b)
        loss = (torch.nn.functional.cross_entropy(lg, b['label'], reduction='none') * w_or[b['w']]).sum()
        if cl is not None: loss = loss + group_loss(cl, b)[0]
        loss = loss / b['NE']
        opt.zero_grad(); loss.backward(); opt.step(); sched.step()
        if step % 200 == 0:
            print(f'step {step}/{steps} loss {loss.item():.4f} {time.time()-t2:.0f}s', flush=True)
        if (step + 1) % 2000 == 0 or step == steps - 1 or (time.time() - t2) / 60 > a.minutes:
            r = evaluate(Dv, a.dev_limit); r['step'] = step + 1; r['seconds'] = round(time.time() - t2); log.append(r)
            print('dev-B', json.dumps(r), flush=True)
            torch.save({'state': {k: v for k, v in model.state_dict().items() if k not in ('wordstars', 'atomstars', 'lower', 'suffix')}, 'args': vars(a), 'labels': labels, 'atoms': atoms.tolist(), 'allowed': {t: sorted(v) for t, v in allowed.items()}}, a.out + '/model.pt')
            if (time.time() - t2) / 60 > a.minutes: break
    r = evaluate(Dv, 10 ** 9); r['final'] = True; r['seconds'] = round(time.time() - t2); log.append(r)
    print('dev-B full', json.dumps(r), flush=True)
    json.dump(log, open(a.out + '/log.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
