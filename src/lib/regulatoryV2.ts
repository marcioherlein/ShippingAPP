import { buildRegulatoryChecks, type ClientProfile, type RegulatoryCheck } from './regulatory'
import type { ProductAnalysis } from './productAnalysis'

export function buildRegulatoryChecksV2(analysis: ProductAnalysis, client: ClientProfile): RegulatoryCheck[] {
  const base = buildRegulatoryChecks(analysis, client).map((check) => {
    if (check.id === 'sita') return {
      ...check,
      title: client.sitaSicnea === 'yes' ? 'SITA disponible' : 'Confirmar acceso operativo a SITA',
      detail: 'ARCA utiliza SITA para presentar documentación complementaria del Perfil Importador/Exportador. No se presume que SICNEA, por sí sola, determine la aceptación o rechazo del perfil.',
    }
    if (check.id === 'fx-timing') return {
      ...check,
      status: 'verify' as const,
      title: 'Validar momento habilitado para pago al exterior',
      detail: client.mipyme === 'yes'
        ? 'La condición MiPyME puede habilitar acceso antes del ingreso aduanero en ciertos pagos a la vista, pero depende de fecha de embarque, NCM, documentación y demás condiciones cambiarias. El banco interviniente valida el encuadre.'
        : 'El momento de acceso al mercado de cambios depende del tipo de pago, ingreso aduanero, NCM, documentación y demás condiciones vigentes. El banco interviniente valida el encuadre.',
    }
    return check
  })

  const arcaDocs: RegulatoryCheck = {
    id: 'arca-supporting-docs', group: 'client', status: 'verify',
    title: 'Verificar documentación complementaria del Perfil ARCA',
    detail: 'La guía vigente de ARCA incluye certificado de antecedentes penales mediante SITA; para personas jurídicas indica la documentación de todos los socios. ShippingAPP no solicita ni almacena ese documento.',
    sourceIds: ['arcaProfile'], financialEffect: 'none',
  }

  const position = Math.max(0, base.findIndex((check) => check.id === 'sita'))
  return [...base.slice(0, position), arcaDocs, ...base.slice(position)]
}
