// Sends circuits to a judge again after the judges' rules changed, so that the newest verdict on them counts.
//   node tests/benchmark/syntax/rejudge.mjs prepare <run-folder> <list.json>… [--from <path>…] [--size 200] [--registry <folder>] [--syntactic <folder>]
// A list is a JSON array of verdicts to judge again, as the consistency check of the rules writes it
// (eval-results/2026-11-27-rules-consistency/rejudge.json). An entry names its message (`text`) and where its verdict
// stands (`file`, a path from the folder that holds soplang-nlu and webmeet-dataset, and `n`), and may say why it is
// judged again (`settled_case`, `why`, `grade_by_rules`). `file` is one of:
//   <run>/judging/verdicts-<k>.jsonl       n is the number of the item in that run
//   <pool>/verdicts-<k>.jsonl              a pool of pool.mjs (it has key.jsonl): n is the pooled number, and the key
//                                          names the round and the number of the item there
//   .../annotations/syntax/v1/judged/<name>.jsonl   n is the line in that registry file, from 1
//   .../syntactic/<tab>/<file>.csv         the label of the message in that file; n is its record number
// Without --from, the entries whose verdict stands in <run-folder>, directly or through a pool, are taken. With
// --from, the entries whose `file` is one of the paths named or lies inside one of them are taken, wherever their
// verdict stands: <run-folder> is then a folder of its own for circuits that have no run folder (the fixed sample,
// known from the registry only) or whose run folder is not kept in git (the conversion folders).
// Every circuit taken gets a new item of the folder, numbered after the last one, with the message, the circuit
// (in its normal form) and the strategies that wrote it, and a field `rejudge` that marks it as judged again:
//   from      the list entry, "<file>:<n>"
//   of        the number of the earlier item of the same circuit in this folder, when it has one
//   against   the registry file that holds the decision on the circuit now, or null: judge-publish.mjs writes the new
//             verdict as a line that supersedes that one
//   before    the decision now: {verdict, grade, note, by}
//   case, why, expected   from the list: the settled case of the rules, the reason, the grade the rules now give
//   rules     the first 12 hexadecimal digits of the sha256 of rules.md: a circuit already sent again under the same
//             rules is not sent twice
// The new items go into new packets judging/packet-<k>.jsonl, numbered after the packets the folder has; a packet
// line holds the number, the message and the circuit, as always, and does not say that the circuit is judged again.
// judging/RULES.md and check.mjs are copied again, so the judge reads the rules as they are now. The verdict files
// already there are not touched: they stay as the history of the run. A judge writes verdicts-<k>.jsonl as for any
// packet; the newest verdict of a circuit counts (runVerdicts in lib.mjs), and judge-publish.mjs publishes it.
import {createHash} from 'node:crypto'
import {existsSync, readFileSync} from 'node:fs'
import {dirname, join, relative, resolve, sep} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {readArguments, readJson, readJsonl, readCsv, readItems, readRegistry, readVerdictFiles, readAgreement, runVerdicts, lookup, normalForm, writeJudging,
  judgingDir, readLabels, keepLabelsBefore, labelsBeforeFile, defaultRegistryDir, syntacticDirOf, packageRoot} from './lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
/** The folder that holds soplang-nlu and webmeet-dataset: the paths of a list start there. */
export const listRoot = resolve(packageRoot, '..')
/** The mark of a version of the rules: the first 12 hexadecimal digits of the sha256 of rules.md. */
export const rulesVersion = (file = join(here, 'rules.md')) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12)
const verdictOf = grade => grade === 'L8' ? 'accepted' : 'rejected'
const sourcesOf = source => String(source ?? '').split('+').filter(Boolean)

/**
 * Where the verdict of a list entry stands, and the circuit it is about.
 * @returns {kind, file, run?, n?, text, sop, sources, of?, before} or {problem}
 */
