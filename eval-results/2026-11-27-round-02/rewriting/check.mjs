// Checks written-<k>.jsonl against packet-<k>.jsonl:  node check.mjs <k>
// Every circuit is checked against the syntax schema and against its message.
import {main} from "file:///home/salboaie/work/sopworlds/soplang-nlu/tests/benchmark/syntax/rewrite-check.mjs"
import {fileURLToPath} from 'node:url'
main(fileURLToPath(new URL('.', import.meta.url)), process.argv.slice(2))
