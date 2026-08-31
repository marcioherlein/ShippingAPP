export type ApiTokenProvider = () => Promise<string | null>

let tokenProvider: ApiTokenProvider | null = null

const IDEMPOTENT_METERED_POSTS = new Set([
  '/api/analyze',
  '/api/intake',
  '/api/opportunity-search',
  '/api/discover',
  '/api/argentina-market/benchmark',
  '/api/mercadolibre/benchmark',
  '/api/watchlist-refresh',
])

export function setApiTokenProvider(provider: ApiTokenProvider | null) {
  tokenProvider = provider
}

function inputUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') {
    try { return new URL(input, typeof window !== 'undefined' ? window.location.origin : 'https://shippingapp.invalid') } catch { return null }
  }
  if (input instanceof URL) return input
  try { return new URL(input.url, typeof window !== 'undefined' ? window.location.origin : 'https://shippingapp.invalid') } catch { return null }
}

function isProtectedSameOriginApi(input: RequestInfo | URL) {
  const url = inputUrl(input)
  if (!url) return false
  if (typeof input === 'string' && input.startsWith('/api/')) return true
  return typeof window !== 'undefined' && url.origin === window.location.origin && url.pathname.startsWith('/api/')
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  return (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
}

function newOperationKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `op-${crypto.randomUUID()}`
  return `op-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function signalAuthenticationRequired() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('shippingapp:auth-required'))
}

function signalUsageUpdated(response: Response) {
  if (typeof window === 'undefined') return
  if (response.headers.get('x-shippingapp-usage-changed') === '1') {
    window.dispatchEvent(new CustomEvent('shippingapp:usage-updated', {
      detail: { creditsRemaining: response.headers.get('x-shippingapp-credits-remaining') },
    }))
  }
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const shouldAttach = isProtectedSameOriginApi(input)
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value))

  const url = inputUrl(input)
  if (
    shouldAttach
    && url
    && requestMethod(input, init) === 'POST'
    && IDEMPOTENT_METERED_POSTS.has(url.pathname)
    && !headers.has('idempotency-key')
  ) {
    headers.set('idempotency-key', newOperationKey())
  }

  if (shouldAttach && tokenProvider) {
    const token = await tokenProvider()
    if (token) headers.set('authorization', `Bearer ${token}`)
  }

  const response = await fetch(input, { ...init, headers })
  if (shouldAttach && response.status === 401) signalAuthenticationRequired()
  if (shouldAttach) signalUsageUpdated(response)
  return response
}
