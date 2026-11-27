// Effect of two invertible re-headings on head distances: markers head their relation; conjuncts chain.
import {readFileSync} from 'node:fs'
const trees = JSON.parse(readFileSync('trees.json', 'utf8'))
const attach = l => l.split(':')[0], tag = l => l.includes(':') ? l.slice(l.indexOf(':') + 1) : null
function rehead({h, l}) {
  h = [...h]; l = [...l]; const n = h.length
  // 1. markers: the first marker word takes the relation arc of the end word
  for (let t = 0; t < n; t++) {
    if (!attach(l[t]).startsWith('rel')) continue
    const marks = []; for (let m = 0; m < n; m++) if (h[m] === t && l[m] === 'mark') marks.push(m)
    if (!marks.length) continue
    const m0 = marks[0]
    h[m0] = h[t]; l[m0] = attach(l[t]); for (const m of marks.slice(1)) { h[m] = m0; l[m] = 'cont' }
    h[t] = m0; l[t] = 'pobj:' + tag(l[t])
  }
  // 2. coordination: each further conjunct depends on the previous one
  for (let k = 0; k < n; k++) {
    const cs = []; for (let c = 0; c < n; c++) if (h[c] === k && attach(l[c]) === 'conj') cs.push(c)
    cs.sort((a, b) => a - b); for (let i = 1; i < cs.length; i++) h[cs[i]] = cs[i - 1]
  }
  return {h, l}
}
const stat = (name, get) => {
  let arcs = 0, near2 = 0, near5 = 0, sum = 0, far10 = 0
  for (const t of trees) { const {h} = get(t); for (let k = 0; k < h.length; k++) { if (h[k] < 0) continue; const d = Math.abs(h[k] - k); arcs++; sum += d; if (d <= 2) near2++; if (d <= 5) near5++; if (d > 10) far10++ } }
  console.log(name, {arcs, mean: (sum / arcs).toFixed(2), '<=2': (100 * near2 / arcs).toFixed(1) + '%', '<=5': (100 * near5 / arcs).toFixed(1) + '%', '>10': (100 * far10 / arcs).toFixed(2) + '%'})
}
stat('tree.mjs (content heads)', t => t)
stat('re-headed', rehead)
