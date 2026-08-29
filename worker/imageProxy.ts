const ALLOWED_IMAGE_HOSTS = [
  'alicdn.com',
  'alibaba.com',
  'images.unsplash.com',
  'source.unsplash.com',
]

const MAX_IMAGE_REDIRECTS = 4
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

function hostMatches(host: string, allowed: string) {
  const normalized = host.toLowerCase()
  return normalized === allowed || normalized.endsWith(`.${allowed}`)
}

export function isAllowedImageProxyHost(host: string) {
  return ALLOWED_IMAGE_HOSTS.some((allowed) => hostMatches(host, allowed))
}

function normalizeAllowedImageSource(raw: string, base?: URL): ImageProxyValidation {
  let parsed: URL
  try {
    parsed = base ? new URL(raw, base) : new URL(raw.startsWith('//') ? `https:${raw}` : raw)
  } catch {
    return { ok: false, status: 400, reason: 'Invalid url' }
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, status: 400, reason: 'Unsupported protocol' }
  }
  if (!isAllowedImageProxyHost(parsed.hostname)) {
    return { ok: false, status: 403, reason: 'Image host not allowed' }
  }

  parsed.protocol = 'https:'
  return { ok: true, source: parsed.toString(), host: parsed.hostname.toLowerCase() }
}

export type ImageProxyValidation =
  | { ok: true; source: string; host: string }
  | { ok: false; status: number; reason: string }

export function validateImageProxyUrl(requestUrl: string): ImageProxyValidation {
  const request = new URL(requestUrl)
  const source = request.searchParams.get('url')?.trim() || ''
  if (!source) return { ok: false, status: 400, reason: 'Missing url' }
  if (source.length > 1600) return { ok: false, status: 414, reason: 'URL too long' }
  return normalizeAllowedImageSource(source)
}

type AllowedImageFetch =
  | { ok: true; response: Response; host: string }
  | { ok: false; status: number; reason: string }

export async function fetchAllowedImage(source: string): Promise<AllowedImageFetch> {
  const initial = normalizeAllowedImageSource(source)
  if (!initial.ok) return initial

  let current = new URL(initial.source)
  for (let redirectCount = 0; redirectCount <= MAX_IMAGE_REDIRECTS; redirectCount += 1) {
    const response = await fetch(current.toString(), {
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 ShippingAPP image proxy',
        referer: 'https://www.alibaba.com/',
      },
      // Redirects are followed manually so every hop is revalidated against the allowlist.
      redirect: 'manual',
    })

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { ok: true, response, host: current.hostname.toLowerCase() }
    }

    if (redirectCount >= MAX_IMAGE_REDIRECTS) {
      return { ok: false, status: 508, reason: 'Too many image redirects' }
    }

    const location = response.headers.get('location')
    if (!location) return { ok: false, status: 502, reason: 'Image redirect missing location' }

    const next = normalizeAllowedImageSource(location, current)
    if (!next.ok) return { ok: false, status: next.status, reason: next.reason }
    current = new URL(next.source)
  }

  return { ok: false, status: 508, reason: 'Too many image redirects' }
}

export async function proxyProductImage(request: Request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
  }

  const validation = validateImageProxyUrl(request.url)
  if (!validation.ok) return new Response(validation.reason, { status: validation.status })

  const fetched = await fetchAllowedImage(validation.source)
  if (!fetched.ok) return new Response(fetched.reason, { status: fetched.status })

  const upstream = fetched.response
  if (!upstream.ok || !upstream.body) {
    return new Response('Image fetch failed', { status: 502 })
  }

  const contentType = upstream.headers.get('content-type') || 'image/jpeg'
  if (!contentType.startsWith('image/')) {
    return new Response('Unsupported image response', { status: 415 })
  }

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
      'x-shippingapp-image-host': fetched.host,
    },
  })
}
