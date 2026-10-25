import { expect, it } from 'vitest'
import { recoverSavedCategory } from './calculationRecovery'
const inputs = ['resale', 'company', 'yes', null, 'unknown', 10000, 50, 200]
const key = (changes: Record<number, unknown> = {}) => JSON.stringify(inputs.map((value, index) => index in changes ? changes[index] : value))
it('restores the manual unknown category omitted by visible journey replay', () => {
  expect(recoverSavedCategory(key({3:'unknown'}), key())).toBe('unknown')
})
it('keeps old null categories and explicit categories without changing their meaning', () => {
  expect(recoverSavedCategory(key(), key())).toBeNull()
  expect(recoverSavedCategory(key({3:'food'}), key())).toBe('food')
})
it('does not reuse a quote after any visible operation or capacity input changes', () => {
  for (const [index, value] of [[0,'own_use'],[1,'individual'],[2,'no'],[3,'food'],[4,'budget'],[5,20000],[6,100],[7,500]] as const) {
    expect(recoverSavedCategory(key({3:'unknown'}), key({[index]:value}))).toBeUndefined()
  }
})
it('rejects malformed, incompatible and unsupported saved contexts', () => {
  for (const saved of ['broken','null','{}','[]',key({3:'invalid-category'})]) expect(recoverSavedCategory(saved,key())).toBeUndefined()
})
