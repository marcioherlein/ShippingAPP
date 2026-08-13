import type { ProductAnalysis } from './productAnalysis'

export type TriState = 'yes' | 'no' | 'unknown'
export type CheckStatus = 'pass' | 'blocker' | 'verify' | 'info'
export type CheckGroup = 'client' | 'customs' | 'tax' | 'fx' | 'sale'

export type ClientProfile = {
  entityType: 'company' | 'individual' | 'unknown'
  taxStatus: 'responsable_inscripto' | 'monotributo' | 'exento' | 'unknown'
  importerProfile: TriState
  biometrics: TriState
  sitaSicnea: TriState
  mipyme: TriState
  bankComex: TriState
  purpose: 'resale' | 'own_use' | 'unknown'
  paymentTerm: 'advance' | 'shipment' | 'arrival' | 'credit' | 'unknown'
  province: string
}

export type RegulatoryCheck = {
  id: string
  group: CheckGroup
  status: CheckStatus
  title: string
  detail: string
  sourceIds: string[]
  financialEffect: 'economic_cost' | 'cash_only' | 'both' | 'none'
}

export const defaultClientProfile: ClientProfile = {
  entityType: 'unknown', taxStatus: 'unknown', importerProfile: 'unknown', biometrics: 'unknown',
  sitaSicnea: 'unknown', mipyme: 'unknown', bankComex: 'unknown', purpose: 'resale',
  paymentTerm: 'unknown', province: '',
}

function clientCheck(id: string, value: TriState, title: string, missing: string, detail: string, sources: string[]): RegulatoryCheck {
  return { id, group: 'client', status: value === 'yes' ? 'pass' : value === 'no' ? 'blocker' : 'verify', title: value === 'no' ? missing : value === 'yes' ? title : `Confirmar: ${title}`, detail, sourceIds: sources, financialEffect: 'none' }
}

function ncmCandidate(analysis: ProductAnalysis) {
  const text = `${analysis.product.category} ${analysis.product.name}`.toLowerCase()
  return text.includes('padel') || text.includes('pádel') || text.includes('paddle racket') ? '9506.59.00' : null
}

