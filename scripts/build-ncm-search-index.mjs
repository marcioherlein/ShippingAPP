import fs from 'node:fs'
import path from 'node:path'
import { parseNomencladorText } from './parse-arca-nomenclador.mjs'

function uniqueText(parts) {
  const seen = new Set()
  const out = []
  for (const part of parts.filter(Boolean)) {
    const value = String(part).trim().replace(/\s+/g, ' ')
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out.join(' > ')
}

export function buildSearchIndex(text, sourceFile) {
  const parsed = parseNomencladorText(text, sourceFile)
  return {
    meta: {
      source: parsed.meta.source,
      sourceFile: parsed.meta.sourceFile,
      sourceDate: parsed.meta.sourceDate,
      parserSchema: parsed.meta.parserSchema,
      indexSchema: 3,
      recordCount: parsed.meta.recordCount,
      tariffDataIncluded: false,
      simOpeningsIncluded: false,
      recordShape: '[ncmCode,label]',
    },
    records: parsed.records.map((record) => [
      record.code,
      uniqueText([...record.context, record.description]),
    ]),
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
