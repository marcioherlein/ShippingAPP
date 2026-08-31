import { readTrustedUserId } from './auth'
import type { D1DatabaseLike } from './persistence/d1'
import { AnalysisHistoryRepository, parseAnalysisHistoryJson, type AnalysisHistoryCursor, type AnalysisHistoryRow } from './persistence/analysisHistoryRepository'

type Env = Record<string, unknown> & { DB?: D1DatabaseLike }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})

function notFound() {
  return json({ error: 'History item not found.', code: 'history_not_found' }, 404)
}

function parsePositiveInt(raw: string | null, fallback: number) {
  if (raw == null || raw === '') return fallback
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function encodeCursor(cursor: AnalysisHistoryCursor) {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeCursor(raw: string | null): AnalysisHistoryCursor | null {
  if (!raw) return null
  try {
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    const parsed = JSON.parse(atob(padded)) as Partial<AnalysisHistoryCursor>
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null
    return { createdAt: parsed.createdAt, id: parsed.id }
  } catch {
    return null
  }
}

function historySummary(row: AnalysisHistoryRow) {
  const parsed = parseAnalysisHistoryJson(row)
  const input = parsed.input as any
  const result = parsed.result as any
  const analysis = result?.analysis ?? result?.productAnalysis ?? null
  const pipeline = result?.pipelineSummary ?? null
  return {
    id: parsed.id,
    createdAt: parsed.createdAt,
    productName: analysis?.product?.name ?? input?.productName ?? input?.analysis?.product?.name ?? 'Análisis guardado',
    sourceUrl: analysis?.sourceUrl ?? input?.sourceUrl ?? input?.analysis?.sourceUrl ?? null,
    ncmCode: analysis?.customs?.ncmCandidate ?? null,
    selectedMode: pipeline?.selectedMode ?? null,
    unitCostUsd: typeof pipeline?.unitCostUsd === 'number' ? pipeline.unitCostUsd : null,
    totalCostUsd: typeof pipeline?.totalCostUsd === 'number' ? pipeline.totalCostUsd : null,
  }
}

export function isAnalysisHistoryRoute(pathname: string) {
  return pathname === '/api/history' || pathname === '/api/history-item'
}

export async function handleAnalysisHistory(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const userId = readTrustedUserId(request)
  if (!userId) return json({ error: 'Unauthorized.', code: 'unauthorized' }, 401)
  if (!env.DB) return json({ error: 'History storage is not configured.', code: 'history_store_unavailable' }, 503)

  const repo = new AnalysisHistoryRepository(env.DB)

  if (url.pathname === '/api/history' && request.method === 'POST') {
    let body: any
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Invalid JSON body.', code: 'invalid_json' }, 400)
    }
    if (!body || typeof body !== 'object' || typeof body.idempotencyKey !== 'string' || body.input === undefined || body.result === undefined) {
      return json({ error: 'idempotencyKey, input and result are required.', code: 'invalid_history_payload' }, 400)
    }

    try {
      const row = await repo.saveCompleted({
        id: crypto.randomUUID(),
        userId,
        idempotencyKey: body.idempotencyKey,
        input: body.input,
        result: body.result,
      })
      return json({ item: historySummary(row) }, 201)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (/must be|exceeds|serializable/i.test(message)) return json({ error: 'History payload is invalid.', code: 'invalid_history_payload' }, 400)
      if (/idempotency collision/i.test(message)) return json({ error: 'Idempotency key was already used for different content.', code: 'idempotency_collision' }, 409)
      throw error
    }
  }

  if (url.pathname === '/api/history' && request.method === 'GET') {
    const limit = parsePositiveInt(url.searchParams.get('limit'), 20)
    if (limit == null || limit > 50) return json({ error: 'limit must be between 1 and 50.', code: 'invalid_pagination' }, 400)
    const rawCursor = url.searchParams.get('cursor')
    const before = rawCursor ? decodeCursor(rawCursor) : null
    if (rawCursor && !before) return json({ error: 'Invalid history cursor.', code: 'invalid_pagination' }, 400)

    const rows = await repo.listVisibleForUser(userId, { limit: limit + 1, before })
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const tail = page.at(-1)
    return json({
      items: page.map(historySummary),
      nextCursor: hasMore && tail ? encodeCursor({ createdAt: tail.created_at, id: tail.id }) : null,
    })
  }

  if (url.pathname === '/api/history-item' && request.method === 'GET') {
    const id = url.searchParams.get('id')
    if (!id) return notFound()
    let row: AnalysisHistoryRow | null
    try {
      row = await repo.getVisibleForUser(userId, id)
    } catch {
      return notFound()
    }
    if (!row) return notFound()
    return json({ item: parseAnalysisHistoryJson(row) })
  }

  if (url.pathname === '/api/history-item' && request.method === 'DELETE') {
    const id = url.searchParams.get('id')
    if (!id) return notFound()
    let changed = 0
    try {
      changed = await repo.softDeleteForUser(userId, id)
    } catch {
      return notFound()
    }
    return changed === 1 ? new Response(null, { status: 204 }) : notFound()
  }

  return json({ error: 'Method not allowed.', code: 'method_not_allowed' }, 405)
}
