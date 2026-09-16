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
