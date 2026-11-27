# Capacity with soft addresses: each word's address = p*correct + (1-p) spread over 3 wrong (head,label) pairs.
import json, sys, math, random, time, torch
torch.manual_seed(0); random.seed(0); dev = 'cuda'
trees = json.load(open(sys.argv[1]))
long_ = [t for t in trees if len(t['w']) >= 25]; short = random.sample([t for t in trees if len(t['w']) < 25], 2000)
sample = long_ + short
split = lambda l: (l.split(':', 1)[0], l.split(':', 1)[1] or 'nominal') if ':' in l else (l, 'none')
atts = sorted({split(l)[0] for t in trees for l in t['l']}); tags = sorted({split(l)[1] for t in trees for l in t['l']})
for D in [int(x) for x in sys.argv[2].split(',')]:
  for p in [0.6, 0.45]:
    g = torch.Generator(device=dev); g.manual_seed(1)
    perm = torch.randperm(D, generator=g, device=dev); perm2 = perm[perm]
    ph = lambda *s: torch.exp(1j * (torch.rand(*s, generator=g, device=dev) * 2 - 1) * math.pi)
    zp = (torch.rand(D, generator=g, device=dev) * 2 - 1) * math.pi; yp = (torch.rand(D, generator=g, device=dev) * 2 - 1) * math.pi
    Att, Tag, Root = ph(len(atts), D), ph(len(tags), D), ph(1, D)[0]
    LAB = (Att[:, None] * Tag[:, perm2][None]).reshape(-1, D); L = LAB.shape[0]
    res = {}; margins = {}
    for t in sample:
      n = len(t['w']); pos = torch.arange(n, device=dev, dtype=torch.float32)
      tok = ph(n, D) * torch.exp(1j * pos[:, None] * zp)
      HEAD = torch.cat([torch.exp(1j * pos[:, None] * yp)[:, perm], Root[None]], 0)
      h = torch.tensor([x if x >= 0 else n for x in t['h']], device=dev)
      lab = torch.tensor([atts.index(split(l)[0]) * len(tags) + tags.index(split(l)[1]) for l in t['l']], device=dev)
      A = p * HEAD[h] * LAB[lab]
      for w in [0.5, 0.3, 0.2]:   # three wrong hypotheses
        A = A + (1 - p) * w * HEAD[torch.randint(0, n + 1, (n,), device=dev)] * LAB[torch.randint(0, L, (n,), device=dev)]
      S = (tok * A).sum(0)
      sc = ((S[None] * tok.conj())[:, None, :] * LAB.conj()[None] @ HEAD.conj().T).real / D
      i = torch.arange(n, device=dev); sc[i, :, i] = -1e9
      flat = sc.reshape(n, -1); best = flat.argmax(1)
      good = ((best % (n + 1) == h) & (best // (n + 1) == lab)).all().item()
      top2 = flat.topk(2, 1).values; m = (top2[:, 0] - top2[:, 1]).min().item()
      b = '<25' if n < 25 else '25-39' if n < 40 else '40+'
      r = res.setdefault(b, [0, 0]); r[0] += good; r[1] += 1; margins.setdefault(b, []).append(m)
    print(f'D={D} p={p}:', {k: f'{v[0]}/{v[1]}' for k, v in sorted(res.items())}, 'median min-margin', {k: round(sorted(v)[len(v)//2], 3) for k, v in sorted(margins.items())})
