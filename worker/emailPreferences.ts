import { readTrustedUserId } from './auth'
import { emailRuntimeStatus } from './emailService'
import { EmailRepository } from './persistence/emailRepository'
import type { D1DatabaseLike } from './persistence/d1'
import { verifyUnsubscribeToken, type UnsubscribeScope } from './unsubscribeToken'

type Env = Record<string, unknown> & { DB?: D1DatabaseLike }
type Dependencies = { clock?: () => Date }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})

function preferenceView(row: {
  digest_enabled: number
  alerts_enabled: number
  marketing_enabled: number
  timezone: string
  updated_at: string
}) {
  return {
    digestEnabled: row.digest_enabled === 1,
    alertsEnabled: row.alerts_enabled === 1,
    marketingEnabled: row.marketing_enabled === 1,
    timezone: row.timezone,
    updatedAt: row.updated_at,
    transactional: {
      configurable: false,
      note: 'Los emails operativos y de seguridad no se desactivan desde preferencias de marketing.',
    },
  }
}

function validTimezone(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || normalized.length > 64) return null
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(new Date())
    return normalized
  } catch {
    return null
  }
}

function parsePatch(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const patch: { digestEnabled?: boolean; alertsEnabled?: boolean; marketingEnabled?: boolean; timezone?: string } = {}
  if ('digestEnabled' in raw) {
    if (typeof raw.digestEnabled !== 'boolean') return null
    patch.digestEnabled = raw.digestEnabled
  }
  if ('alertsEnabled' in raw) {
    if (typeof raw.alertsEnabled !== 'boolean') return null
    patch.alertsEnabled = raw.alertsEnabled
  }
  if ('marketingEnabled' in raw) {
    if (typeof raw.marketingEnabled !== 'boolean') return null
    patch.marketingEnabled = raw.marketingEnabled
  }
  if ('timezone' in raw) {
    const timezone = validTimezone(raw.timezone)
    if (!timezone) return null
    patch.timezone = timezone
  }
  return Object.keys(patch).length ? patch : null
}

function textEnv(env: Env, key: string) {
  const value = env[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function htmlEscape(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function confirmationPage(token: string, scope: UnsubscribeScope, completed = false) {
  const labels: Record<UnsubscribeScope, string> = {
    digest: 'resúmenes semanales',
    alerts: 'alertas de precio y margen',
    marketing: 'novedades y comunicaciones opcionales',
  }
  const title = completed ? 'Preferencia actualizada' : 'Confirmar desuscripción'
  const body = completed
    ? `<p>Ya desactivamos ${htmlEscape(labels[scope])} para esta cuenta.</p>`
    : `<p>Vas a desactivar ${htmlEscape(labels[scope])}. Los emails operativos o de seguridad no se ven afectados.</p><form method="post" action="/api/email-unsubscribe"><input type="hidden" name="token" value="${htmlEscape(token)}"><button type="submit">Desactivar</button></form>`
  return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f7fb;color:#101828;margin:0;padding:32px}main{max-width:560px;margin:8vh auto;background:#fff;border:1px solid #e4e7ec;border-radius:24px;padding:28px;box-shadow:0 18px 50px rgba(16,24,40,.08)}button{border:0;border-radius:999px;padding:12px 18px;background:#101828;color:#fff;font-weight:650;cursor:pointer}</style></head><body><main><strong>ShippingAPP</strong><h1>${title}</h1>${body}</main></body></html>`, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  })
}

async function tokenFromPost(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      const body = await request.json() as any
      return typeof body?.token === 'string' ? body.token : null
    } catch { return null }
  }
  try {
    const body = await request.formData()
    const token = body.get('token')
    return typeof token === 'string' ? token : null
  } catch { return null }
}

export function isApplicationEmailRoute(pathname: string) {
  return pathname === '/api/email-preferences'
    || pathname === '/api/email-unsubscribe'
    || pathname === '/api/email-runtime'
}

export async function handleApplicationEmail(request: Request, env: Env, dependencies: Dependencies = {}): Promise<Response> {
  const url = new URL(request.url)
  const clock = dependencies.clock ?? (() => new Date())

  if (url.pathname === '/api/email-runtime' && request.method === 'GET') {
    return json({ status: 'ok', email: emailRuntimeStatus(env) })
  }

  if (url.pathname === '/api/email-unsubscribe') {
    if (!env.DB) return json({ error: 'Email preference storage is not configured.', code: 'email_store_unavailable' }, 503)
    const secret = textEnv(env, 'EMAIL_UNSUBSCRIBE_SECRET')
    if (!secret || secret.length < 32) return json({ error: 'Unsubscribe is not configured.', code: 'unsubscribe_not_configured' }, 503)
    const token = request.method === 'GET' ? url.searchParams.get('token') : request.method === 'POST' ? await tokenFromPost(request) : null
    if (!token) return json({ error: 'Invalid unsubscribe token.', code: 'invalid_unsubscribe_token' }, 400)
    const payload = await verifyUnsubscribeToken(token, secret, clock())
    if (!payload) return json({ error: 'Invalid unsubscribe token.', code: 'invalid_unsubscribe_token' }, 400)
    if (request.method === 'GET') return confirmationPage(token, payload.scope)
    if (request.method !== 'POST') return json({ error: 'Method not allowed.', code: 'method_not_allowed' }, 405)

    const repo = new EmailRepository(env.DB, clock)
    // A previously-issued valid token may outlive an account deletion. Treat it
    // as an idempotent success instead of recreating preferences or surfacing an
    // FK error. The response stays identical so it reveals no account-existence bit.
    const account = await repo.getUserEmail(payload.userId)
    if (account) {
      const patch = payload.scope === 'digest'
        ? { digestEnabled: false }
        : payload.scope === 'alerts'
          ? { alertsEnabled: false }
          : { marketingEnabled: false }
      await repo.updatePreferences(payload.userId, patch)
    }
    if ((request.headers.get('accept') ?? '').includes('application/json')) {
      return json({ unsubscribed: true, scope: payload.scope })
    }
    return confirmationPage(token, payload.scope, true)
  }

  if (url.pathname !== '/api/email-preferences') return json({ error: 'Not found.', code: 'not_found' }, 404)
  const userId = readTrustedUserId(request)
  if (!userId) return json({ error: 'Unauthorized.', code: 'unauthorized' }, 401)
  if (!env.DB) return json({ error: 'Email preference storage is not configured.', code: 'email_store_unavailable' }, 503)
  const repo = new EmailRepository(env.DB, clock)

  if (request.method === 'GET') {
    return json({ preferences: preferenceView(await repo.getOrCreatePreferences(userId)) })
  }

  if (request.method === 'PATCH') {
    let body: unknown
    try { body = await request.json() } catch {
      return json({ error: 'Invalid JSON body.', code: 'invalid_json' }, 400)
    }
    const patch = parsePatch(body)
    if (!patch) return json({ error: 'No valid preference fields were provided.', code: 'invalid_email_preferences' }, 400)
    return json({ preferences: preferenceView(await repo.updatePreferences(userId, patch)) })
  }

  return json({ error: 'Method not allowed.', code: 'method_not_allowed' }, 405)
}
