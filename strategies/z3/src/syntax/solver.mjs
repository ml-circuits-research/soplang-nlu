// A small MaxSMT solver for the syntax model: the z3-solver package, one message at a time.
// It loads nothing but the problem it is given.
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'

async function loadZ3(module) {
  if (typeof module === 'string') return import(pathToFileURL(resolve(module)).href)
  return module ?? import('z3-solver')
}

/** The Boolean values of a `(get-value (...))` answer: name -> true | false. */
function valuesOf(output) {
  const values = new Map()
  for (const [, name, value] of output.matchAll(/\(([A-Za-z_][\w]*) (true|false)\)/gu)) values.set(name, value === 'true')
  return values
}

export async function createSolver({module, timeoutMs = 4000} = {}) {
  const z3 = await loadZ3(module)
  const {Context, Z3, em} = await z3.init()
  let context = new Context('syntax')
  let solved = 0
  /**
   * Every problem starts from a reset solver, so that the answer to a message never depends
   * on the messages solved before it.
   * @returns {ok, status, values: Map(name -> boolean), objective: the weight of the
   *   preferences the solution gives up, error}
   */
  async function solve(problem, names, {timeout = timeoutMs} = {}) {
    // a fresh context from time to time keeps the WASM heap small
    if (++solved % 500 === 0) context = new Context('syntax' + solved)
    const script = ['(reset)', `(set-option :timeout ${timeout})`, problem, '(check-sat)', '(get-objectives)', `(get-value (${names.join(' ')}))`].join('\n')
    let output
    try {
      output = String(await Z3.eval_smtlib2_string(context.ptr, script))
    } catch (error) {
      context = new Context('syntax' + solved + 'r')
      return {ok: false, status: 'error', error: error.message}
    }
    const status = /^(sat|unsat|unknown)\b/mu.exec(output)?.[1] ?? 'unknown'
    if (status !== 'sat') return {ok: false, status, error: /\(error "([^"]*)"/u.exec(output)?.[1]}
    const objective = /\(objectives\s*\(\s*(?:\S+\s+)?(\d+)\s*\)/u.exec(output)
    return {ok: true, status, values: valuesOf(output), objective: objective ? Number(objective[1]) : null}
  }
  let closing
  return {
    solve,
    close() {
      closing ??= Promise.resolve().then(() => z3.killThreads?.(em))
      return closing
    }
  }
}
