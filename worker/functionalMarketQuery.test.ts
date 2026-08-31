import { describe, expect, it } from 'vitest'
import { buildArgentinaFunctionalMarketQuery } from './functionalMarketQuery'

describe('Argentina functional market query localization', () => {
  it('uses Argentina storefront vocabulary and drops private-label noise', () => {
    const query = buildArgentinaFunctionalMarketQuery(
      'IANONI Super Power Carbon Fiber Padel Racket',
      'paleta de padel',
    )
    expect(query).toContain('paleta')
    expect(query).toContain('padel')
    expect(query).toContain('carbon')
    expect(query).not.toContain('racket')
    expect(query).not.toContain('ianoni')
  })

  it('localizes generic electronics and keeps explicit specs', () => {
    expect(buildArgentinaFunctionalMarketQuery('Generic Cordless Vacuum 500W', 'vacuum')).toContain('aspiradora')
    expect(buildArgentinaFunctionalMarketQuery('Generic Cordless Vacuum 500W', 'vacuum')).toContain('500w')
    expect(buildArgentinaFunctionalMarketQuery('Generic Wireless Speaker 20W', 'speaker')).toContain('parlante')
  })
})
