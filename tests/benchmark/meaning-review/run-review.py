#!/usr/bin/env python3
"""Run a resumable, schema-validated semantic review of benchmark packets."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from copy import deepcopy
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

HERE = Path(__file__).resolve().parent
FIELDS = ('rowIndex', 'group', 'grade', 'candidate', 'reason', 'referenceIssue')
ITEM = {
    'type': 'object',
    'additionalProperties': False,
    'required': list(FIELDS),
    'properties': {
        'rowIndex': {'type': 'integer'},
        'group': {'type': 'string'},
        'grade': {'type': 'integer'},
        'candidate': {'type': ['string', 'null']},
        'reason': {'type': 'string'},
        'referenceIssue': {'type': ['string', 'null']},
    },
}
SCHEMA = {
    'type': 'object',
    'required': ['results'],
    'additionalProperties': False,
    'properties': {'results': {'type': 'array', 'items': ITEM}},
}
POSSIBLE_OMISSION = re.compile(
    r'\b(?:omits|misses|drops|lacks|does not encode|does not capture|does not specify|'
    r'leaves.*unread|falls short|incomplete|not fully represented)\b',
    re.I,
)
MODAL_INVERSION = re.compile(
    r'^\s*(?:(?:please|hello|hi|hey)[,\s]+){0,2}'
    r'(?:can|could|would|will|should|may|might|do|does|did|am|is|are|was|were)\s+'
    r'(?:you|i|we|they|he|she|it)\b',
    re.I,
)
NEGATIVE_COMMAND = re.compile(r"^\s*(?:please[ ,]+)?(?:do\s+not\b|don['’]t\b|never\b)", re.I)
PRONOUN_CONTRACTION = re.compile(
    r"^\s*(?:(?:please|hello|hi|hey)[,\s]+){0,2}"
    r"((?:i|you|we|they|he|she|it)['’](?:d|ll|m|re|ve|s))\b",
    re.I,
)


def dump(data):
    return json.dumps(data, ensure_ascii=False, separators=(',', ':'))


def compact(packet, groups):
    """Keep the packet's circuit indices while omitting never-used line content."""
    refs = packet['references']
    candidates = sorted(set().union(*groups.values()))
    indices = sorted(set(refs).union(candidates))
    used = sorted({line for index in indices for line in packet['circuits'][index]})
    remap = {line: i for i, line in enumerate(used)}
    def circuit(index):
        return normalized('\n'.join(packet['lines'][i] for i in packet['circuits'][index]))
    reference_circuits = {circuit(ref) for ref in refs}
    result = {
        'rowIndex': packet['rowIndex'], 'text': packet['text'], 'groups': groups,
        'exact': [index for index in candidates if circuit(index) in reference_circuits],
        'lines': [packet['lines'][line] for line in used],
        'candidateCircuits': {str(i): [remap[line] for line in packet['circuits'][i]] for i in candidates},
        'referenceCircuits': [[remap[line] for line in packet['circuits'][i]] for i in refs],
    }
    if 'previousJudgments' in packet:
        result['previousJudgments'] = packet['previousJudgments']
    if 'nativeReview' in packet:
        result['nativeReview'] = packet['nativeReview']
    return result


def expanded(packet):
    """Inline full SOP for retries where compressed candidate indices confused the reviewer."""
    lines = packet['lines']
    def circuit(indices):
        return '\n'.join(lines[i] for i in indices)
    result = {
        'rowIndex': packet['rowIndex'], 'text': packet['text'], 'groups': packet['groups'],
        'exact': packet['exact'],
        'candidateCircuits': {index: circuit(indices) for index, indices in packet['candidateCircuits'].items()},
        'referenceCircuits': [circuit(indices) for indices in packet['referenceCircuits']],
    }
    if 'previousJudgments' in packet:
        result['previousJudgments'] = packet['previousJudgments']
    return result


