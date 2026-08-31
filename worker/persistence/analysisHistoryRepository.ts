import type { D1DatabaseLike, D1Value } from './d1'

const MAX = {
  id: 64,
  idempotencyKey: 191,
  requestId: 64,
  inputJson: 262144,
  resultJson: 1048576,
} as const

export type AnalysisHistoryRow = {
  id: string
  user_id: string
  request_id: string | null
  idempotency_key: string | null
  status: 'completed'
  input_json: string
  result_json: string
  error_code: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type AnalysisHistoryCursor = {
  createdAt: string
  id: string
}

function required(label: string, value: string, max: number) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new Error(`${label} must be between 1 and ${max} characters.`)
  }
  return value
}

function optional(label: string, value: string | null | undefined, max: number) {
  if (value == null) return null
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label} exceeds ${max} characters.`)
  return value
}

function jsonText(label: string, value: unknown, max: number) {
  const text = JSON.stringify(value)
  if (typeof text !== 'string') throw new Error(`${label} is not JSON serializable.`)
  if (text.length > max) throw new Error(`${label} exceeds ${max} characters.`)
  return text
}

function safeLimit(limit: number | undefined) {
  if (limit == null) return 20
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('limit must be an integer between 1 and 50.')
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

export class AnalysisHistoryRepository {
  constructor(private readonly db: D1DatabaseLike, private readonly clock: () => Date = () => new Date()) {}

  private now() {
    return this.clock().toISOString()
  }

  async saveCompleted(input: {
    id: string
    userId: string
    idempotencyKey: string
    requestId?: string | null
    input: unknown
    result: unknown
  }) {
    const now = this.now()
    const id = required('id', input.id, MAX.id)
    const userId = required('userId', input.userId, MAX.id)
    const idempotencyKey = required('idempotencyKey', input.idempotencyKey, MAX.idempotencyKey)
    const inputJson = jsonText('analysis input', input.input, MAX.inputJson)
    const resultJson = jsonText('analysis result', input.result, MAX.resultJson)

    await run(this.db,
      `INSERT INTO analyses (
        id, user_id, request_id, idempotency_key, status, input_json, result_json, error_code, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, 'completed', ?, ?, NULL, ?, ?, NULL)
      ON CONFLICT(user_id, idempotency_key) DO NOTHING`,
      [id, userId, optional('requestId', input.requestId, MAX.requestId), idempotencyKey, inputJson, resultJson, now, now],
    )

    const row = await first<AnalysisHistoryRow>(this.db,
      `SELECT * FROM analyses WHERE user_id = ? AND idempotency_key = ?`,
      [userId, idempotencyKey],
    )
    if (!row) throw new Error('Completed analysis persistence failed.')
    if (row.status !== 'completed' || row.input_json !== inputJson || row.result_json !== resultJson) {
      throw new Error('Analysis history idempotency collision.')
    }
    return row
  }

  async listVisibleForUser(userId: string, options: { limit?: number; before?: AnalysisHistoryCursor | null } = {}) {
    const owner = required('userId', userId, MAX.id)
    const limit = safeLimit(options.limit)
    const before = options.before

    if (!before) {
      return all<AnalysisHistoryRow>(this.db,
        `SELECT * FROM analyses
         WHERE user_id = ? AND status = 'completed' AND deleted_at IS NULL
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
        [owner, limit],
      )
    }

    const createdAt = required('cursor.createdAt', before.createdAt, 35)
    const id = required('cursor.id', before.id, MAX.id)
    return all<AnalysisHistoryRow>(this.db,
      `SELECT * FROM analyses
       WHERE user_id = ? AND status = 'completed' AND deleted_at IS NULL
         AND (created_at < ? OR (created_at = ? AND id < ?))
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [owner, createdAt, createdAt, id, limit],
    )
  }

  getVisibleForUser(userId: string, analysisId: string) {
    return first<AnalysisHistoryRow>(this.db,
      `SELECT * FROM analyses
       WHERE id = ? AND user_id = ? AND status = 'completed' AND deleted_at IS NULL`,
      [required('analysisId', analysisId, MAX.id), required('userId', userId, MAX.id)],
    )
  }

  async softDeleteForUser(userId: string, analysisId: string) {
    const now = this.now()
    const result = await run(this.db,
      `UPDATE analyses
       SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND status = 'completed' AND deleted_at IS NULL`,
      [now, now, required('analysisId', analysisId, MAX.id), required('userId', userId, MAX.id)],
    )
    return result.meta?.changes ?? 0
  }
}

export function parseAnalysisHistoryJson(row: AnalysisHistoryRow) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    input: JSON.parse(row.input_json) as unknown,
    result: JSON.parse(row.result_json) as unknown,
  }
}
