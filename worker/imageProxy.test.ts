import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAllowedImage, isAllowedImageProxyHost, validateImageProxyUrl } from './imageProxy'

afterEach(() => vi.unstubAllGlobals())

describe('image proxy validation', () => {
  it('allows Alibaba/alicdn and approved cached image hosts', () => {
    expect(isAllowedImageProxyHost('s.alicdn.com')).toBe(true)
    expect(isAllowedImageProxyHost('www.alibaba.com')).toBe(true)
    expect(isAllowedImageProxyHost('images.unsplash.com')).toBe(true)
  })

  it('rejects missing, invalid, unsupported, and untrusted URLs', () => {
    expect(validateImageProxyUrl('https://shippingapp.test/api/image-proxy')).toMatchObject({ ok: false, status: 400 })
    expect(validateImageProxyUrl('https://shippingapp.test/api/image-proxy?url=not-a-url')).toMatchObject({ ok: false, status: 400 })
    expect(validateImageProxyUrl('https://shippingapp.test/api/image-proxy?url=ftp://s.alicdn.com/a.jpg')).toMatchObject({ ok: false, status: 400 })
    expect(validateImageProxyUrl('https://shippingapp.test/api/image-proxy?url=https://evil.example/a.jpg')).toMatchObject({ ok: false, status: 403 })
  })

  it('normalizes allowed image URLs to https', () => {
    expect(validateImageProxyUrl('https://shippingapp.test/api/image-proxy?url=http://s.alicdn.com/a.jpg')).toEqual({
      ok: true,
      source: 'https://s.alicdn.com/a.jpg',
      host: 's.alicdn.com',
    })
  })

  it('revalidates every redirect and blocks redirects to untrusted hosts', async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1/internal' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchAllowedImage('https://source.unsplash.com/photo.jpg')
    expect(result).toMatchObject({ ok: false, status: 403, reason: 'Image host not allowed' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('allows a redirect chain only when every hop remains allowlisted', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: 'https://images.unsplash.com/final.jpg' },
      }))
      .mockResolvedValueOnce(new Response('image-bytes', {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchAllowedImage('https://source.unsplash.com/photo.jpg')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.host).toBe('images.unsplash.com')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe('manual')
  })
})
