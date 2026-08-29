import { resolveRoutePolicy } from './routePolicy'

const MAX_DECLARED_API_BODY_BYTES = 256 * 1024
const SENSITIVE_ENV_KEYS = [
  'PARSEBOT_API_KEY',
  'MERCADOLIBRE_ACCESS_TOKEN',
  'MERCADOLIBRE_CLIENT_SECRET',
  'MERCADOLIBRE_REFRESH_TOKEN',
] as const

type EnvLike = Record<string, unknown>
type Handler = () => Promise<Response>

function isApiLike(pathname: string) {
  return pathname.startsWith('/api/') || pathname.startsWith('/oauth/')
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function sensitiveValues(env: EnvLike) {
  return SENSITIVE_ENV_KEYS
    .map((key) => env[key])
    .filter((value): value is string => typeof value === 'string' && value.length >= 8)
}

export function redactSensitiveText(input: string, env: EnvLike) {
  let output = input
  for (const secret of sensitiveValues(env)) output = output.split(secret).join('[REDACTED]')
  output = output
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"']+/gi, '$1[REDACTED]')
    .replace(/([?&](?:access_token|refresh_token|client_secret|api_key)=)[^&#\s"']+/gi, '$1[REDACTED]')
    .replace(/("(?:access_token|refresh_token|client_secret|api_key)"\s*:\s*")[^"]+("?)/gi, '$1[REDACTED]$2')
  return output
}

function declaredBodyTooLarge(request: Request) {
  if (!['POST', 'PUT', 'PATCH'].includes(request.method.toUpperCase())) return false
  const raw = request.headers.get('content-length')
  if (!raw) return false
  const declared = Number(raw)
  return Number.isFinite(declared) && declared > MAX_DECLARED_API_BODY_BYTES
}

async function sanitizeResponse(response: Response, requestId: string, env: EnvLike, apiLike: boolean) {
  const headers = new Headers(response.headers)
  if (apiLike) {
    headers.set('x-request-id', requestId)
    headers.set('x-content-type-options', 'nosniff')
  }

  const contentType = headers.get('content-type') || ''
  const canRedact = apiLike && /(?:json|text|html|javascript|xml)/i.test(contentType)
  if (!canRedact) return new Response(response.body, { status: response.status, statusText: response.statusText, headers })

  const text = await response.text()
  return new Response(redactSensitiveText(text, env), {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export async function withRequestContext(request: Request, env: EnvLike, handler: Handler): Promise<Response> {
  const url = new URL(request.url)
  const apiLike = isApiLike(url.pathname)
  if (!apiLike) return handler()

  // Never trust a caller-provided request ID: generate our own to avoid log injection/collision.
  const requestId = crypto.randomUUID()
  const route = resolveRoutePolicy(url.pathname, request.method)
  const startedAt = Date.now()

  let response: Response
  if (declaredBodyTooLarge(request)) {
    response = json({ error: 'Request body too large.', requestId }, 413)
  } else {
    try {
      response = await handler()
    } catch (error) {
      console.error(JSON.stringify({
        event: 'request.failed',
        requestId,
        method: request.method,
        path: url.pathname,
        routeId: route?.id ?? 'unclassified',
        errorType: error instanceof Error ? error.name : typeof error,
      }))
      response = json({ error: 'Internal server error.', requestId }, 500)
    }
  }

  const sanitized = await sanitizeResponse(response, requestId, env, apiLike)
  console.info(JSON.stringify({
    event: 'request.completed',
    requestId,
    method: request.method,
    path: url.pathname,
    routeId: route?.id ?? 'unclassified',
    targetAccess: route?.targetAccess ?? 'unclassified',
    targetMetered: route?.targetMetered ?? false,
    status: sanitized.status,
    durationMs: Date.now() - startedAt,
  }))
  return sanitized
}

export const requestContextLimits = {
  maxDeclaredApiBodyBytes: MAX_DECLARED_API_BODY_BYTES,
} as const
