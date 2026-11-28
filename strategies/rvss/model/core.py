"""rvss pilot core: the state of open constellations, the moves (as oracle2.mjs replay executes them),
the decision views as terms, legality, and the fixed stars.

A view is a list of terms (part, atom, offset, token): the model binds the atom's fixed star with the
smooth position code Z_s^offset and with the learned kind star of the token (or nothing when token = -1),
and bundles the terms of each part. The control model reads the same terms as symbolic features.
"""
import hashlib
import numpy as np

PARTS = ['word', 'cur', 'parent', 'aside', 'last', 'hist', 'stack', 'cand']
P_WORD, P_CUR, P_PAR, P_ASIDE, P_LAST, P_HIST, P_STACK, P_CAND = range(8)
NOFF = 99          # "no position" marker for a term
VIEW = {'version': 1}   # 2: window -3..+4 in the word part, the grandparent's opener in the stack part
OFFCLIP = 12


def seeded(s, D):
    seed = int.from_bytes(hashlib.sha256(s.encode()).digest()[:8], 'little')
    return np.exp(1j * np.random.default_rng(seed).uniform(-np.pi, np.pi, D)).astype(np.complex64)


def phase(x):
    a = np.abs(x)
    return np.where(a > 1e-9, x / np.maximum(a, 1e-9), 1).astype(np.complex64)


class Stars:
    """Fixed stars: word stars from the form and letter trigrams (as m1star.py), atom stars, smooth positions."""
    def __init__(self, D):
        self.D = D
        self.cache, self.tri, self.atoms = {}, {}, {}
        rng = np.random.default_rng(20261127)
        self.phi_s = rng.normal(0, 0.5, D).astype(np.float32)          # smooth position code Z_s
        self.perm = rng.permutation(D)

    def trigram(self, t):
        v = self.tri.get(t)
        if v is None: v = self.tri[t] = seeded('sop-stars-v1:tri:' + t, self.D)
        return v

    def f(self, w):
        v = self.cache.get(w)
        if v is not None: return v
        g = '#' + w + '#'
        tri = [g[i:i + 3] for i in range(max(1, len(g) - 2))]
        v = seeded('sop-stars-v1:id:' + w, self.D) + sum(self.trigram(t) for t in tri) / np.sqrt(len(tri))
        v = self.cache[w] = phase(v)
        return v

    def atom(self, a):
        v = self.atoms.get(a)
        if v is None: v = self.atoms[a] = seeded('rvss-atom:' + a, self.D)
        return v


class Node:
    __slots__ = ('h', 't', 'o', 'words', 'atoms', 'refs', 'parent', 'key', 'status', 'children', 'first')
    def __init__(self, h, t, o):
        self.h, self.t, self.o = h, t, o
        self.words, self.atoms, self.refs, self.children = [], [], [], []
        self.parent, self.key, self.status, self.first = None, None, 'open', None


class Entry:
    __slots__ = ('h', 'held', 'at')
    def __init__(self, h, at):
        self.h, self.held, self.at = h, [], at


def gap_atom(g):
    if not g: return ''
    return g[:3]


