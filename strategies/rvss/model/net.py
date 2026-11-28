"""rvss M2b/M2c models over the views of core.py.

VSA model (rvss): kinds are a soft cleanup of a permutation-coded window of fixed word stars against C
learned kind stars (DESIGN 5.7); every term of a view is atom (x) Z_s^offset (x) kind(token); the terms of
each part are bundled; three parts are bound with the kind of the incoming word (cur x word, parent x word,
aside x word); every decision is scored by parts against P learned prototypes per outcome
(score = sum_part u_part (1/beta) log sum_j exp(beta sim(V_part, P_m,part,j)), DESIGN 8.5); a choice
among stars scores each candidate's bundle, bound with the kind of the deciding constellation's opener and
of the incoming word, against learned choice stars (DESIGN 8.6). Phases are the parameters.

Control (logreg): a logistic regression over the same terms as symbolic features (atom, offset, the
lowercased word form and its last three letters), and the same conjunctions with the incoming word.
"""
import math, zlib
import numpy as np
import torch
import torch.nn as nn
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import seeded as seeded_np

NPARTS = 8          # core.PARTS
P_CUR, P_PAR, P_ASIDE, P_CAND = 1, 2, 3, 7
ACT_PARTS = [0, 1, 2, 3, 4, 5, 6]     # bundled parts of an act view
BOUND = [1, 2, 3]                     # parts also bound with the incoming word's kind
NOFF, OFFCLIP = 99, 12


def off_index(off):
    """offset -> row of the Z_s table (2*OFFCLIP+1 is 'no position')"""
    return torch.where(off == NOFF, torch.full_like(off, 2 * OFFCLIP + 1), off.long() + OFFCLIP)


