import { describe, it, expect } from 'vitest'
import { parseWeightKg } from './weightUnits'
import { extractAlibabaDirectFacts } from './alibabaDirectExtract'
describe('supplier weight units', () => {
  it.each([['180g', .18], ['180 g', .18], ['180grams', .18], ['0,18kg', .18], ['180mg', .00018], ['2.2lbs', .997903214], ['0.18 kg', .18]])('converts %s to kg', (input, expected) => expect(parseWeightKg(input)).toBeCloseTo(expected, 8))
  it.each(['unknown', '-180g', '180-200g', '180 boxes'])('rejects ambiguous %s', input => expect(parseWeightKg(input)).toBeNull())
  it('extracts compact grams for the reported RGB light product', () => {
    const html = '<script type="application/json">'+JSON.stringify({productId:'1601634663041', productTitle:'Portable Mini RGB Phone Lighting Adjustable', unitWeight:'180g'})+'</script>'
    expect(extractAlibabaDirectFacts(html).packedWeightKg).toBe(.18)
  })
})
