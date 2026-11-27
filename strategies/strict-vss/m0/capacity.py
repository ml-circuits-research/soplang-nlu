# Oracle capacity check for strict-vss: compile each gold tree into one FHRR state
#   S = sum_k f(w_k) * z^k * rho(y^{h_k}) * Att(a_k) * rho2(Tag(t_k))
# and read every word back by unbinding its token code and exhaustive cleanup over
# (head position or root) x attachment x tag. Measures the loss due to superposition alone.
import json, sys, math, random, time
import torch

torch.manual_seed(0); random.seed(0)
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
trees = json.load(open(sys.argv[1]))
Ds = [int(x) for x in sys.argv[2].split(',')]
# sample: every message of >= 25 words, plus a random 3000 others
long_ = [t for t in trees if len(t['w']) >= 25]
short = [t for t in trees if len(t['w']) < 25]
sample = long_ + random.sample(short, 3000)
def split(label):
    if ':' in label:
        a, t = label.split(':', 1); return a, (t or 'nominal')
    return label, 'none'
atts = sorted({split(l)[0] for t in trees for l in t['l']})
tags = sorted({split(l)[1] for t in trees for l in t['l']})
print('attachments', len(atts), 'tags', len(tags), 'messages', len(sample), 'long', len(long_), 'device', dev)

def phasor(n, D, g):
    return torch.exp(1j * (torch.rand(n, D, generator=g, device=dev) * 2 - 1) * math.pi)

for D in Ds:
    g = torch.Generator(device=dev); g.manual_seed(1)
    perm = torch.randperm(D, generator=g, device=dev); perm2 = perm[perm]
    rho = lambda v: v[..., perm]; rho2 = lambda v: v[..., perm2]
    vocab = {}
    zphase = (torch.rand(D, generator=g, device=dev) * 2 - 1) * math.pi
    yphase = (torch.rand(D, generator=g, device=dev) * 2 - 1) * math.pi
    Att = phasor(len(atts), D, g); Tag = phasor(len(tags), D, g); Root = phasor(1, D, g)[0]
    LAB = (Att[:, None, :] * rho2(Tag)[None, :, :]).reshape(-1, D)       # all attachment x tag pairs
    ok_words = tot_words = ok_msgs = 0
    by_len = {}
    t0 = time.time()
    for t in sample:
        n = len(t['w'])
        for w in t['w']:
            if w not in vocab: vocab[w] = len(vocab)
        F = torch.exp(1j * (torch.rand(n, D, generator=g, device=dev) * 2 - 1) * math.pi)  # identities (random per token type is equivalent for this test)
        pos = torch.arange(n, device=dev, dtype=torch.float32)
        Z = torch.exp(1j * pos[:, None] * zphase[None, :])
        Y = torch.exp(1j * pos[:, None] * yphase[None, :])
        HEAD = torch.cat([rho(Y), Root[None, :]], 0)                       # candidate heads: words, then root
        tok = F * Z
        h = torch.tensor([x if x >= 0 else n for x in t['h']], device=dev)
        lab = torch.tensor([atts.index(split(l)[0]) * len(tags) + tags.index(split(l)[1]) for l in t['l']], device=dev)
        S = (tok * HEAD[h] * LAB[lab]).sum(0)
        U = S[None, :] * tok.conj()                                          # n x D
        V = U[:, None, :] * LAB.conj()[None, :, :]                           # n x L x D
        scores = (V @ HEAD.conj().T).real / D                                # n x L x (n+1)
        idx = torch.arange(n, device=dev)
        scores[idx, :, idx] = -1e9                                           # a word is not its own head
        flat = scores.reshape(n, -1).argmax(1)
        ph, pl = flat % (n + 1), flat // (n + 1)
        good = ((ph == h) & (pl == lab)).sum().item()
        ok_words += good; tot_words += n; ok_msgs += int(good == n)
        b = '<10' if n < 10 else '10-24' if n < 25 else '25-39' if n < 40 else '40+'
        s = by_len.setdefault(b, [0, 0]); s[0] += int(good == n); s[1] += 1
    print(f'D={D}: words {ok_words}/{tot_words} = {ok_words/tot_words:.5f}; messages exact {ok_msgs}/{len(sample)} = {ok_msgs/len(sample):.4f};',
          'by length', {k: f'{v[0]}/{v[1]}' for k, v in sorted(by_len.items())}, f'{time.time()-t0:.1f}s')
