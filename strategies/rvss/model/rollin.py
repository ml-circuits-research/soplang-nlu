"""rvss M2c: roll-in with the pilot's own moves (DESIGN 9.4, in the spirit of DAgger, Ross, Gordon and Bagnell 2011).

  python rollin.py <model dir> <export.jsonl> <out-prefix> [--workers 4] [--stride 1] [--follow 0.5] [--seed 1] [--split train]

The pilot (a trained model, numpy on the CPU) reads each training message of <export.jsonl> (split train) while the
adopted oracle's moves are known. At every state the pilot proposes its move:
- equal to the gold move: the gold move is applied;
- a deviation that keeps the state consistent with the gold tree (DESIGN 9.4: "a wrong key with the right receiver"):
  a word placed under another key, a wire closed with other marks, a wire opened with the gold type under another key
  (neither held aside), a held item claimed under another key. With probability --follow the pilot's move is applied
  (the state now holds the pilot's own error), else the gold one;
- any other deviation (another receiver, another structure): before any followed deviation the gold move is applied
  (the reading goes on, so later deviations can still be followed); after one, the sequence stops there (early
  update, Collins and Roark 2004): no dynamic oracle exists for this move set.
Every state reached after a followed deviation gives one example: the view of that state and the gold move (and its
choice group for a claim, reopen, point or coordination), as prep.py packs the teacher-forced ones. The sequence also
stops where the gold move is not legal in the pilot's state (legal() of core.py) or its candidates are not found.
Writes <out-prefix>.<split>.npz, .<split>.words.json, .meta.json, for train.py --data (split train) or --dev (split
dev-B: the decisions in the states the pilot reaches on held-out messages, for --eval-only --by-decision).
"""
import json, os, sys, collections, functools
os.environ.setdefault('OMP_NUM_THREADS', '1'); os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import State, label_of, legal, VIEW
from prep import atom_id, cands_for, pack, TYPES, KIND

L = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../.local-data/rvss/model/')


def consistent(mp, g):
    """the pilot's move mp differs from the gold move g only by a key or marks (the receiver and the structure the same)"""
    if mp['op'] != g['op']: return None
    op = g['op']
    if op == 'place' and mp['key'] != g['key']: return {'op': 'place', 'key': mp['key']}
    if op == 'close' and label_of(mp) != label_of(g): return {'op': 'close', 'atoms': mp['atoms']}
    if op == 'open' and mp['t'] == g['t'] and mp['at'] != g['at'] and 'held' not in (mp['at'], g['at']):
        return {'op': 'open', 't': g['t'], 'at': mp['at'], 'h': g['h']}
    if op == 'claim' and mp['item'] == g['item'] and mp['key'] != g['key']: return {'op': 'claim', 'item': g['item'], 'key': mp['key']}
    return None


def same(mp, g):
    if label_of(mp) != label_of(g): return False
    op = g['op']
    if op == 'claim': return mp['item'] == g['item']
    if op == 'point': return mp['target'] == g['target']
    if op == 'reopen': return mp['chain'] == g['chain']
    if op == 'coord': return sorted(mp['gather']) == sorted(g['gather'])
    return True


