"""Suspicion score of spaCy's circuit for every message of the batch conversion, calibrated on the judged circuits
of spaCy (registry, benchmark run, conversion runs), then 4 buckets of the messages with no label and a stratified
random audit sample written as judging packets.

  python score.py --stats            fit, cross-validate and print the weights and AUC (writes nothing)
  python score.py --write            also write the scores, the packets and the key

Inputs: the features of features.mjs (.local-data/rvss/silver-audit/features/*.jsonl) and the distilbert comparison
of distil-compare.mjs (.local-data/rvss/silver-audit/distil-compare.jsonl).
A logistic regression with an L2 penalty (Newton's method, numpy only); its penalty is chosen inside each fold
(nested cross-validation), so the AUC reported is the AUC of predictions for circuits the fit never saw.
"""
import glob, json, math, os, random, shutil, sys
for _v in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ.setdefault(_v, '1')
from collections import Counter
import numpy as np

ROOT = '/home/salboaie/work/sopworlds/soplang-nlu/'
LOCAL = ROOT + '.local-data/rvss/silver-audit/'
AUDIT = ROOT + 'eval-results/2026-11-27-silver-audit/'
SEED = '2026-11-27-silver-audit'
PER_BUCKET = 450
PACKET = 150
# bucket boundaries: quantiles of the score among the messages of the sampling frame
CUTS = [0.50, 0.80, 0.95]
# the feature groups used (--no-kinds leaves out the counts of differing core lines by kind)
USE_KINDS = '--no-kinds' not in sys.argv
USE_DB = '--no-distilbert' not in sys.argv

recs = []
for f in sorted(glob.glob(LOCAL + 'features/*.jsonl')):
    with open(f) as fh:
        recs.extend(json.loads(l) for l in fh)
db = {}
if USE_DB and os.path.exists(LOCAL + 'distil-compare.jsonl'):
    with open(LOCAL + 'distil-compare.jsonl') as fh:
        for l in fh:
            r = json.loads(l)
            db[r['id']] = r


def verdict(r):
    """The verdict of spaCy's circuit and where it comes from, or (None, None)."""
    if r.get('bench') == 'exact' and r.get('benchSpacySame') == 1 and r.get('benchLevelOfSpacy'):
        level = r['benchLevelOfSpacy']
        if level != 'waiting':
            return ('accepted' if level in ('L8', 'L9', 'L10') else 'rejected'), 'benchmark level ' + level
    reg = r.get('reg')
    if reg and reg.get('judge') != 'agreement':
        return reg['verdict'], 'registry'
    if r.get('benchRun'):
        return r['benchRun']['verdict'], 'benchmark run'
    if r.get('run'):
        return r['run']['verdict'], 'conversion run'
    return None, None


def g(d, k, default=0):
    return d.get(k, default) if d else default


AREAS = sorted({r['area'] for r in recs})
SUBS = sorted({r['area'] + '/' + r['sub'] for r in recs})
# the kinds of differing core lines (features.mjs lineKind)
KINDS = ['head', 'dependent', 'verb', 'marker', 'conjunction', 'modifier-like', 'form', 'clause-tie', 'relation-to', 'relation-from', 'coordination']


