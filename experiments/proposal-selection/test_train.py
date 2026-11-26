import gzip
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import train


class ProposalRankerTest(unittest.TestCase):
    def test_weights_and_selection(self):
        short = {'candidates': [{'features':[0], 'accepted':False}]}
        long = {'candidates': [
            {'features':[1], 'accepted':True}, {'features':[1], 'accepted':True},
            {'features':[1], 'accepted':False}
        ]}
        items = list(train.training_items([short, long]))
        self.assertEqual(items[0][2], 1)
        self.assertAlmostEqual(sum(weight for _,_,weight in items[1:]), 1)
        only_candidate = {'features':[0], 'similarity':[1], 'accepted':False}
        policy = {'maxCandidates':3, 'minScore':.9, 'maxSimilarity':.8}
        self.assertEqual(train.select([only_candidate], [.01], policy), [0])
        self.assertEqual(train.select([], [], policy), [])
        candidates = [
            {'similarity':[1,.95,.3,.3],'accepted':True},
            {'similarity':[.95,1,.3,.3],'accepted':True},
            {'similarity':[.3,.3,1,.3],'accepted':False},
            {'similarity':[.3,.3,.3,1],'accepted':True},
        ]
        scores = [.98,.98,.96,.85]
        self.assertEqual(train.select(candidates,scores,policy), [0,2])
        metric = train.evaluate(
            [{'id':'mixed','candidates':candidates},{'id':'empty','candidates':[]}],
            [scores,[]],policy)
        self.assertEqual(metric['counts'], {'ALL':0,'SOME':1,'NONE':1})
        self.assertEqual(metric['averageCandidates'], 1)

    def test_tree_uses_float32_splits(self):
        estimator = {'type':'gradient_boosting','baseScore':0,'learningRate':.1,'trees':[{
            'feature':[0,-2,-2], 'threshold':[.1,-2,-2],
            'left':[1,-1,-1], 'right':[2,-1,-1], 'value':[0,1,-1]
        }]}
        self.assertEqual(train.raw_score(estimator,[.1]),-.1)
        self.assertEqual(train.raw_score(estimator,[.09]),.1)

    def test_fit_freezes_model_and_scores_separate_diagnostic(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            names = root/'features.json'
            names.write_text('["role-evidence","unknown-mass"]')
            train_path = self.make_rows(root,'train',500)
            val_path = self.make_rows(root,'validation',100)
            model_path = root/'model.json'
            report_path = root/'validation-report.json'
            command = [sys.executable,str(Path(train.__file__).resolve())]
            fitted = subprocess.run(command+['fit',str(train_path),str(val_path),str(names),str(model_path),
                                              '--report',str(report_path)],check=True,capture_output=True,text=True)
            model_text = model_path.read_text()
            artifact = json.loads(model_text)
            self.assertEqual(artifact['format'],train.FORMAT)
            self.assertEqual(artifact['training']['rows'],500)
            self.assertEqual(artifact['selection']['validationCohort']['rows'],100)
            self.assertEqual(json.loads(fitted.stdout)['selection']['validation']['anyPercent'],90)
            self.assertEqual(json.loads(report_path.read_text())['selection']['validation']['counts']['ALL'],90)
            diagnosed = self.make_rows(root,'diagnostic',20)
            scored = subprocess.run(command+['score',str(model_path),str(diagnosed)],
                                    check=True,capture_output=True,text=True)
            self.assertEqual(json.loads(scored.stdout)['summary']['counts'],{'ALL':18,'SOME':0,'NONE':2})
            self.assertEqual(model_path.read_text(),model_text)
            forbidden = subprocess.run(command+['fit',str(train_path),str(diagnosed),str(names),str(root/'wrong.json')],
                                      capture_output=True,text=True)
            self.assertNotEqual(forbidden.returncode,0)
            self.assertIn('only validation rows',forbidden.stderr)
            self.assertFalse((root/'wrong.json').exists())

    @staticmethod
    def make_rows(root, split, count):
        file = root/(split+'.jsonl.gz')
        with gzip.open(file,'wt',encoding='utf8') as output:
            for i in range(count):
                positive = {'sop':'@c nlu.clause form=fragment','features':[1,0],
                            'accepted':True,'similarity':[1,.15,.25]}
                negative = {'sop':'@c nlu.clause form=declarative','features':[-1,1],
                            'accepted':False,'similarity':[.15,1,.3]}
                unrelated = {'sop':'@c nlu.clause form=imperative','features':[-.9,.7],
                             'accepted':False,'similarity':[.25,.3,1]}
                candidates = [] if i%10 == 0 else [positive,negative,unrelated]
                output.write(json.dumps({'id':f'{split}-{i}','split':split,'candidates':candidates})+'\n')
        return file


if __name__ == '__main__':
    unittest.main()
