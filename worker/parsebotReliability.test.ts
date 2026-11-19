import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractAlibabaWithParsebot, type ParsebotAlibabaResult } from './parsebotAlibaba'

const requestedId = '1601389995797'
const otherId = '1601144593280'
const productUrl = new URL(`https://www.alibaba.com/product-detail/Smart-Wifi-Video-Door-Phone_${requestedId}.html?spm=direct-link-test`)
const env = { PARSEBOT_API_KEY: 'test-key' }

type RecordedRequest = {
  url: URL
  method: string
  body: Record<string, string>
  signal?: AbortSignal | null
}

function recordRequest(input: RequestInfo | URL, init?: RequestInit): RecordedRequest {
  return {
    url: new URL(input instanceof Request ? input.url : String(input)),
    method: (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase(),
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : {},
    signal: init?.signal,
  }
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status })
}

function unavailableResponse() {
  return response({ status: 'error', message: 'Fixture detail endpoint unavailable' }, 503)
}

function product(id: string, title = 'Exact requested video door phone') {
  return { product_id: id, title, price_tiers: [{ min_quantity: 2, price_value: 49.5 }], moq: '2' }
}

function searchFixture(products: unknown[]) {
  const requests: RecordedRequest[] = []
  const detailRequests: RecordedRequest[] = []
  let searched = false
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = recordRequest(input, init)
    requests.push(request)
    if (request.url.pathname.endsWith('/search_products')) {
      searched = true
      return response({ status: 'success', data: { products } })
    }
    if (searched) {
      detailRequests.push(request)
      return unavailableResponse()
    }
    return unavailableResponse()
  })
  vi.stubGlobal('fetch', fetchMock)
  return { requests, detailRequests, fetchMock }
}

