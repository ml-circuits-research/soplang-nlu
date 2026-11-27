import {open} from './src/syntax/reader.mjs'

// One `syntax` circuit per message, read from the text alone. See src/syntax/.
export const z3 = {
  name: 'z3',
  schema: 'syntax',
  open
}
