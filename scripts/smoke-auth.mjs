export const INTERNAL_TOKEN_HEADER = 'x-shippingapp-internal-token'

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function smokeServiceConfig(env = process.env) {
  const baseUrl = text(env.PRODUCTION_URL) || 'https://shippingapp.marciofabrizio.workers.dev'
  const token = text(env.INTERNAL_API_TOKEN)
  return {
    origin: new URL(baseUrl).origin,
    token: token && token.length >= 32 ? token : null,
  }
}

export function prepareServiceFetch(input, init = {}, env = process.env) {
  const { origin, token } = smokeServiceConfig(env)
  if (!token) return { input, init }

  const rawUrl = input instanceof Request ? input.url : String(input)
  const target = new URL(rawUrl, origin)
  if (target.origin !== origin) return { input, init }

  if (input instanceof Request) {
    const headers = new Headers(input.headers)
    headers.set(INTERNAL_TOKEN_HEADER, token)
    return {
      input: new Request(input, { headers }),
      init,
    }
  }

  const headers = new Headers(init.headers)
  headers.set(INTERNAL_TOKEN_HEADER, token)
  return {
    input,
    init: { ...init, headers },
  }
}

export function installSmokeServiceFetch(target = globalThis, env = process.env) {
  const originalFetch = target.fetch?.bind(target)
  if (typeof originalFetch !== 'function') throw new Error('Global fetch is unavailable.')
  const { token } = smokeServiceConfig(env)
  if (!token) return false

  target.fetch = async (input, init = {}) => {
    const prepared = prepareServiceFetch(input, init, env)
    return originalFetch(prepared.input, prepared.init)
  }
  return true
}
