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

  it('localizes proof-required outdoor and adjustable traits for Argentine storefronts', () => {
    const camera = buildArgentinaFunctionalMarketQuery(
      'Camara seguridad WiFi exterior 3MP sin marca',
      'camara de seguridad',
    )
    const dumbbell = buildArgentinaFunctionalMarketQuery(
      'Mancuerna ajustable 20kg sin marca',
      'mancuerna',
    )

    expect(camera).toContain('exterior')
    expect(camera).not.toContain('outdoor')
    expect(dumbbell).toContain('ajustable')
    expect(dumbbell).not.toContain('adjustable')
  })
})
