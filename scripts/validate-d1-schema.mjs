import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

const db = new DatabaseSync(':memory:')
const migration = readFileSync('migrations/0001_saas_foundation.sql', 'utf8')
db.exec(migration)

const expectedTables = [
  'analyses', 'billing_events', 'credit_ledger', 'email_events', 'email_preferences',
  'plans', 'subscriptions', 'usage_periods', 'users', 'watchlist_items', 'watchlist_snapshots',
]
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name)
if (JSON.stringify(tables) !== JSON.stringify(expectedTables)) throw new Error(`D1 schema table mismatch: ${JSON.stringify(tables)}`)

const expectedIndexes = [
  'idx_analyses_user_created', 'idx_billing_events_status_created', 'idx_billing_events_user_created',
  'idx_credit_ledger_usage_period', 'idx_credit_ledger_user_created', 'idx_email_events_provider_message',
  'idx_email_events_user_created', 'idx_subscriptions_provider_id', 'idx_subscriptions_user',
  'idx_usage_periods_user_period', 'idx_users_email', 'idx_watchlist_items_user_active',
  'idx_watchlist_snapshots_item_observed',
]
const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name)
for (const name of expectedIndexes) if (!indexes.includes(name)) throw new Error(`Missing D1 index ${name}`)

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
console.log(`D1 schema validation passed: ${expectedTables.length} tables, ${expectedIndexes.length} required indexes, rollback probe PASS`)