def features(r):
    t, s, c, os_ = r['t'], r.get('s') or {}, r.get('cmp') or {}, r.get('os') or {}
    words = max(1, t['words'])
    hmm, spd, sp2 = c.get('hmm') or {}, c.get('spd') or {}, c.get('sp2') or {}
    old = [c.get(k) or {} for k in ('hmm2', 'hmm1')]
    d = db.get(r['id'])
    clean = d is not None and d.get('v') and not d.get('trained')
    x = {
        # disagreement with other strategies (the 'variants' agreement key, the core, a Jaccard distance of core lines)
        'differs from hmm-rules (variants key)': 1 - g(hmm, 'var', 0),
        'differs from hmm-rules (core)': 1 - g(hmm, 'core', 0),
        'distance to hmm-rules (core lines)': g(hmm, 'dist', 1.0),
        'distance to hmm-rules (relaxed core lines)': g(hmm, 'rdist', 1.0),
        'differs from both earlier hmm-rules runs': 1 - max(g(o, 'var', 0) for o in old),
        'differs from spacy-direct (variants key)': 1 - g(spd, 'var', 0),
        'distance to spacy-direct': g(spd, 'dist', 1.0),
        'spaCy circuit changed since the earlier run': 1 - g(sp2, 'core', 0),
        'distance to the earlier spaCy circuit': g(sp2, 'dist', 0.0),
        # None when distilbert saw the message in training or did not run on it: centred and 0 below
        'differs from distilbert (variants key)': (1 - g(d, 'var', 0)) if clean else None,
        'distance to distilbert': g(d, 'dist', 1.0) if clean else None,
        # the text
        'log words': math.log(1 + t['words']),
        'commas': t['commas'], 'most commas in one sentence': t['maxCommas'], 'longest comma list': t['longestList'],
        'sentences': t['sentences'], 'question mark': t['question'], 'quotes': min(1, t['quotes']), 'brackets': min(1, t['parens']),
        'colon or semicolon': min(1, t['colons']), 'slash': min(1, t['slashes']), 'words with digits': t['digits'] / words,
        'capitalised words inside': t['capsMid'] / words, 'all-caps words': min(1, t['allCaps']), 'non-ASCII': min(1, t['nonAscii']),
        'starts lower-case': t['lowerStart'], 'no final punctuation': t['noFinalPunct'],
        'and': t['fw_and'], 'or': t['fw_or'], 'but': t['fw_but'], 'then': t['fw_then'], 'so': t['fw_so'],
        'if/when/while/because/after/before/until/unless': sum(t['fw_' + w] for w in ('if', 'when', 'while', 'because', 'after', 'before', 'until', 'unless')),
        'that/which/who/where': sum(t['fw_' + w] for w in ('that', 'which', 'who', 'where')),
        'with': t['fw_with'], 'of': t['fw_of'], 'to': t['fw_to'],
        # spaCy's circuit
        'clauses': g(s, 'clauses'), 'coordinations': g(s, 'coords'), 'coordinations of clauses': g(s, 'clauseCoords'),
        'most conjuncts': g(s, 'maxConjuncts'), 'relations per word': g(s, 'relations') / words, 'nominals per word': g(s, 'nominals') / words,
        'ambiguous attachments': g(s, 'ambiguous'), 'relations without marker': g(s, 'relNoMarker'), 'relations from a nominal': g(s, 'relFromNominal'),
        'subjects': g(s, 'subjects'), 'ellipsis': g(s, 'ellipsis'), 'discourse words': g(s, 'discourse'), 'negations': g(s, 'negation'),
        'fragment clauses': g(s, 'fragment'), 'interrogative clauses': g(s, 'interrogative'), 'declarative clauses': g(s, 'declarative'),
        'other clause forms': g(s, 'otherForm'), 'words in no wire': g(s, 'uncovered'), 'heads of several words': g(s, 'multiHead'),
        'most dependents of a nominal': g(s, 'maxDeps'),
        # spaCy's circuit against hmm-rules' circuit
        'clauses differ from hmm-rules': abs(g(s, 'clauses') - g(os_, 'clauses', g(s, 'clauses'))),
        'relations differ from hmm-rules': abs(g(s, 'relations') - g(os_, 'relations', g(s, 'relations'))),
        'nominals differ from hmm-rules': abs(g(s, 'nominals') - g(os_, 'nominals', g(s, 'nominals'))),
        'coordinations differ from hmm-rules': abs(g(s, 'coords') - g(os_, 'coords', g(s, 'coords'))),
        'log ms of spaCy': math.log(max(1.0, r.get('ms') or 1.0)),
    }
    if USE_KINDS:
        for k in KINDS:
            x[f'hmm-rules differs: {k} lines'] = g(hmm.get('kinds'), k, 0)
            x[f'distilbert differs: {k} lines'] = g(d.get('kinds'), k, 0) if clean else None
    # the area and its part (calendar/meetings is the base)
    for sub in SUBS[1:]:
        x['area ' + sub] = int(r['area'] + '/' + r['sub'] == sub)
    return x


def auc(y, p):
    y, p = np.asarray(y), np.asarray(p)
    pos, neg = p[y == 1], p[y == 0]
    if len(pos) == 0 or len(neg) == 0:
        return float('nan')
    allp = np.concatenate([pos, neg])
    order = np.argsort(allp, kind='mergesort')
    sorted_p = allp[order]
    r = np.arange(1, len(allp) + 1, dtype=float)
    i = 0
    while i < len(sorted_p):  # mid-ranks for ties
        j = i
        while j + 1 < len(sorted_p) and sorted_p[j + 1] == sorted_p[i]:
            j += 1
        r[i:j + 1] = (i + j + 2) / 2
        i = j + 1
    ranks = np.empty(len(allp))
    ranks[order] = r
    return (ranks[:len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg))


