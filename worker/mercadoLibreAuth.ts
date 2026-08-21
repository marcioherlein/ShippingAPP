export type MercadoLibreTokenStore = {
  get: (key: string) => Promise<string | null>
  put: (key: string, value: string) => Promise<void>
}

export type MercadoLibreAuthEnv = {
  MERCADOLIBRE_ACCESS_TOKEN?: string
  MERCADOLIBRE_CLIENT_ID?: string
  MERCADOLIBRE_CLIENT_SECRET?: string
  MERCADOLIBRE_REFRESH_TOKEN?: string
  MERCADOLIBRE_TOKEN_STORE?: MercadoLibreTokenStore
}

export type MercadoLibreAuthResult =
  | { status: 'ready'; accessToken: string; source: 'static_access_token' | 'token_store' | 'refresh' }
  | { status: 'configuration_required' | 'unavailable'; accessToken: null; source: 'none'; reason: string }

type StoredToken = {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

type RefreshResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

const TOKEN_KEY = 'mercadolibre:service-token:v1'
const REFRESH_EARLY_MS = 5 * 60 * 1000

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function validStoredToken(raw: string | null): StoredToken | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredToken>
    const accessToken = text(parsed.accessToken)
    const refreshToken = text(parsed.refreshToken)
    const expiresAt = Number(parsed.expiresAt)
    if (!accessToken || !refreshToken || !Number.isFinite(expiresAt) || expiresAt <= 0) return null
    return { accessToken, refreshToken, expiresAt }
  } catch {
    return null
  }
}

function stillValid(token: StoredToken | null, now: number) {
  return !!token && token.expiresAt - REFRESH_EARLY_MS > now
}

async function refreshAccessToken(
  fetchImpl: typeof fetch,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  })
  const response = await fetchImpl('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!response.ok) throw new Error(`Mercado Libre OAuth ${response.status}`)
  const data = await response.json() as RefreshResponse
  const accessToken = text(data.access_token)
  const nextRefreshToken = text(data.refresh_token)
  const expiresIn = Number(data.expires_in)
  if (!accessToken || !nextRefreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('Mercado Libre OAuth returned an incomplete token response')
  }
  return { accessToken, refreshToken: nextRefreshToken, expiresIn }
}

export async function resolveMercadoLibreAccessToken(
  env: MercadoLibreAuthEnv,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<MercadoLibreAuthResult> {
  const staticAccessToken = text(env.MERCADOLIBRE_ACCESS_TOKEN)
  if (staticAccessToken) return { status: 'ready', accessToken: staticAccessToken, source: 'static_access_token' }

  const clientId = text(env.MERCADOLIBRE_CLIENT_ID)
  const clientSecret = text(env.MERCADOLIBRE_CLIENT_SECRET)
  const bootstrapRefreshToken = text(env.MERCADOLIBRE_REFRESH_TOKEN)
  const store = env.MERCADOLIBRE_TOKEN_STORE

  if (!clientId || !clientSecret || !bootstrapRefreshToken || !store) {
    return {
      status: 'configuration_required',
      accessToken: null,
      source: 'none',
      reason: 'Mercado Libre OAuth is not fully configured. Provide CLIENT_ID, CLIENT_SECRET, an initial REFRESH_TOKEN and the MERCADOLIBRE_TOKEN_STORE KV binding, or provide a temporary ACCESS_TOKEN.',
    }
  }

  let stored: StoredToken | null = null
  try {
    stored = validStoredToken(await store.get(TOKEN_KEY))
  } catch {
    return {
      status: 'unavailable',
      accessToken: null,
      source: 'none',
      reason: 'Mercado Libre token storage is unavailable.',
    }
  }

  if (stillValid(stored, now)) {
    return { status: 'ready', accessToken: stored!.accessToken, source: 'token_store' }
  }

  const refreshToken = stored?.refreshToken || bootstrapRefreshToken
  try {
    const refreshed = await refreshAccessToken(fetchImpl, clientId, clientSecret, refreshToken)
    const next: StoredToken = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: now + refreshed.expiresIn * 1000,
    }
    await store.put(TOKEN_KEY, JSON.stringify(next))
    return { status: 'ready', accessToken: next.accessToken, source: 'refresh' }
  } catch (error) {
    // A concurrent Worker request may have refreshed and rotated the token first.
    try {
      const concurrent = validStoredToken(await store.get(TOKEN_KEY))
      if (stillValid(concurrent, Date.now()) && concurrent?.accessToken !== stored?.accessToken) {
        return { status: 'ready', accessToken: concurrent!.accessToken, source: 'token_store' }
      }
    } catch {
      // Preserve the OAuth error below.
    }
    return {
      status: 'unavailable',
      accessToken: null,
      source: 'none',
      reason: error instanceof Error ? error.message : 'Mercado Libre OAuth refresh failed',
    }
  }
}
