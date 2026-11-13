import React, { useState } from 'react'
import type { PurchasePlan, PurchaseScenario } from '../lib/purchasePlan'
import { usd } from '../lib/format'
import UiIcon, { type UiIconName } from './UiIcon'
import QuoteCostBreakdown from './QuoteCostBreakdown'
import '../styles/purchase-decisions.css'

export const transportLabels = { lcl: 'Marítimo LCL', air: 'Aéreo', courier: 'Courier comercial' }
const transportIcons: Record<keyof typeof transportLabels, UiIconName> = { lcl: 'ship', air: 'plane', courier: 'product' }
export const minimumScenario = (plan: PurchasePlan) => 'minimum' in plan ? plan.minimum ?? null : plan.single

function comparedScenarios(plan: PurchasePlan) {
  const scenarios = [minimumScenario(plan), ...(plan.alternatives || []), plan.selected, plan.improvement]
  return scenarios.filter((item): item is PurchaseScenario => Boolean(item))
    .filter((item, index, items) => items.findIndex(other => other.quantity === item.quantity) === index)
    .sort((a, b) => a.quantity - b.quantity)
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return <td role="cell"><span className="purchase-cell-label" aria-hidden="true">{label}</span><span>{children}</span></td>
}

export function PurchaseOptimization({ plan, onChoose, minimumConfirmed = true }: { plan: PurchasePlan; onChoose?: (quantity: number) => void; minimumConfirmed?: boolean }) {
  const [objective, setObjective] = useState<'quantity' | 'unitCost'>('quantity')
  const scenarios = comparedScenarios(plan)
  const minimum = minimumScenario(plan)
  const selected = plan.selected
  const feasible = scenarios.filter(scenario => scenario.withinBudget !== false)
  const best = objective === 'quantity'
    ? feasible.at(-1)
    : feasible.reduce<PurchaseScenario | undefined>((lowest, scenario) => {
        return !lowest || scenario.cost.unitCostUsd < lowest.cost.unitCostUsd ? scenario : lowest
      }, undefined)
  const saving = best && selected ? selected.cost.unitCostUsd - best.cost.unitCostUsd : 0
  return <section className="purchase-optimization" aria-labelledby="purchase-optimization-title">
    <div className="purchase-section-heading"><h3 id="purchase-optimization-title">Tabla de optimización de tu compra</h3><p>Todos los importes incluyen mercadería, transporte, impuestos y gastos modelados. Un costo por unidad menor puede exigir una inversión mayor.</p></div>
    {feasible.length > 1 && <div className="calculator-optimizer-controls">
      <div role="group" aria-label="Objetivo de la comparación">
        <button type="button" aria-pressed={objective === 'quantity'} onClick={() => setObjective('quantity')}>Más unidades</button>
        <button type="button" aria-pressed={objective === 'unitCost'} onClick={() => setObjective('unitCost')}>Menor costo por unidad</button>
      </div>
      {best && <p aria-live="polite">
        {objective === 'quantity' ? 'Mayor cantidad evaluada' : 'Menor costo unitario evaluado'} · <strong>{best.quantity.toLocaleString('es-AR')} u. a {usd(best.cost.unitCostUsd)} por unidad</strong>. Total {usd(best.cost.totalCostUsd)}.
        {saving > 0.005 && ` Ahorrás ${usd(saving)} por unidad frente a tu elección.`}
      </p>}
    </div>}
    {scenarios.length ? <table className="purchase-options-table" role="table" aria-labelledby="purchase-optimization-title">
      <thead role="rowgroup"><tr role="row"><th scope="col">Cantidad</th><th scope="col">Modalidad</th><th scope="col">Flete incluido · USD</th><th scope="col">Inversión total · USD</th><th scope="col">Costo puesto · USD/u.</th><th scope="col">Ahorro por unidad vs. mínimo</th><th scope="col">Tu elección</th></tr></thead>
      <tbody role="rowgroup">{scenarios.map(scenario => {
        const selected = plan.selected?.quantity === scenario.quantity
        const isMinimum = minimum?.quantity === scenario.quantity
        const saving = minimum ? minimum.cost.unitCostUsd - scenario.cost.unitCostUsd : null
        const pct = saving !== null && minimum && minimum.cost.unitCostUsd > 0 ? saving / minimum.cost.unitCostUsd * 100 : null
        return <tr key={scenario.quantity} role="row" className={selected ? 'is-current' : undefined}>
          <th role="rowheader" scope="row"><strong>{scenario.quantity.toLocaleString('es-AR')} u.</strong>{isMinimum && <small>{minimumConfirmed ? 'Mínimo de compra' : 'Mínimo modelado · MOQ pendiente'}</small>}</th>
          <Cell label="Modalidad">{transportLabels[scenario.mode]}</Cell>
          <Cell label="Flete incluido · USD">{usd(scenario.cost.freightCostUsd)}</Cell>
          <Cell label="Inversión total · USD"><strong>{usd(scenario.cost.totalCostUsd)}</strong></Cell>
          <Cell label="Costo puesto · USD/u."><strong>{usd(scenario.cost.unitCostUsd)}</strong></Cell>
          <Cell label="Ahorro por unidad vs. mínimo">{saving === null ? 'Sin base comparable' : Math.abs(saving) < 0.005 ? 'Base de comparación' : saving > 0 ? <><strong>{usd(saving)} menos</strong><small>{pct!.toLocaleString('es-AR', { maximumFractionDigits: 1 })}% menos por unidad</small></> : <><strong>{usd(Math.abs(saving))} más</strong><small>Mayor costo por unidad</small></>}</Cell>
          <Cell label="Tu elección">{selected ? <span className="purchase-current-badge">Cantidad elegida</span> : scenario.withinBudget === false ? <span className="purchase-budget-warning">Supera tu presupuesto</span> : onChoose ? <button type="button" className="pipeline-secondary" onClick={() => onChoose(scenario.quantity)}>Elegir {scenario.quantity} unidades</button> : 'Escenario comparado'}</Cell>
        </tr>
      })}</tbody>
    </table> : <p>No hay cantidades con precio y transporte confirmados para comparar. Revisá el mínimo y los tramos de la oferta.</p>}
    {scenarios.length === 1 && <p className="purchase-section-note">Por ahora hay una sola cantidad calculable. Para ampliar la comparación, confirmá más tramos de precio y sus cantidades con el proveedor.</p>}
    <p className="purchase-section-note">Las cantidades comparadas usan los tramos de precio confirmados.</p>
  </section>
}

