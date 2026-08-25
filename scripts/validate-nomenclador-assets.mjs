import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const ncmPath = path.join(root, 'public', 'data', 'ncm-index.json')
const simDir = path.join(root, 'public', 'data', 'sim')

function fail(message) {
  console.error(`NOMENCLADOR_INTEGRITY_FAIL: ${message}`)
  process.exit(1)
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    fail(`cannot read/parse ${path.relative(root, file)}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function validNcm(code) {
  return /^\d{4}\.\d{2}\.\d{2}$/.test(code)
}

function validSim(code) {
  return /^\d{4}\.\d{2}\.\d{2}\.\d{3}[A-Z]$/.test(code)
}

if (!fs.existsSync(ncmPath)) fail('public/data/ncm-index.json is missing')
if (!fs.existsSync(simDir)) fail('public/data/sim is missing')

const ncm = readJson(ncmPath)
if (ncm?.meta?.source !== 'ARCA Arancel Integrado') fail('unexpected NCM source')
if (ncm?.meta?.sourceDate !== '2026-08-14') fail(`unexpected NCM sourceDate ${ncm?.meta?.sourceDate ?? 'missing'}`)
if (ncm?.meta?.tariffDataIncluded !== false) fail('NCM retrieval asset must not contain tariff data')
if (!Array.isArray(ncm?.records) || ncm.records.length < 1000) fail('NCM catalog is unexpectedly small')

const ncmCodes = new Set()
for (const row of ncm.records) {
  if (!Array.isArray(row) || row.length !== 2) fail('invalid NCM row shape')
  const [code, label] = row
  if (!validNcm(code)) fail(`invalid NCM code ${code}`)
  if (ncmCodes.has(code)) fail(`duplicate NCM code ${code}`)
  if (typeof label !== 'string') fail(`invalid NCM label for ${code}`)
  ncmCodes.add(code)
}

const simFiles = fs.readdirSync(simDir).filter((name) => /^\d{2}\.json$/.test(name)).sort()
if (simFiles.length < 80) fail(`too few SIM chapter files: ${simFiles.length}`)

let simOpeningCount = 0
let simParentCount = 0
const simCodes = new Set()
for (const fileName of simFiles) {
  const chapter = fileName.slice(0, 2)
  const payload = readJson(path.join(simDir, fileName))
  if (payload?.meta?.source !== 'ARCA Arancel Integrado') fail(`${fileName}: unexpected source`)
  if (payload?.meta?.sourceDate !== '2026-08-14') fail(`${fileName}: unexpected sourceDate`)
  if (payload?.meta?.simIndexSchema !== 1) fail(`${fileName}: unexpected SIM schema`)
  if (payload?.meta?.tariffDataIncluded !== false) fail(`${fileName}: tariff data leaked into SIM asset`)
  if (payload?.meta?.chapter !== chapter) fail(`${fileName}: chapter metadata mismatch`)
  if (!Array.isArray(payload?.records)) fail(`${fileName}: missing records`)
  if (payload.meta.recordCount !== payload.records.length) fail(`${fileName}: recordCount mismatch`)

  for (const row of payload.records) {
    if (!Array.isArray(row) || row.length !== 3) fail(`${fileName}: invalid SIM parent row shape`)
    const [ncmCode, label, openings] = row
    if (!validNcm(ncmCode)) fail(`${fileName}: invalid parent NCM ${ncmCode}`)
    if (!ncmCode.startsWith(chapter)) fail(`${fileName}: parent NCM ${ncmCode} is in wrong chapter`)
    if (!ncmCodes.has(ncmCode)) fail(`${fileName}: SIM parent ${ncmCode} missing from NCM catalog`)
    if (typeof label !== 'string') fail(`${fileName}: invalid parent label for ${ncmCode}`)
    if (!Array.isArray(openings) || openings.length === 0) fail(`${fileName}: parent ${ncmCode} has no openings`)
    simParentCount += 1

    for (const opening of openings) {
      if (!Array.isArray(opening) || opening.length !== 2) fail(`${fileName}: invalid SIM opening shape under ${ncmCode}`)
      const [simCode, simLabel] = opening
      if (!validSim(simCode)) fail(`${fileName}: invalid SIM code ${simCode}`)
      if (!simCode.startsWith(`${ncmCode}.`)) fail(`${fileName}: SIM ${simCode} does not belong to ${ncmCode}`)
      if (simCodes.has(simCode)) fail(`${fileName}: duplicate SIM code ${simCode}`)
      if (typeof simLabel !== 'string') fail(`${fileName}: invalid label for ${simCode}`)
      simCodes.add(simCode)
      simOpeningCount += 1
    }
  }
}

console.log(JSON.stringify({
  status: 'ok',
  source: ncm.meta.source,
  sourceDate: ncm.meta.sourceDate,
  ncmRecords: ncm.records.length,
  simChapterFiles: simFiles.length,
  simParents: simParentCount,
  simOpenings: simOpeningCount,
}, null, 2))
