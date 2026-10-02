import type { ProductConfirmationData } from './productConfirmation'

const PENDING_CONFIRM_KEY = 'shippingapp:pending-confirm:v1'
const PENDING_CONFIRM_TTL_MS = 10 * 60 * 1000 // 10 minutes

type PendingConfirmEntry = {
  data: ProductConfirmationData
  ts: number
}

export function savePendingConfirm(data: ProductConfirmationData): void {
  try {
    const entry: PendingConfirmEntry = { data, ts: Date.now() }
    sessionStorage.setItem(PENDING_CONFIRM_KEY, JSON.stringify(entry))
  } catch {
    // sessionStorage unavailable (private mode, etc.)
  }
}

export function loadPendingConfirm(): ProductConfirmationData | null {
  try {
    const raw = sessionStorage.getItem(PENDING_CONFIRM_KEY)
    if (!raw) return null
    const entry = JSON.parse(raw) as PendingConfirmEntry
    if (Date.now() - entry.ts > PENDING_CONFIRM_TTL_MS) {
      clearPendingConfirm()
      return null
    }
    return entry.data
  } catch {
    return null
  }
}

export function clearPendingConfirm(): void {
  try {
    sessionStorage.removeItem(PENDING_CONFIRM_KEY)
  } catch {
    // sessionStorage unavailable
  }
}
