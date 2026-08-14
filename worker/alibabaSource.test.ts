import { describe, expect, it, vi } from 'vitest'
import { alibabaHtmlQuality, readAlibabaSource, type BrowserRun } from './alibabaSource'

const url = new URL('https://www.alibaba.com/product-detail/Test-Padel-Racket_1600000000000.html')

function response(html: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(html, { status, headers })
}

const richHtml = `<!doctype html><html><head>
<meta property="og:title" content="Carbon Fiber Padel Racket Wholesale">
<script type="application/ld+json">{"@type":"Product","name":"Carbon Fiber Padel Racket","offers":{"price":"25.50"}}</script>
</head><body><div>US $25.50 MOQ: 300 pieces product-detail supplier</div></body></html>`

const partialHtml = `<!doctype html><html><head>
<meta property="og:title" content="Carbon Fiber Padel Racket Wholesale">
</head><body>${'product-detail supplier '.repeat(30)}</body></html>`

const blockedHtml = `<!doctype html><html><head><title>Security verification</title></head><body>${'Verify that you are human CAPTCHA unusual traffic '.repeat(30)}</body></html>`

describe('Alibaba source quality', () => {
  it('recognizes multiple hard product signals', () => {
    expect(alibabaHtmlQuality(richHtml)).toBeGreaterThanOrEqual(4)
  })

  it('does not mistake a long bot challenge for product evidence', () => {
    expect(blockedHtml.length).toBeGreaterThan(500)
    expect(alibabaHtmlQuality(blockedHtml)).toBe(0)
  })
})

describe('Alibaba Browser Run fallback', () => {
  it('does not spend Browser Run when the direct read is already sufficient', async () => {
    const browser: BrowserRun = { quickAction: vi.fn() }
    const direct = vi.fn(async () => response(richHtml))
    const result = await readAlibabaSource(url, browser, direct)
    expect(result.mode).toBe('direct')
    expect(result.browserAttempted).toBe(false)
    expect(browser.quickAction).not.toHaveBeenCalled()
  })

  it('uses rendered HTML only when Browser Run improves a weak direct read', async () => {
    const browser: BrowserRun = {
      quickAction: vi.fn(async () => response(richHtml, 200, { 'X-Browser-Ms-Used': '1875' })),
    }
    const result = await readAlibabaSource(url, browser, async () => response(partialHtml))
    expect(result.mode).toBe('browser')
    expect(result.quality).toBeGreaterThan(alibabaHtmlQuality(partialHtml))
    expect(result.browserMsUsed).toBe(1875)
    expect(result.html).toContain('25.50')
  })

  it('preserves direct partial evidence when the browser only returns a challenge page', async () => {
    const browser: BrowserRun = { quickAction: vi.fn(async () => response(blockedHtml)) }
    const result = await readAlibabaSource(url, browser, async () => response(partialHtml))
    expect(result.mode).toBe('partial')
    expect(result.html).toBe(partialHtml)
    expect(result.browserAttempted).toBe(true)
  })

  it('fails closed when both direct and browser reads are blocked', async () => {
    const browser: BrowserRun = { quickAction: vi.fn(async () => response(blockedHtml)) }
    const result = await readAlibabaSource(url, browser, async () => response(blockedHtml, 403))
    expect(result.mode).toBe('blocked')
    expect(result.quality).toBe(0)
    expect(result.html).toBe('')
  })

  it('does not turn Browser Run exceptions into fake success', async () => {
    const browser: BrowserRun = { quickAction: vi.fn(async () => { throw new Error('quota') }) }
    const result = await readAlibabaSource(url, browser, async () => response('', 503))
    expect(result.mode).toBe('blocked')
    expect(result.browserMsUsed).toBeNull()
  })
})