export function makeLocator(root = listRoot) {
  const runs = new Map(), pools = new Map(), files = new Map()
  const runOf = dir => {
    if (!runs.has(dir)) {
      const items = readItems(dir)
      runs.set(dir, items.length ? {items, itemOf: new Map(items.map(item => [item.n, item])), verdicts: runVerdicts(items, readVerdictFiles(dir).verdicts, readAgreement(dir))} : null)
    }
    return runs.get(dir)
  }
  const poolOf = dir => pools.get(dir) ?? pools.set(dir, new Map(readJsonl(join(dir, 'key.jsonl')).map(line => [line.n, line]))).get(dir)
  const linesOf = file => files.get(file) ?? files.set(file, file.endsWith('.csv') ? readCsv(readFileSync(file, 'utf8')) : readJsonl(file)).get(file)
  const fromItem = (entry, where, run) => {
    const item = run.itemOf.get(where.n)
    if (!item) return {...where, problem: `n=${where.n} is no item of ${where.run}`}
    if (item.text !== entry.text) return {...where, problem: `item ${where.n} of ${where.run} is another message`}
    const verdict = run.verdicts.get(item.text)?.get(item.core)
    return {...where, text: item.text, sop: item.sop, sources: item.sources, of: item.n, before: verdict ? {verdict: verdictOf(verdict.grade), grade: verdict.grade, note: verdict.note, by: verdict.by} : null}
  }
  return entry => {
    if (typeof entry?.file !== 'string' || typeof entry.text !== 'string') return {problem: 'an entry needs `file` and `text`'}
    const file = resolve(root, entry.file)
    if (!existsSync(file)) return {problem: `${entry.file} does not exist`}
    if (/[\\/]judging[\\/]verdicts-\d+\.jsonl$/u.test(file)) {
      const where = {kind: 'run', file, run: dirname(dirname(file)), n: entry.n}, run = runOf(where.run)
      return run ? fromItem(entry, where, run) : {...where, problem: `${where.run} has no key/items.jsonl`}
    }
    if (/[\\/]verdicts-\d+\.jsonl$/u.test(file) && existsSync(join(dirname(file), 'key.jsonl'))) {
      const pool = dirname(file), pooled = poolOf(pool).get(entry.n)
      if (!pooled) return {problem: `n=${entry.n} is no line of the pool ${pool}`}
      const where = {kind: 'pool', file, run: resolve(pooled.round), n: pooled.line}, run = existsSync(where.run) ? runOf(where.run) : null
      if (run) return fromItem(entry, where, run)
      // the round folder is not on this machine: the circuit as the pool's packet holds it, the verdict as its file holds it
      const line = readJsonl(join(pool, `packet-${pooled.pooled}.jsonl`)).find(one => one.n === entry.n)
      const verdict = readJsonl(file).find(one => one.n === entry.n)
      if (line?.text !== entry.text) return {...where, problem: `n=${entry.n} of the pool ${pool} is another message`}
      return {...where, text: line.text, sop: line.sop, sources: [], before: verdict ? {verdict: verdictOf(verdict.grade), grade: verdict.grade, note: verdict.note ?? '', by: 'judge'} : null}
    }
    if (file.endsWith('.jsonl')) {
      const line = linesOf(file)[entry.n - 1]
      if (line?.text !== entry.text) return {problem: `line ${entry.n} of ${entry.file} is another message`}
      return {kind: 'registry', file, n: entry.n, text: line.text, sop: line.sop, sources: sourcesOf(line.source),
        before: {verdict: line.verdict, grade: line.grade, note: line.note ?? '', by: line.judge === 'agreement' ? 'agreement' : line.source === 'judge' ? 'written' : 'judge'}}
    }
    if (file.endsWith('.csv')) {
      const [header, ...rows] = linesOf(file)
      if (header?.[0] !== 'text' || header[1] !== 'sop') return {problem: `${entry.file} is no syntactic file`}
      const row = rows.find(cells => cells[0] === entry.text)
      if (!row?.[1]) return {problem: `${entry.file} has no label for ${JSON.stringify(entry.text)}`}
      return {kind: 'label', file, text: row[0], sop: row[1], sources: sourcesOf(row[2]), before: {verdict: 'accepted', grade: 'L8', note: '', by: row[3] || 'label'}}
    }
    return {problem: `${entry.file} is neither a verdict file, a registry file nor a syntactic file`}
  }
}

/**
 * The new items for the entries of a list that a folder takes.
 * @param items the items the folder has
 * @param located [{entry, where}] where = what the locator gives
 * @param take (entry, where) => true for an entry this folder takes
 * @returns {added, taken, again, problems}: `again` entries whose circuit already has an item judged again under these rules
 */
