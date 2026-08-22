import { describe, expect, it } from 'vitest'
import { applyOfficialNcmLabelSupplements } from './ncmLabelSupplements'
import type { NcmSearchIndex } from './ncmRetrieval'

function index(records: Array<[string, string]>): NcmSearchIndex {
  return {
    meta: {
      source: 'ARCA', sourceFile: 'ncm.json', sourceDate: '2026-08-14', parserSchema: 2, indexSchema: 3,
      recordCount: records.length, tariffDataIncluded: false, simOpeningsIncluded: false, recordShape: '[ncmCode,label]',
    },
    records,
  }
}

describe('official NCM label supplements', () => {
  it('repairs a sparse existing official code', () => {
    const result = applyOfficialNcmLabelSupplements(index([['8516.31.00', '']]))
    expect(result.records[0][1]).toContain('Secadores para el cabello')
  })

  it('cannot create a code that is absent from the official catalog', () => {
    const result = applyOfficialNcmLabelSupplements(index([['8516.32.00', 'Los demás aparatos para el cuidado del cabello']]), [
      { code: '9999.99.99', label: 'Inventado', source: 'invalid' },
    ])
    expect(result.records).toHaveLength(1)
    expect(result.records[0][0]).toBe('8516.32.00')
  })

  it('does not overwrite an informative official label', () => {
    const result = applyOfficialNcmLabelSupplements(index([['8516.31.00', 'Secadores profesionales para cabello']]), [
      { code: '8516.31.00', label: 'Texto alternativo', source: 'test' },
    ])
    expect(result.records[0][1]).toBe('Secadores profesionales para cabello')
  })
})
