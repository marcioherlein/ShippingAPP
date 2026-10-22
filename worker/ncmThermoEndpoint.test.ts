import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import worker from './enrich'
import { resetNcmIndexCacheForTests } from './ncmRetrieval'

it('round-trips the reported termo through the real endpoint, official asset and explicit clarification', async () => {
  resetNcmIndexCacheForTests()
  const index = readFileSync('public/data/ncm-index.json', 'utf8')
  const run = vi.fn(async () => { throw new Error('AI unavailable') })
  const env = {
    AI: { run },
    ASSETS: { fetch: async (request: Request) => new URL(request.url).pathname === '/data/ncm-index.json'
      ? new Response(index, { headers: { 'content-type': 'application/json' } })
      : new Response('not found', { status: 404 }) },
  }
  const facts = { name: 'Termo Stanley', material: 'Acero inoxidable', functionText: 'Para mantener el agua caliente y tomar mate' }
  async function classify(product: object) {
    const response = await worker.fetch(new Request('https://shippingapp.test/api/ncm-classify', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(product),
    }), env as any)
    expect(response.status).toBe(200)
    return response.json() as Promise<any>
  }
  const pending = await classify(facts)
  expect(pending.code).toBeNull()
  expect(pending.tariff).toBeNull()
  expect(pending.alternatives).toEqual([])
  expect(pending.disambiguation.questions).toHaveLength(1)
  const confirmation = pending.disambiguation.questions[0].options.find((option: any) => option.value === 'si').note
  const resolved = await classify({ ...facts, description: confirmation })
  expect(resolved.code).toBe('9617.00.10')
  expect(resolved.status).toBe('candidate')
  expect(resolved.tariff.diePct).toBeGreaterThanOrEqual(0)
  expect(resolved.missingFacts).toEqual([])
  // Missing SIM assets cannot invent a suffix or erase the valid NCM candidate.
  expect(resolved.sim.candidate).toBeNull()
  expect(run).not.toHaveBeenCalled()
})
