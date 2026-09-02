const base = 'https://tiendanewsan.com.ar'
const queries = ['freidora 6l 1700w', 'motorola g85 256gb', 'aspiradora 1800w']
const UA = 'ShippingAPP/2.1 (+Argentina market comparison; public storefront catalog only)'

function decode(value) {
  return String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

for (const query of queries) {
  const url = `${base}/catalogsearch/result/?q=${encodeURIComponent(query)}`
  const response = await fetch(url, { headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': UA } })
  const html = await response.text()
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  const rows = []
  let match
  while ((match = anchorPattern.exec(html)) && rows.length < 8) {
    const attrs = match[1]
    if (!/class=["'][^"']*product-item-link[^"']*["']/i.test(attrs)) continue
    const href = attrs.match(/href=["']([^"']+)["']/i)?.[1] || ''
    const start = Math.max(0, match.index - 500)
    const end = Math.min(html.length, match.index + match[0].length + 1800)
    const block = html.slice(start, end)
    const amounts = [...block.matchAll(/data-price-amount=["']([0-9.,]+)["']/gi)].map((m) => m[1])
    const finalAmount = block.match(/data-price-type=["']finalPrice["'][\s\S]{0,500}?data-price-amount=["']([0-9.,]+)["']/i)?.[1]
      || block.match(/data-price-amount=["']([0-9.,]+)["'][\s\S]{0,300}?data-price-type=["']finalPrice["']/i)?.[1]
      || null
    rows.push({
      href,
      title: decode(match[2]),
      finalAmount,
      amounts: amounts.slice(0, 6),
      stockSignals: decode(block).match(/(?:sin stock|agotado|no disponible|en stock|disponible)/gi) || [],
    })
  }
  console.log(JSON.stringify({
    query,
    url,
    status: response.status,
    bytes: html.length,
    productItemLinkCount: (html.match(/product-item-link/gi) || []).length,
    finalPriceCount: (html.match(/data-price-type=["']finalPrice["']/gi) || []).length,
    rows,
  }, null, 2))
}
