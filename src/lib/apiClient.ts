export type ApiTokenProvider = () => Promise<string | null>

let tokenProvider: ApiTokenProvider | null = null

export function setApiTokenProvider(provider: ApiTokenProvider | null) {
  tokenProvider = provider
}

function isProtectedSameOriginApi(input: RequestInfo | URL) {
  if (typeof input === 'string') return input.startsWith('/api/')
  if (input instanceof URL) return typeof window !== 'undefined' && input.origin === window.location.origin && input.pathname.startsWith('/api/')
  try {
    const url = new URL(input.url, typeof window !== 'undefined' ? window.location.origin : 'https://shippingapp.invalid')
    return typeof window !== 'undefined' && url.origin === window.location.origin && url.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

function signalAuthenticationRequired() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('shippingapp:auth-required'))
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const shouldAttach = isProtectedSameOriginApi(input)
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value))

  if (shouldAttach && tokenProvider) {
    const token = await tokenProvider()
    if (token) headers.set('authorization', `Bearer ${token}`)
  }

  const response = await fetch(input, { ...init, headers })
  if (shouldAttach && response.status === 401) signalAuthenticationRequired()
  return response
}
