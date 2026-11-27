# Standard Gaussian capacity estimate for FHRR bundles (real part of the normalized inner product):
# a stored term reads 1 + N(0,(N-1)/(2D)); each other candidate N(0, N/(2D)); cleanup over M candidates.
import numpy as np
import torch, math
class norm:
    pdf = staticmethod(lambda x: np.exp(-x*x/2)/math.sqrt(2*math.pi))
    cdf = staticmethod(lambda x: 0.5*(1+torch.erf(torch.tensor(np.asarray(x)/math.sqrt(2), dtype=torch.float64)).numpy()))
def p_word(N, D, M, top=1.0, energy=1.0):
    s = np.sqrt(N*energy/(2*D)); x = np.linspace(-8, 8, 4001); w = norm.pdf(x)*(x[1]-x[0])
    return float(np.sum(w*norm.cdf((top + s*x)/s)**(M-1)))
def n_max(D, M, eps):
    # largest N with per-item error below eps
    lo = 1
    for N in range(1, 2000):
        if 1-p_word(N, D, M) <= eps: lo = N
        else: break
    return lo
print('message exact (gold, one term per word), M=(n+1)*L')
for L in (198, 50):
    for D in (1024, 2048, 4096):
        row = []
        for n in (10, 25, 40, 50, 67):
            pw = p_word(n, D, (n+1)*L); row.append(f'n={n}: {pw**n:.3f}')
        print(f'  L={L} D={D}:', '  '.join(row))
print('largest bundle N with per-item error <= 1e-3, cleanup over M=2000 / 10000:')
for D in (1024, 2048, 4096):
    print(f'  D={D}:', n_max(D, 2000, 1e-3), n_max(D, 10000, 1e-3))
# learned (soft) addresses: the top candidate's coefficient is a product of three probabilities w*pi*tau;
# the noise floor is set by the summed energy of all addresses. Smallest top coefficient that still beats
# the zero-coefficient candidates with per-word error 1e-3:
print('smallest readable top coefficient (per-word error 1e-3), energy per address 0.3 / 1.0:')
for D in (2048, 4096):
    row = []
    for n in (10, 25, 40, 67):
        M = (n+1)*50
        for e in (0.3, 1.0):
            c = next(c for c in np.linspace(0.02, 1.5, 300) if 1-p_word(n, D, M, top=c, energy=e) <= 1e-3)
            row.append(f'n={n},E={e}: {c:.2f}')
    print(f'  D={D}:', '  '.join(row))
