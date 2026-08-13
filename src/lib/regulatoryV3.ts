import type { ProductAnalysis } from './productAnalysis'
import { buildRegulatoryChecksV2 } from './regulatoryV2'
import type { ClientProfile, RegulatoryCheck, TriState } from './regulatory'

export type DeclarationRoute = 'self' | 'authorized_declarante' | 'customs_broker' | 'unknown'
export type TechnicalRegulationState = 'unknown' | 'not_applicable_confirmed' | 'applies_ready' | 'applies_pending'

export type ClientProfileV3 = ClientProfile & {
  sitaAccess: TriState
  sicneaAdhesion: TriState
  criminalRecordDocs: TriState
  declarationRoute: DeclarationRoute
  declarantProfile: TriState
  technicalRegulation: TechnicalRegulationState
  tadAccess: TriState
  labelingReady: TriState
}

export const defaultClientProfileV3: ClientProfileV3 = {
  entityType: 'unknown', taxStatus: 'unknown', importerProfile: 'unknown', biometrics: 'unknown',
  sitaSicnea: 'unknown', mipyme: 'unknown', bankComex: 'unknown', purpose: 'resale', paymentTerm: 'unknown', province: '',
  sitaAccess: 'unknown', sicneaAdhesion: 'unknown', criminalRecordDocs: 'unknown',
  declarationRoute: 'unknown', declarantProfile: 'unknown', technicalRegulation: 'unknown', tadAccess: 'unknown', labelingReady: 'unknown',
}

function triStatus(value: TriState, noIsBlocker = false): 'pass' | 'blocker' | 'verify' {
  if (value === 'yes') return 'pass'
  if (value === 'no') return noIsBlocker ? 'blocker' : 'verify'
  return 'verify'
}

