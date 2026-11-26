import { readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createSyntaxReader } from './syntax.mjs'

async function* filesAt(path) {
  const info = await stat(path)
  if (info.isFile()) {
    if (path.endsWith('.sop')) yield path
    return
  }
  const entries = await readdir(path, {withFileTypes:true})
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.sop')) yield join(path, entry.name)
    if (entry.isDirectory()) yield* filesAt(join(path, entry.name))
  }
}

const lexicalTypes = new Set(['k.words.sense', 'w.lang.en.closed', 'w.lang.en.skip', 'w.lang.en.neg'])

// The caller selects the SOP installation. Extra worlds can replace facts by ID.
export async function loadSyntaxReader({knowledgeDir, worldPaths = []}) {
  const installation = resolve(knowledgeDir)
  const {parse} = await import(pathToFileURL(join(installation, 'tools/sopworld/sopworld.mjs')))
  const worlds = join(installation, 'docs/worlds')
  const installed = new Set(await readdir(worlds))
  const sources = ['k.words','w.lang.en'].filter(name => installed.has(name)).map(name => join(worlds,name))
  const facts = new Map()
  for (const source of [...sources,...worldPaths]) {
    for await (const path of filesAt(resolve(source))) {
      const text = await readFile(path,'utf8')
      if (![...lexicalTypes].some(type => text.includes(' ' + type + ' '))) continue
      for (const {id,type,attrs} of parse(text)) {
        if (lexicalTypes.has(type)) {
          const {word,pos,text:forms,class:classes} = attrs
          facts.set(id,{type,attrs:{word,pos,text:forms,class:classes}})
        }
      }
    }
  }
  return createSyntaxReader(facts.values())
}
