const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const labels = readLabels()
const c = {}
for (const l of labels.values()) { const k = l.accepted_by + ' ' + l.source; c[k] = (c[k] ?? 0) + 1 }
for (const [k, v] of Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(String(v).padStart(7), k)
