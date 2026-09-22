import { describe, expect, it, vi } from 'vitest'
import { readBoundedText } from './boundedResponse'

describe('provider response memory budget', () => {
  it('rejects oversized declared bodies without reading them and releases the connection', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream({ cancel })
    await expect(readBoundedText(new Response(body, { headers: { 'content-length': '100' } }), 10)).rejects.toThrow('byte limit')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('caps a chunked stream even when content-length is missing or understated', async () => {
    for (const headers of [{}, { 'content-length': '1' }]) {
      const cancel = vi.fn()
      const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(8)) }, cancel })
      await expect(readBoundedText(new Response(body, { headers }), 10)).rejects.toThrow('byte limit')
      expect(cancel).toHaveBeenCalledOnce()
      expect(body.locked).toBe(false)
    }
  })

  it('counts bytes while preserving UTF-8 split across network chunks', async () => {
    const bytes = new TextEncoder().encode('áé')
    const response = () => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(bytes.slice(0, 1))
      controller.enqueue(bytes.slice(1))
      controller.close()
    } }))
    await expect(readBoundedText(response(), 4)).resolves.toBe('áé')
    await expect(readBoundedText(response(), 3)).rejects.toThrow('byte limit')
  })
})