class VSA(nn.Module):
    def __init__(self, nlabels, D=1024, C=64, P=4, atoms=None, wordstars=None, phi_s=None, perm=None, ntypes=5, sit=0):
        super().__init__()
        self.D, self.C, self.P, self.L, self.sit = D, C, P, nlabels, sit
        # fixed stars (not learned): atom stars, word stars, smooth positions, window permutations
        self.register_buffer('atomstars', atoms)                       # (A, D) complex
        self.register_buffer('wordstars', wordstars)                   # (V, D) complex
        offs = torch.arange(-OFFCLIP, OFFCLIP + 1, dtype=torch.float32)
        Zs = torch.polar(torch.ones(len(offs), D), offs[:, None] * phi_s[None, :])
        self.register_buffer('Zs', torch.cat([Zs, torch.ones(1, D, dtype=torch.complex64)]))
        perms = [torch.arange(D)]
        for _ in range(3): perms.append(perm[perms[-1]])
        P_ = {0: perms[0], 1: perms[1], 2: perms[2], 3: perms[3]}
        inv = torch.argsort(perm); ip = [torch.arange(D)]
        for _ in range(3): ip.append(inv[ip[-1]])
        self.register_buffer('rho', torch.stack([ip[3], ip[2], ip[1], P_[0], P_[1], P_[2], P_[3]]))   # d = -3..3
        # learned
        self.lam = nn.Parameter(torch.tensor([0.35, 0.6, 1.0, 2.0, 1.0, 0.6, 0.35]))
        self.K = nn.Parameter(torch.rand(C, D) * 2 * math.pi)
        self.beta_k = nn.Parameter(torch.tensor(30.0))
        nparts = len(ACT_PARTS) + len(BOUND) + (1 if sit else 0)
        if sit:
            # the situation memory (DESIGN 9.1): the whole view, each part bound with a fixed part star, read
            # against `sit` learned situation stars; the attention-weighted value star is one more part
            nb = len(ACT_PARTS) + len(BOUND)
            self.register_buffer('Sk', torch.stack([torch.as_tensor(seeded_np('rvss-part:%d' % j, D)) for j in range(nb)]))
            self.SQ = nn.Parameter(torch.rand(sit, D) * 2 * math.pi); self.SV = nn.Parameter(torch.rand(sit, D) * 2 * math.pi)
            self.beta_s = nn.Parameter(torch.tensor(8.0))
        self.Pr = nn.Parameter(torch.rand(nlabels, nparts, P, D) * 2 * math.pi)
        self.u = nn.Parameter(torch.full((nparts,), 8.0))
        self.beta = nn.Parameter(torch.full((nparts,), 8.0))
        self.bias = nn.Parameter(torch.zeros(nlabels))
        self.G = nn.Parameter(torch.rand(4, 3, P, D) * 2 * math.pi)       # choice stars: kind x (cand, cand x top, cand x word)
        self.ug = nn.Parameter(torch.full((4, 3), 8.0))
        self.betag = nn.Parameter(torch.full((4, 3), 8.0))
        self.biasg = nn.Parameter(torch.zeros(4))

    def phase_params(self):
        return [self.K, self.Pr, self.G] + ([self.SQ, self.SV] if self.sit else [])

    def scalar_params(self):
        return [self.lam, self.beta_k, self.u, self.beta, self.bias, self.ug, self.betag, self.biasg] + ([self.beta_s] if self.sit else [])

    def situation(self, V):
        """V (N, parts, D) -> (N, 1, D)"""
        Vall = (V * self.Sk[None]).sum(1) / math.sqrt(V.shape[1])
        Q = torch.polar(torch.ones_like(self.SQ), self.SQ); Vv = torch.polar(torch.ones_like(self.SV), self.SV)
        a = torch.softmax(self.beta_s * (Vall @ Q.conj().T).real / self.D * math.sqrt(self.D), -1)
        return (a.to(torch.complex64) @ Vv)[:, None]

    def kinds(self, wid, left, right):
        """wid: (T,) word ids; left/right: (T,) how many neighbours exist on each side (window +-3)"""
        x = 0
        for j, d in enumerate(range(-3, 4)):
            ok = (left >= -d) if d < 0 else (right >= d) if d > 0 else torch.ones_like(left, dtype=torch.bool)
            idx = (torch.arange(len(wid), device=wid.device) + d).clamp(0, len(wid) - 1)
            w = self.wordstars[wid[idx]][:, self.rho[j]]
            x = x + self.lam[j] * w * ok[:, None]
        x = x / x.abs().clamp_min(1e-6)
        Kc = torch.polar(torch.ones_like(self.K), self.K)
        sim = (x @ Kc.conj().T).real / self.D
        pi = torch.softmax(self.beta_k * sim, -1)
        kap = pi.to(torch.complex64) @ Kc
        return torch.cat([kap, torch.ones(1, self.D, dtype=kap.dtype, device=kap.device)]), pi   # last row: no token

    def bundle(self, kap, nparts, ex, part, atom, off, tok):
        """terms -> (N, nparts, D) bundles, each divided by sqrt(its number of terms)"""
        tv = self.atomstars[atom] * self.Zs[off_index(off)] * kap[tok]
        N = int(ex.max().item()) + 1 if len(ex) else 0
        V = torch.zeros(N * nparts, self.D, dtype=tv.dtype, device=tv.device)
        flat = ex.long() * nparts + part.long()
        V.index_add_(0, flat, tv)
        cnt = torch.zeros(N * nparts, device=tv.device).index_add_(0, flat, torch.ones(len(flat), device=tv.device))
        V = V / cnt.clamp_min(1).sqrt()[:, None]
        return V.view(N, nparts, self.D)

    def score_parts(self, V, Pr, u, beta):
        """V (N, parts, D); Pr (M, parts, P, D) phases -> (N, M)"""
        Pc = torch.polar(torch.ones_like(Pr), Pr)                       # (M, parts, P, D)
        out = 0
        for j in range(V.shape[1]):
            s = (V[:, j] @ Pc[:, j].reshape(-1, self.D).conj().T).real / self.D * math.sqrt(self.D)   # (N, M*P)
            s = s.view(V.shape[0], Pr.shape[0], -1)
            out = out + u[j] * torch.logsumexp(beta[j] * s, -1) / beta[j]
        return out

    def act_logits(self, kap, ex, part, atom, off, tok, bw, bt):
        V = self.bundle(kap, NPARTS, ex, part, atom, off, tok)[:, ACT_PARTS]
        kw = kap[bw]
        Vb = torch.stack([V[:, b] * kw for b in BOUND], 1)
        Va = torch.cat([V, Vb], 1)
        if self.sit: Va = torch.cat([Va, self.situation(Va)], 1)
        return self.score_parts(Va, self.Pr, self.u, self.beta) + self.bias

    def cand_logits(self, kap, cidx, part, atom, off, tok, kind, bw, bt):
        """cidx: candidate index of each term; kind/bw/bt per candidate -> (Ncand,)"""
        V = self.bundle(kap, NPARTS, cidx, part, atom, off, tok)[:, P_CAND]
        Vs = torch.stack([V, V * kap[bt], V * kap[bw]], 1)               # (N, 3, D)
        Gc = torch.polar(torch.ones_like(self.G), self.G)               # (4, 3, P, D)
        s = torch.einsum('nqd,kqpd->nkqp', Vs, Gc.conj()).real / self.D * math.sqrt(self.D)
        s = s[torch.arange(len(kind), device=kind.device), kind.long()]  # (N, 3, P)
        bg, ug = self.betag[kind], self.ug[kind]
        return (ug * torch.logsumexp(bg[..., None] * s, -1) / bg).sum(-1) + self.biasg[kind]


