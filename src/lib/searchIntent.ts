function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const GENERIC_ALIBABA_REQUESTS = [
  /^busca(?:lo|me)?\s+(?:en\s+)?alibaba$/i,
  /^buscar\s+(?:en\s+)?alibaba$/i,
  /^buscalo$/i,
  /^buscame$/i,
  /^en\s+alibaba$/i,
]

export function isGenericAlibabaSearchRequest(input: string) {
  const text = normalize(input)
  return GENERIC_ALIBABA_REQUESTS.some((pattern) => pattern.test(text))
}

export function wantsAlibabaDiscovery(input: string) {
  const text = normalize(input)
  if (isGenericAlibabaSearchRequest(text)) return true
  return /\b(?:busca|buscar|buscame|buscalo|encontra|encontrame|opciones|proveedores)\b/.test(text)
    && /\b(?:alibaba|producto|productos|proveedor|proveedores|opciones|importar)\b/.test(text)
}

function stripIntentWords(input: string) {
  return normalize(input)
    .replace(/\b(?:busca|buscar|buscame|buscalo|encontra|encontrame|mostrame|quiero|necesito|opciones|proveedores|productos|producto|importar|en|de|del|la|el|los|las|un|una|por|para)\b/g, ' ')
    .replace(/\balibaba\b/g, ' ')
    .replace(/\b(?:usd|us\$|dolares|dolares?)\b/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildDiscoveryQuery(input: string) {
  const cleaned = stripIntentWords(input)
  if (!cleaned) return ''
  const tokens = cleaned.split(' ').filter((token) => token.length >= 3)
  return tokens.slice(0, 10).join(' ')
}
