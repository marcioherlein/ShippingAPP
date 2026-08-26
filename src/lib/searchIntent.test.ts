import { describe, expect, it } from 'vitest'
import { buildDiscoveryQuery, isGenericAlibabaSearchRequest, wantsAlibabaDiscovery } from './searchIntent'

describe('Alibaba search intent helpers', () => {
  it('keeps generic Alibaba search requests as pending discovery instead of product intake', () => {
    expect(isGenericAlibabaSearchRequest('buscalo en ALIBABA')).toBe(true)
    expect(wantsAlibabaDiscovery('buscalo en ALIBABA')).toBe(true)
    expect(buildDiscoveryQuery('buscalo en ALIBABA')).toBe('')
  })

  it('turns the follow-up product message into an Alibaba search query', () => {
    expect(buildDiscoveryQuery('Paleta de padel 150usd')).toBe('paleta padel')
  })

  it('detects explicit product searches with criteria', () => {
    const text = 'buscame paletas de padel carbono hasta USD 30 MOQ hasta 100 en Alibaba'
    expect(wantsAlibabaDiscovery(text)).toBe(true)
    expect(buildDiscoveryQuery(text)).toBe('paletas padel carbono')
  })
})