class LogReg(nn.Module):
    """the non-VSA control: hashed symbolic features of the same terms, linear scores"""
    def __init__(self, nlabels, bits=21, lower_ids=None, suffix_ids=None, triples=False):
        super().__init__()
        self.triples = triples
        self.L, self.bits = nlabels, bits
        self.E = nn.EmbeddingBag(1 << bits, nlabels, mode='sum')
        nn.init.zeros_(self.E.weight)
        self.Ec = nn.EmbeddingBag(1 << bits, 4, mode='sum'); nn.init.zeros_(self.Ec.weight)
        self.bias = nn.Parameter(torch.zeros(nlabels))
        self.register_buffer('lower', lower_ids)     # (V,) word id -> lowercased form id
        self.register_buffer('suffix', suffix_ids)   # (V,) word id -> last-three-letters id

    def feats(self, ex, part, atom, off, tok_wid, bind_wid):
        """per term: (atom,off), (atom,off,word), (atom,word), (atom,suffix); bound parts add (atom,off,incoming word)"""
        m = (1 << self.bits) - 1
        a = atom.long() * 1000003 + part.long() * 7919
        o = off.long() + 50
        lw = torch.where(tok_wid >= 0, self.lower[tok_wid.clamp_min(0)], torch.full_like(tok_wid, -1)).long()
        sf = torch.where(tok_wid >= 0, self.suffix[tok_wid.clamp_min(0)], torch.full_like(tok_wid, -1)).long()
        bwl = torch.where(bind_wid >= 0, self.lower[bind_wid.clamp_min(0)], torch.full_like(bind_wid, -1)).long()
        f = [a * 31 + o, (a * 31 + o) * 1000033 + lw * 17 + 1, a * 1000037 + lw * 13 + 2, a * 1000039 + sf * 11 + 3,
             (a * 31 + o) * 1000081 + bwl * 19 + 4, a * 1000099 + bwl * 23 + 5]
        if self.triples: f.append((a * 1000117 + lw * 29 + 6) * 1000121 + bwl * 31)     # (atom, word, incoming word)
        F = torch.stack([(x * 2654435761 + 97) & m for x in f], 1)       # (T, 6 or 7)
        use = torch.ones_like(F, dtype=torch.bool)
        use[:, 1:4] &= (tok_wid >= 0)[:, None]
        if self.triples: use[:, 6] &= (tok_wid >= 0)
        return F, use

    def act_logits(self, ex, part, atom, off, tok_wid, bind_wid, N):
        F, use = self.feats(ex, part, atom, off, tok_wid, bind_wid)
        exr = ex.long()[:, None].expand_as(F)
        F, exr = F[use], exr[use]
        order = torch.argsort(exr, stable=True)
        F, exr = F[order], exr[order]
        offsets = torch.zeros(N, dtype=torch.long, device=F.device)
        cnt = torch.bincount(exr, minlength=N)
        offsets[1:] = torch.cumsum(cnt, 0)[:-1]
        return self.E(F, offsets) + self.bias

    def cand_logits(self, cidx, part, atom, off, tok_wid, bind_wid, kind, N):
        F, use = self.feats(cidx, part, atom, off, tok_wid, bind_wid)
        exr = cidx.long()[:, None].expand_as(F)
        F, exr = F[use], exr[use]
        order = torch.argsort(exr, stable=True); F, exr = F[order], exr[order]
        offsets = torch.zeros(N, dtype=torch.long, device=F.device)
        cnt = torch.bincount(exr, minlength=N); offsets[1:] = torch.cumsum(cnt, 0)[:-1]
        return self.Ec(F, offsets).gather(1, kind.long()[:, None])[:, 0]
