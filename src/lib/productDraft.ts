// Private, per-tab recovery across sign-in redirects. Never added to the URL.
const PREFIX = 'shippingapp:product-draft:'
const MAX_AGE = 24 * 60 * 60 * 1000
export function readProductDraft<T>(key: string): T | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(PREFIX + key) || 'null')
    if (!value || value.v !== 1 || Date.now() - value.at > MAX_AGE) return null
    return value.data as T
  } catch { return null }
}
export function writeProductDraft(key: string, data: unknown) {
  try { sessionStorage.setItem(PREFIX + key, JSON.stringify({ v: 1, at: Date.now(), data })) } catch { /* Storage can be unavailable in private browsing. */ }
}
export function clearProductDraft() {
  try { for (const key of ['analysis', 'entry']) sessionStorage.removeItem(PREFIX + key) } catch { /* Optional recovery. */ }
}
