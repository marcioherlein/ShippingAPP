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

export function buildSimIndexes(text, sourceFile) {
  const parsed = parseNomencladorText(text, sourceFile)
  const chapters = new Map()

  for (const record of parsed.records) {
    if (!record.simOpenings.length) continue
    const chapter = record.code.slice(0, 2)
    const list = chapters.get(chapter) || []
    list.push([
      record.code,
      uniqueText([...record.context, record.description]),
      record.simOpenings.map((opening) => [
        opening.code,
        uniqueText([...opening.context, opening.description]),
      ]),
    ])
    chapters.set(chapter, list)
  }

  return {
    meta: {
      source: parsed.meta.source,
      sourceFile: parsed.meta.sourceFile,
      sourceDate: parsed.meta.sourceDate,
      parserSchema: parsed.meta.parserSchema,
      simIndexSchema: 1,
      tariffDataIncluded: false,
      recordShape: '[ncmCode,ncmLabel,[[simCode,simLabel],...]]',
    },
    chapters: [...chapters.entries()].sort(([a], [b]) => a.localeCompare(b)),
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const input = process.argv[2]
  const outputDir = process.argv[3]
  if (!input || !outputDir) {
    console.error('Usage: node scripts/build-sim-index.mjs <nomenclador.txt> <output-dir>')
    process.exit(2)
  }

  const text = fs.readFileSync(input, 'latin1')
  const built = buildSimIndexes(text, input)
  fs.rmSync(outputDir, { recursive: true, force: true })
  fs.mkdirSync(outputDir, { recursive: true })

  let totalBytes = 0
  let chapterCount = 0
  for (const [chapter, records] of built.chapters) {
    const payload = { meta: { ...built.meta, chapter, recordCount: records.length }, records }
    const target = path.join(outputDir, `${chapter}.json`)
    fs.writeFileSync(target, JSON.stringify(payload))
    const bytes = fs.statSync(target).size
    totalBytes += bytes
    chapterCount += 1
  }
  const manifest = {
    ...built.meta,
    chapterCount,
    totalBytes,
    chapters: built.chapters.map(([chapter, records]) => [chapter, records.length]),
  }
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest))
  console.log(JSON.stringify(manifest, null, 2))
}
