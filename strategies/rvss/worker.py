"""rvss worker: one JSON line in ({id, words, gaps}), one JSON line out ({id, nodes, readback, ms_pilot, ms_readback}
or {id, error}). Runs on the CPU with numpy (one thread); the model is model.pt from train.py.
  python worker.py --model <dir>
"""
import os, sys, json, time
os.environ.setdefault('OMP_NUM_THREADS', '1'); os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'model'))


def main():
    a = sys.argv[1:]
    model = a[a.index('--model') + 1]
    from decode import Pilot
    P = Pilot(model)
    P.read(['warm', 'up'], ['', '', ''])
    print(json.dumps({'ready': True, 'device': 'cpu', 'model': model, 'kind': P.kind}), flush=True)
    for line in sys.stdin:
        req = json.loads(line)
        try:
            r = P.read(req['words'], req['gaps'])
            out = {'id': req['id'], 'nodes': r['nodes'], 'readback': r['readback'], 'forced': r['forced'],
                   'ms_pilot': r['ms_pilot'], 'ms_readback': r['ms_readback']}
        except Exception as e:
            out = {'id': req['id'], 'error': 'no circuit: ' + str(e)[:200]}
        print(json.dumps(out), flush=True)


if __name__ == '__main__':
    main()
