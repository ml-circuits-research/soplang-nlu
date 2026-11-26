import hashlib,json,pathlib
root=pathlib.Path(__file__).resolve().parent
first,second=({vote['key']:vote for vote in json.loads((root/name).read_text())} for name in ['gpt-6-sol.json','gpt-6.1-terra.json'])
assert first.keys()==second.keys()
disagreement = [key for key in first if first[key]['usable']!=second[key]['usable']]
ordered = sorted(first,key=lambda key: hashlib.sha256(('blind-dev100-dependency-audit\0'+key).encode()).hexdigest())
agreements = [key for key in ordered if first[key]['usable']==second[key]['usable']]
pass_agree = [key for key in agreements if first[key]['usable']][:12]
fail_agree = [key for key in agreements if not first[key]['usable']][:12]
selection = dict(disagreement=disagreement, agreedUsable=pass_agree, agreedUnusable=fail_agree)
(root/'audit-selection.json').write_text(json.dumps(selection,indent=2)+'\n')
(root/'audit-keys.json').write_text(json.dumps(disagreement+pass_agree+fail_agree)+'\n')
print({label:len(keys) for label,keys in selection.items()})
