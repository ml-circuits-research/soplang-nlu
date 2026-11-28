"""rvss M2b: train the pilot's decisions under teacher forcing (VSA model or the logistic control).

  python train.py --model vsa|logreg --data distill[,labels] --out <dir> [--epochs 2] [--D 1024] [--C 64]
                  [--batch 96] [--max-words N] [--minutes M]
Reads .local-data/rvss/model/<data>.{train,dev-B}.npz (prep.py). dev-B is always the distill dev-B (spaCy).
"""
import argparse, json, math, os, sys, time
import numpy as np
import torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import Stars, seeded
from net import VSA, LogReg

L = '/home/salboaie/work/sopworlds/soplang-nlu/.local-data/rvss/model/'
TYPES = ['M', 'nominal', 'relation', 'clause', 'coordination']
WEIGHT = {0: 1.0, 1: 1.0, 2: 3.0, 3: 3.0}      # spacy, agreement, judge, written (DESIGN 9.3)


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


class Data:
    def __init__(self, R, wid, aid, dev):
        self.n = len(R['words'])
        t = lambda a, dt=torch.int64: torch.as_tensor(np.asarray(a), dtype=dt, device=dev)
        self.tok = t([wid[w] for ws in R['words'] for w in ws])
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
        b = dict(wid=self.tok[tidx], left=left, right=right, NTOK=NTOK,
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
    w = torch.tensor([WEIGHT[i] for i in range(4)], device=dev)
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
    ap.add_argument('--model', default='vsa'); ap.add_argument('--data', default='distill'); ap.add_argument('--out', required=True)
    ap.add_argument('--epochs', type=float, default=2); ap.add_argument('--D', type=int, default=1024); ap.add_argument('--C', type=int, default=64)
    ap.add_argument('--P', type=int, default=4)
    ap.add_argument('--batch', type=int, default=96); ap.add_argument('--max-words', type=int, default=0); ap.add_argument('--minutes', type=float, default=1e9)
    ap.add_argument('--lr', type=float, default=0.02); ap.add_argument('--lr-scalar', type=float, default=0.005); ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--dev-limit', type=int, default=4000); ap.add_argument('--triples', action='store_true'); ap.add_argument('--sit', type=int, default=0)
    ap.add_argument('--eval-only', action='store_true'); ap.add_argument('--replace', action='store_true'); ap.add_argument('--confusion', action='store_true')
    a = ap.parse_args()
    torch.manual_seed(a.seed); np.random.seed(a.seed)
    os.makedirs(a.out, exist_ok=True)
    dev = torch.device('cuda')
    labels = json.load(open(L + 'labels.json'))
    meta = json.load(open(L + a.data.split(',')[0] + '.meta.json')); a.view = meta.get('view', 1)
    dvname = 'distill2' if a.view == 2 else 'distill'
    allowed = {}
    for name in a.data.split(','):
        for k, c in json.load(open(L + name + '.meta.json'))['allowed'].items():
            t, lab = k.split('|', 1); allowed.setdefault(t, set()).add(lab)
    mask = torch.zeros(len(TYPES), len(labels), dtype=torch.bool, device=dev)
    for t, labs in allowed.items():
        for lab in labs: mask[TYPES.index(t), labels.index(lab)] = True
    t0 = time.time()
    parts = [load(n, 'train', a.max_words) for n in a.data.split(',')]
    if a.replace and len(parts) == 2:
        # mixed.jsonl.gz: a message with a label is learned from its label only (spaCy's line is dropped)
        lab = {tuple(w) for w in parts[1]['words']}
        keep = np.array([tuple(w) not in lab for w in parts[0]['words']])
        print('replace: spaCy lines kept', int(keep.sum()), 'of', len(keep), flush=True)
        parts[0] = _reindex(parts[0], np.nonzero(keep)[0])
    tr = concat(parts)
    dv = load(dvname, 'dev-B', a.max_words)
    dv = _reindex(dv, np.arange(min(len(dv['words']), 10 ** 9)))
    print('loaded', len(tr['words']), 'train messages', len(tr['ex_label']), 'acts;', len(dv['words']), 'dev-B', f'{time.time()-t0:.0f}s', flush=True)
    # vocabularies of fixed stars
    vocab = {}
    for ws in tr['words'] + dv['words']:
        for w in ws: vocab.setdefault(w, len(vocab))
    atoms = np.unique(np.concatenate([tr['term_atom'], tr['cterm_atom'], dv['term_atom'], dv['cterm_atom']]))
    amap = {int(x): i for i, x in enumerate(atoms)}
    lut = np.zeros(int(atoms.max()) + 1, np.int64); lut[atoms] = np.arange(len(atoms))
    aid = lambda arr: lut[np.asarray(arr)]
    S = Stars(a.D)
    t1 = time.time()
    if a.model == 'vsa':
        W = np.stack([S.f(w) for w in vocab]); A = np.stack([seeded('rvss-atom-id:%d' % int(x), a.D) for x in atoms])
        print('stars', W.shape, A.shape, f'{time.time()-t1:.0f}s', flush=True)
        model = VSA(len(labels), a.D, a.C, a.P, torch.as_tensor(A), torch.as_tensor(W), torch.as_tensor(S.phi_s), torch.as_tensor(S.perm), sit=a.sit).to(dev)
        opt = torch.optim.Adam([{'params': model.phase_params(), 'lr': a.lr}, {'params': model.scalar_params(), 'lr': a.lr_scalar}])
    else:
        import zlib
        low = np.array([zlib.crc32(w.lower().encode()) & 0x7fffffff for w in vocab]); sf = np.array([zlib.crc32(('suf:' + w.lower()[-3:]).encode()) & 0x7fffffff for w in vocab])
        model = LogReg(len(labels), 21, torch.as_tensor(low), torch.as_tensor(sf), a.triples).to(dev)
        opt = torch.optim.Adam(model.parameters(), lr=a.lr)
    T = Data(tr, vocab, aid, dev); Dv = Data(dv, vocab, aid, dev)
    print('on gpu', f'{time.time()-t0:.0f}s', flush=True)
    w_or = torch.tensor([WEIGHT[i] for i in range(4)], device=dev)

    def forward(b):
        if a.model == 'vsa':
            kap, _ = model.kinds(b['wid'], b['left'], b['right'])
            lg = model.act_logits(kap, b['ex'], b['part'], b['atom'], b['off'], b['tok'], b['bw'], b['bt'])
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
                if CONF is not None:
                    for g_, p_ in zip(b['label'][~right].tolist(), lg.argmax(1)[~right].tolist()): CONF[(labels[g_], labels[p_])] = CONF.get((labels[g_], labels[p_]), 0) + 1
                wrong = torch.zeros(len(idx[s:s + 256]), device=dev).index_add_(0, b['emsg'], (~right).float())
                if cl is not None:
                    _, p_, g_ = group_loss(cl, b); pr[0] += p_[0]; pr[1] += p_[1]; ga[0] += g_[0]; ga[1] += g_[1]
                msg_ok += int((wrong == 0).sum()); msg_tot += len(wrong)
        model.train()
        return {'act': ok / max(tot, 1), 'acts': tot, 'pointer': pr[0] / max(pr[1], 1), 'pointers': pr[1], 'gather': ga[0] / max(ga[1], 1), 'gathers': ga[1],
                'messages_all_acts_right': msg_ok / max(msg_tot, 1)}

    CONF = {} if a.confusion else None
    if a.eval_only:
        ck = torch.load(a.out + '/model.pt', map_location=dev, weights_only=False)
        model.load_state_dict(ck['state'], strict=False)
        res = {}
        nw = np.array([len(w) for w in dv['words']])
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
