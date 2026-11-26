"""CPU controls for the residual draft path without a downloaded model."""
import unittest

import torch
from transformers import DistilBertConfig, DistilBertModel

from repair_model import DraftResidual, Vocabulary, is_graph_row


class RepairConditioningTest(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(117)
        torch.set_num_threads(1)
        self.nodes = [
            {"anchor": 0, "type": "nlu.clause", "attrs": [
                {"key": "form", "atom": "imperative"},
                {"key": "predicate", "start": 0, "end": 1},
                {"key": "direct_object", "target": 1},
            ]},
            {"anchor": 1, "type": "nlu.entity", "attrs": [{"key": "head", "start": 1, "end": 2}]},
            {"anchor": 2, "type": "nlu.entity", "attrs": [{"key": "head", "start": 2, "end": 3}]},
        ]
        config = DistilBertConfig(vocab_size=16, n_layers=1, n_heads=2, dim=16, hidden_dim=24)
        self.model = DraftResidual(DistilBertModel(config), Vocabulary.build([{"nodes": self.nodes}]),
                                   hidden=12).eval()
        self.source = tuple(torch.tensor([row]) for row in (
            [1, 2, 3, 4, 5], [1, 1, 1, 1, 1], [-1, 0, 1, 2, -1], [True, True, True]
        ))

    def context(self, nodes):
        return self.model.draft_events([{"draftNodes": nodes}], 3, torch.device("cpu"))

    def test_empty_hint_uses_source_only(self):
        baseline = super(DraftResidual, self.model).encode(self.source)
        empty = self.model.encode((self.source, self.context([])))
        for expected, actual in zip(baseline, empty):
            self.assertTrue(torch.equal(expected, actual))

    def test_ref_target_changes_features_and_backpropagates(self):
        first = self.model.encode((self.source, self.context(self.nodes)))[0]
        changed = [
            {**self.nodes[0], "attrs": [*self.nodes[0]["attrs"][:-1], {"key": "direct_object", "target": 2}]},
            *self.nodes[1:],
        ]
        second = self.model.encode((self.source, self.context(changed)))[0]
        self.assertFalse(torch.allclose(first, second))
        loss = self.model.loss((self.source, self.context(changed)), [{"nodes": self.nodes}])
        loss.backward()
        for parameter in (self.model.events.weight, self.model.gate.weight, self.model.copy_logit):
            self.assertGreater(parameter.grad.abs().sum().item(), 0)

    def test_worker_input_subgraph_checks_utf16_offsets(self):
        row = {"text": "😀x", "tokens": [{"text": "x", "start": 2, "end": 3}], "draftNodes": []}
        self.assertIs(is_graph_row(row), row)
        row["tokens"][0]["start"] = 1
        with self.assertRaises(ValueError):
            is_graph_row(row)


if __name__ == "__main__":
    unittest.main()
