import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

export function extractDatabaseInfo(raw, expectedName = 'shippingapp-db') {
  const candidates = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.results)
      ? raw.results
      : [raw]

  const record = candidates.find((item) => item && typeof item === 'object' && item.name === expectedName)
    || candidates.find((item) => item && typeof item === 'object')

  if (!record) throw new Error(`D1 database ${expectedName} was not returned by Wrangler.`)

  const databaseId = record.uuid || record.id || record.database_id || record.databaseId
  const databaseName = record.name || expectedName

  if (typeof databaseId !== 'string' || !databaseId.trim()) {
    throw new Error('Wrangler D1 info did not include a database id.')
  }
  if (typeof databaseName !== 'string' || databaseName !== expectedName) {
    throw new Error(`Resolved unexpected D1 database name: ${String(databaseName)}`)
  }

  return { databaseId: databaseId.trim(), databaseName }
}

export function buildResolvedConfig(baseConfig, databaseInfo) {
  if (!baseConfig || typeof baseConfig !== 'object' || Array.isArray(baseConfig)) {
    throw new Error('Wrangler configuration must be an object.')
  }

  const existing = Array.isArray(baseConfig.d1_databases) ? baseConfig.d1_databases : []
  const dbBinding = existing.find((binding) => binding?.binding === 'DB') || {}
  const otherBindings = existing.filter((binding) => binding?.binding !== 'DB')

  return {
    ...baseConfig,
    d1_databases: [
      ...otherBindings,
      {
        ...dbBinding,
        binding: 'DB',
        database_name: databaseInfo.databaseName,
        database_id: databaseInfo.databaseId,
        migrations_dir: dbBinding.migrations_dir || 'migrations',
      },
    ],
  }
}

export function resolveProductionD1Config({ infoPath, baseConfigPath = 'wrangler.jsonc', outputPath = '.wrangler.production.json', expectedName = 'shippingapp-db' }) {
  if (!infoPath) throw new Error('infoPath is required.')
  const rawInfo = JSON.parse(fs.readFileSync(infoPath, 'utf8').replace(/^\uFEFF/, ''))
  const baseConfig = JSON.parse(fs.readFileSync(baseConfigPath, 'utf8').replace(/^\uFEFF/, ''))
  const info = extractDatabaseInfo(rawInfo, expectedName)
  const resolved = buildResolvedConfig(baseConfig, info)
  fs.writeFileSync(outputPath, `${JSON.stringify(resolved, null, 2)}\n`, 'utf8')
  return info
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [infoPath, baseConfigPath = 'wrangler.jsonc', outputPath = '.wrangler.production.json', expectedName = 'shippingapp-db'] = process.argv.slice(2)
  const info = resolveProductionD1Config({ infoPath, baseConfigPath, outputPath, expectedName })
  console.log(`Resolved production D1 binding DB -> ${info.databaseName} (${info.databaseId.slice(0, 8)}...)`)
}