export function buildRegulatoryChecks(analysis: ProductAnalysis, client: ClientProfile): RegulatoryCheck[] {
  const ncm = ncmCandidate(analysis)
  const checks: RegulatoryCheck[] = [
    clientCheck('arca-profile', client.importerProfile, 'Perfil ARCA Importador/Exportador operativo', 'Falta Perfil ARCA Importador/Exportador', 'El Código Aduanero ya no exige inscripción en un registro, pero ARCA utiliza este perfil operativo para gestionar destinaciones aduaneras.', ['customsCode', 'arcaProfile']),
    clientCheck('biometrics', client.biometrics, 'Datos biométricos registrados', 'Faltan datos biométricos', 'ARCA incluye los datos biométricos y la situación tributaria entre las condiciones para solicitar y sostener el perfil.', ['arcaProfile']),
    clientCheck('sita', client.sitaSicnea, 'SITA / SICNEA disponibles', 'Falta habilitar SITA / SICNEA', 'Los trámites y comunicaciones aduaneras electrónicas utilizan SITA y SICNEA; la documentación del perfil se presenta por SITA.', ['arcaProfile']),
    {
      id: 'tax-status', group: 'client', status: client.taxStatus === 'unknown' ? 'verify' : 'pass',
      title: client.taxStatus === 'unknown' ? 'Definir situación fiscal' : 'Situación fiscal informada',
      detail: client.taxStatus === 'unknown' ? 'Es necesaria para estimar percepciones y qué parte del desembolso puede ser recuperable fiscalmente.' : `Perfil informado: ${client.taxStatus.replaceAll('_', ' ')}.`,
      sourceIds: ['arcaProfile', 'vatPerception', 'gains'], financialEffect: 'both',
    },
    {
      id: 'ncm', group: 'customs', status: 'verify', title: ncm ? `NCM candidato ${ncm}` : 'Determinar posición NCM',
      detail: ncm ? 'Candidato para una raqueta de pádel. Debe validarse contra ficha técnica y Arancel Integrado antes de declarar; ShippingAPP no lo presenta como clasificación definitiva.' : 'No hay todavía una posición candidata con suficiente confianza.',
      sourceIds: ['tariff'], financialEffect: 'both',
    },
    {
      id: 'vuce', group: 'customs', status: 'verify', title: 'Verificar intervenciones VUCE / LPCO',
      detail: 'Consultar por NCM licencias, permisos, certificados, reglamentos técnicos, origen, antidumping y otras intervenciones. Hasta automatizar esta consulta, este paso no puede marcarse OK.',
      sourceIds: ['vuce'], financialEffect: 'both',
    },
    {
      id: 'sedi', group: 'customs', status: 'pass', title: 'SEDI no requerido',
      detail: 'SEDI fue derogado en febrero de 2025. No se incluye como requisito vigente.', sourceIds: ['sedi'], financialEffect: 'none',
    },
    {
      id: 'duty', group: 'tax', status: 'verify', title: 'Derecho de importación: pendiente de arancel vigente',
      detail: 'Debe obtenerse de la NCM validada en el Arancel Integrado. El 25% genérico del prototipo no es una determinación tributaria.', sourceIds: ['tariff'], financialEffect: 'economic_cost',
    },
    {
      id: 'statistics', group: 'tax', status: 'info', title: 'Tasa de estadística: 3% con topes y excepciones',
      detail: 'El 3% está prorrogado hasta el 31/12/2027. Existen topes por base imponible y exenciones, entre ellas determinados acuerdos preferenciales y mercadería originaria del MERCOSUR.', sourceIds: ['statistics'], financialEffect: 'economic_cost',
    },
    {
      id: 'vat', group: 'tax', status: 'info', title: 'IVA de importación',
      detail: 'La importación definitiva está alcanzada por IVA salvo excepción. La tasa general es 21% y la base incorpora el valor aduanero más los tributos de importación aplicables.', sourceIds: ['vat'], financialEffect: 'cash_only',
    },
  ]

  const privateUse = client.entityType === 'individual' && client.purpose === 'own_use'
  checks.push({
    id: 'vat-perception', group: 'tax', status: client.taxStatus === 'unknown' ? 'verify' : 'info',
    title: privateUse ? 'Percepción IVA: revisar excepción por uso particular' : 'Percepción IVA: evaluar 20% y excepciones',
    detail: privateUse ? 'RG 2937 contempla una excepción para uso o consumo particular de una persona humana, sujeto a que el caso encuadre.' : 'Para mercadería alcanzada por la tasa general, RG 2937 prevé 20% en los casos alcanzados. Hay excepciones y tratamientos específicos; para responsables inscriptos puede computarse fiscalmente.',
    sourceIds: ['vatPerception'], financialEffect: 'cash_only',
  })
  checks.push({
    id: 'gains', group: 'tax', status: client.taxStatus === 'unknown' ? 'verify' : 'info',
    title: client.purpose === 'own_use' ? 'Percepción Ganancias: posible 11%' : 'Percepción Ganancias: referencia general 6%',
    detail: client.purpose === 'own_use' ? 'RG 2281 prevé 11% para bienes destinados al uso o consumo particular; deben revisarse exclusiones.' : 'RG 2281 prevé, de corresponder, una percepción general del 6%. Certificados y excepciones pueden modificarla.',
    sourceIds: ['gains'], financialEffect: 'cash_only',
  })
  checks.push({
    id: 'iibb', group: 'tax', status: client.province.trim() ? 'info' : 'verify',
    title: client.province.trim() ? `Ingresos Brutos: revisar ${client.province}` : 'Definir jurisdicción para Ingresos Brutos',
    detail: 'No existe una tasa nacional única de percepción de IIBB: debe resolverse por jurisdicción y padrón aplicable.', sourceIds: [], financialEffect: 'cash_only',
  })

  const fxDetail = client.mipyme === 'yes'
    ? 'Para nuevas importaciones de bienes de MiPyMEs, el BCRA habilitó pago vía MLC desde el despacho en puerto de origen, sujeto al encuadre y documentación bancaria.'
    : client.mipyme === 'no'
      ? 'Para nuevas importaciones de bienes en general, el BCRA habilitó pago vía MLC desde el registro de ingreso aduanero, sujeto al encuadre y documentación bancaria.'
      : 'La condición MiPyME modifica el momento desde el cual puede accederse al MLC para nuevas importaciones de bienes.'
  checks.push({ id: 'fx-timing', group: 'fx', status: client.mipyme === 'unknown' ? 'verify' : 'info', title: client.mipyme === 'unknown' ? 'Confirmar condición MiPyME' : 'Timing de pago al exterior identificado', detail: fxDetail, sourceIds: ['bcra'], financialEffect: 'cash_only' })

  const bank = clientCheck('bank', client.bankComex, 'Canal bancario COMEX definido', 'Falta canal bancario COMEX', 'El acceso al mercado de cambios se cursa por una entidad autorizada que valida la documentación y el encuadre.', ['bcra'])
  bank.group = 'fx'
  checks.push(bank)

  checks.push({
    id: 'labeling', group: 'sale', status: client.purpose === 'resale' ? 'verify' : 'info',
    title: client.purpose === 'resale' ? 'Rotulado / identificación para venta local' : 'Requisitos de venta dependen del destino',
    detail: client.purpose === 'resale' ? 'Para comercializar en Argentina deben revisarse denominación, país de fabricación, calidad/composición cuando corresponda, medidas/contenido e información obligatoria en idioma nacional, además de cualquier reglamento específico.' : 'El checklist de rotulado se activa como requisito de comercialización cuando el destino es reventa.',
    sourceIds: ['labeling'], financialEffect: client.purpose === 'resale' ? 'economic_cost' : 'none',
  })
  return checks
}

export function readinessSummary(checks: RegulatoryCheck[]) {
  const blockers = checks.filter((c) => c.status === 'blocker').length
  const verify = checks.filter((c) => c.status === 'verify').length
  return { blockers, verify, decision: blockers ? 'blocked' : verify ? 'verify' : 'ready' as 'blocked' | 'verify' | 'ready' }
}
