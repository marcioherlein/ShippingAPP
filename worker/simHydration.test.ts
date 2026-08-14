import { beforeEach, describe, expect, it } from 'vitest'
import { resetSimCacheForTests, resolveSimOpening, sanitizeSimRanking, scoreSimOpenings } from './simHydration'

function chapter(records: any[]) {
  return {
    meta: { sourceDate: '2026-08-14', simIndexSchema: 1, tariffDataIncluded: false, chapter: '95', recordCount: records.length },
    records,
  }
}

function assets(payload: any) {
  return { fetch: async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }) }
}

function ai(outputs: unknown[]) {
  let i = 0
  return { run: async () => ({ response: JSON.stringify(outputs[i++] ?? {}) }) }
}

beforeEach(() => resetSimCacheForTests())

describe('SIM opening scoring and sanitization', () => {
  it('gives badminton evidence to the official badminton opening', () => {
    const ranked = scoreSimOpenings([
      ['9506.59.00.100F', 'Raquetas de badminton, incluso sin cordaje'],
      ['9506.59.00.900Z', 'Las demás'],
    ], { name: 'Professional badminton racket', category: 'Badminton racket' })
    expect(ranked[0].code).toBe('9506.59.00.100F')
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
  })

  it('drops an AI-invented SIM suffix', () => {
    const allowed = [
      { code: '9506.59.00.100F', label: 'Badminton', score: 5 },
      { code: '9506.59.00.900Z', label: 'Las demás', score: 0 },
    ]
    const result = sanitizeSimRanking({ ranking: [{ code: '9506.59.00.999Q' }, { code: '9506.59.00.100F' }] }, allowed)
    expect(result.ranking.map((item) => item.code)).toEqual(['9506.59.00.100F'])
  })
})

describe('SIM hydration', () => {
  it('returns a single official opening without calling AI', async () => {
    let calls = 0
    const result = await resolveSimOpening('https://shippingapp.test/api', assets(chapter([
      ['9506.40.00', 'Tenis de mesa', [['9506.40.00.200P', 'Paletas']]],
    ])), { run: async () => { calls += 1; return {} } }, '9506.40.00', { name: 'table tennis paddle' })
    expect(result.status).toBe('single')
    expect(result.candidate?.code).toBe('9506.40.00.200P')
    expect(result.confidence).toBe('high')
    expect(calls).toBe(0)
  })

  it('resolves badminton strongly when deterministic and AI evidence agree', async () => {
    const result = await resolveSimOpening('https://shippingapp.test/api', assets(chapter([
      ['9506.59.00', 'Raquetas similares', [
        ['9506.59.00.100F', 'Raquetas de badminton, incluso sin cordaje'],
        ['9506.59.00.200L', 'Raquetas de squash, incluso sin cordaje'],
        ['9506.59.00.900Z', 'Las demás'],
      ]],
    ])), ai([{ ranking: [{ code: '9506.59.00.100F', reason: 'Producto descrito expresamente como badminton.' }], confidence: 'high', missingFacts: [] }]), '9506.59.00', { name: 'badminton racket', category: 'Badminton racket' })
    expect(result.candidate?.code).toBe('9506.59.00.100F')
    expect(['high', 'medium']).toContain(result.confidence)
  })

  it('keeps an AI-only residual choice LOW when text cannot distinguish it deterministically', async () => {
    const result = await resolveSimOpening('https://shippingapp.test/api', assets(chapter([
      ['9506.59.00', 'Raquetas similares', [
        ['9506.59.00.100F', 'Raquetas de badminton'],
        ['9506.59.00.200L', 'Raquetas de squash'],
        ['9506.59.00.900Z', 'Las demás'],
      ]],
    ])), ai([{ ranking: [{ code: '9506.59.00.900Z', reason: 'Padel no coincide con badminton ni squash.' }], confidence: 'high', missingFacts: [] }]), '9506.59.00', { name: 'padel racket', category: 'Padel racket' })
    expect(result.candidate?.code).toBe('9506.59.00.900Z')
    expect(result.confidence).toBe('low')
  })

  it('returns not_found rather than borrowing openings from another NCM', async () => {
    const result = await resolveSimOpening('https://shippingapp.test/api', assets(chapter([
      ['9506.59.00', 'Raquetas similares', [['9506.59.00.900Z', 'Las demás']]],
    ])), ai([]), '9506.51.00', { name: 'tennis racket' })
    expect(result.status).toBe('not_found')
    expect(result.candidate).toBeNull()
  })

  it('rejects a corrupted chapter asset', async () => {
    await expect(resolveSimOpening('https://shippingapp.test/api', assets({ meta: { simIndexSchema: 99 }, records: [] }), ai([]), '9506.59.00', { name: 'padel racket' })).rejects.toThrow('integrity')
  })
})
