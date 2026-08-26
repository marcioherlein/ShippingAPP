const ALLOWED_IMAGE_HOSTS = [
  'alicdn.com',
  'alibaba.com',
  'images.unsplash.com',
  'source.unsplash.com',
]

function hostMatches(host: string, allowed: string) {
  const normalized = host.toLowerCase()
  return normalized === allowed || normalized.endsWith(`.${allowed}`)
}

export function isAllowedImageProxyHost(host: string) {
  return ALLOWED_IMAGE_HOSTS.some((allowed) => hostMatches(host, allowed))
}

export type ImageProxyValidation =
  | { ok: true; source: string; host: string }
  | { ok: false; status: number; reason: string }

export function validateImageProxyUrl(requestUrl: string): ImageProxyValidation {
  const request = new URL(requestUrl)
  const source = request.searchParams.get('url')?.trim() || ''
  if (!source) return { ok: false, status: 400, reason: 'Missing url' }
  if (source.length > 1600) return { ok: false, status: 414, reason: 'URL too long' }

  let parsed: URL
  try {
    parsed = new URL(source.startsWith('//') ? `https:${source}` : source)
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

export async function proxyProductImage(request: Request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
  }

  const validation = validateImageProxyUrl(request.url)
  if (!validation.ok) return new Response(validation.reason, { status: validation.status })

  const upstream = await fetch(validation.source, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0 ShippingAPP image proxy',
      referer: 'https://www.alibaba.com/',
    },
    redirect: 'follow',
  })

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
      'x-shippingapp-image-host': validation.host,
    },
  })
}
