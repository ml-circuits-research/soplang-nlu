// Is a tree projective, with the root placed after the last word (as the parser places it)?
export function projective(heads) {
  const n = heads.length
  const arcs = heads.map((h, d) => h < 0 ? [Math.min(n, d), Math.max(n, d)] : [Math.min(h, d), Math.max(h, d)])
  for (const [a, b] of arcs) for (const [c, e] of arcs) if (a < c && c < b && b < e) return false
  return true
}
