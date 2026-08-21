import { describe, expect, it, vi } from 'vitest'
import { checkAiHealth, INTAKE_MODEL, resetAiHealthCacheForTests } from './aiHealth'

describe('Workers AI health probe', () => {
  it('reports healthy when the intake model returns the expected JSON contract', async () => {
    resetAiHealthCacheForTests()
    const run = vi.fn(async () => ({ response: JSON.stringify({ ok: true }) }))
    let tick = 1_000
    const result = await checkAiHealth({ run }, () => (tick += 25))

    expect(result.status).toBe('ok')
    expect(result.model).toBe(INTAKE_MODEL)
    expect(result.latencyMs).toBe(25)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('reports degraded instead of throwing when the model response is malformed', async () => {
    resetAiHealthCacheForTests()
    const run = vi.fn(async () => ({ response: 'not-json' }))
    const result = await checkAiHealth({ run })

    expect(result.status).toBe('degraded')
    expect(result.model).toBe(INTAKE_MODEL)
  })

  it('caches healthy probes so repeated health checks do not spend an AI call each time', async () => {
    resetAiHealthCacheForTests()
    const run = vi.fn(async () => ({ response: JSON.stringify({ ok: true }) }))
    let now = 10_000

    const first = await checkAiHealth({ run }, () => now)
    now += 1_000
    const second = await checkAiHealth({ run }, () => now)

    expect(first.status).toBe('ok')
    expect(second.status).toBe('ok')
    expect(run).toHaveBeenCalledTimes(1)
  })
})
