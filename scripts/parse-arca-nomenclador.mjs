import fs from 'node:fs'
import path from 'node:path'

function sourceDateFromFilename(filePath) {
  const match = path.basename(filePath).match(/nomenclador_(\d{2})(\d{2})(\d{4})\.txt$/i)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null
}

function validNcm(code) {
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(code)) return false
  const chapter = Number(code.slice(0, 2))
  return Number.isInteger(chapter) && chapter >= 1 && chapter <= 97
}

function ncmFromRawCode(rawCode) {
  const match = rawCode.match(/^(\d{4}\.\d{2}\.\d{2})/)
  return match && validNcm(match[1]) ? match[1] : null
}

function isSimOpening(rawCode) {
  return /^\d{4}\.\d{2}\.\d{2}\.\d{3}[A-Z]$/.test(rawCode)
}

export function parseNomencladorText(text, sourceFile = 'nomenclador_unknown.txt') {
  const rows = new Map()
  let parsedLines = 0
  let malformedLines = 0

  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('2@')) continue
    const parts = line.split('@')
    if (parts.length !== 11) {
      malformedLines += 1
      continue
    }

    const rawCode = parts[1].trim()
    const ncm = ncmFromRawCode(rawCode)
    if (!ncm) continue
    parsedLines += 1

    const description = parts[10].trim().replace(/\s+/g, ' ')
    const rawTariffFields = parts.slice(2, 8).map((value) => value.trim())
    const unitCode = parts[8].trim() || null

    const current = rows.get(ncm) || {
      code: ncm,
      description: null,
      simOpenings: [],
    }

    if (rawCode === ncm && description) current.description = description.replace(/^-+/, '').trim()

    if (isSimOpening(rawCode)) {
      current.simOpenings.push({
        code: rawCode,
        description: description || null,
        rawTariffFields,
        unitCode,
      })
    }

    rows.set(ncm, current)
  }

  const records = [...rows.values()]
    .map((row) => ({ ...row, simOpenings: row.simOpenings.sort((a, b) => a.code.localeCompare(b.code)) }))
    .sort((a, b) => a.code.localeCompare(b.code))

  return {
    meta: {
      source: 'ARCA Arancel Integrado',
      sourceFile: path.basename(sourceFile),
      sourceDate: sourceDateFromFilename(sourceFile),
      parserSchema: 1,
      tariffFieldSemantics: 'UNMAPPED_RAW_FIELDS',
      parsedLines,
      malformedLines,
      recordCount: records.length,
    },
    records,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const input = process.argv[2]
  const output = process.argv[3]
  if (!input || !output) {
    console.error('Usage: node scripts/parse-arca-nomenclador.mjs <nomenclador.txt> <output.json>')
    process.exit(2)
  }
  const text = fs.readFileSync(input, 'latin1')
  const parsed = parseNomencladorText(text, input)
  fs.writeFileSync(output, JSON.stringify(parsed))
  console.log(JSON.stringify(parsed.meta, null, 2))
}
