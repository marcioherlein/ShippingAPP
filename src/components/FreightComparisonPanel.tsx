import React, { useMemo } from 'react'
import type { Inputs } from '../lib/types'
import type { ClientProfileV3 } from '../lib/regulatoryV3'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import { compareLandedCost, type SensitiveProductCategory } from '../lib/landedCostEngine'
import { usd } from '../lib/format'

type Props = {
  analysis: ProductAnalysisV2
  inputs: Inputs
  client: ClientProfileV3
}

function firstUnitPrice(inputs: Inputs) {
  const first = inputs.priceTiers.slice().sort((a, b) => a.minQuantity - b.minQuantity)[0]
  return first?.unitPriceUsd || 0
}

function firstQuantity(inputs: Inputs) {
  const firstTier = inputs.priceTiers.slice().sort((a, b) => a.minQuantity - b.minQuantity)[0]?.minQuantity
  return inputs.quantities[0] || firstTier || 1
}

function importerSignature(client: ClientProfileV3) {
  const extended = client as ClientProfileV3 & { hasImporterSignature?: 'yes' | 'no' | 'unknown' }
  const state = extended.hasImporterSignature || client.importerProfile
  if (state === 'yes') return true
  if (state === 'no') return false
  return null
}

function sensitiveCategory(client: ClientProfileV3): SensitiveProductCategory {
  const extended = client as ClientProfileV3 & { sensitiveCategory?: SensitiveProductCategory }
  return extended.sensitiveCategory || 'unknown'
}

const modeLabels = { fcl: 'FCL referencia', lcl: 'LCL', air: 'Aéreo' } as const

export default function FreightComparisonPanel({ analysis, inputs, client }: Props) {
  const comparison = useMemo(() => compareLandedCost({
    originCountry: analysis.product.originCountry || 'China',
    quantity: firstQuantity(inputs),
    unitPriceUsd: firstUnitPrice(inputs),
    unitWeightKg: inputs.weightKg,
    unitVolumeCbm: inputs.volumeCbm,
    dutyRatePct: inputs.dutyRatePct,
    statisticsRatePct: inputs.statisticsRatePct,
    vatRatePct: inputs.vatRatePct,
    vatAdditionalRatePct: inputs.vatPerceptionPct,
    gainsRatePct: inputs.gainsPerceptionPct,
    iibbRatePct: inputs.iibbPerceptionPct,
    purpose: client.purpose,
    entityType: client.entityType,
    hasImporterSignature: importerSignature(client),
    sensitiveCategory: sensitiveCategory(client),
  }), [analysis, inputs, client])

  const lcl = comparison.modes.lcl
  const air = comparison.modes.air
  const fcl = comparison.modes.fcl

  return <section className="table-card">
    <div className="table-title">
      <div><span className="eyebrow">Motor de fletes y costo final</span><h2>LCL vs Aéreo, con FCL como referencia</h2></div>
      <small>{comparison.origin ? `${comparison.origin.country} · ${comparison.origin.region}` : 'Origen no encontrado'}</small>
    </div>

    <div className="table-scroll">
      <table>
        <thead><tr><th>Modo</th><th>Flete</th><th>CIF</th><th>Impuestos</th><th>Gastos fijos</th><th>Total</th><th>Unitario</th></tr></thead>
        <tbody>
          {([fcl, lcl, air] as const).map((mode) => {
            const taxes = mode.dutyUsd + mode.statisticsUsd + mode.vatUsd + mode.vatAdditionalUsd + mode.gainsUsd + mode.iibbUsd
            const extras = mode.fixedDestinationUsd + mode.noImporterSignatureUsd + mode.sensitiveCategoryUsd
            const selected = comparison.bestMode === mode.mode
            return <tr key={mode.mode} className={selected ? 'selected-row' : undefined}>
              <td><b>{modeLabels[mode.mode]}</b>{selected && <em>menor costo</em>}</td>
              <td>{usd(mode.freightCostUsd)}<br /><small>{mode.chargeableUnits} {mode.chargeableBasis === 'container' ? 'cont.' : mode.mode === 'air' ? 'kg cobrables' : 'WM'}</small></td>
              <td>{usd(mode.cifUsd)}</td>
              <td>{usd(taxes)}</td>
              <td>{usd(extras)}</td>
              <td><b>{usd(mode.totalCostUsd)}</b></td>
              <td><b>{usd(mode.unitCostUsd)}</b></td>
            </tr>
          })}
        </tbody>
      </table>
    </div>

    <div className="analysis-banner" style={{ marginTop: 16 }}>
      <b>Comparación principal:</b> {comparison.lclVsAir.cheaperMode === 'lcl'
        ? `LCL es más barato que aéreo por ${usd(comparison.lclVsAir.savingsUsd || 0)} (${comparison.lclVsAir.savingsPct}%).`
        : comparison.lclVsAir.cheaperMode === 'air'
          ? `Aéreo es más barato que LCL por ${usd(comparison.lclVsAir.savingsUsd || 0)} (${comparison.lclVsAir.savingsPct}%).`
          : 'LCL y aéreo empatan con los datos actuales.'} FCL queda sólo como referencia porque implica contenedor entero.
    </div>

    <details className="tax-breakdown" style={{ color: '#344057', borderTop: '1px solid #e7ebf2' }}>
      <summary>Ver fórmula aplicada</summary>
      <p className="assumption-note">FOB = precio mercadería × cantidad. CIF = FOB + flete internacional. Derecho de importación y tasa estadística se calculan sobre CIF. Base IVA = CIF + derecho + tasa. IVA, IVA adicional, ganancias e IIBB se calculan sobre Base IVA. Luego se suman gastos fijos y extras por firma/categoría sensible.</p>
      {comparison.checklist.blockers.length > 0 && <ul className="tax-assumptions">{comparison.checklist.blockers.map((item) => <li key={item}>{item}</li>)}</ul>}
    </details>
  </section>
}
