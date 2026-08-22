import { describe, expect, it } from 'vitest'
import { searchableLabel } from './build-ncm-search-index.mjs'

describe('NCM search-index label construction', () => {
  it('uses official SIM opening text when the base NCM label is empty', () => {
    const label = searchableLabel({
      code: '8516.31.00',
      description: null,
      context: [],
      simOpenings: [
        {
          code: '8516.31.00.100A',
          description: 'Secadores para el cabello',
          context: ['Aparatos electrotermicos de uso domestico'],
        },
      ],
    })
    expect(label).toContain('Secadores para el cabello')
    expect(label).toContain('Aparatos electrotermicos')
  })

  it('preserves an already-informative base NCM label without adding SIM-child noise', () => {
    const label = searchableLabel({
      code: '8507.60.00',
      description: 'De iones de litio',
      context: ['Acumuladores electricos'],
      simOpenings: [
        { code: '8507.60.00.100A', description: 'Con capacidad inferior a cierto umbral', context: ['Detalle SIM'] },
      ],
    })
    expect(label).toBe('Acumuladores electricos > De iones de litio')
    expect(label).not.toContain('Detalle SIM')
  })

  it('deduplicates repeated context inherited from SIM openings', () => {
    const label = searchableLabel({
      code: '8516.31.00',
      description: 'Las demas',
      context: [],
      simOpenings: [
        { code: '8516.31.00.100A', description: 'Secadores para el cabello', context: ['Secadores para el cabello'] },
      ],
    })
    expect(label.match(/Secadores para el cabello/g)).toHaveLength(1)
  })
})
