import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthIdentity } from './auth'
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResultLike, D1Value } from './persistence/d1'
import { CREDITS_REMAINING_HEADER, USAGE_RESERVATION_HEADER, withUsageEntitlement } from './usage'

class NodeStatement implements D1PreparedStatementLike {
  constructor(private readonly statement: StatementSync, private readonly values: D1Value[] = []) {}
  bind(...values: D1Value[]) { return new NodeStatement(this.statement, values) }
  async first<T>() { return (this.statement.get(...this.values as any[]) as T | undefined) ?? null }
  async all<T>() { return { results: this.statement.all(...this.values as any[]) as T[] } }
  async run(): Promise<D1RunResultLike> {
    const result = this.statement.run(...this.values as any[])
    return { success: true, meta: { changes: Number(result.changes) } }
  }
}

class NodeDatabase implements D1DatabaseLike {
  constructor(readonly raw: DatabaseSync) {}
  prepare(sql: string) { return new NodeStatement(this.raw.prepare(sql)) }
}

const USER = 'iterative-user-0000-4000-8000-000000000001'
const NOW = '2026-09-02T12:00:00.000Z'
const identity: AuthIdentity = { kind: 'user', provider: 'clerk', subject: 'iterative-subject', userId: USER }

function seed(sqlite: DatabaseSync) {
  for (const migration of [
    '0001_saas_foundation.sql',
    '0002_analysis_history.sql',
    '0003_usage_entitlements.sql',
    '0005_ncm_iterative_clarifications.sql',
  ]) sqlite.exec(readFileSync(`migrations/${migration}`, 'utf8'))
  sqlite.prepare("INSERT INTO users (id, auth_provider, auth_subject, created_at, updated_at) VALUES (?, 'test', ?, ?, ?)")
    .run(USER, 'iterative-subject', NOW, NOW)
}

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://shippingapp.test${path}`, init)
}

function analyzeRequest(key: string) {
  return request('/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify({ url: 'https://www.alibaba.com/product-detail/cabinet-lock.html' }),
  })
}

const product = {
  name: 'Cabinet/Drawer Lock',
  category: 'Cabinet Locks',
  material: 'zinc alloy',
  functionText: 'lock',
  description: 'Mechanical cabinet and drawer lock',
}

function continuation(reservationId: string, facts = product) {
  return request('/api/ncm-classify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [USAGE_RESERVATION_HEADER]: reservationId },
    body: JSON.stringify(facts),
  })
}

function lowResult(missing = 'Función/uso principal') {
  return {
    status: 'candidate',
    code: '8301.30.00',
    label: 'Cerraduras de los tipos utilizados en muebles',
    confidence: 'low',
    missingFacts: [missing],
  }
}

function highResult() {
  return {
    status: 'candidate',
    code: '8301.30.00',
    label: 'Cerraduras de los tipos utilizados en muebles',
    confidence: 'high',
    missingFacts: [],
  }
}