export function PurchaseTransportComparison({ plan }: { plan: PurchasePlan }) {
  const options = plan.transportOptions
  return <section className="purchase-transport" aria-labelledby="purchase-transport-title">
    <div className="purchase-section-heading"><h3 id="purchase-transport-title">Compará los medios de envío</h3></div>
    {plan.selected && options?.[0] && <p className="purchase-cargo-summary">{plan.selected.quantity.toLocaleString('es-AR')} unidades <span aria-hidden="true">·</span> {options[0].cost.totalVolumeCbm.toLocaleString('es-AR', { maximumFractionDigits: 3 })} m³ <span aria-hidden="true">·</span> {options[0].cost.totalWeightKg.toLocaleString('es-AR', { maximumFractionDigits: 2 })} kg de peso real</p>}
    {options?.length ? <div className="purchase-transport-grid">{options.map(option => {
      const available = option.cost.available && option.eligibility !== 'unavailable'
      const chosen = plan.selected?.mode === option.mode
      const quantity = plan.selected?.quantity ?? 0
      const baseLimit = option.limitations.find(limit => limit !== option.cost.reason)
      const otherLimits = option.limitations.filter(limit => limit !== baseLimit && limit !== option.cost.reason)
      const mentionsBatteries = option.limitations.some(limit => /\bbater[ií]as?\b/i.test(limit))
      const label = !available ? 'Sin tarifa calculable' : option.eligibility === 'requires_quote' ? 'Requiere cotización y aceptación' : 'Estimación disponible'
      return <article key={option.mode} className={`purchase-transport-card${chosen ? ' is-current' : ''}`} aria-label={transportLabels[option.mode]}>
        <div className="purchase-transport-heading"><h4><span className="calculator-transport-icon" data-mode={option.mode}><UiIcon name={transportIcons[option.mode]} size={17} /></span>{transportLabels[option.mode]}</h4>{chosen && <span className="purchase-current-badge">Usada en este cálculo</span>}</div>
        <p className={`purchase-transport-status${option.eligibility === 'requires_quote' || !available ? ' needs-review' : ''}`}>{label}</p>
        {mentionsBatteries && <p className="purchase-cargo-warning">La carga menciona baterías: confirmá aceptación y recargos con el transportista.</p>}
        {available ? <>
          <strong className="purchase-transport-price">{usd(option.cost.unitCostUsd)}<small> USD / unidad</small></strong>
          <dl className="purchase-transport-facts">
            <div><dt>Desembolso total</dt><dd>{usd(option.cost.totalCostUsd)}</dd></div>
            <div><dt>Flete internacional</dt><dd>{usd(option.cost.freightCostUsd)}</dd></div>
          </dl>
          {option.eligibility === 'requires_quote' && <p className="purchase-conditional-price">Tarifa estándar de referencia: falta confirmar aceptación y recargos de esta carga.</p>}
        </> : <p className="purchase-unavailable-reason">{option.cost.reason || 'Pedí una cotización al operador para esta carga.'}</p>}
        <div className="purchase-transit"><span>Plazo estimado de transporte</span><strong>{option.transit ? `${option.transit.minDays}–${option.transit.maxDays} días ${option.transit.basis === 'business' ? 'hábiles' : 'corridos'}` : 'A confirmar con el operador'}</strong></div>
        <details className="purchase-transport-details"><summary>Ver límites y fuentes</summary>{baseLimit && <p className="purchase-transport-source">{baseLimit}</p>}{available && <p className="purchase-transport-source">{option.mode === 'lcl' ? 'Medida facturable' : 'Peso facturable'}: {option.cost.chargeableUnits.toLocaleString('es-AR')} {option.mode === 'lcl' ? 'W/M' : 'kg'}.</p>}
          {otherLimits.length > 0 && <ul>{otherLimits.map(limit => <li key={limit}>{limit}</li>)}</ul>}
          {available && <p className="purchase-transport-source">Fuente del costo: {option.cost.source}</p>}
          {option.transit && <><p className="purchase-transport-source">Plazo: {option.transit.source}.</p><p className="purchase-transport-source">Alcance: {option.transit.scope}</p></>}
        </details>
        {available && quantity > 0 && <details className="calculator-route-breakdown">
          <summary>Ver desglose<span className="calculator-sr-only"> de {transportLabels[option.mode]}</span></summary>
          <QuoteCostBreakdown cost={option.cost} quantity={quantity} />
        </details>}
      </article>
    })}</div> : <div className="purchase-legacy-comparison" role="status"><p>Este presupuesto guardado no incluye el detalle por modalidad. Recalculá con los datos y las tarifas actuales para comparar courier, LCL y aéreo.</p></div>}
    <p className="purchase-section-note">Los tiempos son referencias de planificación, no fechas de entrega ni servicios reservados. No incluyen fabricación, preparación del proveedor, trámites aduaneros ni entrega local. Confirmá ruta, salidas y aceptación del producto con el operador.</p>
  </section>
}
