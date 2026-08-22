import { describe, expect, it } from 'vitest'
import { buildNcmD1Seed } from './build-ncm-d1-seed.mjs'

const official = {
  meta: {
    source: 'ARCA Arancel Integrado', sourceFile: 'nomenclador_14082026.txt', sourceDate: '2026-08-14',
    indexSchema: 3,
  },
  records: [
    ['8504.40.90', 'Convertidores eléctricos estáticos > Los demás'],
    ['9506.59.00', 'Raquetas de tenis, bádminton o similares > Las demás'],
    ['8472.90.20', 'Máquinas de oficina > Las demás'],
  ],
}

const tariffs = {
  meta: { schemaVersion: 1, blockedConflictCodes: ['8472.90.20'] },
  records: [
    {
      code: '8504.40.90', sourceGroupDescription: 'Convertidores', sourceRows: [3010],
      tariff: { aecPct: 7, statisticsRatePct: 3, ivaPct: 21, ivaAdditionalPct: 20 },
    },
    {
      code: '9506.59.00', sourceGroupDescription: 'Artículos para deporte', sourceRows: [3570],
      tariff: { aecPct: 20, statisticsRatePct: 3, ivaPct: 21, ivaAdditionalPct: 20 },
    },
    {
      code: '8472.90.20', sourceGroupDescription: 'Máquinas de oficina', sourceRows: [3016, 3072],
      tariff: { aecPct: 5, statisticsRatePct: 3, ivaPct: 21, ivaAdditionalPct: 20 },
    },
  ],
}

describe('buildNcmD1Seed', () => {
  it('joins official labels to normalized tariffs and excludes blocked conflicts', () => {
    const result = buildNcmD1Seed(official, tariffs)
    expect(result.stats.officialCodes).toBe(3)
    expect(result.stats.tariffCodes).toBe(2)
    expect(result.stats.blockedConflictCodes).toEqual(['8472.90.20'])
    expect(result.sql).toContain('Convertidores eléctricos estáticos > Los demás')
    expect(result.sql).toContain("'8504.40.90',7,3,21,20")
    expect(result.sql).toContain("'9506.59.00',20,3,21,20")
    expect(result.sql).not.toContain("ncm_tariffs(version_id,code,aec_pct,statistics_rate_pct,iva_pct,iva_additional_pct,source_group_description,source_rows,validation_status) VALUES ((SELECT id FROM ncm_dataset_versions WHERE active=1 ORDER BY id DESC LIMIT 1),'8472.90.20'")
  })

  it('rejects a tariff code that does not exist in the official catalog', () => {
    const bad = {
      ...tariffs,
      meta: { schemaVersion: 1, blockedConflictCodes: [] },
      records: [...tariffs.records, {
        code: '9999.99.99', sourceGroupDescription: 'invalid', sourceRows: [1],
        tariff: { aecPct: 1, statisticsRatePct: 1, ivaPct: 1, ivaAdditionalPct: 1 },
      }],
    }
    expect(() => buildNcmD1Seed(official, bad)).toThrow('missing from official catalog')
  })

  it('rejects duplicate normalized tariff codes before writing SQL', () => {
    const duplicate = { ...tariffs, records: [...tariffs.records, tariffs.records[0]] }
    expect(() => buildNcmD1Seed(official, duplicate)).toThrow('Duplicate normalized tariff code')
  })
})