class State:
    def __init__(self, words, gaps):
        self.words, self.gaps = words, gaps
        self.n = len(words)
        self.nodes = {}
        self.M = Node('M', 'M', 0)
        self.stack = [Entry('M', None)]
        self.p = 0
        self.hist = []
        self.last_closed = None
        self.since_place = 0
        self.closed_now = set()      # stars closed since the last placed word: not reopened in the same run of moves

    def clone(self):
        S = State.__new__(State)
        S.words, S.gaps, S.n, S.p = self.words, self.gaps, self.n, self.p
        def cp(nd):
            x = Node(nd.h, nd.t, nd.o); x.words = list(nd.words); x.atoms = list(nd.atoms); x.refs = list(nd.refs)
            x.children = list(nd.children); x.parent, x.key, x.status, x.first = nd.parent, nd.key, nd.status, nd.first
            return x
        S.nodes = {h: cp(nd) for h, nd in self.nodes.items()}; S.M = cp(self.M)
        S.stack = []
        for E in self.stack:
            e = Entry(E.h, E.at); e.held = list(E.held); S.stack.append(e)
        S.hist = list(self.hist); S.last_closed = self.last_closed; S.since_place = self.since_place; S.closed_now = set(self.closed_now)
        return S

    # ---- helpers
    def node(self, h):
        return self.M if h == 'M' else self.nodes[h]

    def top(self):
        return self.stack[-1]

    def opener(self, nd):
        """the token that shows a constellation: its first own word, else its first child's, else where it opened"""
        if nd.first is not None: return nd.first
        best = None
        for c in nd.children:
            q = self.opener(self.nodes[c])
            if q is not None and (best is None or q < best): best = q
        return best if best is not None else min(nd.o, self.n - 1)

    def detach(self, h):
        nd = self.nodes[h]
        if nd.parent is not None:
            self.node(nd.parent).children.remove(h); nd.parent = None; nd.key = None; return
        for E in self.stack:
            if h in E.held: E.held.remove(h); return
        raise ValueError('star %s not found' % h)

    def attach(self, h, parent, key):
        nd = self.nodes[h]; nd.parent = parent; nd.key = key; self.node(parent).children.append(h)

    # ---- the moves (as replay in oracle2.mjs)
    def apply(self, m):
        op = m['op']
        if op == 'open':
            h = m['h']; self.nodes[h] = Node(h, m['t'], self.p); self.stack.append(Entry(h, m['at']))
        elif op == 'coord':
            h = m['h']; self.nodes[h] = Node(h, 'coordination', self.p); self.stack.append(Entry(h, m['at']))
            for g in m['gather']: self.detach(g); self.attach(g, h, 'conjunct')
        elif op == 'claim':
            self.detach(m['item']); self.attach(m['item'], self.top().h, m['key'])
        elif op == 'place':
            nd = self.node(self.top().h); nd.words.append((self.p, m['key']))
            if nd.first is None: nd.first = self.p
            self.p += 1; self.since_place = -1; self.closed_now = set()
        elif op == 'close':
            e = self.stack.pop()
            if e.held: raise ValueError('closed with held items')
            nd = self.nodes[e.h]; nd.atoms = [list(a) for a in m['atoms']]; nd.status = 'closed'; self.last_closed = e.h; self.closed_now.add(e.h)
            if e.at == 'held': self.top().held.append(e.h)
            else: self.attach(e.h, self.top().h, e.at)
        elif op == 'reopen':
            for h in m['chain']:
                nd = self.nodes[h]; key = nd.key; self.detach(h); nd.status = 'open'; self.stack.append(Entry(h, key))
        elif op == 'point':
            self.node(self.top().h).refs.append((m['key'], m['target']))
        self.hist.append(label_of(m))
        self.since_place += 1

    def done(self):
        return self.p == self.n and len(self.stack) == 1 and not self.stack[0].held

    # ---- candidates for the choices among stars
    def held_items(self):
        out = []
        for d, E in enumerate(reversed(self.stack)):
            for h in E.held: out.append((h, d, 'held'))
        return out

    def closed_reachable(self):
        """closed stars hanging (through closed holders) from an open constellation: what reopen can unfold
        (not through a star closed since the last placed word)"""
        out = []
        for d, E in enumerate(reversed(self.stack)):
            todo = list(self.node(E.h).children)
            while todo:
                c = todo.pop(); nd = self.nodes[c]
                if nd.status == 'closed' and c not in self.closed_now:
                    out.append((c, d, 'child')); todo.extend(nd.children)
        return out

    def chain_to(self, target):
        chain = []; x = target
        open_ids = {E.h for E in self.stack}
        while x not in open_ids:
            chain.insert(0, x); x = self.nodes[x].parent
            if x is None: return None
        return chain

    def gather_cands(self):
        out = []
        for d, E in enumerate(reversed(self.stack)):
            X = self.node(E.h)
            for c in X.children:
                if self.nodes[c].status == 'closed' and not (X.t == 'coordination' and self.nodes[c].key == 'conjunct'): out.append((c, d, 'child'))
            for h in E.held: out.append((h, d, 'held'))
        return out

    def point_cands(self):
        th = self.top().h
        return [(h, 0, 'any') for h in self.nodes if h != th]

    # ---- the view
    def view(self):
        T = []; p, n = self.p, self.n
        add = T.append
        def off(q):
            return max(-OFFCLIP, min(OFFCLIP, p - q))
        for d in ((-2, -1, 0, 1, 2) if VIEW['version'] == 1 else (-3, -2, -1, 0, 1, 2, 3, 4)):
            q = p + d
            if 0 <= q < n: add((P_WORD, 'w%d' % d, NOFF, q))
            else: add((P_WORD, 'w%d:none' % d, NOFF, -1))
        if p < n:
            add((P_WORD, 'gap-before:' + gap_atom(self.gaps[p]), NOFF, -1))
            add((P_WORD, 'gap-after:' + gap_atom(self.gaps[p + 1]), NOFF, -1))
            add((P_WORD, 'pos:%d' % min(p, 6), NOFF, -1))
            add((P_WORD, 'left:%d' % min(n - p, 6), NOFF, -1))
        else:
            add((P_WORD, 'end', NOFF, -1)); add((P_WORD, 'gap-end:' + gap_atom(self.gaps[n]), NOFF, -1))
        E = self.top(); X = self.node(E.h)
        self._wire(T, P_CUR, E, X, off, full=True)
        if len(self.stack) > 1:
            E2 = self.stack[-2]; self._wire(T, P_PAR, E2, self.node(E2.h), off, full=False)
        else: add((P_PAR, 'none', NOFF, -1))
        held = self.held_items()
        for h, d, _ in held[:6]:
            nd = self.nodes[h]; add((P_ASIDE, 'held:%s:%d' % (nd.t, min(d, 3)), off(self.opener(nd)), self.opener(nd)))
        add((P_ASIDE, 'nheld:%d' % min(len(held), 4), NOFF, -1))
        if self.last_closed is not None:
            nd = self.nodes[self.last_closed]
            where = 'held' if nd.parent is None else nd.key
            add((P_LAST, 'last:%s:%s' % (nd.t, where), off(self.opener(nd)), self.opener(nd)))
            add((P_LAST, 'last-status:%s' % nd.status, NOFF, -1))
        else: add((P_LAST, 'last:none', NOFF, -1))
        h = self.hist
        add((P_HIST, 'h1:' + (h[-1] if h else '^'), NOFF, -1))
        add((P_HIST, 'h12:' + '|'.join(h[-2:]), NOFF, -1))
        add((P_HIST, 'since:%d' % min(self.since_place, 5), NOFF, -1))
        add((P_STACK, 'depth:%d' % min(len(self.stack), 8), NOFF, -1))
        add((P_STACK, 'stack:' + '/'.join(self.node(e.h).t for e in self.stack[-3:]), NOFF, -1))
        if VIEW['version'] >= 2 and len(self.stack) > 2:
            G = self.node(self.stack[-3].h)
            if G.t != 'M':
                og = self.opener(G); add((P_STACK, 'grand:' + G.t, off(og), og))
                for q, k in G.words[-2:]: add((P_STACK, 'grand-word:' + k, off(q), q))
        return T

    def _wire(self, T, part, E, X, off, full):
        add = T.append
        add((part, 'type:' + X.t, NOFF, -1))
        if X.t == 'M':
            add((part, 'mtops:%d' % min(len(X.children), 3), NOFF, -1)); return
        o = self.opener(X)
        add((part, 'opener:' + X.t, off(o), o))
        add((part, 'at:%s:%s' % (X.t, E.at), NOFF, -1))
        filled = set()
        for q, k in X.words[-6:] if full else X.words[-3:]:
            add((part, 'word:' + k, off(q), q)); filled.add(k)
        for _, k in X.words: filled.add(k)
        for c in X.children[-5:] if full else X.children[-2:]:
            nd = self.nodes[c]; oc = self.opener(nd)
            add((part, 'child:%s:%s' % (nd.key, nd.t), off(oc), oc))
        for c in X.children: filled.add(self.nodes[c].key)
        for k, _ in X.refs: filled.add('ref-' + k)
        for k in sorted(filled): add((part, 'filled:%s:%s' % (X.t, k), NOFF, -1))
        add((part, 'size:%d' % min(len(X.words) + len(X.children), 5), NOFF, -1))
        if E.held: add((part, 'has-held:%d' % min(len(E.held), 3), NOFF, -1))

    def cand_terms(self, kind, h, d, how, extra=''):
        nd = self.nodes[h]; o = self.opener(nd); p = self.p
        offv = max(-OFFCLIP, min(OFFCLIP, p - o))
        T = [(P_CAND, 'c:%s:%s:%s:%s' % (kind, nd.t, how, nd.key if how == 'child' else '-'), offv, o),
             (P_CAND, 'c-depth:%s:%d' % (kind, min(d, 4)), NOFF, -1),
             (P_CAND, 'c-status:%s:%s' % (kind, nd.status), NOFF, -1),
             (P_CAND, 'c-size:%s:%d' % (kind, min(len(nd.words) + len(nd.children), 4)), NOFF, -1)]
        hd = [q for q, k in nd.words if k in ('head', 'verb')]
        if hd: T.append((P_CAND, 'c-head:%s:%s' % (kind, nd.t), max(-OFFCLIP, min(OFFCLIP, p - hd[-1])), hd[-1]))
        if nd.parent is not None:
            par = self.node(nd.parent)
            T.append((P_CAND, 'c-holder:%s:%s:%s' % (kind, par.t, 'open' if par.status == 'open' else 'closed'), NOFF, -1))
        if extra: T.append((P_CAND, 'c-x:%s:%s' % (kind, extra), NOFF, -1))
        return T

    def binders(self):
        """tokens whose kind is bound with the parts cur x word and cand x top"""
        X = self.node(self.top().h)
        return (self.p if self.p < self.n else -1, self.opener(X) if X.t != 'M' else -1)


