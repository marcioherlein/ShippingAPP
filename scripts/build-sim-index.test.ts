import { describe, expect, it } from 'vitest'
import { buildSimIndexes } from './build-sim-index.mjs'

const fixture = [
  '2@8504.4          @      @      @      @      @      @      @  @  @-Convertidores estáticos:',
  '2@8504.40.90      @      @      @      @      @      @      @  @  @--Los demás',
  '2@8504.40.90.100A @000.00@010.00@016.00@010.00@000.00@      @07@  @      Para telecomunicaciones',
  '2@9506.5          @      @      @      @      @      @      @  @  @-Raquetas de tenis, bádminton o similares, incluso sin cordaje:',
  '2@9506.59.00      @      @      @      @      @      @      @  @  @--Las demás',
  '2@9506.59.00.100F @000.00@007.50@020.00@007.50@000.00@      @07@  @      Raquetas de badminton, incluso sin cordaje',
  '2@9506.59.00.900Z @000.00@007.50@020.00@007.50@000.00@      @07@  @      Las demás',
].join('\n')

describe('SIM chapter index builder', () => {
  it('splits details by NCM chapter', () => {
    const built = buildSimIndexes(fixture, 'nomenclador_14082026.txt')
    expect(built.chapters.map(([chapter]) => chapter)).toEqual(['85', '95'])
  })

  it('preserves NCM parent context and official SIM openings', () => {
    const built = buildSimIndexes(fixture, 'nomenclador_14082026.txt')
    const chapter95 = built.chapters.find(([chapter]) => chapter === '95')?.[1]
    const row = chapter95?.find((item: any) => item[0] === '9506.59.00')
    expect(row?.[1]).toContain('Raquetas de tenis')
    expect(row?.[2].map((opening: any) => opening[0])).toEqual(['9506.59.00.100F', '9506.59.00.900Z'])
  })

  it('does not carry raw tariff fields into SIM detail assets', () => {
    const built = buildSimIndexes(fixture, 'nomenclador_14082026.txt')
    expect(built.meta.tariffDataIncluded).toBe(false)
    expect(JSON.stringify(built)).not.toContain('020.00')
    expect(JSON.stringify(built)).not.toContain('007.50')
  })

  it('does not produce rows for NCMs without SIM openings', () => {
    const text = `${fixture}\n2@8501.10.19      @      @      @      @      @      @      @  @  @--Los demás motores`
    const built = buildSimIndexes(text, 'nomenclador_14082026.txt')
    const chapter85 = built.chapters.find(([chapter]) => chapter === '85')?.[1] || []
    expect(chapter85.some((item: any) => item[0] === '8501.10.19')).toBe(false)
  })
})
