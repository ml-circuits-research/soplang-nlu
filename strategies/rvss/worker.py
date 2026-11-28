"""rvss worker: one JSON line in ({id, words, gaps}), one JSON line out ({id, nodes, readback, ms_pilot, ms_readback}
or {id, error}). Runs on the CPU with numpy (one thread) by default; --device cuda (or SOP_NLU_RVSS_DEVICE=cuda) scores the
VSA model's moves on the GPU with torch (the rest stays numpy). The model is model.pt from train.py.
  python worker.py --model <dir> [--device cpu|cuda]
How the pilot reads (greedy, or a beam scored by fit, DESIGN 10) is <dir>/reading.json when the folder has one:
{"beam": K, "fit": L, "sync": true}; without it the pilot reads greedily.
"""
import os, sys, json, time
os.environ.setdefault('OMP_NUM_THREADS', '1'); os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'model'))


def main():
    a = sys.argv[1:]
    model = a[a.index('--model') + 1]
    device = a[a.index('--device') + 1] if '--device' in a else os.environ.get('SOP_NLU_RVSS_DEVICE', 'cpu')
    from decode import Pilot
    P = Pilot(model, device)
    rd = os.path.join(model, 'reading.json')
    how = json.load(open(rd)) if os.path.exists(rd) else {}
    beam, fit, sync = int(how.get('beam', 1)), float(how.get('fit', 0)), bool(how.get('sync', False))
    P.read(['warm', 'up'], ['', '', ''], 1, [[], []])
    print(json.dumps({'ready': True, 'device': P.device, 'model': model, 'kind': P.kind}), flush=True)
    for line in sys.stdin:
        req = json.loads(line)
        try:
            r = P.read(req['words'], req['gaps'], beam, req.get('stations'), fit=fit, sync=sync)
            out = {'id': req['id'], 'nodes': r['nodes'], 'readback': r['readback'], 'forced': r['forced'],
                   'ms_pilot': r['ms_pilot'], 'ms_readback': r['ms_readback']}
        except Exception as e:
            out = {'id': req['id'], 'error': 'no circuit: ' + str(e)[:200]}
        print(json.dumps(out), flush=True)


if __name__ == '__main__':
    main()
