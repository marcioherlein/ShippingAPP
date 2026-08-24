import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function comparisonKey(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function hierarchySegments(label) {
  const parts = cleanText(label)
    .split('>')
    .map(cleanText)
    .filter(Boolean)
  const metaIndex = parts.findIndex((part) => /la posicion sim se define por/i.test(comparisonKey(part)))
  return metaIndex >= 0 ? parts.slice(0, metaIndex) : parts
}

export function commonOfficialHierarchy(labels) {
  const paths = labels
    .map(hierarchySegments)
    .filter((segments) => segments.length > 0)
  if (!paths.length) return ''

  const first = paths[0]
  let commonLength = first.length
  for (const current of paths.slice(1)) {
    commonLength = Math.min(commonLength, current.length)
    for (let index = 0; index < commonLength; index += 1) {
      if (comparisonKey(first[index]) !== comparisonKey(current[index])) {
        commonLength = index
        break
      }
    }
    if (!commonLength) break
  }

  return first.slice(0, commonLength).join(' > ')
}

export function collectOfficialSimLabels(simIndexes) {
  const labelsByCode = new Map()
  for (const index of simIndexes) {
    if (!index || !Array.isArray(index.records)) continue
    for (const row of index.records) {
      if (!Array.isArray(row) || row.length < 3) continue
      const [code, ncmLabel, openings] = row
      if (typeof code !== 'string' || !/^\d{4}\.\d{2}\.\d{2}$/.test(code)) continue
      const labels = labelsByCode.get(code) || []
      const cleanNcmLabel = cleanText(ncmLabel)
      if (cleanNcmLabel) labels.push(cleanNcmLabel)
      if (Array.isArray(openings)) {
        for (const opening of openings) {
          if (!Array.isArray(opening) || opening.length < 2) continue
          const simLabel = cleanText(opening[1])
          if (simLabel) labels.push(simLabel)
        }
      }
      if (labels.length) labelsByCode.set(code, [...new Set(labels)])
    }
  }
  return labelsByCode
}

const GENERIC_SIM_SEGMENTS = new Set([
  'los demas', 'las demas', 'los demás', 'las demás', 'demas', 'demás', 'otros', 'otras',
])

function usefulSimSegment(segment, specificBaseKey) {
  const text = cleanText(segment)
  const key = comparisonKey(text)
  if (!text || text.length < 4 || text.length > 150) return false
  if (GENERIC_SIM_SEGMENTS.has(key)) return false
  if (/^[\d\W]+$/.test(text)) return false
  // Compare terminal evidence only with the child-specific NCM path, not the
  // giant heading text. Some headings enumerate many sibling article types
  // (e.g. 42.02 mentions MOCHILAS everywhere); removing a terminal "Mochilas"
  // merely because the parent heading also says it destroys the discriminating
  // evidence that separates the exact child branch.
  if (specificBaseKey && specificBaseKey.includes(key)) return false
  return true
}

function specificHierarchyKey(baseLabel) {
  const segments = hierarchySegments(baseLabel)
  if (!segments.length) return ''
  // The first segment is normally the shared heading. Child path segments are
  // the part that terminal SIM evidence should be deduplicated against.
  const specific = segments.length > 1 ? segments.slice(1) : segments
  return comparisonKey(specific.join(' > '))
}

// Keep the canonical ARCA label as the first part of every record, but expose a
// bounded amount of official terminal SIM vocabulary for retrieval. This adds
// words such as "mochilas" or a specific portable-machine subtype without ever
// adding a new NCM/SIM code or tariff field. Only the last two hierarchy segments
// of each official SIM label are considered so broad heading text does not drown
// the product-specific evidence.
export function officialSimSearchEvidence(labels, baseLabel, maxSegments = 8) {
  const specificBaseKey = specificHierarchyKey(baseLabel)
  const seen = new Set()
  const evidence = []

  for (const label of labels) {
    const segments = hierarchySegments(label)
    for (const segment of segments.slice(-2)) {
      const text = cleanText(segment)
      const key = comparisonKey(text)
      if (!usefulSimSegment(text, specificBaseKey) || seen.has(key)) continue
      seen.add(key)
      evidence.push(text)
      if (evidence.length >= maxSegments) return evidence
    }
  }
  return evidence
}

export function enrichNcmSearchIndex(baseIndex, simIndexes) {
  if (!baseIndex || !Array.isArray(baseIndex.records)) throw new Error('Invalid NCM search index')
  const labelsByCode = collectOfficialSimLabels(simIndexes)
  let originalBlankLabelCount = 0
  let simEnrichedLabelCount = 0
  let simEvidenceLabelCount = 0
  let remainingBlankLabelCount = 0

  const records = baseIndex.records.map((row) => {
    if (!Array.isArray(row) || row.length < 2) return row
    const [code, rawLabel] = row
    const label = cleanText(rawLabel)
    const officialSimLabels = labelsByCode.get(code) || []

    if (label) {
      const evidence = officialSimSearchEvidence(officialSimLabels, label)
      if (!evidence.length) return [code, label]
      simEvidenceLabelCount += 1
      return [code, `${label} > Aperturas SIM oficiales: ${evidence.join(' | ')}`]
    }

    originalBlankLabelCount += 1
    const enrichedLabel = commonOfficialHierarchy(officialSimLabels)
    if (enrichedLabel) {
      simEnrichedLabelCount += 1
      const evidence = officialSimSearchEvidence(officialSimLabels, enrichedLabel)
      return [code, evidence.length ? `${enrichedLabel} > Aperturas SIM oficiales: ${evidence.join(' | ')}` : enrichedLabel]
    }

    remainingBlankLabelCount += 1
    return [code, '']
  })

  const baseCodes = new Set(baseIndex.records.map((row) => Array.isArray(row) ? row[0] : null).filter(Boolean))
  if (records.some((row) => Array.isArray(row) && !baseCodes.has(row[0]))) {
    throw new Error('SIM enrichment attempted to create an NCM code')
  }

  return {
    ...baseIndex,
    meta: {
      ...(baseIndex.meta || {}),
      recordCount: records.length,
      tariffDataIncluded: false,
      simOpeningsIncluded: false,
      searchTextEnrichment: 'official-sim-terminal-vocabulary',
      originalBlankLabelCount,
      simEnrichedLabelCount,
      simEvidenceLabelCount,
      remainingBlankLabelCount,
    },
    records,
  }
}

export function readSimIndexes(simDirectory) {
  return fs.readdirSync(simDirectory)
    .filter((name) => /^\d{2}\.json$/.test(name))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(simDirectory, name), 'utf8')))
}

export function enrichIndexFiles(inputPath, simDirectory, outputPath) {
  const baseIndex = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  const enriched = enrichNcmSearchIndex(baseIndex, readSimIndexes(simDirectory))
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(enriched))
  return enriched.meta
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  const [inputPath, simDirectory, outputPath] = process.argv.slice(2)
  if (!inputPath || !simDirectory || !outputPath) {
    console.error('Usage: node scripts/enrich-ncm-index-from-sim.mjs <ncm-index.json> <sim-directory> <output.json>')
    process.exit(2)
  }
  const meta = enrichIndexFiles(inputPath, simDirectory, outputPath)
  console.log(JSON.stringify({
    searchTextEnrichment: meta.searchTextEnrichment,
    originalBlankLabelCount: meta.originalBlankLabelCount,
    simEnrichedLabelCount: meta.simEnrichedLabelCount,
    simEvidenceLabelCount: meta.simEvidenceLabelCount,
    remainingBlankLabelCount: meta.remainingBlankLabelCount,
  }, null, 2))
}
