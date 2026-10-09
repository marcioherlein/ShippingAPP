export type SessionState = 'unmanaged' | 'loading' | 'signed_out' | 'verifying' | 'ready' | 'error'
let state: SessionState = 'unmanaged'
const listeners = new Set<() => void>()
export const getSessionState = () => state
export function subscribeSession(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function setSessionState(next: SessionState) {
  if (state === next) return
  state = next
  listeners.forEach(listener => listener())
  if (next === 'ready' && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('shippingapp:auth-resolved'))
}
export class ApiAuthError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'ApiAuthError' }
}
export function authenticationError(code: string, signedIn = false) {
  const message = code === 'session_required'
    ? 'Ingresá a tu cuenta para continuar. Conservamos tu operación y la retomaremos al conectar la cuenta.'
    : code === 'auth_origin_rejected'
      ? 'Tu sesión está iniciada, pero este dominio no está autorizado por el servidor. Conservamos tus datos; es un problema de configuración.'
      : code === 'auth_session_expired'
        ? 'Tu sesión venció. Conservamos tu operación; volvé a ingresar para continuar.'
        : code === 'auth_session_pending'
          ? 'Estamos verificando tu cuenta. Conservamos tu operación para continuar al conectarla.'
          : signedIn
            ? 'Tu sesión está iniciada, pero no pudimos conectar tu cuenta con el servidor. Conservamos tus datos. En Mi cuenta, elegí Reintentar conectar cuenta.'
            : 'No pude validar tu sesión. Conservamos tus datos; reintentá conectar la cuenta.'
  return new ApiAuthError(code, message)
}

/** Customer calls cannot overtake the server identity bootstrap. */
export async function waitForVerifiedSession(signal?: AbortSignal) {
  if (state === 'loading' || state === 'verifying') {
    await new Promise<void>((resolve, reject) => {
      const finish = () => { unsubscribe(); signal?.removeEventListener('abort', abort) }
      const abort = () => { finish(); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')) }
      const unsubscribe = subscribeSession(() => {
        if (state !== 'loading' && state !== 'verifying') { finish(); resolve() }
      })
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
    })
  }
  if (state === 'signed_out') throw authenticationError('session_required')
  if (state === 'error') throw authenticationError('auth_session_unavailable', true)
}