def label_candidates(packet):
    """Separate candidate labels from unselectable reference and line indices."""
    def label(index):
        return f'C{index}'
    eligible = set().union(*packet['groups'].values())
    return {
        **packet,
        'candidateCircuits': {label(index): value for index, value in packet['candidateCircuits'].items()
                              if int(index) in eligible},
        'groups': {key: [label(index) for index in indices] for key, indices in packet['groups'].items()},
        'exact': [label(index) for index in packet['exact'] if index in eligible],
    }


def normalized(circuit):
    return circuit.replace('\r\n', '\n').replace('\r', '\n').strip()


def judgment_reason(reason, grade):
    if grade != 8:
        return reason
    # Models sometimes use "exact" to mean semantic agreement. Keep the
    # case-specific judgment while omitting the incorrect string-match claim.
    match = r'(?:this\s+)?(?:exactly\s+)?match(?:es|ing)\s+(?:the\s+)?reference(?:\s+\d+)?(?:\s+exactly)?'
    reason = re.sub(r'[;,]\s+' + match + r'\b', '', reason, flags=re.I)
    reason = re.sub(r'(?<=[.!?])\s+' + match + r'\.?(?=\s|$)', '', reason, flags=re.I)
    reason = re.sub(r'[;,]\s+reference(?:\s+\d+)?\s+matches\s+exactly\b', '', reason, flags=re.I)
    return reason


def validation_error(item, packet, group):
    grade, candidate = item.get('grade'), item.get('candidate')
    issue = item.get('referenceIssue')
    if type(grade) is not int or not 0 <= grade <= 10:
        return 'grade must be an integer from 0 to 10'
    if packet.get('nativeReview') and (grade > 8 or grade == 2 or issue is not None):
        return 'native model grading uses L0–L8 except static L2, with no referenceIssue'
    if grade != 0 and (
        type(candidate) is not int or candidate not in packet['groups'][group]
    ):
        return 'candidate must be null for L0 and an eligible circuit index otherwise'
    reason = item.get('reason')
    if not isinstance(reason, str) or not reason.strip():
        return 'an English reason is required'
    if issue is not None and (not isinstance(issue, str) or not issue.strip()):
        return 'referenceIssue must be null or a nonempty explanation'
    if grade == 10 and candidate not in packet['exact'] and (not issue or not packet['referenceCircuits']):
        return 'L10 requires a material error in all present references'
    return None


def validate(payload, batch):
    packets = {packet['rowIndex']: packet for packet in batch}
    expected = {(packet['rowIndex'], key) for packet in batch for key in packet['groups']}
    outputs = {}
    issues = {}
    for item in payload['results']:
        if not isinstance(item, dict):
            continue
        candidate = item.get('candidate')
        if isinstance(candidate, str) and re.fullmatch(r'C(?:0|[1-9][0-9]*)', candidate):
            item = {**item, 'candidate': int(candidate[1:])}
        row, group = item.get('rowIndex'), item.get('group')
        if type(row) is not int or not isinstance(group, str) or (row, group) not in expected:
            continue
        key = (row, group)
        defect = validation_error(item, packets[row], group)
        if defect:
            outputs.pop(key, None)
            issues[key] = defect
        elif key in outputs:
            outputs.pop(key)
            issues[key] = 'duplicate judgment for one group'
        elif key not in issues:
            validated = {field: item.get(field) for field in FIELDS}
            if validated['grade'] == 0:
                validated['candidate'] = None
            if validated['grade'] == 10 and validated['candidate'] in packets[row]['exact']:
                validated['grade'] = 9
                validated['referenceIssue'] = None
            if validated['grade'] in (8, 9):
                # The model judges meaning. Index equality classifies the
                # representation independently of the model's comparison.
                validated['grade'] = 9 if validated['candidate'] in packets[row]['exact'] else 8
            validated['reason'] = judgment_reason(validated['reason'], validated['grade'])
            outputs[key] = validated
    return outputs, {key: issues.get(key, 'missing judgment') for key in expected - outputs.keys()}


