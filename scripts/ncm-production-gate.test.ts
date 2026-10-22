import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import worker from '../worker/enrich'
import { resetNcmIndexCacheForTests } from '../worker/ncmRetrieval'
import { verifyNcmReliability } from './smoke-production-ncm-reliability.mjs'

it('runs the production gate against the actual endpoint and complete catalog with unavailable AI', async () => {
  resetNcmIndexCacheForTests()
  const asset = readFileSync('public/data/ncm-index.json', 'utf8')
  const env = { AI: { run: async () => { throw new Error('AI unavailable') } }, ASSETS: { fetch: async (request: Request) => new URL(request.url).pathname === '/data/ncm-index.json' ? new Response(asset) : new Response('not found', { status: 404 }) } }
  const report = await verifyNcmReliability('https://shippingapp.test', (input: string, init: RequestInit) => worker.fetch(new Request(input, init), env as any))
  expect(report.status).toBe('passed')
  expect(report.cases).toBe(5)
  expect(report.catalogRecordCount).toBeGreaterThan(10000)
})
