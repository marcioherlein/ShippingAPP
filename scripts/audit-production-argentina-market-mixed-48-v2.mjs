import { spawnSync } from 'node:child_process'
import { upgradeMixed48Audit } from './mixed48-audit-semantics.mjs'

const child = spawnSync(process.execPath, ['scripts/audit-production-argentina-market-mixed-48.mjs'], {
  env: process.env,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
})

if (child.error) throw child.error
if (child.status !== 0) {
  process.stdout.write(child.stdout || '')
  process.stderr.write(child.stderr || '')
  process.exit(child.status ?? 1)
}

const stdout = child.stdout || ''
const marker = '{\n  "status": "audit_complete"'
const jsonStart = stdout.lastIndexOf(marker)
if (jsonStart < 0) {
  process.stdout.write(stdout)
  throw new Error('Could not locate legacy mixed-48 audit JSON payload.')
}

const progress = stdout.slice(0, jsonStart).trimEnd()
if (progress) process.stdout.write(`${progress}\n`)

const legacyJson = stdout.slice(jsonStart).trim()
const legacy = JSON.parse(legacyJson)
const upgraded = upgradeMixed48Audit(legacy)

console.log(JSON.stringify(upgraded, null, 2))
