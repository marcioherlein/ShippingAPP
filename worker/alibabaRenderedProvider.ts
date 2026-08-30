import type { BrowserRun } from './alibabaSource'
import { extractAlibabaDirectFacts, type AlibabaDirectFacts } from './alibabaDirectExtract'

export type RenderedAlibabaResult =
  | { status: 'ready' | 'partial'; source: 'ShippingAPP rendered Alibaba'; facts: AlibabaDirectFacts; httpStatus: number; warnings: string[]; browserMsUsed: number | null }
  | { status: 'unavailable'; source: 'ShippingAPP rendered Alibaba'; facts: null; httpStatus: number | null; warnings: string[]; browserMsUsed: number | null }

function browserMs(response: Response) {
  const value = Number(response.headers.get('X-Browser-Ms-Used'))
  return Number.isFinite(value) && value >= 0 ? value : null
}

function coreSignals(facts: AlibabaDirectFacts) {
  return [facts.name, facts.category, facts.unitPriceUsd, facts.moq, facts.packedWeightKg, facts.volumeCbm, facts.originCountry].filter(Boolean).length
}

function productTitleFromUrl(url: URL) {
  const segment = url.pathname.split('/').filter(Boolean).at(-1) || ''
  const withoutId = segment.replace(/_\d{8,}\.html$/i, '').replace(/\.html$/i, '')
  let decoded = withoutId
  try { decoded = decodeURIComponent(withoutId) } catch { /* keep slug */ }
  const title = decoded.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!title || /^(?:product|product detail|detail)$/i.test(title)) return null
  return title.slice(0, 700)
}

function preserveUrlIdentity(facts: AlibabaDirectFacts, url: URL) {
  if (facts.name) return facts
  const name = productTitleFromUrl(url)
  if (!name) return facts
  return { ...facts, name, evidence: [...new Set([...facts.evidence, 'url_slug_title'])] }
}

function request(url: URL) {
  return {
    url: url.toString(),
    gotoOptions: { waitUntil: 'networkidle2', timeout: 22_000 },
    rejectResourceTypes: ['image', 'media', 'font'],
  }
}

async function wait(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export async function extractAlibabaRenderedHtml(url: URL, browser: BrowserRun): Promise<RenderedAlibabaResult> {
  let response: Response
  let retried429 = false
  try {
    response = await browser.quickAction('content', request(url))
    if (response.status === 429) {
      retried429 = true
      await wait(650)
      response = await browser.quickAction('content', request(url))
    }
  } catch (error) {
    return {
      status: 'unavailable', source: 'ShippingAPP rendered Alibaba', facts: null, httpStatus: null, browserMsUsed: null,
      warnings: [`Rendered Alibaba read failed: ${error instanceof Error ? error.message : 'unknown error'}`],
    }
  }

  const ms = browserMs(response)
  if (!response.ok) {
    return {
      status: 'unavailable', source: 'ShippingAPP rendered Alibaba', facts: null, httpStatus: response.status, browserMsUsed: ms,
      warnings: [`Browser rendered-content returned HTTP ${response.status}${retried429 ? ' after one bounded retry' : ''}.`],
    }
  }

  let html = ''
  try { html = await response.text() } catch {
    return {
      status: 'unavailable', source: 'ShippingAPP rendered Alibaba', facts: null, httpStatus: response.status, browserMsUsed: ms,
      warnings: ['Browser rendered-content could not be read as HTML.'],
    }
  }
  if (html.length < 80) {
    return {
      status: 'unavailable', source: 'ShippingAPP rendered Alibaba', facts: null, httpStatus: response.status, browserMsUsed: ms,
      warnings: ['Browser rendered-content was too small to contain product evidence.'],
    }
  }

  const extracted = extractAlibabaDirectFacts(html, url)
  const facts = preserveUrlIdentity(extracted, url)
  const signals = coreSignals(facts)
  const hardEvidence = facts.evidence.filter((item) => item !== 'url_slug_title' && item !== 'product_id').length
  if (!facts.name || hardEvidence < 1) {
    return {
      status: 'unavailable', source: 'ShippingAPP rendered Alibaba', facts: null, httpStatus: response.status, browserMsUsed: ms,
      warnings: ['Chromium opened Alibaba, but the rendered HTML still did not expose trustworthy product facts beyond the URL identity.'],
    }
  }

  const warnings: string[] = []
  if (retried429) warnings.push('Browser rendered-content recibió HTTP 429 en el primer intento y recuperó la página en un único retry acotado.')
  if (facts.evidence.includes('url_slug_title') && !extracted.name) warnings.push('El título se conservó desde el URL como identidad provisional; debe confirmarlo el usuario.')
  if (!facts.category) warnings.push('Categoría/tipo no expuesto en el HTML renderizado.')
  if (!facts.unitPriceUsd) warnings.push('Precio unitario no expuesto en el HTML renderizado.')
  if (!facts.moq) warnings.push('MOQ no expuesto en el HTML renderizado.')
  if (!facts.packedWeightKg) warnings.push('Peso embalado no expuesto en el HTML renderizado.')
  if (!facts.volumeCbm) warnings.push('Volumen/dimensiones de empaque no expuestos en el HTML renderizado.')
  if (!facts.originCountry) warnings.push('Origen de la mercadería no expuesto en el HTML renderizado.')

  return {
    status: signals >= 7 ? 'ready' : 'partial',
    source: 'ShippingAPP rendered Alibaba',
    facts,
    httpStatus: response.status,
    warnings,
    browserMsUsed: ms,
  }
}
