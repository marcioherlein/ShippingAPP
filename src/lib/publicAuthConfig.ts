export const isClerkPublishableKey = (value: unknown): value is string =>
  typeof value === 'string' && /^pk_(test|live)_[A-Za-z0-9+/=_-]+$/.test(value)

/** The runtime key belongs to the backend instance; builds need no auth secret. */
export async function readPublicAuthKey(buildKey?: string): Promise<string | null> {
  const fallback = isClerkPublishableKey(buildKey?.trim()) ? buildKey!.trim() : null
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<string | null>(resolve => {
    timer = setTimeout(() => { resolve(fallback); controller.abort() }, 8_000)
  })
  const download = async () => {
    try {
      const response = await fetch('/api/public-auth-config', { signal: controller.signal, cache: 'no-store' })
      if (!response.ok) return fallback
      const data = await response.json()
      return isClerkPublishableKey(data.publishableKey) ? data.publishableKey : fallback
    } catch { return fallback }
  }
  try { return await Promise.race([download(), timeout]) }
  finally { clearTimeout(timer) }
}
