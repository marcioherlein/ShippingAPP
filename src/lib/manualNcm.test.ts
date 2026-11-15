import { describe, it, expect } from 'vitest'
import { manualNcmProfile, searchManualNcm, type ManualNcmIndex } from './manualNcm'
import { customsProfileFor } from './customsClassification'
const index: ManualNcmIndex = { meta: { source: 'test catalog', sourceDate: '2026-08-27' }, records: [['3304.99.90', 'Preparaciones para cuidado de la piel', 18, 18, 3, 0, 21, 20, 6, 2.5, null, false], ['9506.51.00', 'Raquetas de tenis']] }
describe('manual nomenclature', () => {
 it('searches normalized labels, compact codes and chapters', () => {
  expect(searchManualNcm(index, 'PIÉL', '33')[0][0]).toBe('3304.99.90')
  expect(searchManualNcm(index, '33049990', '')).toHaveLength(1)
  expect(searchManualNcm(index, 'raquetas', '33')).toHaveLength(0)
 })
 it('finds damaged accents after exact descriptions and keeps chapter and code filters', () => {
  const records: ManualNcmIndex['records'] = [
   ['7321.12.00', 'Aparatos de cocción de combustibles l?quidos'],
   ['7321.19.00', 'Aparatos de cocción de combustibles sólidos'],
   ['7321.82.00', 'Los demás aparatos de combustibles líquidos'],
   ['8413.19.00', 'Bombas para l�quidos'],
  ]
  const catalog = { ...index, records }
  expect(searchManualNcm(catalog, 'combustibles LÍQUIDOS', '73').map(([code]) => code)).toEqual(['7321.82.00', '7321.12.00'])
  expect(searchManualNcm(catalog, '73211200 líquidos', '').map(([code]) => code)).toEqual(['7321.12.00'])
  expect(searchManualNcm(catalog, 'líquidos', '84').map(([code]) => code)).toEqual(['8413.19.00'])
  expect(searchManualNcm(catalog, 'líquid*', '')).toEqual([])
 })
 it('uses catalog tariffs and clears stale SIM when user confirms', () => {
  const profile = manualNcmProfile(customsProfileFor('', ''), index, '3304.99.90')
  expect(profile.dutyRatePct).toBe(18)
  expect(profile.simOpeningCandidate).toBeNull()
  expect(profile.source).toContain('usuario')
 })
 it('rejects unknown positions and incomplete tariffs', () => {
  expect(() => manualNcmProfile(customsProfileFor('', ''), index, '9999.99.99')).toThrow()
  expect(() => manualNcmProfile(customsProfileFor('', ''), index, '9506.51.00')).toThrow()
 })
})
