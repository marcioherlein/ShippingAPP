import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { validateDigestRecipientColumns } from './digest-schema-privacy.mjs'

const db = new DatabaseSync(':memory:')
const migrationFiles = readdirSync('migrations')
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort()

for (const name of migrationFiles) {
  db.exec(readFileSync(`migrations/${name}`, 'utf8'))
}

const expectedTables = [
  'analyses', 'billing_events', 'credit_ledger', 'credit_reservations', 'digest_run_recipients', 'digest_runs',
  'email_events', 'email_preferences', 'plans', 'subscriptions', 'usage_periods', 'users', 'watchlist_items', 'watchlist_snapshots',
]
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name)
if (JSON.stringify(tables) !== JSON.stringify(expectedTables)) throw new Error(`D1 schema table mismatch: ${JSON.stringify(tables)}`)

const expectedIndexes = [
  'idx_analyses_user_created', 'idx_analyses_user_visible_created', 'idx_billing_events_status_created', 'idx_billing_events_user_created',
  'idx_credit_ledger_usage_period', 'idx_credit_ledger_user_created', 'idx_credit_reservations_lease', 'idx_credit_reservations_user_status',
  'idx_digest_recipients_run_status', 'idx_digest_recipients_user_created', 'idx_digest_runs_status_updated',
  'idx_email_events_provider_message', 'idx_email_events_user_created', 'idx_subscriptions_provider_id', 'idx_subscriptions_user',
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

const expectedPlans = [
  { code: 'free', monthly_credits: 3 },
  { code: 'pro', monthly_credits: 30 },
  { code: 'business', monthly_credits: 100 },
]
const plans = db.prepare("SELECT code, monthly_credits FROM plans WHERE code IN ('free','pro','business') ORDER BY monthly_credits").all()
for (const expected of expectedPlans) {
  const row = plans.find((item) => item.code === expected.code)
  if (!row || Number(row.monthly_credits) !== expected.monthly_credits) {
    throw new Error(`Stage 5 entitlement plan seed mismatch for ${expected.code}: ${JSON.stringify(row)}`)
  }
}

const reservationIndexes = db.prepare("PRAGMA index_list('credit_reservations')").all()
const reservationUniqueIndexes = reservationIndexes.filter((row) => Number(row.unique) === 1)
const uniqueColumns = (index) => db.prepare(`PRAGMA index_info('${String(index.name).replaceAll("'", "''")}')`).all()
  .sort((a, b) => Number(a.seqno) - Number(b.seqno)).map((row) => row.name)
if (!reservationUniqueIndexes.some((index) => JSON.stringify(uniqueColumns(index)) === JSON.stringify(['user_id', 'operation_key']))) {
  throw new Error('Stage 5 credit reservation UNIQUE(user_id, operation_key) is missing')
}
if (!reservationUniqueIndexes.some((index) => JSON.stringify(uniqueColumns(index)) === JSON.stringify(['id', 'user_id']))) {
  throw new Error('Stage 5 credit reservation UNIQUE(id, user_id) is missing')
}

const reservationFks = db.prepare("PRAGMA foreign_key_list('credit_reservations')").all()
if (!reservationFks.some((row) => row.table === 'users' && row.from === 'user_id' && row.to === 'id')) {
  throw new Error('Stage 5 reservation user ownership FK is missing')
}
const periodFkColumns = new Set(reservationFks.filter((row) => row.table === 'usage_periods').map((row) => `${row.from}->${row.to}`))
if (!periodFkColumns.has('usage_period_id->id') || !periodFkColumns.has('user_id->user_id')) {
  throw new Error('Stage 5 composite reservation-to-usage-period ownership FK is missing')
}

const expectedTriggers = [
  'trg_credit_reservations_after_insert',
  'trg_credit_reservations_after_release',
  'trg_credit_reservations_after_retry',
  'trg_credit_reservations_before_insert',
  'trg_credit_reservations_before_update_identity',
  'trg_credit_reservations_before_update_transition',
]
const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_credit_reservations_%' ORDER BY name").all().map((row) => row.name)
if (JSON.stringify(triggers) !== JSON.stringify(expectedTriggers)) throw new Error(`Stage 5 reservation trigger mismatch: ${JSON.stringify(triggers)}`)

// Stage 6 email ownership and idempotency invariants.
const emailPreferenceFks = db.prepare("PRAGMA foreign_key_list('email_preferences')").all()
if (!emailPreferenceFks.some((row) => row.table === 'users' && row.from === 'user_id' && row.to === 'id')) {
  throw new Error('Stage 6 email preference owner FK is missing')
}
const emailEventFks = db.prepare("PRAGMA foreign_key_list('email_events')").all()
if (!emailEventFks.some((row) => row.table === 'users' && row.from === 'user_id' && row.to === 'id')) {
  throw new Error('Stage 6 email event user FK is missing')
}
const emailEventUnique = db.prepare("PRAGMA index_list('email_events')").all().filter((row) => Number(row.unique) === 1)
if (!emailEventUnique.some((index) => JSON.stringify(uniqueColumns(index)) === JSON.stringify(['idempotency_key']))) {
  throw new Error('Stage 6 email event idempotency uniqueness is missing')
}

// Stage 7 scheduler state must be idempotent, owner-linked, and persist only
// opaque scheduler/audit identifiers. email_event_id is an FK to Stage 6's
// delivery ledger; the exact allowlist rejects any recipient address or rendered
// message/product content column, including future names the old substring scan
// could miss.
const digestRunUnique = db.prepare("PRAGMA index_list('digest_runs')").all().filter((row) => Number(row.unique) === 1)
if (!digestRunUnique.some((index) => JSON.stringify(uniqueColumns(index)) === JSON.stringify(['run_key']))) {
  throw new Error('Stage 7 digest run-key uniqueness is missing')
}
const digestRecipientIndexes = db.prepare("PRAGMA index_list('digest_run_recipients')").all()
const digestPrimary = digestRecipientIndexes.find((row) => String(row.origin) === 'pk')
if (!digestPrimary || JSON.stringify(uniqueColumns(digestPrimary)) !== JSON.stringify(['run_id', 'user_id'])) {
  throw new Error('Stage 7 digest recipient composite primary key is missing')
}
const digestFks = db.prepare("PRAGMA foreign_key_list('digest_run_recipients')").all()
if (!digestFks.some((row) => row.table === 'digest_runs' && row.from === 'run_id' && row.to === 'id')) throw new Error('Stage 7 digest run FK is missing')
if (!digestFks.some((row) => row.table === 'users' && row.from === 'user_id' && row.to === 'id')) throw new Error('Stage 7 digest user FK is missing')
if (!digestFks.some((row) => row.table === 'email_events' && row.from === 'email_event_id' && row.to === 'id')) throw new Error('Stage 7 digest email-event FK is missing')
const digestColumns = db.prepare("PRAGMA table_info('digest_run_recipients')").all().map((row) => String(row.name))
validateDigestRecipientColumns(digestColumns)

// Prove the DB invariant itself: with one granted credit, the first reservation
// consumes it, the second distinct operation is rejected, release refunds once,
// and the released logical operation can be retried exactly once per attempt.
const now = '2026-08-31T20:00:00.000Z'
db.prepare("INSERT INTO users (id, auth_provider, auth_subject, created_at, updated_at) VALUES ('stage5-user', 'test', 'stage5-subject', ?, ?)").run(now, now)
db.prepare("INSERT INTO usage_periods (id, user_id, plan_id, period_start, period_end, credits_granted, credits_consumed, created_at, updated_at) VALUES ('stage5-period', 'stage5-user', 'plan-free-v1', '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', 1, 0, ?, ?)").run(now, now)
db.prepare("INSERT INTO credit_reservations (id, user_id, usage_period_id, operation_key, route_id, operation_kind, credits, attempt_no, status, lease_expires_at, created_at, updated_at) VALUES ('stage5-res-a', 'stage5-user', 'stage5-period', 'stage5-op-a', 'analyze', 'full_analysis', 1, 1, 'running', '2026-08-31T20:15:00.000Z', ?, ?)").run(now, now)
let usage = db.prepare("SELECT credits_consumed FROM usage_periods WHERE id='stage5-period'").get()
if (Number(usage.credits_consumed) !== 1) throw new Error('Stage 5 reservation trigger did not atomically consume credit')
let quotaBlocked = false
try {
  db.prepare("INSERT INTO credit_reservations (id, user_id, usage_period_id, operation_key, route_id, operation_kind, credits, attempt_no, status, lease_expires_at, created_at, updated_at) VALUES ('stage5-res-b', 'stage5-user', 'stage5-period', 'stage5-op-b', 'analyze', 'full_analysis', 1, 1, 'running', '2026-08-31T20:15:00.000Z', ?, ?)").run(now, now)
} catch (error) {
  quotaBlocked = String(error).includes('quota_exhausted')
}
if (!quotaBlocked) throw new Error('Stage 5 quota trigger allowed a second reservation past the limit')

db.prepare("UPDATE credit_reservations SET status='released', last_error_code='validator_probe', released_at=?, updated_at=? WHERE id='stage5-res-a'").run(now, now)
usage = db.prepare("SELECT credits_consumed FROM usage_periods WHERE id='stage5-period'").get()
if (Number(usage.credits_consumed) !== 0) throw new Error('Stage 5 release did not refund consumed counter')
const refundCountBefore = Number(db.prepare("SELECT COUNT(*) AS count FROM credit_ledger WHERE idempotency_key='refund:stage5-res-a:1'").get().count)
db.prepare("UPDATE credit_reservations SET last_error_code='validator_probe_again', updated_at=? WHERE id='stage5-res-a'").run(now)
const refundCountAfter = Number(db.prepare("SELECT COUNT(*) AS count FROM credit_ledger WHERE idempotency_key='refund:stage5-res-a:1'").get().count)
if (refundCountBefore !== 1 || refundCountAfter !== 1) throw new Error('Stage 5 release refund was not exactly once')

db.prepare("UPDATE credit_reservations SET status='running', attempt_no=2, last_error_code=NULL, released_at=NULL, lease_expires_at='2026-08-31T20:20:00.000Z', updated_at=? WHERE id='stage5-res-a'").run(now)
usage = db.prepare("SELECT credits_consumed FROM usage_periods WHERE id='stage5-period'").get()
if (Number(usage.credits_consumed) !== 1) throw new Error('Stage 5 retry did not reserve credit exactly once')
const consumeEntries = Number(db.prepare("SELECT COUNT(*) AS count FROM credit_ledger WHERE user_id='stage5-user' AND entry_type='consume'").get().count)
const refundEntries = Number(db.prepare("SELECT COUNT(*) AS count FROM credit_ledger WHERE user_id='stage5-user' AND entry_type='refund'").get().count)
if (consumeEntries !== 2 || refundEntries !== 1) throw new Error(`Stage 5 ledger attempt invariant failed: consume=${consumeEntries} refund=${refundEntries}`)

// Stage 7 run-level idempotency probe.
db.prepare("INSERT INTO digest_runs (id, run_key, period_start, period_end, due_at, status, cursor_user_id, invocation_count, last_error_code, started_at, updated_at, completed_at) VALUES ('digest-run-a', 'weekly:2026-08-31', '2026-08-31T00:00:00.000Z', '2026-09-07T00:00:00.000Z', '2026-08-31T11:00:00.000Z', 'running', NULL, 1, NULL, ?, ?, NULL)").run(now, now)
let duplicateRunBlocked = false
try {
  db.prepare("INSERT INTO digest_runs (id, run_key, period_start, period_end, due_at, status, cursor_user_id, invocation_count, last_error_code, started_at, updated_at, completed_at) VALUES ('digest-run-b', 'weekly:2026-08-31', '2026-08-31T00:00:00.000Z', '2026-09-07T00:00:00.000Z', '2026-08-31T11:00:00.000Z', 'running', NULL, 1, NULL, ?, ?, NULL)").run(now, now)
} catch {
  duplicateRunBlocked = true
}
if (!duplicateRunBlocked) throw new Error('Stage 7 duplicate weekly run key was not blocked')
db.prepare("INSERT INTO digest_run_recipients (run_id, user_id, status, attempt_count, created_at, updated_at) VALUES ('digest-run-a', 'stage5-user', 'pending', 0, ?, ?)").run(now, now)
let duplicateRecipientBlocked = false
try {
  db.prepare("INSERT INTO digest_run_recipients (run_id, user_id, status, attempt_count, created_at, updated_at) VALUES ('digest-run-a', 'stage5-user', 'pending', 0, ?, ?)").run(now, now)
} catch {
  duplicateRecipientBlocked = true
}
if (!duplicateRecipientBlocked) throw new Error('Stage 7 duplicate run/user recipient was not blocked')

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
console.log(`D1 schema validation passed: ${expectedTables.length} tables, ${expectedIndexes.length} required indexes, ${migrationFiles.length} migrations, Stage 4 ownership/dedupe PASS, Stage 5 atomic reservation/ledger constraints PASS, Stage 6 email ownership/idempotency PASS, Stage 7 weekly-run/recipient idempotency+privacy PASS, rollback probe PASS`)
