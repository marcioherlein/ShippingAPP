import { describe, expect, it } from 'vitest'
import { isAllowedImageProxyHost, validateImageProxyUrl } from './imageProxy'

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
})
