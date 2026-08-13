import type { ProductAnalysisV2 } from './productAnalysisV2'
import { buildRegulatoryChecksV3, type ClientProfileV3 } from './regulatoryV3'
import type { RegulatoryCheck } from './regulatory'

export function buildRegulatoryChecksV4(analysis: ProductAnalysisV2, client: ClientProfileV3): RegulatoryCheck[] {
  const base = buildRegulatoryChecksV3(analysis, client)
  if (client.technicalRegulation !== 'unknown') return base

  const screening = analysis.customs.technicalRegulationScreening
  if (screening !== 'no_specific_rt_detected') return base

  return base.map((check) => {
    if (check.id !== 'technical-regulation') return check
    return {
      ...check,
      status: 'verify' as const,
      title: 'No se detectó RT específico en el screening; confirmar VUCE/CIVUCE',
      detail: `${analysis.customs.technicalRegulationEvidence} Este resultado reduce la incertidumbre, pero no constituye una confirmación de no aplicabilidad ni reemplaza la consulta de intervenciones vigente al ejecutar la operación.`,
      sourceIds: ['consumerProducts313', 'technicalRegs', 'vuce'],
      financialEffect: 'none' as const,
    }
  })
}
