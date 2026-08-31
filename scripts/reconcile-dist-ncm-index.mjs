import fs from 'node:fs'
import path from 'node:path'
import { loadCanonicalSimParentLabels, reconcileNcmIndexLabels } from './ncm-label-reconciliation.mjs'

const root = process.cwd()
const sourcePath = path.join(root, 'public', 'data', 'ncm-index.json')
const simDir = path.join(root, 'public', 'data', 'sim')
const targetPath = path.join(root, 'dist', 'data', 'ncm-index.json')

if (!fs.existsSync(targetPath)) throw new Error('dist/data/ncm-index.json is missing; run Vite build before NCM label reconciliation')

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
const { labelsByCode, sourceDate, chapterFiles } = loadCanonicalSimParentLabels(simDir)
const runtime = reconcileNcmIndexLabels(source, labelsByCode, sourceDate)
fs.writeFileSync(targetPath, `${JSON.stringify(runtime)}\n`, 'utf8')

console.log(JSON.stringify({
  status: 'ok',
  output: 'dist/data/ncm-index.json',
  records: runtime.records.length,
  canonicalLabelSource: runtime.meta.canonicalLabelSource,
  canonicalLabelSourceDate: runtime.meta.canonicalLabelSourceDate,
  canonicalLabelCoverage: runtime.meta.canonicalLabelCoverage,
  simChapterFiles: chapterFiles,
}, null, 2))