def fit(X, y, lam, iters=50):
    n, p = X.shape
    Xb = np.hstack([np.ones((n, 1)), X])
    w = np.zeros(p + 1)
    w[0] = math.log((y.mean() + 1e-6) / (1 - y.mean() + 1e-6))
    pen = np.full(p + 1, lam)
    pen[0] = 0
    for _ in range(iters):
        mu = 1 / (1 + np.exp(-np.clip(Xb @ w, -30, 30)))
        grad = Xb.T @ (mu - y) + pen * w
        H = (Xb * (mu * (1 - mu))[:, None]).T @ Xb + np.diag(pen + 1e-9)
        step = np.linalg.solve(H, grad)
        w -= step
        if np.abs(step).max() < 1e-8:
            break
    return w


def predict(w, X):
    return 1 / (1 + np.exp(-np.clip(w[0] + X @ w[1:], -30, 30)))


def folds(y, k, rng):
    idx_pos = [i for i in range(len(y)) if y[i] == 1]
    idx_neg = [i for i in range(len(y)) if y[i] == 0]
    rng.shuffle(idx_pos)
    rng.shuffle(idx_neg)
    f = [[] for _ in range(k)]
    for j, i in enumerate(idx_pos + idx_neg):
        f[j % k].append(i)
    return f


LAMBDAS = [10, 30, 100, 300, 1000, 3000]


def choose_lambda(X, y, rng, focus):
    """The penalty with the best 4-fold AUC on the `focus` circuits (those differing from hmm-rules)."""
    best, best_auc = None, -1
    fs = folds(y, 4, rng)
    for lam in LAMBDAS:
        pred = np.zeros(len(y))
        for k in range(4):
            test = np.array(fs[k])
            train = np.array([i for j in range(4) if j != k for i in fs[j]])
            w = fit(X[train], y[train], lam)
            pred[test] = predict(w, X[test])
        a = auc(y[focus], pred[focus]) if focus.sum() else auc(y, pred)
        if a > best_auc:
            best, best_auc = lam, a
    return best


def nested_cv(X, y, focus, repeats=5, k=5, seed=1):
    """Out-of-fold predictions of every repeat; the penalty chosen inside every training part."""
    preds = np.zeros((repeats, len(y)))
    chosen = []
    for rep in range(repeats):
        rng = random.Random(seed * 1000 + rep)
        fs = folds(y, k, rng)
        for j in range(k):
            test = np.array(fs[j])
            train = np.array([i for m in range(k) if m != j for i in fs[m]])
            lam = choose_lambda(X[train], y[train], rng, focus[train])
            chosen.append(lam)
            w = fit(X[train], y[train], lam)
            preds[rep, test] = predict(w, X[test])
    return preds, chosen


def bootstrap_auc(y, p, rng, n=1000):
    y, p = np.asarray(y), np.asarray(p)
    if y.sum() == 0 or y.sum() == len(y):
        return None
    out = []
    for _ in range(n):
        s = rng.integers(0, len(y), len(y))
        out.append(auc(y[s], p[s]))
    out = np.array([a for a in out if not math.isnan(a)])
    return round(float(np.percentile(out, 2.5)), 3), round(float(np.percentile(out, 97.5)), 3)


