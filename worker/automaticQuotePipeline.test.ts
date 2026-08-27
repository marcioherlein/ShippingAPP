import { describe, expect, it } from 'vitest'
import { classifyFullNcm, type NcmSearchIndex } from './ncmRetrieval'
import { calculateImportTaxes } from '../src/lib/importTaxes'

const index: NcmSearchIndex = {
  meta: {
    source: 'ARCA Arancel Integrado', sourceFile: 'nomenclador_14082026.txt', sourceDate: '2026-08-14',
    parserSchema: 2, indexSchema: 3, recordCount: 10504, tariffDataIncluded: false,
    simOpeningsIncluded: false, recordShape: '[ncmCode,label]',
  },
  records: [
    ['9506.59.00', 'Raquetas de tenis, bádminton o similares, incluso sin cordaje > Las demás'],
    ['8504.40.90', 'Transformadores eléctricos, convertidores eléctricos estáticos y bobinas de reactancia > Convertidores estáticos > Los demás'],
    ['8541.43.00', 'Células fotovoltaicas ensambladas en módulos o paneles'],
  ],
}

const aiNeverNeeded = { run: async () => ({ response: '{}' }) }

type ClassifiedTariff = NonNullable<Awaited<ReturnType<typeof classifyFullNcm>>['tariff']>

function automaticTaxFromClassification(customsBaseUsd: number, tariff: ClassifiedTariff, opts: { gainsExempt?: boolean; capitalGoodUse?: boolean } = {}) {
  const capitalGoodUse = opts.capitalGoodUse === true && tariff.capitalGoodEligible
  return calculateImportTaxes({
    customsBaseUsd,
    dutyRatePct: tariff.diePct,
    dutyRateVerified: true,
    statisticsRatePct: tariff.tePct,
    statisticsExempt: capitalGoodUse,
    vatRatePct: tariff.vatPct,
    vatPerceptionPct: capitalGoodUse ? 0 : tariff.vatAdditionalPct,
    gainsPerceptionPct: tariff.gainsPct,
    iibbPerceptionPct: capitalGoodUse ? 0 : tariff.iibbPct,
    taxStatus: 'responsable_inscripto',
    purpose: capitalGoodUse ? 'own_use' : 'resale',
    entityType: 'company',
    vatPerceptionExempt: capitalGoodUse,
    gainsPerceptionExempt: opts.gainsExempt === true || capitalGoodUse,
    capitalGoodEligible: tariff.capitalGoodEligible,
    capitalGoodUse,
  })
}

describe('automatic quote pipeline', () => {
  it('classifies an Alibaba padel racket and feeds duty, VAT, gains and IIBB automatically', async () => {
    const product = {
      name: 'Carbon 18K padel racket Alibaba',
      unitPriceUsd: 40,
      moq: 50,
      packedWeightKg: 1,
      volumeCbm: 0.01,
      originCountry: 'China',
    }
    expect(product.unitPriceUsd).toBeGreaterThan(0)
    expect(product.moq).toBeGreaterThan(0)
    expect(product.packedWeightKg).toBeGreaterThan(0)
    expect(product.volumeCbm).toBeGreaterThan(0)
    expect(product.originCountry).toBe('China')

    const classification = await classifyFullNcm(index, aiNeverNeeded, { name: product.name, category: 'padel racket' })
    expect(classification.code).toBe('9506.59.00')
    expect(classification.tariff).toMatchObject({ diePct: 20, tePct: 3, vatPct: 21, vatAdditionalPct: 20, gainsPct: 6, iibbPct: 2.5, capitalGoodEligible: false })

    const taxes = automaticTaxFromClassification(6000, classification.tariff!)
    expect(taxes.importDutyUsd).toBe(1200)
    expect(taxes.importVatUsd).toBeGreaterThan(0)
    expect(taxes.gainsPerceptionUsd).toBeGreaterThan(0)
    expect(taxes.iibbPerceptionUsd).toBeGreaterThan(0)
  })

  it('automatically removes gains when NCM_APP says ganancias is 0', async () => {
    const classification = await classifyFullNcm(index, aiNeverNeeded, { name: 'solar panel photovoltaic Alibaba', category: 'solar panel' })
    expect(classification.code).toBe('8541.43.00')
    expect(classification.tariff?.gainsPct).toBe(0)
    const taxes = automaticTaxFromClassification(10000, classification.tariff!)
    expect(taxes.gainsPerceptionUsd).toBe(0)
  })

  it('capital-good user choice leaves only duty and import VAT as requested', async () => {
    const classification = await classifyFullNcm(index, aiNeverNeeded, { name: 'cargador USB-C 65W', category: 'power adapter' })
    expect(classification.code).toBe('8504.40.90')
    expect(classification.tariff?.capitalGoodEligible).toBe(true)
    const normal = automaticTaxFromClassification(5000, classification.tariff!)
    const capitalGood = automaticTaxFromClassification(5000, classification.tariff!, { capitalGoodUse: true })

    expect(normal.statisticsFeeUsd).toBeGreaterThan(0)
    expect(normal.vatPerceptionUsd).toBeGreaterThan(0)
    expect(normal.gainsPerceptionUsd).toBeGreaterThan(0)
    expect(normal.iibbPerceptionUsd).toBeGreaterThan(0)

    expect(capitalGood.statisticsFeeUsd).toBe(0)
    expect(capitalGood.vatPerceptionUsd).toBe(0)
    expect(capitalGood.gainsPerceptionUsd).toBe(0)
    expect(capitalGood.iibbPerceptionUsd).toBe(0)
    expect(capitalGood.cashTaxesUsd).toBe(capitalGood.importDutyUsd + capitalGood.importVatUsd)
  })
})
