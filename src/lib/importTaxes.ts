export type TaxStatus = 'responsable_inscripto' | 'monotributo' | 'exento' | 'unknown'
export type ImportPurpose = 'resale' | 'own_use' | 'unknown'

export type ImportTaxInput = {
  customsBaseUsd: number
  dutyRatePct: number
  dutyRateVerified: boolean
  statisticsRatePct: number
  statisticsExempt: boolean
  vatRatePct: number
  vatPerceptionPct: number
  gainsPerceptionPct: number
  iibbPerceptionPct: number
  taxStatus: TaxStatus
  purpose: ImportPurpose
  entityType: 'company' | 'individual' | 'unknown'
  vatPerceptionExempt: boolean
  gainsPerceptionExempt: boolean
}

export type ImportTaxBreakdown = {
  importDutyUsd: number
  statisticsFeeUsd: number
  vatTaxBaseUsd: number
  importVatUsd: number
  vatPerceptionUsd: number
  gainsPerceptionUsd: number
  iibbPerceptionUsd: number
  cashTaxesUsd: number
  potentialCreditsUsd: number
  nonRecoverableTaxCostUsd: number
  assumptions: string[]
  reviewedAt: string
}

export const TAX_RULES_REVIEWED_AT = '2026-08-13'

export function statisticsCap(customsBaseUsd: number) {
  if (customsBaseUsd <= 10_000) return 180
  if (customsBaseUsd <= 100_000) return 3_000
  if (customsBaseUsd <= 1_000_000) return 30_000
  return 150_000
}

export function calculateImportTaxes(input: ImportTaxInput): ImportTaxBreakdown {
  const assumptions: string[] = []
  const customsBaseUsd = Math.max(0, input.customsBaseUsd)
  const importDutyUsd = customsBaseUsd * Math.max(0, input.dutyRatePct) / 100

  if (!input.dutyRateVerified) {
    assumptions.push(`Derecho de importación ${input.dutyRatePct}% usado como estimación provisional; validar NCM y Arancel Integrado vigente.`)
  }

  const statisticsFeeUsd = input.statisticsExempt
    ? 0
    : Math.min(customsBaseUsd * Math.max(0, input.statisticsRatePct) / 100, statisticsCap(customsBaseUsd))

  if (input.statisticsExempt) assumptions.push('Tasa de estadística modelada en 0% por exención informada; validar origen y régimen preferencial.')

  const vatTaxBaseUsd = customsBaseUsd + importDutyUsd + statisticsFeeUsd
  const importVatUsd = vatTaxBaseUsd * Math.max(0, input.vatRatePct) / 100

  const privateHumanUse = input.entityType === 'individual' && input.purpose === 'own_use'
  const vatPerceptionApplies = !input.vatPerceptionExempt && !privateHumanUse
  const vatPerceptionUsd = vatPerceptionApplies
    ? vatTaxBaseUsd * Math.max(0, input.vatPerceptionPct) / 100
    : 0

  const gainsPerceptionUsd = input.gainsPerceptionExempt
    ? 0
    : vatTaxBaseUsd * Math.max(0, privateHumanUse ? 11 : input.gainsPerceptionPct) / 100

  const iibbPerceptionUsd = vatTaxBaseUsd * Math.max(0, input.iibbPerceptionPct) / 100
  if (input.iibbPerceptionPct <= 0) assumptions.push('Ingresos Brutos no incluido: falta resolver jurisdicción/padrón aplicable.')

  const cashTaxesUsd = importDutyUsd + statisticsFeeUsd + importVatUsd + vatPerceptionUsd + gainsPerceptionUsd + iibbPerceptionUsd

  let potentialCreditsUsd = 0
  if (input.taxStatus === 'responsable_inscripto' && input.purpose === 'resale') {
    potentialCreditsUsd = importVatUsd + vatPerceptionUsd + gainsPerceptionUsd + iibbPerceptionUsd
    assumptions.push('IVA importación y percepciones se muestran como potenciales créditos/pagos a cuenta para un RI con reventa gravada; la recuperabilidad efectiva depende de la situación fiscal real.')
  } else if (input.taxStatus === 'unknown') {
    assumptions.push('Situación fiscal desconocida: no se presume recuperabilidad de IVA ni percepciones.')
  } else {
    assumptions.push('No se presume recuperabilidad fiscal para este perfil; revisar con asesor impositivo.')
  }

  const nonRecoverableTaxCostUsd = Math.max(0, cashTaxesUsd - potentialCreditsUsd)

  return {
    importDutyUsd,
    statisticsFeeUsd,
    vatTaxBaseUsd,
    importVatUsd,
    vatPerceptionUsd,
    gainsPerceptionUsd,
    iibbPerceptionUsd,
    cashTaxesUsd,
    potentialCreditsUsd,
    nonRecoverableTaxCostUsd,
    assumptions,
    reviewedAt: TAX_RULES_REVIEWED_AT,
  }
}
