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

  it('uses raqueta for tennis while preserving paleta for padel', () => {
    const tennis = buildArgentinaFunctionalMarketQuery(
      'Raqueta de tenis grafito 300g sin marca',
      'raqueta de tenis',
    )
    const tennisEnglish = buildArgentinaFunctionalMarketQuery(
      'Generic graphite tennis racket 300g',
      'tennis racket',
    )
    const padel = buildArgentinaFunctionalMarketQuery(
      'Paleta de padel carbono sin marca',
      'paleta de padel',
    )

    expect(tennis).toContain('raqueta')
    expect(tennis).toContain('tenis')
    expect(tennis).not.toContain('paleta')
    expect(tennisEnglish).toContain('raqueta')
    expect(tennisEnglish).not.toContain('paleta')
    expect(padel).toContain('paleta')
    expect(padel).not.toContain('raqueta')
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
