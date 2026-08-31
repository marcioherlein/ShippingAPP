import { describe, expect, it } from 'vitest'
import { assertCanonicalLabelSentinels, deriveCanonicalParentLabel, reconcileNcmIndexLabels } from './ncm-label-reconciliation.mjs'

const canonicalSentinels = new Map<string, string>([
  ['9506.51.00', 'Artículos y material para deportes > Raquetas de tenis, bádminton o similares > Raquetas de tenis, incluso sin cordaje'],
  ['9506.40.00', 'Artículos y material para deportes > Artículos y material para tenis de mesa'],
  ['9506.91.00', 'Artículos y material para deportes > Los demás > Artículos y material para cultura física, gimnasia o atletismo'],
  ['9506.59.00', 'Artículos y material para deportes > Raquetas de tenis, bádminton o similares > Las demás'],
  ['8507.60.00', 'Acumuladores eléctricos, incluidos sus separadores > De iones de litio'],
])

function fixture() {
  const records: any[] = [
    ['9506.51.00', 'Artículos y material para cultura física — Inflables', 20, 20, 3, 0, 21, 20, 6, 2.5, null, 'NO'],
    ['9506.40.00', 'Artículos y material para cultura física — Inflables', 20, 20, 3, 0, 21, 20, 6, 2.5, null, 'NO'],
    ['9506.91.00', 'Artículos y material para cultura física — Inflables', 20, 20, 3, 0, 21, 20, 6, 2.5, null, 'NO'],
    ['9506.59.00', 'Artículos y material para cultura física — Inflables', 20, 20, 3, 0, 21, 20, 6, 2.5, null, 'NO'],
    ['8507.60.00', 'Acumuladores eléctricos — De níquel-cadmio — Los demás', 18, 18, 3, 0, 21, 20, 6, 2.5, null, 'NO'],
  ]
  const labels = new Map(canonicalSentinels)
  for (let i = records.length; i < 10000; i += 1) {
    const code = `1000.${String(Math.floor(i / 100) % 100).padStart(2, '0')}.${String(i % 100).padStart(2, '0')}`
    records.push([code, `Corrupted source label ${i}`, 10, 10, 3, 0, 21, 20, 6, 2.5, null, 'NO'])
    labels.set(code, `Canonical ARCA label ${i}`)
  }
  return {
    ncm: {
      meta: { source: 'NCM_APP.xlsx', sourceFile: 'NCM_APP.xlsx', sourceDate: '2026-08-27', indexSchema: 4, recordCount: records.length, tariffDataIncluded: true },
      records,
    },
    labels,
  }
}

describe('NCM canonical label reconciliation', () => {
  it('replaces corrupted NCM_APP labels with SIM/ARCA labels without changing tariff columns', () => {
    const { ncm, labels } = fixture()
    const beforeTariff = ncm.records[0].slice(2)
    const result = reconcileNcmIndexLabels(ncm, labels, '2026-08-14')
    expect(result.records[0][1]).toContain('Raquetas de tenis')
    expect(result.records[0][1]).not.toContain('Inflables')
    expect(result.records[4][1]).toContain('iones de litio')
    expect(result.records[4][1]).not.toContain('níquel-cadmio')
    expect(result.records[0].slice(2)).toEqual(beforeTariff)
    expect(result.meta.canonicalLabelCoverage).toBe(10000)
    expect(result.meta.canonicalLabelSourceDate).toBe('2026-08-14')
    expect(result.meta.runtimeLabelReconciled).toBe(true)
  })

  it('derives a trustworthy parent from official SIM openings when the raw parent label is blank', () => {
    expect(deriveCanonicalParentLabel('', [
      ['0101.30.00.000T', 'CABALLOS, ASNOS, MULOS Y BURDEGANOS, VIVOS. > Asnos'],
    ])).toBe('CABALLOS, ASNOS, MULOS Y BURDEGANOS, VIVOS. > Asnos')

    expect(deriveCanonicalParentLabel('', [
      ['9999.99.99.100A', 'Familia oficial > Subfamilia > Variante A'],
      ['9999.99.99.200B', 'Familia oficial > Subfamilia > Variante B'],
    ])).toBe('Familia oficial > Subfamilia')
  })

  it('fails closed if any NCM code lacks a canonical SIM parent label', () => {
    const { ncm, labels } = fixture()
    labels.delete(ncm.records.at(-1)[0])
    expect(() => reconcileNcmIndexLabels(ncm, labels, '2026-08-14')).toThrow(/coverage missing/i)
  })

  it('rejects the exact historical semantic contaminations', () => {
    const broken = new Map(canonicalSentinels)
    broken.set('9506.51.00', 'Artículos y material para cultura física — Inflables')
    expect(() => assertCanonicalLabelSentinels(broken)).toThrow(/9506\.51\.00/)

    broken.set('9506.51.00', canonicalSentinels.get('9506.51.00')!)
    broken.set('8507.60.00', 'Acumuladores eléctricos > De níquel-cadmio > Los demás')
    expect(() => assertCanonicalLabelSentinels(broken)).toThrow(/8507\.60\.00/)
  })
})