describe('Parse.bot exact Alibaba identity and request reliability', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('first looks up the exact requested product ID using the canonical GET', async () => {
    const requests: RecordedRequest[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(recordRequest(input, init))
      return response({ status: 'success', data: product(requestedId) })
    }))

    const result = await extractAlibabaWithParsebot(productUrl, env)

    expect(requests).toHaveLength(1)
    expect(requests[0].method).toBe('GET')
    expect(requests[0].url.searchParams.get('product_id')).toBe(requestedId)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') throw new Error('Expected the exact requested product')
    expect(result.facts.productId).toBe(requestedId)
  })

  it.each([5_000, 7_000])('accepts a useful canonical lookup taking %ims without restarting it', async (delayMs) => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => setTimeout(() => resolve(response({ status: 'success', data: product(requestedId) })), delayMs)))
    vi.stubGlobal('fetch', fetchMock)
    let result: ParsebotAlibabaResult | undefined
    void extractAlibabaWithParsebot(productUrl, env, { timeoutMs: 12_000 }).then(value => { result = value })
    await vi.advanceTimersByTimeAsync(delayMs - 1)
    expect(result).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(result?.status).toBe('ready')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result?.diagnostics?.attempts).toEqual([{ method: 'GET', outcome: 'ready', durationMs: delayMs, httpStatus: 200 }])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('posts the original URL and same ID once when the canonical method is unavailable', async () => {
    const requests: RecordedRequest[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = recordRequest(input, init); requests.push(request)
      return request.method === 'GET' ? response({ status: 'error' }, 405) : response({ status: 'success', data: product(requestedId) })
    }))
    const result = await extractAlibabaWithParsebot(productUrl, env)
    expect(result.status).toBe('ready')
    expect(requests.map(request => request.method)).toEqual(['GET', 'POST'])
    expect(requests[1].body).toEqual({ url: productUrl.href, product_url: productUrl.href, product_id: requestedId, id: requestedId })
    expect(result.diagnostics?.attempts.map(attempt => attempt.outcome)).toEqual(['http_error', 'ready'])
    expect(JSON.stringify(result.diagnostics)).not.toContain('test-key')
    expect(JSON.stringify(result.diagnostics)).not.toContain(productUrl.href)
  })

  it('caps a hanging fallback at the shared deadline after one timed-out canonical request', async () => {
    vi.useFakeTimers()
    const requests: RecordedRequest[] = []
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(recordRequest(input, init)); return new Promise<Response>(() => {})
    }))
    let result: ParsebotAlibabaResult | undefined
    void extractAlibabaWithParsebot(productUrl, env, { timeoutMs: 12_000 }).then(value => { result = value })
    await vi.advanceTimersByTimeAsync(8_000)
    expect(requests.map(request => request.method)).toEqual(['GET', 'POST'])
    expect(requests[0].signal?.aborted).toBe(true)
    expect(requests[1].signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(3_999)
    expect(result).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(result?.status).toBe('unavailable')
    expect(requests).toHaveLength(2)
    expect(requests[1].signal?.aborted).toBe(true)
    expect(result?.diagnostics?.attempts.map(attempt => [attempt.method, attempt.outcome, attempt.durationMs])).toEqual([
      ['GET', 'timeout', 8_000], ['POST', 'timeout', 4_000],
    ])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects primary product details that explicitly identify another listing', async () => {
    const requests: RecordedRequest[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = recordRequest(input, init)
      requests.push(request)
      return request.url.pathname.endsWith('/search_products')
        ? response({ status: 'success', data: { products: [] } })
        : response({ status: 'success', data: product(otherId, 'Unrelated LCD monitor') })
    }))

    const result = await extractAlibabaWithParsebot(productUrl, env)

    expect(result.status).toBe('unavailable')
    expect(result.facts).toBeNull()
    expect(requests.some((request) => request.url.pathname.endsWith('/search_products'))).toBe(true)
  })

  it.each([
    ['a different product ID', product(otherId, 'Unrelated first search result')],
    ['no product ID', { title: 'Tempting search result without identity', price_value: 1 }],
  ])('never accepts a search result with %s', async (_case, candidate) => {
    const { detailRequests } = searchFixture([candidate])

    const result = await extractAlibabaWithParsebot(productUrl, env)

    expect(result.status).toBe('unavailable')
    expect(result.facts).toBeNull()
    expect(detailRequests).toHaveLength(0)
  })

  it('finds the exact ID later in search results without repeating failed detail lookups', async () => {
    const { detailRequests, requests } = searchFixture([
      product(otherId, 'Unrelated first result'),
      { title: 'Unidentified second result', price_value: 1 },
      product(requestedId, 'Exact summary later in results'),
    ])

    const result = await extractAlibabaWithParsebot(productUrl, env)

    expect(detailRequests).toHaveLength(0)
    expect(requests).toHaveLength(3)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') throw new Error('Expected the later exact-ID product')
    expect(result.facts.productId).toBe(requestedId)
    expect(result.facts.name).toBe('Exact summary later in results')
  })

  it('preserves the exact search summary after both direct lookup methods fail', async () => {
    const { detailRequests } = searchFixture([
      product(otherId, 'Unrelated first result'),
      product(requestedId, 'Exact requested summary retained'),
    ])

    const result = await extractAlibabaWithParsebot(productUrl, env)

    expect(detailRequests).toHaveLength(0)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') throw new Error('Expected the matching search summary')
    expect(result.facts.productId).toBe(requestedId)
    expect(result.facts.name).toBe('Exact requested summary retained')
    expect(result.facts.unitPriceUsd).toBe(49.5)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('stops after a provider rate limit instead of starting duplicate lookups', async () => {
    const fetchMock = vi.fn(async () => response({ status: 'error' }, 429))
    vi.stubGlobal('fetch', fetchMock)
    const result = await extractAlibabaWithParsebot(productUrl, env)
    expect(result.status).toBe('unavailable')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.diagnostics?.attempts).toMatchObject([{ method: 'GET', outcome: 'http_error', httpStatus: 429 }])
  })

  it('finishes within the deadline and aborts when fetch ignores its signal before headers', async () => {
    vi.useFakeTimers()
    const requests: RecordedRequest[] = []
    const aborts = vi.fn()
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const request = recordRequest(input, init)
      requests.push(request)
      request.signal?.addEventListener('abort', aborts, { once: true })
      return new Promise<Response>(() => {})
    }))
    let result: ParsebotAlibabaResult | undefined
    void extractAlibabaWithParsebot(productUrl, env, { timeoutMs: 75 }).then((value) => { result = value })

    await vi.advanceTimersByTimeAsync(74)
    expect(result).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)

    expect(result?.status).toBe('unavailable')
    expect(requests).toHaveLength(1)
    expect(requests[0].signal?.aborted).toBe(true)
    expect(aborts).toHaveBeenCalledTimes(1)
  })

  it('includes stalled response-body consumption in the same deadline', async () => {
    vi.useFakeTimers()
    const requests: RecordedRequest[] = []
    const aborts = vi.fn()
    const bodyRead = vi.fn(() => new Promise<string>(() => {}))
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = recordRequest(input, init)
      requests.push(request)
      request.signal?.addEventListener('abort', aborts, { once: true })
      const stalledResponse = response({ status: 'success', data: product(requestedId) })
      vi.spyOn(stalledResponse, 'text').mockImplementation(bodyRead)
      return stalledResponse
    }))
    let result: ParsebotAlibabaResult | undefined
    void extractAlibabaWithParsebot(productUrl, env, { timeoutMs: 75 }).then((value) => { result = value })

    await vi.advanceTimersByTimeAsync(74)
    expect(bodyRead).toHaveBeenCalledTimes(1)
    expect(result).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)

    expect(result?.status).toBe('unavailable')
    expect(requests).toHaveLength(1)
    expect(requests[0].signal?.aborted).toBe(true)
    expect(aborts).toHaveBeenCalledTimes(1)
  })

  it('uses only the remaining total budget for a POST fallback after a slow GET failure', async () => {
    vi.useFakeTimers()
    const requests: RecordedRequest[] = []
    const aborts = vi.fn()
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const request = recordRequest(input, init)
      requests.push(request)
      request.signal?.addEventListener('abort', aborts, { once: true })
      if (requests.length === 1) {
        return new Promise<Response>((resolve) => setTimeout(() => resolve(unavailableResponse()), 40))
      }
      return new Promise<Response>(() => {})
    }))
    let result: ParsebotAlibabaResult | undefined
    void extractAlibabaWithParsebot(productUrl, env, { timeoutMs: 75 }).then((value) => { result = value })

    await vi.advanceTimersByTimeAsync(40)
    expect(requests.map((request) => request.method)).toEqual(['GET', 'POST'])
    await vi.advanceTimersByTimeAsync(34)
    expect(result).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)

    expect(result?.status).toBe('unavailable')
    expect(requests).toHaveLength(2)
    expect(requests[1].signal?.aborted).toBe(true)
    expect(aborts).toHaveBeenCalled()
  })

  it('returns promptly and aborts the active fetch when the caller cancels', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const requests: RecordedRequest[] = []
    const aborts = vi.fn()
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const request = recordRequest(input, init)
      requests.push(request)
      request.signal?.addEventListener('abort', aborts, { once: true })
      return new Promise<Response>(() => {})
    }))
    let result: ParsebotAlibabaResult | undefined
    void extractAlibabaWithParsebot(productUrl, env, { timeoutMs: 1000, signal: controller.signal }).then((value) => { result = value })

    await vi.advanceTimersByTimeAsync(30)
    controller.abort()
    await vi.advanceTimersByTimeAsync(0)

    expect(result?.status).toBe('unavailable')
    expect(requests).toHaveLength(1)
    expect(requests[0].signal?.aborted).toBe(true)
    expect(aborts).toHaveBeenCalledTimes(1)
  })
})
