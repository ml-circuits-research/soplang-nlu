"""rvss M2b data: teacher-forced decision examples from the derived moves.

  python prep.py <export.jsonl> <out-prefix> [--workers 18] [--max-words N]
writes <out-prefix>.<split>.npz and <out-prefix>.meta.json (labels: the set's own move-label list, which ex_label
indexes; allowed labels per top type, counts). No label list is kept outside the set.

Every gold move gives one act example (the view of the state before it, the gold label, the top's type);
claim, reopen and point give a pointer group (candidates found from the state, the gold one marked), and a
coordination gives a gather group (every candidate marked in or out).
"""
import json, sys, zlib, collections
import numpy as np
from multiprocessing import Pool
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from core import State, label_of, VIEW

ATOM_BITS = 20
TYPES = ['M', 'nominal', 'relation', 'clause', 'coordination']
KIND = {'claim': 0, 'reopen': 1, 'point': 2, 'gather': 3}


def atom_id(a):
    return zlib.crc32(a.encode()) & ((1 << ATOM_BITS) - 1)


def cands_for(S, m):
    op = m['op']
    if op == 'claim':
        c = [x for x in S.held_items()]; gold = [x[0] for x in c].index(m['item']); return 'claim', c, [gold]
    if op == 'reopen':
        c = S.closed_reachable(); tgt = m['chain'][-1]
        if S.chain_to(tgt) != m['chain']: raise ValueError('reopen chain differs')
        return 'reopen', c, [[x[0] for x in c].index(tgt)]
    if op == 'point':
        c = S.point_cands(); return 'point', c, [[x[0] for x in c].index(m['target'])]
    if op == 'coord':
        c = S.gather_cands(); ids = [x[0] for x in c]
        return 'gather', c, [ids.index(g) for g in m['gather']]
    return None


def work(lines, view=1):
    VIEW['version'] = view
    labels = {}; out = []; bad = collections.Counter(); allowed = collections.Counter()
    for line in lines:
        o = json.loads(line)
        S = State(o['words'], o['gaps'])
        acts, groups = [], []
        try:
            for m in o['moves']:
                lab = label_of(m); t = S.node(S.top().h).t
                allowed[(t, lab)] += 1
                li = labels.setdefault(lab, len(labels))
                bw, bt = S.binders()
                acts.append((li, TYPES.index(t), bw, bt, [(pt, atom_id(a), off, tok) for pt, a, off, tok in S.view()]))
                c = cands_for(S, m)
                if c:
                    kind, cs, gold = c
                    extra = m.get('at', '') if kind == 'gather' else (m.get('key', '') if kind in ('claim', 'point') else '')
                    if kind == 'gather': bw2, bt2 = bw, bt
                    else: bw2, bt2 = bw, bt
                    cl = []
                    for j, (h, d, how) in enumerate(cs):
                        terms = S.cand_terms(kind, h, d, how, extra)
                        cl.append((int(j in gold), [(pt, atom_id(a), off, tok) for pt, a, off, tok in terms]))
                    groups.append((KIND[kind], bw2, bt2, cl))
                S.apply(m)
            if not S.done(): raise ValueError('not done')
        except Exception as e:
            bad[str(e)[:60]] += 1; continue
        out.append({'words': o['words'], 'origin': o['origin'], 'split': o['split'], 'acts': acts, 'groups': groups})
    return labels, out, bad, allowed