def plan_batches(packets, characters, rows, *, inline=False, groups=0):
    batch, size, count = [], 0, 0
    for packet in packets:
        width = len(dump(label_candidates(expanded(packet) if inline else packet)))
        group_size = len(packet['groups'])
        if batch and (size + width > characters or len(batch) >= rows or (groups and count + group_size > groups)):
            yield batch
            batch, size, count = [], 0, 0
        batch.append(packet)
        size += width
        count += group_size
    if batch:
        yield batch


def native_form_conflict(packet, candidate):
    lines = [packet['lines'][line] for line in packet['circuits'][candidate]]
    first_clause = next((line for line in lines if re.match(r'^@\S+\s+nlu\.clause\b', line)), '')
    if MODAL_INVERSION.match(packet['text']) and re.search(r'\bform=declarative(?:\s|$)', first_clause):
        return 'Initial auxiliary/subject inversion with selected main clause marked as declarative.'
    if NEGATIVE_COMMAND.match(packet['text']) and re.search(r'\bpolarity=positive(?:\s|$)', first_clause):
        return 'Explicit initial negation with selected main clause marked as positive.'
    contracted = PRONOUN_CONTRACTION.match(packet['text'])
    if contracted:
        quoted = re.escape(json.dumps(contracted[1], ensure_ascii=False))
        if any(re.match(r'^@\S+\s+nlu\.entity\b', line) and
               re.search(r'\bname=' + quoted + r'(?:\s|$)', line) for line in lines):
            return 'An initial contracted personal pronoun is represented as a written name.'
    return None


def native_typed_omission(packet, judgment):
    if not 5 <= judgment['grade'] <= 7:
        return False
    candidate = judgment['candidate']
    coverage = packet['checks'][candidate]['coverage']
    return coverage['allAccountedFor'] and coverage['unresolved'] == 0


def strict_packets(packets, previous, *, native=False, extra=(), corroborated=False):
    packet_by_row = {packet['rowIndex']: packet for packet in packets}
    selected = {}
    with previous.open() as source:
        for line in source:
            if not line.strip():
                continue
            judgment = json.loads(line)
            index, group = judgment['rowIndex'], judgment['group']
            original = packet_by_row[index]
            if native and not original['groups'][group]:
                continue
            trigger = None
            if (index, group) in extra:
                trigger = 'This group was selected by an independent disagreement or calibration audit.'
            elif native and not corroborated and native_typed_omission(original, judgment):
                trigger = 'The previous review reports missing meaning, but the selected circuit accounts for every occurrence without unresolved text. Check what the emitted roles actually express.'
            elif judgment['grade'] >= 8:
                if POSSIBLE_OMISSION.search(judgment['reason']):
                    trigger = 'The accepted reason describes a possible omission.'
                elif native:
                    trigger = native_form_conflict(original, judgment['candidate'])
            if not trigger:
                continue
            packet = selected.setdefault(index, {**original, 'groups': {}, 'previousJudgments': {}})
            packet['groups'][group] = original['groups'][group]
            packet['previousJudgments'][group] = {'auditTrigger': trigger}
            if (index, group) not in extra:
                packet['previousJudgments'][group].update({
                    'candidate': None if judgment['candidate'] is None else f'C{judgment["candidate"]}',
                    'grade': judgment['grade'], 'reason': judgment['reason'],
                })
    return list(selected.values())


