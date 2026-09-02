import { buildFunctionalMarketQuery } from './functionalMarketMatch'

const ARGENTINA_STOREFRONT_TERMS: Record<string, string> = {
  vacuum: 'aspiradora',
  phone: 'celular',
  drill: 'taladro',
  headphones: 'auriculares',
  speaker: 'parlante',
  blender: 'licuadora',
  wireless: 'inalambrico',
  electric: 'electrico',
  outdoor: 'exterior',
  adjustable: 'ajustable',
  storage: 'organizador',
  box: 'caja',
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildArgentinaFunctionalMarketQuery(productName: string, category: string) {
  const base = buildFunctionalMarketQuery(productName, category)
  const target = normalize(`${productName} ${category}`)
  const racketTerm = /\b(?:tenis|tennis)\b/.test(target) ? 'raqueta' : 'paleta'
  const localized = base
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token === 'racket' ? racketTerm : ARGENTINA_STOREFRONT_TERMS[token] || token)
  return [...new Set(localized)].slice(0, 8).join(' ')
}