def work(chunk, model_dir, follow, seed):
    from decode import Pilot
    P = Pilot(model_dir)
    lab_ix = {l: i for i, l in enumerate(P.labels)}
    rng = np.random.default_rng(seed + chunk[0])
    out = []; c = collections.Counter(); allowed = collections.Counter()
    for o in chunk[1]:
        words, gold = o['words'], o['moves']
        try:
            kap = P.sc.kinds(words, P.stations(words) if getattr(P.sc, 'hmm', False) else None)
        except Exception:
            c['no stations'] += 1; continue
        S = State(words, o['gaps']); NT = len(words); forced = [0]
        acts, groups = [], []; deviated = False; c['messages'] += 1
        try:
            for i, g in enumerate(gold):
                lab = label_of(g); li = lab_ix.get(lab)
                if deviated:
                    ok = legal(S, P.labels, P.allowed)
                    if li is None or not ok[li]: c['stop: gold move not legal'] += 1; break
                    t = S.node(S.top().h).t; bw, bt = S.binders()
                    terms = [(pt, atom_id(a), off, tok) for pt, a, off, tok in S.view()]
                    cg = cands_for(S, g)
                    grp = None
                    if cg:
                        kind, cs, gl = cg
                        extra = g.get('at', '') if kind == 'gather' else (g.get('key', '') if kind in ('claim', 'point') else '')
                        grp = (KIND[kind], bw, bt, [(int(j in gl), [(pt, atom_id(a), off, tok) for pt, a, off, tok in S.cand_terms(kind, h, d, how, extra)]) for j, (h, d, how) in enumerate(cs)])
                    acts.append((li, TYPES.index(t), bw, bt, terms)); allowed[(t, lab)] += 1
                    if grp: groups.append(grp)
                ex = P.expand(S, kap, NT, g.get('h', 0) if g['op'] in ('open', 'coord') else 0, k=1, forced=forced)
                mp = ex[0][1] if ex else None
                if mp is not None and same(mp, g): S.apply(g); continue
                alt = consistent(mp, g) if mp is not None else None
                if alt is not None:
                    if rng.random() < follow: S.apply(alt); deviated = True; c['followed deviations'] += 1
                    else: S.apply(g)
                    continue
                if deviated: c['stop: deviation leaves the gold tree'] += 1; break
                S.apply(g)
        except Exception as e:
            c['stop: ' + str(e)[:40]] += 1
        if acts:
            c['messages with examples'] += 1; c['examples'] += len(acts)
            out.append({'words': words, 'origin': o['origin'], 'split': o['split'], 'acts': acts, 'groups': groups})
    return out, c, allowed


def main():
    md, src, prefix = sys.argv[1:4]; args = sys.argv[4:]
    opt = lambda k, d: type(d)(args[args.index('--' + k) + 1]) if '--' + k in args else d
    workers, stride, follow, seed, split = opt('workers', 4), opt('stride', 1), opt('follow', 0.5), opt('seed', 1), opt('split', 'train')
    lines = []
    for i, l in enumerate(open(src)):
        o = json.loads(l)
        if o['split'] == split and o['origin'] == 'spacy': lines.append(o)
    lines = lines[::stride]
    import torch
    VIEW['version'] = torch.load(os.path.join(md, 'model.pt'), map_location='cpu', weights_only=False)['args'].get('view', 1)
    chunks = [(i, lines[i:i + 500]) for i in range(0, len(lines), 500)]
    from multiprocessing import Pool
    from train import concat
    msgs = []; count = collections.Counter(); allowed = collections.Counter()
    with Pool(workers) as pool:
        for k, (out, c, al) in enumerate(pool.imap(functools.partial(work, model_dir=md, follow=follow, seed=seed), chunks)):
            msgs.extend(out); count.update(c); allowed.update(al)
            if k % 20 == 0: print(k, len(chunks), dict(count), flush=True)
    R = pack(msgs, lambda w: 0, None); W = [m['words'] for m in msgs]
    R['words'] = W; R = concat([R]); R.pop('words'); R['tok'] = np.array([0], np.int32)
    np.savez(prefix + '.' + split + '.npz', **R)
    json.dump(W, open(prefix + '.' + split + '.words.json', 'w'))
    if split != 'train' and os.path.exists(prefix + '.meta.json'): prefix_meta = prefix + '.' + split + '.meta.json'
    else: prefix_meta = prefix + '.meta.json'
    meta = {'view': VIEW['version'], 'model': md, 'source': src, 'stride': stride, 'follow': follow, 'counts': dict(count),
            'allowed': {f'{t}|{l}': n for (t, l), n in allowed.items()}, split: {'messages': len(W), 'acts': int(len(R['ex_label']))}}
    json.dump(meta, open(prefix_meta, 'w'), indent=1)
    print(json.dumps({k: v for k, v in meta.items() if k != 'allowed'}))


if __name__ == '__main__':
    main()
