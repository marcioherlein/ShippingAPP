import type { ProductAnalysis } from './productAnalysis'
import type { RegulatoryCheck } from './regulatory'
import { buildRegulatoryChecksV3, type ClientProfileV3 } from './regulatoryV3'
import type { ExpertOverride } from './expertOverride'

export function buildRegulatoryChecksV4(analysis: ProductAnalysis, client: ClientProfileV3, override: ExpertOverride | null): RegulatoryCheck[] {
  const base = buildRegulatoryChecksV3(analysis, client)
  if (!override) return base

  const patched = base.map((check) => {
    if (check.id === 'ncm') return {
      ...check,
      status: 'verify' as const,
      title: `NCM informada por usuario ${override.ncm}`,
      detail: override.userCheckedOfficialSource
        ? `El usuario indicó haber contrastado esta NCM con una fuente oficial (${override.sourceNote}). ShippingAPP todavía no la validó de forma independiente; mantener VERIFICAR antes de declarar.`
        : 'NCM aportada manualmente para habilitar el business case. ShippingAPP no la clasificó ni la validó; confirmar ficha técnica, NCM y Arancel Integrado antes de declarar.',
      sourceIds: ['tariff'],
    }
    if (check.id === 'duty') return {
      ...check,
      status: 'verify' as const,
      title: `Derecho informado por usuario: ${override.dutyRatePct}%`,
      detail: override.userCheckedOfficialSource
        ? `Tasa aportada por el usuario con referencia declarada a ${override.sourceNote}. Se usa para screening económico, pero ShippingAPP no confirma que corresponda a la NCM/origen/régimen de la operación.`
        : 'Tasa manual usada para screening económico. Debe confirmarse contra la NCM validada, origen, preferencia y Arancel Integrado vigente.',
      sourceIds: ['tariff'],
    }
    return check
  })

  const evidence: RegulatoryCheck = {
    id: 'expert-override-evidence',
    group: 'customs',
    status: 'verify',
    title: 'Business case habilitado con evidencia manual',
    detail: `Precio proveedor, MOQ, peso, volumen, benchmark local, demanda mensual, NCM y derecho fueron aportados por el usuario. Origen de evidencia: user_supplied. ${override.userCheckedOfficialSource ? 'Existe una referencia oficial declarada por el usuario, no verificada por ShippingAPP.' : 'No se declaró verificación oficial del NCM/derecho.'}`,
    sourceIds: override.userCheckedOfficialSource ? ['tariff'] : [],
    financialEffect: 'both',
  }

  const ncmIndex = patched.findIndex((check) => check.id === 'ncm')
  const insertAt = ncmIndex >= 0 ? ncmIndex : patched.findIndex((check) => check.group === 'customs')
  return insertAt >= 0 ? [...patched.slice(0, insertAt), evidence, ...patched.slice(insertAt)] : [...patched, evidence]
}