describe('iterative NCM clarification session', () => {
  let sqlite: DatabaseSync
  let db: NodeDatabase

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:')
    seed(sqlite)
    db = new NodeDatabase(sqlite)
  })

  afterEach(() => sqlite.close())

  it('keeps one credit while a low result is clarified and then resolved', async () => {
    const analyzed = await withUsageEntitlement(analyzeRequest('cabinet-lock-flow-1'), { DB: db }, identity,
      async () => Response.json({ product }))
    const reservationId = String(analyzed.headers.get(USAGE_RESERVATION_HEADER))
    expect(analyzed.headers.get(CREDITS_REMAINING_HEADER)).toBe('2')

    const provider = vi.fn()
      .mockResolvedValueOnce(Response.json(lowResult()))
      .mockResolvedValueOnce(Response.json(highResult()))

    const first = await withUsageEntitlement(continuation(reservationId), { DB: db }, identity, provider)
    expect(first.status).toBe(200)
    expect((await first.json() as any).refinement).toEqual({ allowed: true, attempt: 1, maxAttempts: 3 })
    expect((sqlite.prepare('SELECT status FROM credit_reservations WHERE id = ?').get(reservationId) as any).status).toBe('continuation_ready')

    const clarified = {
      ...product,
      material: 'zinc alloy body with steel cam',
      functionText: 'mechanical lock for securing cabinet doors and drawers',
      description: `${product.description}. Aclaración del usuario: uso principal asegurar cajones y puertas de gabinetes`,
    }
    const second = await withUsageEntitlement(continuation(reservationId, clarified), { DB: db }, identity, provider)
    expect(second.status).toBe(200)
    expect((await second.json() as any).refinement).toEqual({ allowed: false, attempt: 2, maxAttempts: 3 })
    expect(provider).toHaveBeenCalledTimes(2)

    const row = sqlite.prepare('SELECT status, continuation_attempt_no FROM credit_reservations WHERE id = ?').get(reservationId) as any
    expect(row).toMatchObject({ status: 'settled', continuation_attempt_no: 2 })
    const usage = sqlite.prepare('SELECT credits_consumed FROM usage_periods WHERE user_id = ?').get(USER) as any
    expect(Number(usage.credits_consumed)).toBe(1)
    const consumes = sqlite.prepare("SELECT COUNT(*) AS count FROM credit_ledger WHERE user_id = ? AND entry_type = 'consume'").get(USER) as any
    expect(Number(consumes.count)).toBe(1)
  })

  it('caps unresolved refinement at three provider calls and replays the final low result', async () => {
    const analyzed = await withUsageEntitlement(analyzeRequest('cabinet-lock-flow-2'), { DB: db }, identity,
      async () => Response.json({ product }))
    const reservationId = String(analyzed.headers.get(USAGE_RESERVATION_HEADER))
    const provider = vi.fn(async () => Response.json(lowResult()))

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const facts = { ...product, description: `${product.description}. Aclaración del usuario ${attempt}` }
      const response = await withUsageEntitlement(continuation(reservationId, facts), { DB: db }, identity, provider)
      expect(response.status).toBe(200)
      const body = await response.json() as any
      expect(body.refinement.attempt).toBe(attempt)
      expect(body.refinement.maxAttempts).toBe(3)
      expect(body.refinement.allowed).toBe(attempt < 3)
    }

    const row = sqlite.prepare('SELECT status, continuation_attempt_no FROM credit_reservations WHERE id = ?').get(reservationId) as any
    expect(row).toMatchObject({ status: 'settled', continuation_attempt_no: 3 })

    const replay = await withUsageEntitlement(continuation(reservationId, { ...product, description: 'another clarification' }), { DB: db }, identity, provider)
    expect(replay.status).toBe(200)
    expect(replay.headers.get('x-shippingapp-idempotency-replayed')).toBe('true')
    expect((await replay.json() as any).refinement).toEqual({ allowed: false, attempt: 3, maxAttempts: 3 })
    expect(provider).toHaveBeenCalledTimes(3)
  })

  it('still rejects a pivot to a different core product before provider work', async () => {
    const analyzed = await withUsageEntitlement(analyzeRequest('cabinet-lock-flow-3'), { DB: db }, identity,
      async () => Response.json({ product }))
    const reservationId = String(analyzed.headers.get(USAGE_RESERVATION_HEADER))
    const provider = vi.fn(async () => Response.json(highResult()))

    const pivot = await withUsageEntitlement(continuation(reservationId, {
      ...product,
      name: 'Smartwatch AMOLED',
      category: 'Wearable Electronics',
      functionText: 'smartwatch',
    }), { DB: db }, identity, provider)

    expect(pivot.status).toBe(409)
    expect((await pivot.json() as any).code).toBe('usage_continuation_mismatch')
    expect(provider).not.toHaveBeenCalled()
    const row = sqlite.prepare('SELECT status, continuation_attempt_no FROM credit_reservations WHERE id = ?').get(reservationId) as any
    expect(row).toMatchObject({ status: 'continuation_ready', continuation_attempt_no: 0 })
  })
})