def main():
    write = '--write' in sys.argv
    rows = [r for r in recs if r['valid']]
    for r in rows:
        r['_x'] = features(r)
        r['_y'], r['_src'] = verdict(r)
    names = list(rows[0]['_x'].keys())
    cal = [r for r in rows if r['_y']]
    # distilbert: centred on the calibration circuits where it is an independent signal, 0 where it is missing
    for name in [n for n in names if 'distilbert' in n]:
        vals = [r['_x'][name] for r in cal if r['_x'][name] is not None]
        m = float(np.mean(vals)) if vals else 0.0
        for r in rows:
            r['_x'][name] = 0.0 if r['_x'][name] is None else r['_x'][name] - m
    X = np.array([[r['_x'][n] for n in names] for r in cal], dtype=float)
    y = np.array([1.0 if r['_y'] == 'rejected' else 0.0 for r in cal])
    mean, sd = X.mean(0), X.std(0)
    sd[sd == 0] = 1
    Z = (X - mean) / sd
    disagree = np.array([r['_x']['differs from hmm-rules (variants key)'] == 1 for r in cal])
    bench = np.array([r.get('bench') == 'exact' for r in cal])
    dbclean = np.array([(db.get(r['id']) or {}).get('v') == 1 and not (db.get(r['id']) or {}).get('trained') for r in cal])
    dataset = os.popen('git -C /home/salboaie/work/sopworlds/webmeet-dataset rev-parse --short HEAD').read().strip()
    print('dataset commit', dataset, '| features:', len(names), '| kinds', USE_KINDS, '| distilbert', USE_DB)
    print('messages', len(recs), 'valid spaCy circuits', len(rows))
    print('calibration circuits', len(cal), 'rejected', int(y.sum()), 'sources', dict(Counter(r['_src'] for r in cal)))
    print('  of them differing from hmm-rules (variants key):', int(disagree.sum()), 'rejected', int(y[disagree].sum()),
          '| benchmark messages:', int(bench.sum()), 'rejected', int(y[bench].sum()), '| distilbert independent:', int(dbclean.sum()), 'rejected', int(y[dbclean].sum()),
          '| distilbert independent and differing from hmm-rules:', int((dbclean & disagree).sum()), 'rejected', int(y[dbclean & disagree].sum()))

    # univariate signals
    uni = []
    for j, n in enumerate(names):
        sub = dbclean if 'distilbert' in n else np.ones(len(y), bool)
        uni.append((n, auc(y[sub], X[sub, j]), auc(y[sub & disagree], X[sub & disagree, j])))
    print('\nunivariate AUC (all calibration | within differs-from-hmm-rules); distilbert rows: only where it is independent')
    for n, a, b in sorted(uni, key=lambda t: -abs((t[2] if not math.isnan(t[2]) else 0.5) - 0.5)):
        print(f'  {n:52s} {a:.3f} | {b:.3f}')
    print('\nrejection rate by binary signal (value 1 vs 0)')
    for j, n in enumerate(names):
        col = X[:, j]
        sub = dbclean if 'distilbert' in n else np.ones(len(y), bool)
        if not sub.any() or len(np.unique(col[sub])) != 2:
            continue
        hi = (col > col[sub].min() + 1e-9) & sub
        lo = sub & ~hi

        def rate(m):
            return f'{int(y[m].sum())}/{int(m.sum())} = {100 * y[m].mean():.1f}%' if m.sum() else '-'
        print(f'  {n:52s} 1: {rate(hi):22s} 0: {rate(lo):22s} | within differs-from-hmm 1: {rate(hi & disagree):22s} 0: {rate(lo & disagree)}')

    # nested cross-validation
    preds, chosen = nested_cv(Z, y, disagree)
    pm = preds.mean(0)
    rng = np.random.default_rng(7)
    both = disagree & bench
    rep = lambda m: [auc(y[m], preds[k][m]) for k in range(len(preds))]
    print('\nnested 5-fold CV, 5 repeats; penalties chosen:', dict(Counter(chosen)))
    for label, m in (('all calibration circuits', np.ones(len(y), bool)), ('differing from hmm-rules', disagree), ('benchmark messages', bench),
                     ('benchmark messages differing from hmm-rules', both), ('distilbert independent, differing from hmm-rules', dbclean & disagree)):
        a = rep(m)
        print(f'  AUC {label:50s} {np.mean(a):.3f} (repeats {min(a):.3f}-{max(a):.3f}); bootstrap 95% CI {bootstrap_auc(y[m], pm[m], rng)}; n={int(m.sum())}, rejected {int(y[m].sum())}')
    # the same without distilbert, and a few signals alone, for comparison
    for label, keep in (('without the distilbert signals', [j for j, n in enumerate(names) if 'distilbert' not in n]),
                        ('distilbert signals and hmm-rules only', [j for j, n in enumerate(names) if 'distilbert' in n or 'hmm-rules' in n]),
                        ('four signals: hmm-rules key, distilbert key, distance to hmm-rules, log words',
                         [names.index(n) for n in ('differs from hmm-rules (variants key)', 'differs from distilbert (variants key)', 'distance to hmm-rules (relaxed core lines)', 'log words')])):
        p2, _ = nested_cv(Z[:, keep], y, disagree, repeats=3)
        p2m = p2.mean(0)
        print(f'  {label}: AUC all {auc(y, p2m):.3f}, differing from hmm-rules {auc(y[disagree], p2m[disagree]):.3f}, benchmark differing {auc(y[both], p2m[both]):.3f},'
              f' distilbert independent differing {auc(y[dbclean & disagree], p2m[dbclean & disagree]):.3f}')

    # final fit on all calibration circuits
    lam = choose_lambda(Z, y, random.Random(99), disagree)
    w = fit(Z, y, lam)
    print(f'\nfinal fit: penalty {lam}; intercept {w[0]:.3f}; weights per standard deviation of the calibration circuits (per unit = weight / sd):')
    weights = sorted(zip(names, w[1:], sd), key=lambda t: -abs(t[1]))
    for n, wt, s in weights:
        print(f'  {n:52s} {wt:+.3f}   per unit {wt / s:+.3f}')

    # scores of every valid message
    Xall = np.array([[r['_x'][n] for n in names] for r in rows], dtype=float)
    pall = predict(w, (Xall - mean) / sd)
    for r, p in zip(rows, pall):
        r['_p'] = float(p)
    unlabelled = [r for r in rows if not r['label']]
    frame = [r for r in unlabelled if r.get('bench') is None and r['_y'] is None]
    cut_values = [float(v) for v in np.quantile([r['_p'] for r in frame], CUTS)]

    def bucket(p):
        return 1 + sum(p > c for c in cut_values)
    for r in rows:
        r['_b'] = bucket(r['_p'])
    print('\nbucket boundaries (predicted probability of rejection, quantiles', CUTS, 'of the frame):', [round(c, 4) for c in cut_values])
    print('messages with no label (valid spaCy circuit):', len(unlabelled), '| sampling frame (no benchmark message or near-copy, no verdict on the circuit yet):', len(frame))
    print('  frame: distilbert ran', sum(1 for r in frame if r['id'] in db), 'independent', sum(1 for r in frame if (db.get(r['id']) or {}).get('v') and not (db.get(r['id']) or {}).get('trained')),
          '| differs from hmm-rules', sum(1 for r in frame if r['_x']['differs from hmm-rules (variants key)'] == 1))
    for b in (1, 2, 3, 4):
        fb = [r for r in frame if r['_b'] == b]
        ub = [r for r in unlabelled if r['_b'] == b]
        print(f'  bucket {b}: {len(ub)} with no label, {len(fb)} in the frame; mean predicted rejection {np.mean([r["_p"] for r in fb]):.3f}; areas {dict(Counter(r["area"] for r in fb))}')
    print('  calibration circuits differing from hmm-rules, by the bucket of their out-of-fold prediction (averaged over repeats):')
    for b in (1, 2, 3, 4):
        m = np.array([bucket(p) == b for p in pm]) & disagree
        mb = m & bench
        print(f'    bucket {b}: {int(y[m].sum())}/{int(m.sum())} rejected' + (f' = {100 * y[m].mean():.1f}%' if m.sum() else '')
              + f'; benchmark messages {int(y[mb].sum())}/{int(mb.sum())}' + (f' = {100 * y[mb].mean():.1f}%' if mb.sum() else ''))

    if not write:
        return
    with open(LOCAL + 'scores.jsonl', 'w') as fh:
        for r in rows:
            fh.write(json.dumps({'id': r['id'], 'text': r['text'], 'score': round(r['_p'], 6), 'bucket': r['_b'], 'labelled': bool(r['label']),
                                 'bench': r.get('bench'), 'verdict': r['_y'], 'inFrame': (not r['label']) and r.get('bench') is None and r['_y'] is None},
                                ensure_ascii=False) + '\n')
    # stratified random sample: PER_BUCKET per bucket, the order mixed, numbered from 1
    rng2 = random.Random(SEED)
    sample = []
    for b in (1, 2, 3, 4):
        fb = sorted([r for r in frame if r['_b'] == b], key=lambda r: r['id'])
        sample += [(b, r) for r in rng2.sample(fb, min(PER_BUCKET, len(fb)))]
    rng2.shuffle(sample)
    os.makedirs(AUDIT + 'judging', exist_ok=True)
    os.makedirs(AUDIT + 'key', exist_ok=True)
    cores = load_cores([r for _, r in sample])
    items = []
    for n, (b, r) in enumerate(sample, 1):
        items.append({'n': n, 'packet': (n - 1) // PACKET + 1, 'text': r['text'], 'sop': r['sop'], 'core': cores[r['id']], 'sources': ['spacy'],
                      'id': r['id'], 'file': r['id'].split('#')[0], 'folder': r['folder'], 'bucket': b, 'score': round(r['_p'], 6)})
    packets = (len(items) - 1) // PACKET + 1
    for k in range(1, packets + 1):
        with open(AUDIT + f'judging/packet-{k}.jsonl', 'w') as fh:
            for it in items[(k - 1) * PACKET:k * PACKET]:
                fh.write(json.dumps({'n': it['n'], 'text': it['text'], 'sop': it['sop']}, ensure_ascii=False) + '\n')
    with open(AUDIT + 'key/items.jsonl', 'w') as fh:
        for it in items:
            fh.write(json.dumps(it, ensure_ascii=False) + '\n')
    shutil.copyfile(ROOT + 'tests/benchmark/syntax/rules.md', AUDIT + 'judging/RULES.md')
    shutil.copyfile(ROOT + 'eval-results/2026-11-27-syntax-benchmark-random/judging/check.mjs', AUDIT + 'judging/check.mjs')
    summary = {
        'dataset': dataset, 'seed': SEED, 'perBucket': PER_BUCKET, 'packetSize': PACKET, 'packets': packets, 'cuts': CUTS, 'boundaries': cut_values,
        'messages': len(recs), 'validSpacy': len(rows), 'unlabelled': len(unlabelled), 'frame': len(frame),
        'buckets': {str(b): {'unlabelled': sum(r['_b'] == b for r in unlabelled), 'frame': sum(r['_b'] == b for r in frame),
                             'sampled': sum(it['bucket'] == b for it in items),
                             'meanPredicted': float(np.mean([r['_p'] for r in frame if r['_b'] == b]))} for b in (1, 2, 3, 4)},
        'model': {'penalty': lam, 'intercept': float(w[0]),
                  'weights': {n: {'perSd': float(wt), 'sd': float(s), 'mean': float(mean[names.index(n)])} for n, wt, s in weights}},
        'calibration': {'circuits': len(cal), 'rejected': int(y.sum()), 'differing': int(disagree.sum()), 'differingRejected': int(y[disagree].sum()),
                        'aucNested': float(np.mean(rep(np.ones(len(y), bool)))), 'aucNestedDiffering': float(np.mean(rep(disagree))),
                        'aucNestedBenchmark': float(np.mean(rep(bench)))},
    }
    with open(AUDIT + 'key/summary.json', 'w') as fh:
        json.dump(summary, fh, indent=1)
    print('\nwrote', len(items), 'items in', packets, 'packets to', AUDIT)


