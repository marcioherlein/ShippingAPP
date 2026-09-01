import { buildFunctionalMarketQuery } from './functionalMarketMatch'

const ARGENTINA_STOREFRONT_TERMS: Record<string, string> = {
  vacuum: 'aspiradora',
  racket: 'paleta',
  phone: 'celular',
  drill: 'taladro',
  headphones: 'auriculares',
  speaker: 'parlante',
  blender: 'licuadora',
  wireless: 'inalambrico',
  electric: 'electrico',
  storage: 'organizador',
  box: 'caja',
}

export function buildArgentinaFunctionalMarketQuery(productName: string, category: string) {
  const base = buildFunctionalMarketQuery(productName, category)
  const localized = base
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => ARGENTINA_STOREFRONT_TERMS[token] || token)
  return [...new Set(localized)].slice(0, 8).join(' ')
}
