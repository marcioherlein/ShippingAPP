import fs from 'node:fs'
import path from 'node:path'
import { parseNomencladorText } from './parse-arca-nomenclador.mjs'

function uniqueParts(parts) {
  const seen = new Set()
  const out = []
  for (const part of parts.filter(Boolean)) {
    const value = String(part).trim().replace(/\s+/g, ' ')
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function uniqueText(parts) {
  return uniqueParts(parts).join(' > ')
}

function meaningfulWords(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/).filter((word) => word.length >= 4 && !['dema','otro','otra'].includes(word))
}

export function searchableLabel(record) {
  const baseParts = uniqueParts([...(record.context || []), record.description])
  const base = baseParts.join(' > ')

  // A base NCM can legitimately exist with no useful textual leaf while its
  // official SIM opening carries the product wording. Supplement only sparse
  // base labels; do not pollute already-informative NCM labels with every SIM
  // child description.
  if (meaningfulWords(base).length >= 2) return base

  const simParts = (record.simOpenings || []).flatMap((opening) => [
    ...(opening.context || []),
    opening.description,
  ])
  return uniqueText([...baseParts, ...simParts])
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
      searchLabelPolicy: 'base NCM context/description; sparse labels supplemented from official SIM opening context',
      recordShape: '[ncmCode,label]',
    },
    records: parsed.records.map((record) => [record.code, searchableLabel(record)]),
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
