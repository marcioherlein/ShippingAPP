/** Provider numbers without units retain their documented kg convention. */
export function parseWeightKg(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^([0-9]+(?:[.,][0-9]+)?)\s*(kg|kgs|kilograms?|kilogramos?|g|gr|grams?|gramos?|mg|lbs?|pounds?|oz)?\s*$/i)
  if (!match) return null
  const amount = Number(match[1].replace(',', '.'))
  const unit = (match[2] || 'kg').toLowerCase()
  const factor = /^(g|gr|grams?|gramos?)$/.test(unit) ? .001 : unit === 'mg' ? .000001 : /^(lb|lbs|pounds?)$/.test(unit) ? .45359237 : unit === 'oz' ? .028349523125 : 1
  return amount > 0 ? Number((amount * factor).toFixed(9)) : null
}
