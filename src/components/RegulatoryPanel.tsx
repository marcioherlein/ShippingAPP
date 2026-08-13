import React from 'react'
import { legalSources } from '../lib/regulatorySources'
import { readinessSummary, type RegulatoryCheck } from '../lib/regulatory'
import type { ClientProfileV3 } from '../lib/regulatoryV3'

type Props = { checks: RegulatoryCheck[]; client: ClientProfileV3 }

const groupLabels: Record<RegulatoryCheck['group'], string> = {
  client: '01 · Importador', customs: '02 · Aduana y producto', tax: '03 · Impuestos y cash', fx: '04 · Pago exterior', sale: '05 · Comercialización local',
}
const statusLabels = { pass: 'OK', blocker: 'BLOQUEA', verify: 'VERIFICAR', info: 'INFO' }

const baseDocuments = [
  ['Antes de comprar', 'Factura proforma / comercial', 'Producto, precio, moneda, cantidades, Incoterm y partes.'],
  ['Antes de comprar', 'Ficha técnica', 'Materiales, función, modelo y especificaciones suficientes para sostener NCM y revisar reglamentos técnicos.'],
  ['Antes del embarque', 'Packing list', 'Bultos, unidades, pesos neto/bruto y dimensiones.'],
  ['Antes del embarque', 'Origen / prueba de origen', 'Condicional. Sólo usar preferencias después de validar posición, reglas de origen y documentación.'],
  ['Antes del embarque', 'LPCO / permisos / intervenciones VUCE', 'Condicional según NCM, producto y organismo. Resolver en el momento exigido por la intervención aplicable.'],
  ['Aduana', 'Documento de transporte', 'Bill of Lading, Air Waybill u otro según la vía.'],
  ['Aduana', 'Destinación aduanera', 'Declaración en SIM con NCM, valor, origen, tributos e intervenciones.'],
  ['Pago', 'Documentación bancaria COMEX', 'Factura, transporte y respaldo que la entidad interviniente requiera para validar el pago exterior.'],
  ['Antes de vender', 'Rotulado / identificación', 'Requisitos de Lealtad Comercial y cualquier marcado específico del Reglamento Técnico aplicable.'],
] as const

export default function RegulatoryPanel({ checks, client }: Props) {
  const summary = readinessSummary(checks)
  const decisionTitle = summary.decision === 'blocked' ? 'Hay bloqueos de ejecución o comercialización' : summary.decision === 'verify' ? 'La oportunidad requiere validaciones antes de ejecutar' : 'Readiness operativo alto'
  const technicalApplies = client.technicalRegulation === 'applies_ready' || client.technicalRegulation === 'applies_pending'
  const externalDeclarant = client.declarationRoute === 'authorized_declarante' || client.declarationRoute === 'customs_broker'
  const documents = [
    ...baseDocuments,
    ...(externalDeclarant ? [['Aduana', 'Autorización / vínculo con declarante', 'Confirmar el mecanismo operativo de autorización y el perfil del despachante/declarante en ARCA.'] as const] : []),
    ...(technicalApplies ? [['Antes de vender', 'DJC + evidencia de conformidad', 'Completar la Declaración Jurada de Conformidad y evaluación/certificación/marcado que exija el reglamento específico.'] as const] : []),
  ]

  return <section className="regulatory-section">
    <div className={`readiness-summary ${summary.decision}`}>
      <div><span className="eyebrow">Can I execute this opportunity?</span><h2>{decisionTitle}</h2><p>ShippingAPP separa oportunidad económica, capacidad de importar y readiness para comercializar. Leé cada blocker por etapa: no todos implican una prohibición de ingreso aduanero.</p></div>
      <div className="readiness-counts"><div><b>{summary.blockers}</b><span>Bloquean</span></div><div><b>{summary.verify}</b><span>Verificar</span></div></div>
    </div>

    <section className="regulatory-card">
      <div className="reg-card-head"><div><span className="eyebrow">Regulatory engine</span><h2>Requisitos detectados</h2></div><span className="law-date">Fuentes revisadas · 13 Ago 2026</span></div>
      <p className="reg-intro">Screening normativo trazable, no dictamen aduanero. NCM candidato, preferencia de origen, intervención VUCE o no aplicabilidad de un Reglamento Técnico permanecen en VERIFICAR hasta contar con evidencia suficiente.</p>
      <div className="requirement-groups">
        {(Object.keys(groupLabels) as RegulatoryCheck['group'][]).map((group) => <div className="requirement-group" key={group}>
          <h3>{groupLabels[group]}</h3>
          {checks.filter((c) => c.group === group).map((check) => <article className={`requirement ${check.status}`} key={check.id}>
            <span className="status-chip">{statusLabels[check.status]}</span>
            <div><b>{check.title}</b><p>{check.detail}</p>
              {check.sourceIds.length > 0 && <div className="source-links">{check.sourceIds.map((id) => {
                const source = legalSources[id]
                return source ? <a href={source.url} target="_blank" rel="noreferrer" key={id}>{source.label} ↗</a> : null
              })}</div>}
            </div>
            {check.financialEffect !== 'none' && <small className="effect-tag">{check.financialEffect === 'cash_only' ? 'Cash' : check.financialEffect === 'economic_cost' ? 'Costo' : 'Cash + costo'}</small>}
          </article>)}
        </div>)}
      </div>
    </section>

    <section className="regulatory-card docs-card">
      <div className="reg-card-head"><div><span className="eyebrow">Execution checklist</span><h2>Documentos y pasos de la operación</h2></div></div>
      <div className="docs-list">{documents.map(([stage, title, detail]) => <div className="doc-row" key={`${stage}-${title}`}><span>{stage}</span><div><b>{title}</b><p>{detail}</p></div><i>○</i></div>)}</div>
      {client.purpose !== 'resale' && <p className="docs-note">El bloque “Antes de vender” es condicional porque marcaste un destino distinto de reventa.</p>}
    </section>

    <div className="cash-vs-cost"><b>Cash requerido ≠ costo económico</b><p>El motor ya separa derechos/tasas no recuperables del IVA y percepciones que pueden constituir créditos o pagos a cuenta según el perfil fiscal. Los importes siguen siendo screening hasta confirmar NCM, alícuotas, jurisdicción de IIBB y situación fiscal real.</p></div>
  </section>
}
