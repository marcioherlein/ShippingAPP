import fs from 'node:fs'
import path from 'node:path'
import { parseNomencladorText } from './parse-arca-nomenclador.mjs'

function normalize(value) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactRecord(record) {
  const simOpenings = record.simOpenings.map((opening) => ({
    code: opening.code,
    description: opening.description,
    context: opening.context,
  }))
  const searchText = normalize([
    ...record.context,
    record.description,
    ...simOpenings.flatMap((opening) => [...opening.context, opening.description]),
  ].filter(Boolean).join(' '))

  return {
    code: record.code,
    description: record.description,
    context: record.context,
    simOpenings,
    searchText,
  }
}

export function buildSearchIndex(text, sourceFile) {
  const parsed = parseNomencladorText(text, sourceFile)
  return {
    meta: {
      source: parsed.meta.source,
      sourceFile: parsed.meta.sourceFile,
      sourceDate: parsed.meta.sourceDate,
      parserSchema: parsed.meta.parserSchema,
      indexSchema: 1,
      recordCount: parsed.meta.recordCount,
      tariffDataIncluded: false,
    },
    records: parsed.records.map(compactRecord),
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const input = process.argv[2]
  const output = process.argv[3]
  if (!input || !output) {
    console.error('Usage: node scripts/build-ncm-search-index.mjs <nomenclador.txt> <output.json>')
    process.exit(2)
  }
  const text = fs.readFileSync(input, 'latin1')
  const index = buildSearchIndex(text, input)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(index))
  console.log(JSON.stringify(index.meta, null, 2))
  console.log(`bytes=${fs.statSync(output).size}`)
}
