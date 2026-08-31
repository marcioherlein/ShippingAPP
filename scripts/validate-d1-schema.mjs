import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'

const db = new DatabaseSync(':memory:')
const migrationFiles = readdirSync('migrations')
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort()

for (const name of migrationFiles) {
  db.exec(readFileSync(`migrations/${name}`, 'utf8'))
}

const expectedTables = [
  'analyses', 'billing_events', 'credit_ledger', 'email_events', 'email_preferences',
  'plans', 'subscriptions', 'usage_periods', 'users', 'watchlist_items', 'watchlist_snapshots',
]
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name)
if (JSON.stringify(tables) !== JSON.stringify(expectedTables)) throw new Error(`D1 schema table mismatch: ${JSON.stringify(tables)}`)

const expectedIndexes = [
  'idx_analyses_user_created', 'idx_analyses_user_visible_created', 'idx_billing_events_status_created', 'idx_billing_events_user_created',
  'idx_credit_ledger_usage_period', 'idx_credit_ledger_user_created', 'idx_email_events_provider_message',
  'idx_email_events_user_created', 'idx_subscriptions_provider_id', 'idx_subscriptions_user',
  'idx_usage_periods_user_period', 'idx_users_email', 'idx_watchlist_items_user_active',
  'idx_watchlist_snapshots_item_observed',
]
const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name)
for (const name of expectedIndexes) if (!indexes.includes(name)) throw new Error(`Missing D1 index ${name}`)

const analysisColumns = db.prepare('PRAGMA table_info(analyses)').all().map((row) => row.name)
if (!analysisColumns.includes('deleted_at')) throw new Error('Stage 3 analyses.deleted_at column is missing')

const watchlistIndexes = db.prepare("PRAGMA index_list('watchlist_items')").all()
const watchlistUniqueIndexes = watchlistIndexes.filter((row) => Number(row.unique) === 1)
const hasUserSourceUnique = watchlistUniqueIndexes.some((index) => {
  const columns = db.prepare(`PRAGMA index_info('${String(index.name).replaceAll("'", "''")}')`).all().sort((a, b) => Number(a.seqno) - Number(b.seqno)).map((row) => row.name)
  return JSON.stringify(columns) === JSON.stringify(['user_id', 'source_url'])
})
if (!hasUserSourceUnique) throw new Error('Stage 4 watchlist UNIQUE(user_id, source_url) is missing')

const snapshotIndexes = db.prepare("PRAGMA index_list('watchlist_snapshots')").all()
const hasSnapshotIdempotencyUnique = snapshotIndexes.filter((row) => Number(row.unique) === 1).some((index) => {
  const columns = db.prepare(`PRAGMA index_info('${String(index.name).replaceAll("'", "''")}')`).all().sort((a, b) => Number(a.seqno) - Number(b.seqno)).map((row) => row.name)
  return JSON.stringify(columns) === JSON.stringify(['idempotency_key'])
})
if (!hasSnapshotIdempotencyUnique) throw new Error('Stage 4 watchlist snapshot idempotency uniqueness is missing')

const watchlistFks = db.prepare("PRAGMA foreign_key_list('watchlist_items')").all()
if (!watchlistFks.some((row) => row.table === 'users' && row.from === 'user_id' && row.to === 'id')) {
  throw new Error('Stage 4 watchlist user ownership FK is missing')
}
const analysisFkRows = watchlistFks.filter((row) => row.table === 'analyses')
const analysisFkColumns = new Set(analysisFkRows.map((row) => `${row.from}->${row.to}`))
if (!analysisFkColumns.has('analysis_id->id') || !analysisFkColumns.has('user_id->user_id')) {
  throw new Error('Stage 4 composite watchlist-to-analysis ownership FK is missing')
}
const snapshotFks = db.prepare("PRAGMA foreign_key_list('watchlist_snapshots')").all()
if (!snapshotFks.some((row) => row.table === 'watchlist_items' && row.from === 'watchlist_item_id' && row.to === 'id')) {
  throw new Error('Stage 4 snapshot parent FK is missing')
}

if (db.prepare('PRAGMA foreign_keys').get().foreign_keys !== 1) throw new Error('Foreign keys are not enabled')

let failed = false
try {
  db.exec("BEGIN; CREATE TABLE migration_probe (id INTEGER PRIMARY KEY); INSERT INTO migration_probe VALUES (1); INSERT INTO definitely_missing_table VALUES (1); COMMIT;")
} catch {
  failed = true
  try { db.exec('ROLLBACK') } catch { /* host may auto-rollback */ }
}
if (!failed) throw new Error('Synthetic migration failure did not fail')
if (db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='migration_probe'").get().count !== 0) throw new Error('Failed migration left partial schema behind')
if (db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='users'").get().count !== 1) throw new Error('Failed migration damaged prior schema')

db.close()
console.log(`D1 schema validation passed: ${expectedTables.length} tables, ${expectedIndexes.length} required indexes, ${migrationFiles.length} migrations, Stage 4 ownership/dedupe constraints PASS, rollback probe PASS`)