export function buildRegulatoryChecksV3(analysis: ProductAnalysis, client: ClientProfileV3): RegulatoryCheck[] {
  const combinedElectronic: TriState = client.sitaAccess === 'yes' && client.sicneaAdhesion === 'yes'
    ? 'yes'
    : client.sitaAccess === 'no' || client.sicneaAdhesion === 'no' ? 'no' : 'unknown'
  const baseClient: ClientProfile = { ...client, sitaSicnea: combinedElectronic }
  const base = buildRegulatoryChecksV2(analysis, baseClient).filter((check) => ![
    'sita', 'criminal-record', 'arca-supporting-docs', 'labeling', 'statistics', 'fx-timing'
  ].includes(check.id))

  const arcaAccepted = client.importerProfile === 'yes'
  const criminalStatus = arcaAccepted ? 'pass' : triStatus(client.criminalRecordDocs, true)
  const criminal: RegulatoryCheck = {
    id: 'criminal-docs', group: 'client', status: criminalStatus,
    title: arcaAccepted ? 'Antecedentes incorporados al Perfil ARCA' : client.criminalRecordDocs === 'no' ? 'Falta documentación de antecedentes para el Perfil' : 'Confirmar documentación de antecedentes penales',
    detail: arcaAccepted
      ? 'ARCA revisa la documentación y demás condiciones antes de emitir la aceptación del Perfil.'
      : 'ARCA requiere el certificado de antecedentes penales vía SITA; para personas jurídicas, la guía vigente indica presentar los certificados de todos los socios.',
    sourceIds: ['arcaProfile'], financialEffect: 'none',
  }

  const sicnea: RegulatoryCheck = {
    id: 'sicnea', group: 'client', status: triStatus(client.sicneaAdhesion, true),
    title: client.sicneaAdhesion === 'yes' ? 'SICNEA adherido y habilitado' : client.sicneaAdhesion === 'no' ? 'Falta adhesión / habilitación SICNEA' : 'Confirmar adhesión y acceso a SICNEA',
    detail: 'SICNEA es el canal de comunicaciones y notificaciones electrónicas aduaneras. La adhesión y habilitación se gestionan en los servicios de ARCA y las notificaciones producen efectos legales.',
    sourceIds: ['sicnea'], financialEffect: 'none',
  }

  const sita: RegulatoryCheck = {
    id: 'sita-access', group: 'client', status: triStatus(client.sitaAccess, false),
    title: client.sitaAccess === 'yes' ? 'Acceso SITA disponible' : 'Confirmar acceso operativo a SITA',
    detail: 'SITA se utiliza para trámites y documentación aduanera complementaria, incluida la presentación de antecedentes vinculada al Perfil. Se mantiene separado de SICNEA porque cumplen funciones distintas.',
    sourceIds: ['arcaProfile'], financialEffect: 'none',
  }

  const routeDefined = client.declarationRoute !== 'unknown'
  const declarationRoute: RegulatoryCheck = {
    id: 'declaration-route', group: 'customs', status: routeDefined ? 'info' : 'verify',
    title: routeDefined ? 'Canal de declaración aduanera definido' : 'Definir quién presentará la destinación',
    detail: client.declarationRoute === 'self'
      ? 'El Código Aduanero permite gestionar el despacho por cuenta propia. Debe verificarse el perfil/habilitación operativa que corresponda para actuar como declarante.'
      : client.declarationRoute === 'authorized_declarante' || client.declarationRoute === 'customs_broker'
        ? 'La destinación será gestionada por una persona autorizada. ARCA prevé el Perfil de Despachante de Aduanas/Declarante para quien actúe como declarante autorizado.'
        : 'Definir si la operación se gestionará directamente o mediante despachante/declarante autorizado antes de oficializar la destinación.',
    sourceIds: ['customsCode', 'arcaProfile'], financialEffect: 'none',
  }

  const needsExternalDeclarant = client.declarationRoute === 'authorized_declarante' || client.declarationRoute === 'customs_broker'
  const declarant: RegulatoryCheck | null = needsExternalDeclarant ? {
    id: 'declarant-profile', group: 'customs', status: triStatus(client.declarantProfile, true),
    title: client.declarantProfile === 'yes' ? 'Declarante / despachante con perfil operativo' : client.declarantProfile === 'no' ? 'Falta declarante habilitado' : 'Confirmar perfil del declarante / despachante',
    detail: 'Cuando actúa una persona autorizada como declarante, ARCA exige su alta en el Perfil de Despachante de Aduanas/Declarante.',
    sourceIds: ['arcaProfile'], financialEffect: 'none',
  } : null

  const stats: RegulatoryCheck = {
    id: 'statistics-v3', group: 'tax', status: 'info', title: 'Tasa de estadística: modelar 3% con topes; preferencias sólo tras validación',
    detail: 'ShippingAPP aplica la tasa general y sus topes hasta que una preferencia/exención por origen o régimen haya sido verificada con la posición, reglas de origen y documentación correspondiente. El país declarado por el proveedor no activa una exención automática.',
    sourceIds: ['statistics', 'vuce'], financialEffect: 'economic_cost',
  }

  let technical: RegulatoryCheck
  if (client.technicalRegulation === 'not_applicable_confirmed') {
    technical = { id: 'technical-regulation', group: 'sale', status: 'pass', title: 'Reglamento técnico: no aplicable confirmado', detail: 'La no aplicabilidad debe provenir de la consulta de la posición/producto y conservarse como evidencia del análisis.', sourceIds: ['vuce', 'technicalRegs'], financialEffect: 'none' }
  } else if (client.technicalRegulation === 'applies_ready') {
    technical = { id: 'technical-regulation', group: 'sale', status: 'pass', title: 'Reglamento técnico aplicable: evidencia de conformidad disponible', detail: 'Para productos alcanzados, el marco general exige la Declaración Jurada de Conformidad y el procedimiento de evaluación que establezca el reglamento específico; cuando corresponda certificación, deben cumplirse además sus requisitos y marcado exigible.', sourceIds: ['technicalRegs'], financialEffect: 'economic_cost' }
  } else if (client.technicalRegulation === 'applies_pending') {
    technical = { id: 'technical-regulation', group: 'sale', status: 'blocker', title: 'No comercializar: conformidad técnica pendiente', detail: 'Si el producto está alcanzado por un Reglamento Técnico, el importador es responsable de su conformidad antes de introducirlo al mercado. Deben completarse la DJC y el procedimiento de evaluación/certificación aplicable.', sourceIds: ['technicalRegs'], financialEffect: 'economic_cost' }
  } else {
    technical = { id: 'technical-regulation', group: 'sale', status: 'verify', title: 'Determinar si aplica un Reglamento Técnico', detail: 'La NCM por sí sola no cierra este punto. Verificar VUCE/CIVUCE y el alcance material del reglamento. Si aplica, activar DJC, evaluación/certificación y marcado según corresponda.', sourceIds: ['vuce', 'technicalRegs'], financialEffect: 'economic_cost' }
  }

  const technicalPending = client.technicalRegulation === 'applies_pending'
  const technicalReady = client.technicalRegulation === 'applies_ready'
  let tadStatus: RegulatoryCheck['status'] = 'info'
  if (technicalPending) tadStatus = triStatus(client.tadAccess, true)
  else if (technicalReady) tadStatus = client.tadAccess === 'yes' ? 'pass' : 'verify'
  const tad: RegulatoryCheck = {
    id: 'tad', group: 'sale', status: tadStatus,
    title: technicalPending
      ? (client.tadAccess === 'yes' ? 'Canal TAD disponible para resolver conformidad' : 'Resolver acceso TAD para el trámite técnico pendiente')
      : technicalReady
        ? (client.tadAccess === 'yes' ? 'Canal TAD disponible' : 'Conformidad informada como lista; confirmar acceso TAD si hubiera gestiones posteriores')
        : 'TAD: activar cuando un trámite de Reglamento Técnico lo requiera',
    detail: 'Los trámites y procedimientos instituidos por el Marco General de Evaluación de la Conformidad se realizan mediante TAD, o el sistema que lo reemplace. La falta de acceso sólo se trata como blocker cuando existe un trámite técnico pendiente que debe resolverse.',
    sourceIds: ['technicalRegs'], financialEffect: 'none',
  }

  let labeling: RegulatoryCheck
  if (client.purpose !== 'resale') {
    labeling = { id: 'labeling-v3', group: 'sale', status: 'info', title: 'Rotulado comercial: revisar si cambia el destino', detail: 'El bloque de comercialización se vuelve crítico si la mercadería se destina a reventa.', sourceIds: ['labeling'], financialEffect: 'none' }
  } else {
    labeling = {
      id: 'labeling-v3', group: 'sale', status: triStatus(client.labelingReady, true),
      title: client.labelingReady === 'yes' ? 'Rotulado comercial preparado' : client.labelingReady === 'no' ? 'No comercializar: rotulado pendiente' : 'Confirmar rotulado para comercialización',
      detail: 'Antes de comercializar, revisar la identificación exigida por Lealtad Comercial: denominación, país de fabricación, calidad/composición cuando corresponda, medidas o contenido e información obligatoria en idioma nacional, además del marcado específico que pudiera exigir un Reglamento Técnico.',
      sourceIds: ['labeling', 'technicalRegs'], financialEffect: 'economic_cost',
    }
  }

  const fx: RegulatoryCheck = {
    id: 'fx-v3', group: 'fx', status: 'verify', title: 'Validar pago exterior con banco contra normativa BCRA vigente',
    detail: 'El momento y condiciones de acceso al mercado de cambios dependen del tipo de pago, condición de la importación, documentación, NCM y normativa vigente. La condición MiPyME puede modificar el encuadre, pero ShippingAPP no presume una fecha automática de pago; la entidad interviniente debe validarla.',
    sourceIds: ['bcra'], financialEffect: 'cash_only',
  }

  const additions = [criminal, sicnea, sita, declarationRoute, ...(declarant ? [declarant] : []), stats, technical, tad, labeling, fx]
  const insertAfterClient = base.findIndex((check) => check.group !== 'client')
  if (insertAfterClient < 0) return [...base, ...additions]
  return [...base.slice(0, insertAfterClient), criminal, sicnea, sita, ...base.slice(insertAfterClient), declarationRoute, ...(declarant ? [declarant] : []), stats, technical, tad, labeling, fx]
}
