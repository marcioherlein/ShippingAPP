import type { NcmTariff } from './ncmRetrieval'

export const NCM_APP_TARIFF_SOURCE = {
  source: 'NCM_APP.xlsx',
  sourceDate: '2026-08-27',
  scope: 'Common automatic-classification tariff overrides used when the public search index is still schema 3.',
}

const rows: Record<string, [aecPct: number, diePct: number, tePct: number, diiPct: number, vatPct: number, vatAdditionalPct: number, gainsPct: number, iibbPct: number, internalTax: string | number | null, capitalGoodEligible: 0 | 1]> = {
  '9506.59.00': [20, 20, 3, 0, 21, 20, 6, 2.5, null, 0],
  '8504.40.90': [12.6, 2, 0, 0, 21, 20, 6, 2.5, null, 1],
  '8525.89.19': [20, 2, 3, 0, 21, 20, 6, 2.5, null, 0],
  '8518.30.00': [20, 35, 3, 0, 21, 20, 6, 2.5, null, 0],
  '8528.69.10': [0, 0, 0, 0, 21, 20, 6, 2.5, null, 1],
  '8528.69.90': [20, 20, 3, 0, 21, 20, 6, 2.5, null, 0],
  '8509.40.50': [20, 20, 3, 0, 21, 20, 6, 2.5, null, 1],
  '8508.11.00': [20, 20, 3, 0, 21, 20, 6, 2.5, null, 0],
  '8543.70.99': [10.8, 10.8, 0, 0, 10.5, 10, 6, 2.5, null, 1],
  '8471.30.19': [16, 16, 0, 0, 10.5, 10, 6, 2.5, null, 1],
  '8541.43.00': [10.8, 10.8, 0, 0, 10.5, 10, 0, 2.5, null, 0],
  '9004.10.00': [20, 20, 3, 0, 21, 20, 6, 2.5, null, 1],
  '8516.71.00': [20, 20, 3, 0, 21, 20, 6, 2.5, null, 0],
  '9403.10.00': [18, 18, 3, 0, 21, 20, 6, 2.5, null, 1],
  '8423.81.90': [12.6, 12.6, 0, 0, 10.5, 10, 6, 2.5, null, 1],
  '9506.51.00': [20, 20, 3, 0, 21, 20, 6, 2.5, null, 0],
  '9506.40.00': [20, 20, 3, 0, 21, 20, 6, 2.5, null, 0],
  '9506.91.00': [20, 35, 3, 0, 21, 20, 6, 2.5, null, 0],
  '4202.92.00': [35, 20, 3, 0, 21, 20, 6, 2.5, null, 0],
  '9617.00.10': [18, 18, 3, 0, 21, 20, 6, 2.5, null, 0],
  '8518.21.00': [20, 20, 3, 0, 21, 20, 6, 2.5, null, 0],
  '8471.60.52': [10.8, 0, 0, 0, 10.5, 10, 6, 2.5, null, 1],
  '8471.60.53': [10.8, 0, 0, 0, 10.5, 10, 6, 2.5, null, 1],
  '9405.42.00': [18, 20, 3, 0, 21, 20, 6, 2.5, null, 0],
  '8516.10.00': [20, 20, 3, 0, 21, 20, 6, 2.5, null, 0],
  '8507.60.00': [18, 18, 3, 0, 21, 20, 6, 2.5, null, 0],
  '6404.11.00': [35, 0, 3, 0, 21, 20, 6, 2.5, null, 0],
}

export function ncmAppTariffOverride(code: string | null | undefined): NcmTariff | null {
  if (!code) return null
  const row = rows[code]
  if (!row) return null
  return {
    aecPct: row[0],
    diePct: row[1],
    tePct: row[2],
    diiPct: row[3],
    vatPct: row[4],
    vatAdditionalPct: row[5],
    gainsPct: row[6],
    iibbPct: row[7],
    internalTax: row[8],
    capitalGoodEligible: row[9] === 1,
  }
}
