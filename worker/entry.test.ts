import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './entry'

const quietConsole = () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
}

afterEach(() => vi.restoreAllMocks())

describe('Stage 0 Worker boundary', () => {
  it('handles malformed JSON without executing provider work or leaking internals', async () => {
    quietConsole()
    const response = await worker.fetch(new Request('https://shipping.test/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{broken-json',
    }), {})

    expect(response.status).toBe(400)
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/i)
    const text = await response.text()
    expect(text).toContain('AI Import Analyst')
    expect(text).not.toContain('SyntaxError')
    expect(text).not.toContain('stack')
  })

  it('degrades a missing runtime binding to a controlled operational failure', async () => {
    quietConsole()
    const response = await worker.fetch(new Request('https://shipping.test/api/runtime-smoke'), {})

    expect(response.status).toBe(503)
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/i)
    const body = await response.json() as any
    expect(body.status).toBe('fail')
    expect(JSON.stringify(body)).not.toContain(' at ')
  })

  it('keeps unknown API paths as 404 while still attaching correlation metadata', async () => {
    quietConsole()
    const response = await worker.fetch(new Request('https://shipping.test/api/not-real'), {})

    expect(response.status).toBe(404)
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/i)
    expect(await response.json()).toEqual({ error: 'Not found' })
  })
})