def label_of(m):
    op = m['op']
    if op == 'place': return 'place:' + m['key']
    if op == 'close': return 'close:' + ','.join('%s=%s' % (k, v) for k, v in m['atoms'])
    if op == 'open': return 'open:%s:%s' % (m['t'], m['at'])
    if op == 'coord': return 'coord:' + m['at']
    if op == 'claim': return 'claim:' + m['key']
    if op == 'reopen': return 'reopen'
    if op == 'point': return 'point:' + m['key']
    raise ValueError(op)


# the schema's constraints (schemas/syntax/schema.sop), declared not VSA: which wire types a reference key takes,
# which keys hold one value, what a wire needs before it closes
REFT = {'subject': {'nominal', 'coordination'}, 'complement': {'nominal', 'coordination'}, 'to': {'clause', 'nominal', 'coordination'},
        'conjunct': {'clause', 'nominal', 'relation'}, 'ellipsis': {'clause'}, 'rel': {'relation', 'coordination'}}
SINGLE_REF = {'subject', 'ellipsis', 'to'}
SINGLE_WORD = {'verb', 'head'}


def compat(key, t):
    return key == 'top' or key == 'held' or t in REFT.get(key, {t})


def ref_filled(S, X):
    return {S.nodes[c].key for c in X.children} | {k for k, _ in X.refs}


