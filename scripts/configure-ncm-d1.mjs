import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function validD1DatabaseId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
}

export function configureWrangler(config, databaseId) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid wrangler configuration')
  if (!validD1DatabaseId(databaseId)) throw new Error('Invalid Cloudflare D1 database_id')

  const current = Array.isArray(config.d1_databases) ? config.d1_databases : []
  const preserved = current.filter((entry) => entry && typeof entry === 'object' && entry.binding !== 'NCM_DB')
  return {
    ...config,
    d1_databases: [
      ...preserved,
      {
        binding: 'NCM_DB',
        database_name: 'shippingapp-ncm',
        database_id: databaseId.trim(),
      },
    ],
  }
}

function runCli() {
  const databaseId = process.argv[2]
  const target = process.argv[3] || 'wrangler.jsonc'
  if (!databaseId) {
    console.error('Usage: npm run ncm:d1:configure -- <database_id> [wrangler.jsonc]')
    process.exit(2)
  }
  const absolute = path.resolve(target)
  const raw = fs.readFileSync(absolute, 'utf8')
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${target} must be parseable JSONC without comments for automatic configuration`)
  }
  const configured = configureWrangler(parsed, databaseId)
  fs.writeFileSync(absolute, `${JSON.stringify(configured, null, 2)}\n`)
  console.log(`Configured NCM_DB in ${target} -> shippingapp-ncm (${databaseId})`)
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (invoked) runCli()