def load_cores(rows):
    """The core of each sampled circuit, from lib.mjs normalForm (through node); the circuit must be in normal form."""
    tmp = LOCAL + 'sample-for-cores.jsonl'
    with open(tmp, 'w') as fh:
        for r in rows:
            fh.write(json.dumps({'id': r['id'], 'text': r['text'], 'sop': r['sop']}) + '\n')
    script = LOCAL + 'cores.mjs'
    with open(script, 'w') as fh:
        fh.write("import {readFileSync} from 'node:fs'\n"
                 "const {normalForm} = await import('" + ROOT + "tests/benchmark/syntax/lib.mjs')\n"
                 "for (const l of readFileSync(process.argv[2], 'utf8').split('\\n').filter(Boolean)) {\n"
                 "  const r = JSON.parse(l), nf = normalForm(r.text, r.sop)\n"
                 "  if (!nf || nf.sop !== r.sop) throw new Error('not a normal form: ' + r.id)\n"
                 "  console.log(JSON.stringify({id: r.id, core: nf.core}))\n}\n")
    out = os.popen(f'node {script} {tmp}').read()
    cores = {}
    for l in out.splitlines():
        if l.strip():
            o = json.loads(l)
            cores[o['id']] = o['core']
    missing = [r['id'] for r in rows if r['id'] not in cores]
    if missing:
        raise SystemExit(f'no core for {len(missing)} sampled circuits, first {missing[:3]}')
    return cores


if __name__ == '__main__':
    main()
