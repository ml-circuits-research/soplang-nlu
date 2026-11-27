// Unannotated text for learning: the messages of a dataset checkout, each one once.
// Node only (file access); the reader itself never imports this module.
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs'
import {join} from 'node:path'

function* csvRows(text) {
  let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); yield row; row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); yield row }
}

/** Distinct message texts of every `<folder>/*.csv` whose first column is `text`. */
export function readMessages(dataset, folders = ['drawing', 'diagram', 'document', 'calendar']) {
  const texts = new Set()
  // the messages live in `semantic/` since the dataset was split into a semantic and a syntactic layer
  const root = existsSync(join(dataset, 'semantic')) ? join(dataset, 'semantic') : dataset
  for (const folder of folders) {
    const directory = join(root, folder)
    for (const name of readdirSync(directory).sort()) {
      if (!name.endsWith('.csv') || !statSync(join(directory, name)).isFile()) continue
      let header = null
      for (const row of csvRows(readFileSync(join(directory, name), 'utf8'))) {
        if (!header) { header = row; if (header[0] !== 'text') break; continue }
        if (row[0]?.trim()) texts.add(row[0])
      }
    }
  }
  return [...texts]
}
