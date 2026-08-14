import type { Inputs } from './types'

export type ExpertOverrideDraft = {
  ncm: string
  dutyRatePct: number | null
  supplierUnitPriceUsd: number | null
  moq: number | null
  unitWeightKg: number | null
  unitVolumeCbm: number | null
  marketPriceArs: number | null
  monthlyDemand: number | null
  userCheckedOfficialSource: boolean
  sourceNote: string
}

export type ExpertOverride = {
  ncm: string
  dutyRatePct: number
  supplierUnitPriceUsd: number
  moq: number
  unitWeightKg: number
  unitVolumeCbm: number
  marketPriceArs: number
  monthlyDemand: number
  userCheckedOfficialSource: boolean
  sourceNote: string
  evidenceOrigin: 'user_supplied'
}

export type ExpertOverrideValidation = {
  valid: boolean
  errors: Partial<Record<keyof ExpertOverrideDraft, string>>
  value?: ExpertOverride
}

export const emptyExpertOverride: ExpertOverrideDraft = {
  ncm: '', dutyRatePct: null, supplierUnitPriceUsd: null, moq: null,
  unitWeightKg: null, unitVolumeCbm: null, marketPriceArs: null, monthlyDemand: null,
  userCheckedOfficialSource: false, sourceNote: '',
}

export function normalizeNcm(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.length === 8 ? `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}` : null
}

function positive(value: number | null) {
  return value !== null && Number.isFinite(value) && value > 0
}

export function validateExpertOverride(draft: ExpertOverrideDraft): ExpertOverrideValidation {
  const errors: ExpertOverrideValidation['errors'] = {}
  const ncm = normalizeNcm(draft.ncm)
  if (!ncm) errors.ncm = 'Ingresá una NCM de 8 dígitos.'
  if (draft.dutyRatePct === null || !Number.isFinite(draft.dutyRatePct) || draft.dutyRatePct < 0 || draft.dutyRatePct > 100) errors.dutyRatePct = 'El derecho debe estar entre 0% y 100%.'
  if (!positive(draft.supplierUnitPriceUsd)) errors.supplierUnitPriceUsd = 'Ingresá el precio unitario real del proveedor.'
  if (!positive(draft.moq) || !Number.isInteger(draft.moq)) errors.moq = 'El MOQ debe ser un entero positivo.'
  if (!positive(draft.unitWeightKg)) errors.unitWeightKg = 'Ingresá peso embalado por unidad.'
  if (!positive(draft.unitVolumeCbm)) errors.unitVolumeCbm = 'Ingresá volumen embalado por unidad.'
  if (!positive(draft.marketPriceArs)) errors.marketPriceArs = 'Ingresá un benchmark local positivo.'
  if (!positive(draft.monthlyDemand)) errors.monthlyDemand = 'Ingresá una hipótesis explícita de ventas mensuales.'
  if (draft.userCheckedOfficialSource && draft.sourceNote.trim().length < 5) errors.sourceNote = 'Indicá qué fuente oficial verificaste.'

  if (Object.keys(errors).length || !ncm || draft.dutyRatePct === null || draft.supplierUnitPriceUsd === null || draft.moq === null || draft.unitWeightKg === null || draft.unitVolumeCbm === null || draft.marketPriceArs === null || draft.monthlyDemand === null) return { valid: false, errors }

  return {
    valid: true,
    errors: {},
    value: {
      ncm,
      dutyRatePct: draft.dutyRatePct,
      supplierUnitPriceUsd: draft.supplierUnitPriceUsd,
      moq: draft.moq,
      unitWeightKg: draft.unitWeightKg,
      unitVolumeCbm: draft.unitVolumeCbm,
      marketPriceArs: draft.marketPriceArs,
      monthlyDemand: draft.monthlyDemand,
      userCheckedOfficialSource: draft.userCheckedOfficialSource,
      sourceNote: draft.sourceNote.trim(),
      evidenceOrigin: 'user_supplied',
    },
  }
}

export function applyExpertOverride(inputs: Inputs, override: ExpertOverride): Inputs {
  const existingQuantities = inputs.quantities.filter((quantity) => Number.isFinite(quantity) && quantity >= override.moq)
  const quantities = [...new Set([override.moq, ...existingQuantities])].sort((a, b) => a - b)
  return {
    ...inputs,
    priceTiers: [{ minQuantity: override.moq, unitPriceUsd: override.supplierUnitPriceUsd }],
    quantities,
    weightKg: override.unitWeightKg,
    volumeCbm: override.unitVolumeCbm,
    marketPriceArs: override.marketPriceArs,
    monthlyDemand: override.monthlyDemand,
    dutyRatePct: override.dutyRatePct,
    dutyRateVerified: false,
  }
}