export function rejudgeItems(items, located, registry, {runDir = null, take = () => true, rules = rulesVersion()} = {}) {
  const sent = new Set(items.filter(item => item.rejudge?.rules === rules).map(item => item.text + '\0' + item.core))
  let next = Math.max(0, ...items.map(item => item.n)) + 1
  const added = [], problems = []
  let taken = 0, again = 0
  for (const {entry, where} of located) {
    if (where.problem) { if (take(entry, where)) problems.push(`${entry.file}:${entry.n ?? ''} ${where.problem}`); continue }
    if (!take(entry, where)) continue
    taken++
    const normal = normalForm(where.text, where.sop)
    if (!normal?.core) { problems.push(`${entry.file}:${entry.n ?? ''} holds no valid circuit of its message`); continue }
    const key = where.text + '\0' + normal.core
    if (sent.has(key)) { again++; continue }
    sent.add(key)
    const known = lookup(registry, where.text, normal.core)
    const sources = where.sources?.length ? where.sources : sourcesOf(known?.source)
    added.push({n: next++, text: where.text, sop: normal.sop, core: normal.core, sources, rejudge: {
      from: entry.file + (entry.n === undefined || entry.n === null ? '' : ':' + entry.n),
      ...where.of !== undefined && where.run === runDir ? {of: where.of} : {},
      against: typeof known?.file === 'string' ? known.file : null,
      before: known ? {verdict: known.verdict, grade: known.grade, note: known.note ?? '', by: known.judge === 'agreement' ? 'agreement' : known.source === 'judge' ? 'written' : 'judge'} : where.before,
      ...entry.settled_case ? {case: entry.settled_case} : {}, ...entry.why ? {why: entry.why} : {}, ...entry.grade_by_rules ? {expected: entry.grade_by_rules} : {},
      rules}})
  }
  return {added, taken, again, problems}
}

function prepare(runDir, lists, named) {
  const registryDir = resolve(named.registry ?? defaultRegistryDir)
  const entries = lists.flatMap(list => { const read = readJson(list); if (!Array.isArray(read)) throw new Error(`${list} is no JSON array`); return read })
  const from = (named.from ?? []).map(path => resolve(path))
  const take = from.length
    ? entry => { const file = resolve(listRoot, entry.file); return from.some(path => file === path || file.startsWith(path + sep)) }
    : (entry, where) => where.run === runDir
  const locate = makeLocator()
  const located = entries.map(entry => ({entry, where: locate(entry)}))
  const registry = readRegistry(registryDir)
  const items = readItems(runDir)
  if (!from.length && !items.length) { console.error(`${runDir} has no key/items.jsonl. A folder of its own for circuits judged again is made with --from.`); process.exit(1) }
  const rules = rulesVersion()
  const {added, taken, again, problems} = rejudgeItems(items, located, registry, {runDir, take, rules})
  for (const problem of problems) console.error(problem)
  if (problems.length) { console.error(`${problems.length} entries could not be read: nothing written.`); process.exit(1) }
  const size = Number(named.size ?? 200)
  const packets = writeJudging(runDir, [...items, ...added], added, size)
  // a folder of its own keeps the labels its messages have now, as every run does
  if (!existsSync(labelsBeforeFile(runDir))) keepLabelsBefore(runDir, readLabels(syntacticDirOf(registryDir, named.syntactic)), added.map(item => item.text))
  const cases = new Map()
  for (const item of added) cases.set(item.rejudge.case ?? '(no case named)', (cases.get(item.rejudge.case ?? '(no case named)') ?? 0) + 1)
  console.log(`${entries.length} entries in ${lists.map(list => relative(process.cwd(), list)).join(', ')}: ${taken} for ${relative(process.cwd(), runDir) || '.'}` +
    (again ? `, of which ${again} were sent again already under these rules (${rules})` : '') + `. ${added.length} circuits are sent to a judge again.`)
  if (added.length) {
    const before = added.reduce((count, item) => (count[item.rejudge.before?.verdict ?? 'none']++, count), {accepted: 0, rejected: 0, none: 0})
    console.log(`Their decision now: ${before.accepted} accepted, ${before.rejected} rejected${before.none ? `, ${before.none} with none` : ''}; ${added.filter(item => item.rejudge.against).length} have a registry line that the new verdict will supersede.`)
    console.log('| Settled case of the rules | Circuits |\n| --- | ---: |\n' + [...cases].map(([name, count]) => `| ${name} | ${count} |`).join('\n'))
  }
  console.log(packets.length ? `New packets: ${packets.map(([name, lines]) => `${name} (${lines})`).join(', ')} in ${relative(process.cwd(), judgingDir(runDir))}; RULES.md and check.mjs copied again.` : 'No new packet.')
  if (packets.length) console.log(`A judge reads RULES.md and one packet, writes verdicts-<k>.jsonl beside it, and checks it with: node ${relative(process.cwd(), join(judgingDir(runDir), 'check.mjs'))} <k>\n` +
    `Then: node tests/benchmark/syntax/judge-publish.mjs ${relative(process.cwd(), runDir)} --tag <name> --judge <model> --rejudged-only`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {words, named} = readArguments(process.argv.slice(2), ['from'])
  const [command, folder, ...lists] = words
  if (command !== 'prepare' || !folder || !lists.length) {
    console.error('Usage: node tests/benchmark/syntax/rejudge.mjs prepare <run-folder> <list.json>… [--from <path>…] [--size 200] [--registry <folder>] [--syntactic <folder>]')
    process.exit(2)
  }
  prepare(resolve(folder), lists.map(list => resolve(list)), named)
}
