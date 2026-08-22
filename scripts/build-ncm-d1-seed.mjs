import fs from 'node:fs'
import path from 'node:path'

function validCode(code) {
  return typeof code === 'string' && /^\d{4}\.\d{2}\.\d{2}$/.test(code)
}

function sectionForChapter(chapter) {
  const ch = Number(chapter)
  const ranges = [
    [1,5,'I'],[6,14,'II'],[15,15,'III'],[16,24,'IV'],[25,27,'V'],[28,38,'VI'],
    [39,40,'VII'],[41,43,'VIII'],[44,46,'IX'],[47,49,'X'],[50,63,'XI'],[64,67,'XII'],
    [68,70,'XIII'],[71,71,'XIV'],[72,83,'XV'],[84,85,'XVI'],[86,89,'XVII'],
    [90,92,'XVIII'],[93,93,'XIX'],[94,96,'XX'],[97,97,'XXI'],
  ]
  return ranges.find(([lo, hi]) => ch >= lo && ch <= hi)?.[2] || null
}

function quote(value) {
  if (value === null || value === undefined) return 'NULL'
  return `'${String(value).replaceAll("'", "''")}'`
}

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : 'NULL'
}

function normalizeLabel(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function meaningfulWords(value) {
  return normalizeLabel(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').split(/\s+/)
    .filter((word) => word.length >= 4 && !['dema','otro','otra'].includes(word))
}

function supplementMap(dataset) {
  if (!dataset) return new Map()
  if (dataset?.meta?.schemaVersion !== 1 || !Array.isArray(dataset.records)) throw new Error('NCM label supplement dataset is invalid')
  return new Map(dataset.records
    .filter((row) => Array.isArray(row) && validCode(row[0]) && typeof row[1] === 'string')
    .map(([code, label]) => [code, normalizeLabel(label)]))
}

export function buildNcmD1Seed(ncmIndex, tariffDataset, labelSupplements = null) {
  if (ncmIndex?.meta?.indexSchema !== 3 || !Array.isArray(ncmIndex?.records) || ncmIndex.records.length < 1) {
    throw new Error('Official NCM index is invalid')
  }
  if (tariffDataset?.meta?.schemaVersion !== 1 || !Array.isArray(tariffDataset?.records)) {
    throw new Error('Normalized tariff dataset is invalid')
  }

  const tariffs = new Map()
  for (const row of tariffDataset.records) {
    if (!validCode(row?.code)) continue
    if (tariffs.has(row.code)) throw new Error(`Duplicate normalized tariff code: ${row.code}`)
    tariffs.set(row.code, row)
  }
  const blocked = new Set(tariffDataset?.meta?.blockedConflictCodes || [])
  for (const code of blocked) tariffs.delete(code)
  const supplements = supplementMap(labelSupplements)

  const officialRows = []
  const seen = new Set()
  let appliedSupplements = 0
  for (const row of ncmIndex.records) {
    if (!Array.isArray(row) || !validCode(row[0])) continue
    const code = row[0]
    if (seen.has(code)) throw new Error(`Duplicate official NCM code: ${code}`)
    seen.add(code)
    const digits = code.replaceAll('.', '')
    const baseLabel = normalizeLabel(row[1])
    const supplement = supplements.get(code)
    const label = meaningfulWords(baseLabel).length >= 2 || !supplement ? baseLabel : supplement
    if (label !== baseLabel) appliedSupplements += 1
    officialRows.push({
      code, digits, section: sectionForChapter(digits.slice(0, 2)), chapter: digits.slice(0, 2),
      heading: digits.slice(0, 4), subheading: digits.slice(0, 6), label,
    })
  }
  if (!officialRows.length) throw new Error('Official NCM index contains no valid rows')

  const missingOfficial = [...tariffs.keys()].filter((code) => !seen.has(code))
  if (missingOfficial.length) throw new Error(`Normalized tariff codes missing from official catalog: ${missingOfficial.slice(0, 10).join(', ')}`)
  const invalidSupplements = [...supplements.keys()].filter((code) => !seen.has(code))
  if (invalidSupplements.length) throw new Error(`Label supplements reference codes absent from official catalog: ${invalidSupplements.slice(0, 10).join(', ')}`)

  const sourceName = ncmIndex.meta.source || 'ARCA Arancel Integrado'
  const sourceFile = ncmIndex.meta.sourceFile || 'ncm-index.json'
  const sourceDate = ncmIndex.meta.sourceDate || null
  const versionExpr = '(SELECT id FROM ncm_dataset_versions WHERE active=1 ORDER BY id DESC LIMIT 1)'
  const lines = [
    'PRAGMA foreign_keys = ON;', 'BEGIN;', 'UPDATE ncm_dataset_versions SET active=0;',
    `INSERT INTO ncm_dataset_versions(source_name,source_file,source_date,schema_version,record_count,active) VALUES (${quote(sourceName)},${quote(sourceFile)},${quote(sourceDate)},1,${officialRows.length},1);`,
  ]

  for (const row of officialRows) {
    const searchText = row.label
    lines.push(
      `INSERT INTO ncm_codes(version_id,code,code_digits,section,chapter,heading,subheading,official_label,search_text,active) VALUES (${versionExpr},${quote(row.code)},${quote(row.digits)},${quote(row.section)},${quote(row.chapter)},${quote(row.heading)},${quote(row.subheading)},${quote(row.label)},${quote(searchText)},1);`,
      `INSERT INTO ncm_codes_fts(version_id,code,official_label,search_text) VALUES (${versionExpr},${quote(row.code)},${quote(row.label)},${quote(searchText)});`,
    )
    const tariff = tariffs.get(row.code)
    if (!tariff) continue
    lines.push(
      `INSERT INTO ncm_tariffs(version_id,code,aec_pct,statistics_rate_pct,iva_pct,iva_additional_pct,source_group_description,source_rows,validation_status) VALUES (` +
      `${versionExpr},${quote(row.code)},${number(tariff.tariff?.aecPct)},${number(tariff.tariff?.statisticsRatePct)},${number(tariff.tariff?.ivaPct)},${number(tariff.tariff?.ivaAdditionalPct)},` +
      `${quote(tariff.sourceGroupDescription || '')},${quote((tariff.sourceRows || []).join(','))},'validated');`,
    )
  }

  lines.push('COMMIT;')
  return { sql: lines.join('\n') + '\n', stats: {
    officialCodes: officialRows.length, tariffCodes: tariffs.size, blockedConflictCodes: [...blocked],
    appliedLabelSupplements: appliedSupplements, sourceDate,
  } }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [officialPath, tariffPath, outputPath, supplementPath] = process.argv.slice(2)
  if (!officialPath || !tariffPath || !outputPath) {
    console.error('Usage: node scripts/build-ncm-d1-seed.mjs <public/data/ncm-index.json> <normalized-tariffs.json> <output.sql> [ncm-label-supplements.json]')
    process.exit(2)
  }
  const official = JSON.parse(fs.readFileSync(officialPath, 'utf8'))
  const tariffs = JSON.parse(fs.readFileSync(tariffPath, 'utf8'))
  const supplements = supplementPath ? JSON.parse(fs.readFileSync(supplementPath, 'utf8')) : null
  const result = buildNcmD1Seed(official, tariffs, supplements)
  fs.writeFileSync(outputPath, result.sql)
  console.log(JSON.stringify(result.stats, null, 2))
}