def pack(msgs, wid, gl):
    A = collections.defaultdict(list)
    tok = []; ex_t = []; ex_p = []; ex_a = []; ex_o = []; ex_k = []
    g_rows = []; c_rows = []; ct_p = []; ct_a = []; ct_o = []; ct_k = []
    m_rows = []
    for mi, m in enumerate(msgs):
        t0 = len(tok); tok.extend(wid(w) for w in m['words'])
        e0 = len(A['ex_label']); g0 = len(g_rows)
        for li, ty, bw, bt, terms in m['acts']:
            A['ex_msg'].append(mi); A['ex_label'].append(li); A['ex_type'].append(ty)
            A['ex_bw'].append(bw); A['ex_bt'].append(bt); A['ex_tstart'].append(len(ex_p)); A['ex_nt'].append(len(terms))
            for pt, a, off, k in terms: ex_p.append(pt); ex_a.append(a); ex_o.append(off); ex_k.append(k)
        for kind, bw, bt, cl in m['groups']:
            g_rows.append((mi, kind, bw, bt, len(c_rows), len(cl)))
            for gold, terms in cl:
                c_rows.append((gold, len(ct_p), len(terms)))
                for pt, a, off, k in terms: ct_p.append(pt); ct_a.append(a); ct_o.append(off); ct_k.append(k)
        m_rows.append((t0, len(m['words']), e0, len(A['ex_label']) - e0, g0, len(g_rows) - g0))
    R = {k: np.array(v, np.int32) for k, v in A.items()}
    R['tok'] = np.array(tok, np.int32)
    R['term_part'] = np.array(ex_p, np.int8); R['term_atom'] = np.array(ex_a, np.int32)
    R['term_off'] = np.array(ex_o, np.int8); R['term_tok'] = np.array(ex_k, np.int16)
    R['msg'] = np.array(m_rows, np.int32).reshape(-1, 6)
    R['grp'] = np.array(g_rows, np.int32).reshape(-1, 6)
    R['cand'] = np.array(c_rows, np.int32).reshape(-1, 3)
    R['cterm_part'] = np.array(ct_p, np.int8); R['cterm_atom'] = np.array(ct_a, np.int32)
    R['cterm_off'] = np.array(ct_o, np.int8); R['cterm_tok'] = np.array(ct_k, np.int16)
    R['origin'] = np.array([{'spacy': 0, 'agreement': 1, 'judge': 2, 'written': 3, 'general': 4, 'plausible': 5}[m['origin']] for m in msgs], np.int8)
    return R


def main():
    src, prefix = sys.argv[1], sys.argv[2]
    args = sys.argv[3:]
    workers = int(args[args.index('--workers') + 1]) if '--workers' in args else 18
    maxw = int(args[args.index('--max-words') + 1]) if '--max-words' in args else 10 ** 9
    view = int(args[args.index('--view') + 1]) if '--view' in args else 1
    lines = [l for l in open(src)]
    chunks = [lines[i:i + 1000] for i in range(0, len(lines), 1000)]
    import functools
    from train import concat
    labels = {}      # the set's own move-label list, in order of first appearance; ex_label indexes it (meta.json 'labels')
    allowed = collections.Counter(); bad = collections.Counter(); packs = collections.defaultdict(list); words = collections.defaultdict(list)
    n = 0
    with Pool(workers) as pool:
        for lab, out, b, al in pool.imap(functools.partial(work, view=view), chunks):
            inv = {i: l for l, i in lab.items()}
            for l in lab:
                if l not in labels: labels[l] = len(labels)
            for m in out:
                for j, a in enumerate(m['acts']): m['acts'][j] = (labels[inv[a[0]]],) + a[1:]
            bad.update(b); allowed.update(al); n += len(out)
            for split in sorted({m['split'] for m in out}):
                sel = [m for m in out if m['split'] == split and len(m['words']) <= maxw]
                if not sel: continue
                R = pack(sel, lambda w: 0, None); R['words'] = [m['words'] for m in sel]
                packs[split].append(R); words[split].extend(R['words'])
    meta = {'view': view, 'labels': sorted(labels, key=labels.get), 'bad': bad, 'messages': n,
            'allowed': {f'{t}|{l}': c for (t, l), c in allowed.items()}}
    for split in sorted(packs):
        if not packs[split]: continue
        R = concat(packs[split]); W = R.pop('words')
        R['tok'] = np.array([0], np.int32)
        np.savez(prefix + '.' + split + '.npz', **R)
        with open(prefix + '.' + split + '.words.json', 'w') as f: json.dump(W, f)
        meta[split] = {'messages': len(W), 'acts': int(len(R['ex_label'])), 'groups': int(len(R['grp'])), 'terms': int(len(R['term_part']))}
        del R, W
    json.dump(meta, open(prefix + '.meta.json', 'w'), indent=1)
    print(json.dumps({k: v for k, v in meta.items() if k != 'allowed' and k != 'labels'}), len(labels), 'labels')


if __name__ == '__main__':
    main()
