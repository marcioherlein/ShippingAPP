import type { D1DatabaseLike, D1Value } from './d1'

const MAX = {
  id: 64,
  title: 240,
  sourceUrl: 2048,
  metadataJson: 262144,
  snapshotJson: 524288,
  idempotencyKey: 191,
} as const

export type WatchlistItemRow = {
  id: string
  user_id: string
  analysis_id: string | null
  title: string
  source_url: string
  active: number
  metadata_json: string | null
  created_at: string
  updated_at: string
}

export type WatchlistSnapshotRow = {
  id: string
  watchlist_item_id: string
  observed_at: string
  market_price_ars: number | null
  landed_cost_ars: number | null
  payload_json: string | null
  idempotency_key: string
  created_at: string
}

function required(label: string, value: string, max: number) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new Error(`${label} must be between 1 and ${max} characters.`)
  }
  return value
}

function finiteNonNegative(label: string, value: number | null | undefined) {
  if (value == null) return null
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number.`)
  return value
}

function isoUtc(label: string, value: string) {
  if (typeof value !== 'string' || !value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid UTC ISO timestamp.`)
  }
  return new Date(value).toISOString()
}

function jsonText(label: string, value: unknown | null | undefined, max: number) {
  if (value == null) return null
  const text = JSON.stringify(value)
  if (typeof text !== 'string') throw new Error(`${label} is not JSON serializable.`)
  if (text.length > max) throw new Error(`${label} exceeds ${max} characters.`)
  return text
}

function safeLimit(limit: number | undefined) {
  if (limit == null) return 24
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be an integer between 1 and 100.')
  return limit
}

async function first<T>(db: D1DatabaseLike, sql: string, values: D1Value[]) {
  return db.prepare(sql).bind(...values).first<T>()
}

async function all<T>(db: D1DatabaseLike, sql: string, values: D1Value[]) {
  return (await db.prepare(sql).bind(...values).all<T>()).results
}

async function run(db: D1DatabaseLike, sql: string, values: D1Value[]) {
  return db.prepare(sql).bind(...values).run()
}

export class WatchlistRepository {
  constructor(private readonly db: D1DatabaseLike, private readonly clock: () => Date = () => new Date()) {}

  private now() {
    return this.clock().toISOString()
  }

  async addOrReactivateFromAnalysis(input: {
    id: string
    userId: string
    analysisId: string
    title: string
    sourceUrl: string
    metadata?: unknown | null
  }) {
    const now = this.now()
    const userId = required('userId', input.userId, MAX.id)
    const sourceUrl = required('sourceUrl', input.sourceUrl, MAX.sourceUrl)
    const metadataJson = jsonText('watchlist metadata', input.metadata, MAX.metadataJson)

    await run(this.db,
      `INSERT INTO watchlist_items (
        id, user_id, analysis_id, title, source_url, active, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(user_id, source_url) DO UPDATE SET
        analysis_id = excluded.analysis_id,
        title = excluded.title,
        active = 1,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at`,
      [
        required('id', input.id, MAX.id),
        userId,
        required('analysisId', input.analysisId, MAX.id),
        required('title', input.title, MAX.title),
        sourceUrl,
        metadataJson,
        now,
        now,
      ],
    )

    const row = await first<WatchlistItemRow>(this.db,
      'SELECT * FROM watchlist_items WHERE user_id = ? AND source_url = ?',
      [userId, sourceUrl],
    )
    if (!row) throw new Error('Watchlist item creation failed.')
    return row
  }

  listActiveForUser(userId: string) {
    return all<WatchlistItemRow>(this.db,
      `SELECT * FROM watchlist_items
       WHERE user_id = ? AND active = 1
       ORDER BY updated_at DESC, id DESC`,
      [required('userId', userId, MAX.id)],
    )
  }

  getActiveForUser(userId: string, itemId: string) {
    return first<WatchlistItemRow>(this.db,
      `SELECT * FROM watchlist_items WHERE id = ? AND user_id = ? AND active = 1`,
      [required('itemId', itemId, MAX.id), required('userId', userId, MAX.id)],
    )
  }

  async deactivateForUser(userId: string, itemId: string) {
    const now = this.now()
    const result = await run(this.db,
      `UPDATE watchlist_items SET active = 0, updated_at = ?
       WHERE id = ? AND user_id = ? AND active = 1`,
      [now, required('itemId', itemId, MAX.id), required('userId', userId, MAX.id)],
    )
    return result.meta?.changes ?? 0
  }

  async addSnapshotForUser(input: {
    id: string
    userId: string
    watchlistItemId: string
    observedAt: string
    marketPriceArs?: number | null
    landedCostArs?: number | null
    payload?: unknown | null
    idempotencyKey: string
  }) {
    const now = this.now()
    const id = required('id', input.id, MAX.id)
    const userId = required('userId', input.userId, MAX.id)
    const itemId = required('watchlistItemId', input.watchlistItemId, MAX.id)
    const observedAt = isoUtc('observedAt', input.observedAt)
    const marketPriceArs = finiteNonNegative('marketPriceArs', input.marketPriceArs)
    const landedCostArs = finiteNonNegative('landedCostArs', input.landedCostArs)
    const payloadJson = jsonText('snapshot payload', input.payload, MAX.snapshotJson)
    const key = required('idempotencyKey', input.idempotencyKey, MAX.idempotencyKey)

    await run(this.db,
      `INSERT INTO watchlist_snapshots (
        id, watchlist_item_id, observed_at, market_price_ars, landed_cost_ars, payload_json, idempotency_key, created_at
      )
      SELECT ?, wi.id, ?, ?, ?, ?, ?, ?
      FROM watchlist_items wi
      WHERE wi.id = ? AND wi.user_id = ? AND wi.active = 1
      ON CONFLICT(idempotency_key) DO NOTHING`,
      [id, observedAt, marketPriceArs, landedCostArs, payloadJson, key, now, itemId, userId],
    )

    const row = await first<WatchlistSnapshotRow>(this.db,
      `SELECT ws.* FROM watchlist_snapshots ws
       JOIN watchlist_items wi ON wi.id = ws.watchlist_item_id
       WHERE ws.idempotency_key = ? AND wi.user_id = ?`,
      [key, userId],
    )
    if (!row) throw new Error('Watchlist snapshot creation failed.')

    if (
      row.watchlist_item_id !== itemId
      || row.observed_at !== observedAt
      || row.market_price_ars !== marketPriceArs
      || row.landed_cost_ars !== landedCostArs
      || row.payload_json !== payloadJson
    ) {
      throw new Error('Watchlist snapshot idempotency collision.')
    }
    return row
  }

  listSnapshotsForUser(userId: string, itemId: string, limit?: number) {
    return all<WatchlistSnapshotRow>(this.db,
      `SELECT ws.* FROM watchlist_snapshots ws
       JOIN watchlist_items wi ON wi.id = ws.watchlist_item_id
       WHERE wi.id = ? AND wi.user_id = ?
       ORDER BY ws.observed_at DESC, ws.id DESC
       LIMIT ?`,
      [required('itemId', itemId, MAX.id), required('userId', userId, MAX.id), safeLimit(limit)],
    )
  }
}

export function parseWatchlistMetadata(row: WatchlistItemRow) {
  if (!row.metadata_json) return null
  return JSON.parse(row.metadata_json) as unknown
}

export function parseWatchlistSnapshotPayload(row: WatchlistSnapshotRow) {
  if (!row.payload_json) return null
  return JSON.parse(row.payload_json) as unknown
}
