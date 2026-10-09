import { authenticationError, getSessionState, setSessionState, waitForVerifiedSession } from './authSession'
export type ApiTokenProvider = (fresh?: boolean) => Promise<string | null>

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

export function newOperationKey() {
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

async function apiFetchInternal(input: RequestInfo | URL, init?: RequestInit) {
  const shouldAttach = isProtectedSameOriginApi(input)
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value))

  const url = inputUrl(input)
  if (shouldAttach && url?.pathname !== '/api/me') {
    try { await waitForVerifiedSession(init?.signal ?? undefined) } catch (error) {
      if (getSessionState() === 'signed_out') signalAuthenticationRequired()
      throw error
    }
  }
  if (
    shouldAttach
    && url
    && requestMethod(input, init) === 'POST'
    && IDEMPOTENT_METERED_POSTS.has(url.pathname)
    && !headers.has('idempotency-key')
  ) {
    headers.set('idempotency-key', newOperationKey())
  }

  const provider = shouldAttach ? tokenProvider : null
  const attachToken = async (fresh = false) => {
    if (init?.signal?.aborted) throw init.signal.reason
    if (!provider) return
    let token: string | null
    try { token = await provider(fresh) } catch {
      if (init?.signal?.aborted) throw init.signal.reason
      if (getSessionState() !== 'unmanaged') setSessionState('error')
      throw authenticationError('auth_token_unavailable', true)
    }
    if (init?.signal?.aborted) throw init.signal.reason
    if (!token) {
      if (getSessionState() !== 'unmanaged') setSessionState('error')
      throw authenticationError('auth_session_pending', true)
    }
    headers.set('authorization', `Bearer ${token}`)
  }
  await attachToken()
  // Clone Request inputs before their body is consumed by the first fetch.
  const replay = input instanceof Request ? input.clone() : input
  let response = await fetch(input, { ...init, headers })
  let code = ''
  const responseCode = async () => {
    try { return String((await response.clone().json()).code || '') } catch { return '' }
  }
  if (shouldAttach && response.status === 401) {
    code = await responseCode()
    if (provider && code !== 'auth_origin_rejected') {
      await attachToken(true)
      if (init?.signal?.aborted) throw init.signal.reason
      response = await fetch(replay, { ...init, headers })
      code = await responseCode()
    }
  }
  if (shouldAttach && response.status === 401) {
    if (!provider) { signalAuthenticationRequired(); throw authenticationError('session_required') }
    if (getSessionState() !== 'unmanaged') setSessionState('error')
    throw authenticationError(code || 'auth_session_rejected', true)
  }
  if (shouldAttach && response.status === 503) {
    code = await responseCode()
    if (code.startsWith('auth_')) {
      if (getSessionState() !== 'unmanaged') setSessionState('error')
      throw authenticationError(code, !!provider)
    }
  }
  if (shouldAttach) signalUsageUpdated(response)
  return response
}

/** Bounds both session lookup and provider requests; abort releases the connection. */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController()
  const abort = () => controller.abort(init?.signal?.reason)
  init?.signal?.addEventListener('abort', abort, { once: true })
  if (init?.signal?.aborted) abort()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      apiFetchInternal(input, { ...init, signal: controller.signal }).then(async response => {
        if (!response.body) return response
        const body = await response.arrayBuffer()
        return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('La operación tardó más de 30 segundos. Conservamos los datos: podés reintentar o completar la ficha manualmente.'))
          controller.abort()
        }, 30_000)
      }),
    ])
  } finally {
    clearTimeout(timer)
    init?.signal?.removeEventListener('abort', abort)
  }
}
