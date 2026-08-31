import fs from 'node:fs'
import path from 'node:path'

export const NCM_LABEL_SENTINELS = [
  { code: '9506.51.00', includes: ['raquetas de tenis'], excludes: ['inflables'] },
  { code: '9506.40.00', includes: ['tenis de mesa'], excludes: ['inflables'] },
  { code: '9506.91.00', includes: ['cultura fisica', 'gimnasia'], excludes: ['inflables'] },
  { code: '9506.59.00', includes: ['raquetas de tenis', 'las demas'], excludes: ['inflables'] },
  { code: '8507.60.00', includes: ['iones de litio'], excludes: ['niquel cadmio'] },
]

export function normalizeLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function assertCanonicalLabelSentinels(labelsByCode) {
  for (const sentinel of NCM_LABEL_SENTINELS) {
    const label = labelsByCode.get(sentinel.code)
    if (!label) throw new Error(`Canonical SIM label missing for sentinel ${sentinel.code}`)
    const normalized = normalizeLabel(label)
    for (const term of sentinel.includes) {
      if (!normalized.includes(normalizeLabel(term))) {
        throw new Error(`Canonical SIM label ${sentinel.code} is missing expected term "${term}": ${label}`)
      }
    }
    for (const term of sentinel.excludes) {
      if (normalized.includes(normalizeLabel(term))) {
        throw new Error(`Canonical SIM label ${sentinel.code} contains forbidden term "${term}": ${label}`)
      }
    }
  }
}

export function loadCanonicalSimParentLabels(simDir) {
  const files = fs.readdirSync(simDir).filter((name) => /^\d{2}\.json$/.test(name)).sort()
  if (files.length < 80) throw new Error(`Too few SIM chapter files: ${files.length}`)

  const labelsByCode = new Map()
  const sourceDates = new Set()
  for (const fileName of files) {
    const chapter = fileName.slice(0, 2)
    const payload = JSON.parse(fs.readFileSync(path.join(simDir, fileName), 'utf8'))
    if (payload?.meta?.simIndexSchema !== 1 || payload?.meta?.tariffDataIncluded !== false || payload?.meta?.chapter !== chapter) {
      throw new Error(`${fileName}: invalid SIM chapter metadata`)
    }
    if (typeof payload?.meta?.sourceDate === 'string') sourceDates.add(payload.meta.sourceDate)
    if (!Array.isArray(payload?.records)) throw new Error(`${fileName}: missing SIM records`)

    for (const row of payload.records) {
      if (!Array.isArray(row) || row.length !== 3) throw new Error(`${fileName}: invalid SIM parent row`)
      const [code, label] = row
      if (!/^\d{4}\.\d{2}\.\d{2}$/.test(code) || !code.startsWith(chapter)) {
        throw new Error(`${fileName}: invalid SIM parent code ${code}`)
      }
      if (typeof label !== 'string' || !label.trim()) throw new Error(`${fileName}: blank SIM parent label for ${code}`)
      if (labelsByCode.has(code)) throw new Error(`${fileName}: duplicate SIM parent ${code}`)
      labelsByCode.set(code, label.trim())
    }
  }

  if (sourceDates.size !== 1) throw new Error(`SIM parent labels contain inconsistent source dates: ${[...sourceDates].join(', ')}`)
  assertCanonicalLabelSentinels(labelsByCode)
  return { labelsByCode, sourceDate: [...sourceDates][0], chapterFiles: files.length }
}

export function reconcileNcmIndexLabels(ncm, labelsByCode, sourceDate) {
  if (!Array.isArray(ncm?.records) || ncm.records.length < 10000) throw new Error('NCM catalog is unexpectedly small')
  const missing = []
  const records = ncm.records.map((row) => {
    if (!Array.isArray(row) || typeof row[0] !== 'string') throw new Error('Invalid NCM row during label reconciliation')
    const canonical = labelsByCode.get(row[0])
    if (!canonical) {
      missing.push(row[0])
      return row
    }
    return [row[0], canonical, ...row.slice(2)]
  })
  if (missing.length) throw new Error(`SIM canonical label coverage missing ${missing.length} NCM code(s): ${missing.slice(0, 8).join(', ')}`)
  if (labelsByCode.size !== records.length) {
    throw new Error(`SIM/NCM parent-count mismatch: SIM=${labelsByCode.size}, NCM=${records.length}`)
  }

  const reconciledLabels = new Map(records.map((row) => [row[0], row[1]]))
  assertCanonicalLabelSentinels(reconciledLabels)
  return {
    ...ncm,
    meta: {
      ...ncm.meta,
      canonicalLabelSource: 'ARCA Arancel Integrado · SIM parent labels',
      canonicalLabelSourceDate: sourceDate,
      canonicalLabelCoverage: records.length,
      runtimeLabelReconciled: true,
    },
    records,
  }
}
