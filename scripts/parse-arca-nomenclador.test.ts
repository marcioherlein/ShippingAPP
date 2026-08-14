import { describe, expect, it } from 'vitest'
import { parseNomencladorText } from './parse-arca-nomenclador.mjs'

const fixture = [
  '2@9506.5          @      @      @      @      @      @      @  @  @-Raquetas de tenis, bádminton o similares, incluso sin cordaje:',
  '2@9506.51.00      @      @      @      @      @      @      @07@  @--Raquetas de tenis, incluso sin cordaje',
  '2@9506.51.00.2    @      @      @      @      @      @      @  @  @      De fibras de carbono',
  '2@9506.51.00.210U @000.00@007.50@020.00@007.50@000.00@      @07@  @       Sin combinar con otras materias',
  '2@9506.59.00      @      @      @      @      @      @      @  @  @--Las demás',
  '2@9506.59.00.100F @000.00@007.50@020.00@007.50@000.00@      @07@  @      Raquetas de badminton, incluso sin cordaje',
  '2@9506.59.00.900Z @000.00@007.50@020.00@007.50@000.00@      @07@  @      Las demás',
].join('\n')

describe('ARCA nomenclador hierarchy parser', () => {
  it('inherits the group description when an NCM leaf says only Las demás', () => {
    const parsed = parseNomencladorText(fixture, 'nomenclador_14082026.txt')
    const row = parsed.records.find((item: any) => item.code === '9506.59.00')
    expect(row?.description).toBe('Las demás')
    expect(row?.context).toContain('Raquetas de tenis, bádminton o similares, incluso sin cordaje:')
  })

  it('preserves intermediate SIM material context', () => {
    const parsed = parseNomencladorText(fixture, 'nomenclador_14082026.txt')
    const row = parsed.records.find((item: any) => item.code === '9506.51.00')
    const carbon = row?.simOpenings.find((item: any) => item.code === '9506.51.00.210U')
    expect(carbon?.context).toContain('De fibras de carbono')
    expect(carbon?.description).toBe('Sin combinar con otras materias')
  })

  it('does not let a prior SIM subgroup leak into a sibling NCM', () => {
    const parsed = parseNomencladorText(fixture, 'nomenclador_14082026.txt')
    const row = parsed.records.find((item: any) => item.code === '9506.59.00')
    expect(row?.context).not.toContain('De fibras de carbono')
  })

  it('keeps tariff fields raw and labels their semantics unmapped', () => {
    const parsed = parseNomencladorText(fixture, 'nomenclador_14082026.txt')
    expect(parsed.meta.tariffFieldSemantics).toBe('UNMAPPED_RAW_FIELDS')
    const row = parsed.records.find((item: any) => item.code === '9506.59.00')
    expect(row?.simOpenings[0].rawTariffFields).toEqual(['000.00', '007.50', '020.00', '007.50', '000.00', ''])
  })
})
