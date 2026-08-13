import React from 'react'
import { legalSources } from '../lib/regulatorySources'
import { readinessSummary, type ClientProfile, type RegulatoryCheck } from '../lib/regulatory'

type Props = { checks: RegulatoryCheck[]; client: ClientProfile }

const groupLabels: Record<RegulatoryCheck['group'], string> = {
  client: '01 · Importador', customs: '02 · Aduana y producto', tax: '03 · Impuestos y cash', fx: '04 · Pago exterior', sale: '05 · Venta local',
}
const statusLabels = { pass: 'OK', blocker: 'BLOQUEA', verify: 'VERIFICAR', info: 'INFO' }

const documents = [
  ['Antes de comprar', 'Factura proforma / comercial', 'Producto, precio, moneda, cantidades, Incoterm y partes.'],
  ['Antes de comprar', 'Ficha técnica', 'Materiales, función, modelo y especificaciones suficientes para sostener NCM.'],
  ['Antes del embarque', 'Packing list', 'Bultos, unidades, pesos neto/bruto y dimensiones.'],
  ['Antes del embarque', 'Origen / certificados', 'Condicional según preferencia arancelaria, NCM e intervención VUCE.'],
  ['Antes del embarque', 'LPCO / permisos VUCE', 'Condicional. Deben estar resueltos antes del embarque cuando correspondan.'],
  ['Aduana', 'Documento de transporte', 'Bill of Lading, Air Waybill u otro según la vía.'],
  ['Aduana', 'Destinación aduanera', 'Declaración en SIM con NCM, valor, origen, tributos e intervenciones.'],
  ['Pago', 'Documentación bancaria COMEX', 'Factura, transporte y respaldo exigido por la entidad para el pago exterior.'],
  ['Antes de vender', 'Rotulado / identificación', 'Requisitos generales y reglamentos específicos que resulten aplicables.'],
] as const

export default function RegulatoryPanel({ checks, client }: Props) {
  const summary = readinessSummary(checks)
  const decisionTitle = summary.decision === 'blocked' ? 'Hay bloqueadores del importador' : summary.decision === 'verify' ? 'Operación posible, pero requiere validaciones' : 'Readiness operativo alto'

  return <section className="regulatory-section">
    <div className={`readiness-summary ${summary.decision}`}>
      <div><span className="eyebrow">Can I actually import this?</span><h2>{decisionTitle}</h2><p>ShippingAPP separa oportunidad económica de capacidad real de ejecutar la importación.</p></div>
      <div className="readiness-counts"><div><b>{summary.blockers}</b><span>Bloquean</span></div><div><b>{summary.verify}</b><span>Verificar</span></div></div>
    </div>

    <section className="regulatory-card">
      <div className="reg-card-head"><div><span className="eyebrow">Regulatory engine</span><h2>Requisitos detectados</h2></div><span className="law-date">Legislación revisada · 13 Ago 2026</span></div>
      <p className="reg-intro">Esto es un screening normativo trazable. Una clasificación NCM estimada o una consulta pendiente de VUCE nunca se presenta como cumplimiento confirmado.</p>
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

    <div className="cash-vs-cost"><b>Próxima mejora del motor financiero</b><p>Derechos y tasas deben alimentar el <strong>costo económico</strong>; IVA y percepciones deben modelarse también como <strong>cash requerido</strong> y, cuando corresponda, como créditos/anticipos fiscales recuperables. El actual “25% CIF” queda marcado como transitorio hasta reemplazarlo por este desglose.</p></div>
  </section>
}
