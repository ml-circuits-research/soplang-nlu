"""Equivalence of two analyses of one message (accepted vs rejected circuit in the registry snapshot), with the
representation of m1star.py (type atom at the holder). Two scores:
  message star:  sim(m_A, m_B)                          (depth-biased: a deep difference barely moves the top star)
  aligned wires: 2 * |wires of A with an identical item in B| / (|A| + |B|), items I(Y) = Z^(a_Y) (x) c(Y)
                 (atlas-to-atlas matching; every wire counts once, whatever its depth)
Reported against the number of differing core lines: Spearman, and the partial Spearman controlling for the number
of wires (the mean of the two circuits).
Usage: python equiv2.py pairs.json [D]"""
import json, sys, numpy as np
sys.argv, args = ['x'], sys.argv
exec(open(__file__.replace('equiv2.py', 'm1star.py')).read().replace("if __name__ == '__main__':\n    main()", ""))
pairs = json.load(open(args[1])); D = int(args[2]) if len(args) > 2 else 1024
S = Space(D)
rank = lambda x: np.argsort(np.argsort(x)).astype(float)
def partial(x, y, z):
    rx, ry, rz = rank(x), rank(y), rank(z)
    r = np.corrcoef([rx, ry, rz]); rxy, rxz, ryz = r[0, 1], r[0, 2], r[1, 2]
    return (rxy - rxz * ryz) / np.sqrt((1 - rxz ** 2) * (1 - ryz ** 2))
top, wires, diff, nw = [], [], [], []
for p in pairs:
    try:
        ta, sa = encode(S, p['acc']); tb, sb = encode(S, p['rej'])
    except RecursionError:
        continue
    ia = np.stack([S.Z(w['a']) * s for w, s in zip(p['acc']['wires'], sa)])
    ib = np.stack([S.Z(w['a']) * s for w, s in zip(p['rej']['wires'], sb)])
    sim = (ia @ np.conj(ib).T).real / D
    matched = int((sim.max(1) > 0.999).sum())
    top.append(float(np.real(np.vdot(ta, tb)) / D)); wires.append(2 * matched / (len(ia) + len(ib)))
    diff.append(p['diff']); nw.append((len(ia) + len(ib)) / 2)
top, wires, diff, nw = map(np.array, (top, wires, diff, nw))
print(f'D={D} pairs {len(top)}')
for name, v in (('message star', top), ('aligned wires', wires)):
    rho = np.corrcoef(rank(v), rank(diff))[0, 1]
    print(f'  {name}: Spearman with differing core lines {rho:.3f}; partial, controlling for the number of wires {partial(v, diff, nw):.3f}; '
          f'Spearman with the number of wires {np.corrcoef(rank(v), rank(nw))[0, 1]:.3f}')
    for lo, hi in [(1, 2), (3, 4), (5, 8), (9, 1000)]:
        m = (diff >= lo) & (diff <= hi)
        if m.any(): print(f'    differing lines {lo}-{hi}: n={m.sum()} median {np.median(v[m]):.3f}')