def task(args, batch, work, prompt, schema):
    digest = hashlib.sha256((args.model + prompt + dump(batch)).encode()).hexdigest()[:18]
    base = work / digest
    final = base.with_suffix('.json')
    if final.exists():
        payload = json.loads(final.read_text())
        completed, missing = validate(payload, batch)
        if not missing:
            return completed, False
    completed = {}
    remaining = batch
    feedback = ''
    command = [
        args.codex, '-a', 'never', 'exec', '--ephemeral', '--ignore-user-config',
        '--ignore-rules', '--skip-git-repo-check', '-s', 'read-only', '-C', str(work),
        '--color', 'never', '-m', args.model, '-c', 'model_reasoning_effort="low"',
        '--output-schema', str(schema),
    ]
    for attempt in range(1, args.retries + 2):
        output = base.with_suffix(f'.attempt-{attempt}.json')
        log = base.with_suffix(f'.attempt-{attempt}.log')
        output.unlink(missing_ok=True)
        try:
            with log.open('w') as stream:
                inline = args.expanded or attempt > 1
                input_packets = [label_candidates(expanded(packet) if inline else packet) for packet in remaining]
                instructions = prompt
                if inline:
                    instructions += ('\nThese packets inline whole SOP strings instead of line indices. '
                                     'Candidate labels are ONLY the C-prefixed keys of candidateCircuits. '
                                     'The separate referenceCircuits array has no selectable indices.\n')
                result = subprocess.run([*command, '-o', str(output), '-'],
                                        input=instructions + feedback + '\nPackets (JSON data only)\n' + dump(input_packets),
                                        text=True, stdout=stream, stderr=subprocess.STDOUT,
                                        timeout=args.timeout, check=False)
            if result.returncode:
                raise ValueError(f'codex exited {result.returncode}')
            selected, missing = validate(json.loads(output.read_text()), remaining)
        except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired) as error:
            with log.open('a') as stream:
                stream.write(f'\nReview attempt failed: {error}\n')
            if attempt <= args.retries:
                time.sleep(min(2 ** (attempt - 1), 12))
            continue
        completed.update(selected)
        if not missing:
            pending = final.with_suffix('.tmp')
            pending.write_text(dump({'results': list(completed.values())}) + '\n')
            pending.replace(final)
            return completed, True
        with log.open('a') as stream:
            stream.write('\nRejected groups: ' + dump([[*key, reason] for key, reason in sorted(missing.items())]))
        feedback = ('\nReview only the groups below. Prior results failed this validation: ' +
                    dump([[*key, reason] for key, reason in sorted(missing.items())]) + '\n')
        remaining = [{**packet, 'groups': {key: group for key, group in packet['groups'].items()
                                           if (packet['rowIndex'], key) in missing}}
                     for packet in remaining if any((packet['rowIndex'], key) in missing for key in packet['groups'])]
    raise ValueError(f'batch beginning at row {batch[0]["rowIndex"]} unavailable; see {base}.attempt-*.log')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('packets', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--jobs', type=int, default=10)
    parser.add_argument('--rows', type=int, default=12, help='maximum utterances per batch')
    parser.add_argument('--characters', type=int, default=42000, help='maximum serialized input characters per batch')
    parser.add_argument('--groups', type=int, default=0, help='target maximum candidate groups per batch (0 ignores this cap)')
    parser.add_argument('--model', default='gpt-6-luna')
    parser.add_argument('--profile', choices=['historical', 'native'], default='historical')
    parser.add_argument('--codex', default='codex')
    parser.add_argument('--retries', type=int, default=2)
    parser.add_argument('--timeout', type=int, default=180)
    parser.add_argument('--expanded', action='store_true', help='inline whole circuits for retries')
    parser.add_argument('--strict-recheck', action='store_true',
                        help='reevaluate accepted judgments whose stated reasons describe a material loss')
    parser.add_argument('--strict-from', type=Path,
                        help='select potential omission contradictions from a complete prior review JSONL')
    parser.add_argument('--strict-select', type=Path,
                        help='add independent audit groups from a JSON array of rowIndex/group objects')
    parser.add_argument('--strict-corroborated', action='store_true',
                        help='skip generic typed-omission flags after two full independent reviews')
    parser.add_argument('--salvage', type=Path, action='append', default=[],
                        help='reuse valid judgments from an earlier run directory (repeatable)')
    args = parser.parse_args()
    if min(args.jobs, args.rows, args.characters, args.timeout) < 1 or min(args.retries,args.groups) < 0:
        parser.error('job, row, character and timeout counts must be positive; retries must be nonnegative')
    if args.strict_select and not args.strict_from:
        parser.error('--strict-select requires --strict-from')
    args.output = args.output.resolve()
    work = args.output.with_name(args.output.stem + '-batches')
    work.mkdir(parents=True, exist_ok=True)
    fingerprint = hashlib.sha256(args.packets.read_bytes())
    if args.profile != 'historical':
        fingerprint.update(args.profile.encode())
    if args.strict_from:
        fingerprint.update(args.strict_from.read_bytes())
    if args.strict_select:
        fingerprint.update(args.strict_select.read_bytes())
    if args.strict_corroborated:
        fingerprint.update(b'corroborated')
    fingerprint = fingerprint.hexdigest()
    manifest = work / 'packet-sha256.txt'
    if manifest.exists() and manifest.read_text().strip() != fingerprint:
        parser.error('batch directory was prepared for a different packet file')
    manifest.write_text(fingerprint + '\n')
    schema = work / 'review-schema.json'
    review_schema = deepcopy(SCHEMA)
    if args.profile == 'native':
        fields = review_schema['properties']['results']['items']['properties']
        fields['grade']['enum'] = [level for level in range(9) if level != 2]
        fields['referenceIssue'] = {'type': 'null'}
        prompt = (HERE / 'native-reviewer-prompt.md').read_text() + '\n' + (HERE / 'native-legend.md').read_text()
    else:
        prompt = (HERE / 'reviewer-prompt.md').read_text() + '\n' + (HERE / 'legend.md').read_text()
    schema.write_text(dump(review_schema))
    if args.strict_recheck or args.strict_from:
        prompt += (
            '\nA previous review described a possible meaning loss but assigned an accepted grade. '
            'Recheck all candidates independently, including the previous candidate. '
            'Never use L8, L9 or L10 merely because a fragment is useful or most of the text is represented. '
            'A missing requested action, target, property, value, location, scope or qualifier requires L5, L6 or L7, '
            'unless another candidate wholly preserves the request. Material wrong or invented meaning takes L1–L4. '
            'A reason that says the witness omits a material instruction cannot accompany an accepted grade. '
            'Courtesy, punctuation and optional reference formatting are immaterial. '
            'Use previousJudgments only to locate the possible omission; it is not gold.'
        )
        if args.profile == 'native':
            prompt += (
                '\nIf the initial auxiliary is inverted before the subject, an interrogative is normally required. '
                'A conventional courtesy-modal request can also be read as imperative when its structure conveys the request. '
                'A plain declarative analysis with inverted auxiliary and subject is defective. '
                'Check that clause boundaries and role references connect the correct participants. '
                'Prefer a complete reading with an isolated structural-form error over a shell that omits the action or operands. '
                'An accepted witness takes precedence over either partial reading. Re-evaluate independently of the prior grade.'
            )
    with gzip.open(args.packets, 'rt', encoding='utf-8') as source:
        packets = json.load(source)
    if args.strict_from:
        extra = {(row['rowIndex'], row['group']) for row in json.loads(args.strict_select.read_text())} \
            if args.strict_select else set()
        packets = strict_packets(packets, args.strict_from, native=args.profile == 'native', extra=extra,
                                 corroborated=args.strict_corroborated)
    pending = []
    all_results = {}
    for packet in packets:
        if args.profile == 'native':
            if packet['references'] or 'staticJudgments' not in packet:
                parser.error('native source-first v2 packets require static judgments and no reference circuits')
            packet = {**packet, 'nativeReview': True}
        groups = {}
        for key, group in packet['groups'].items():
            if group:
                groups[key] = group
            elif args.profile == 'native':
                static = packet['staticJudgments'].get(key)
                if not static or static['grade'] not in (0, 2):
                    parser.error(f'missing static native judgment for row {packet["rowIndex"]} group {key}')
                all_results[packet['rowIndex'], key] = {**static, 'referenceIssue': None}
            else:
                all_results[packet['rowIndex'], key] = dict(
                    rowIndex=packet['rowIndex'], group=key, grade=0, candidate=None,
                    reason='No nonempty structurally eligible candidate was emitted.', referenceIssue=None)
        if groups:
            pending.append(compact(packet, groups))
    empty_count = len(all_results)
    for directory in args.salvage:
        previous = directory / manifest.name
        if previous.exists() and previous.read_text().strip() != fingerprint:
            parser.error(f'salvage directory has a different packet fingerprint: {directory}')
        # Validated checkpoints take priority over raw attempts.
        paths = sorted(directory.glob('*.json'), key=lambda path: ('.attempt-' in path.name, path.name))
        for result_path in paths:
            try:
                payload = json.loads(result_path.read_text())
                results, _ = validate(payload, pending)
            except (OSError, ValueError, KeyError, TypeError):
                continue
            for key, result in results.items():
                all_results.setdefault(key, result)
    if args.salvage:
        pending = [{**packet, 'groups': {key: group for key, group in packet['groups'].items()
                                         if (packet['rowIndex'], key) not in all_results}}
                   for packet in pending if any((packet['rowIndex'], key) not in all_results for key in packet['groups'])]
    batches = list(plan_batches(pending, args.characters, args.rows, inline=args.expanded, groups=args.groups))
    print(f'{len(packets)} rows, {empty_count} empty groups, {len(all_results) - empty_count} salvaged, '
          f'{len(batches)} jobs ({args.jobs} concurrent)', flush=True)
    start = time.monotonic()
    failures = []
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        jobs = [pool.submit(task, args, batch, work, prompt, schema) for batch in batches]
        for n, future in enumerate(as_completed(jobs), 1):
            try:
                results, reviewed = future.result()
                all_results.update(results)
                status = 'reviewed' if reviewed else 'cached'
            except ValueError as error:
                failures.append(str(error))
                status = str(error)
            print(f'{n}/{len(jobs)} batches, {len(all_results)} groups, {time.monotonic() - start:.0f}s, {status}', flush=True)
    expected = sum(len(packet['groups']) for packet in packets)
    if failures or len(all_results) != expected:
        raise SystemExit(f'Review incomplete: {len(all_results)}/{expected} groups. Validated batches can be resumed.')
    temporary = args.output.with_suffix('.tmp')
    with temporary.open('w') as sink:
        for key in sorted(all_results):
            record = all_results[key]
            if record['referenceIssue'] is None:
                record = {field: value for field, value in record.items() if field != 'referenceIssue'}
            sink.write(dump(record) + '\n')
    os.replace(temporary, args.output)
    details = {
        'profile': args.profile, 'model': args.model, 'rows': len(packets), 'groups': len(all_results),
        'emptyGroups': empty_count, 'batches': len(batches), 'jobs': args.jobs, 'maxRowsPerBatch': args.rows,
        'maxCharactersPerBatch': args.characters, 'maxGroupsPerBatch': args.groups, 'retries': args.retries, 'timeoutSeconds': args.timeout,
        'strictRecheck': bool(args.strict_recheck or args.strict_from),
        'promptSha256': hashlib.sha256(prompt.encode()).hexdigest(),
        'packetsSha256': hashlib.sha256(args.packets.read_bytes()).hexdigest(),
        'timeSeconds': time.monotonic() - start,
    }
    (work / 'execution.json').write_text(dump(details) + '\n')
    print(f'Wrote {len(all_results)} validated group judgments to {args.output}', flush=True)


if __name__ == '__main__':
    main()
