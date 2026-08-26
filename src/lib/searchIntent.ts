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

const SEARCH_FILLER_WORDS = new Set([
  'busca', 'buscar', 'buscame', 'buscalo', 'encontra', 'encontrame', 'mostrame', 'quiero', 'necesito',
  'opciones', 'proveedores', 'productos', 'producto', 'importar', 'alibaba', 'precio', 'precios',
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'por', 'para', 'con', 'sin', 'hasta', 'max', 'maximo', 'minimo',
  'menos', 'mayor', 'menor', 'below', 'under', 'usd', 'dolar', 'dolares', 'us', 'moq', 'pedido', 'minima', 'minimo',
])

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

export function buildDiscoveryQuery(input: string) {
  const tokens = normalize(input)
    .replace(/us\$/g, ' usd ')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
    .filter((token) => !/^\d+(?:[.,]\d+)?$/.test(token))
    .filter((token) => !SEARCH_FILLER_WORDS.has(token))
  return tokens.slice(0, 10).join(' ')
}