def can_place(S, X, key):
    if key not in SINGLE_WORD: return True
    have = [q for q, k in X.words if k == key]
    return not have or (have[-1] == S.p - 1 and X.words[-1][0] == S.p - 1)


def can_close(S, X, lab=''):
    if X.t == 'nominal': return any(k == 'head' for _, k in X.words)
    if X.t == 'relation': return any(S.nodes[c].key == 'to' for c in X.children)
    if X.t == 'coordination':
        cj = [S.nodes[c].t for c in X.children if S.nodes[c].key == 'conjunct']
        return len(cj) >= 2 and len(set(cj)) == 1
    if X.t == 'clause':
        verb = any(k == 'verb' for _, k in X.words); frag = 'form=fragment' in lab
        if verb == frag: return False
        if any(k == 'ellipsis' for k, _ in X.refs) and not frag: return False
    return True


def can_take(S, X, key, t, single=True):
    """can constellation X take a wire of type t at key? (a new constellation may take a filled single key:
    under the adopted conventions a conjunct takes the place of its coordination before the coordination opens)"""
    if not compat(key, t): return False
    if single and key in SINGLE_REF and key in ref_filled(S, X): return False
    return True


def legal(S, vocab, allowed, max_since=12, relax=False):
    """the labels the executor can take now (a boolean mask over vocab.labels)"""
    E = S.top(); X = S.node(E.h); t = X.t; p, n = S.p, S.n
    last = S.hist[-1] if S.hist else '^'
    lastop = last.split(':')[0]
    ok = []
    held_any = any(F.held for F in S.stack)
    content = (len(X.words) + len(X.children)) > 0
    for i, lab in enumerate(vocab):
        op = lab.split(':')[0]
        if lab not in allowed.get(t, ()): ok.append(False); continue
        arg = lab.split(':')
        if op == 'place': r = p < n and t != 'M' and can_place(S, X, arg[1])
        elif op == 'close': r = t != 'M' and not E.held and (relax or (content and can_close(S, X, lab)))
        elif op in ('open', 'coord'):
            r = S.since_place < max_since and (p < n or held_any or op == 'coord')
            if p == n and op == 'open' and not held_any: r = False
            if op == 'coord' and not S.gather_cands(): r = False
            if r and t != 'M':
                at = arg[-1]; nt = arg[1] if op == 'open' else 'coordination'
                if at != 'held' and not can_take(S, X, at, nt, single=False): r = False
        elif op == 'claim': r = lastop in ('open', 'coord', 'claim') and any(can_take(S, X, arg[1], S.nodes[h].t) for h, d, _ in S.held_items() if d > 0)
        elif op == 'point': r = lastop in ('open', 'coord', 'claim', 'point', 'place') and S.since_place < max_since and any(can_take(S, X, arg[1], S.nodes[h].t) for h, _, _ in S.point_cands())
        elif op == 'reopen': r = lastop != 'reopen' and S.since_place < max_since and bool(S.closed_reachable())
        else: r = False
        ok.append(r)
    return ok
