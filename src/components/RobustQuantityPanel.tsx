import React, { useMemo, useState } from 'react'
import { ars, pct, usd } from '../lib/format'
import { optimizeRobust, type RobustCandidate } from '../lib/robustOptimizer'
import type { Inputs, ScenarioTaxContext } from '../lib/types'

type Props = {
  inputs: Inputs
  context: ScenarioTaxContext
  marketP25Ars: number | null
}

function modeLabel(mode: 'air' | 'sea') {
  return mode === 'air' ? 'Aéreo' : 'Marítimo LCL'
}

function bestPerQuantity(candidates: RobustCandidate[]) {
  const best = new Map<number, RobustCandidate>()
  for (const candidate of candidates) {
    const current = best.get(candidate.quantity)
    if (!current || (candidate.affordable && !current.affordable) || (candidate.affordable === current.affordable && (candidate.robustScore > current.robustScore || (candidate.robustScore === current.robustScore && candidate.base.cashRequiredUsd < current.base.cashRequiredUsd)))) best.set(candidate.quantity, candidate)
  }
  return [...best.values()].sort((a, b) => a.quantity - b.quantity)
}

export default function RobustQuantityPanel({ inputs, context, marketP25Ars }: Props) {
  const empiricalFloor = marketP25Ars && marketP25Ars > 0 ? Math.min(marketP25Ars, inputs.marketPriceArs) : null
  const [demandDownPct, setDemandDownPct] = useState(30)
  const [priceFloorArs, setPriceFloorArs] = useState(empiricalFloor ?? inputs.marketPriceArs)
  const optimization = useMemo(() => optimizeRobust(inputs, context, { demandDownPct, marketFloorArs: priceFloorArs }), [inputs, context, demandDownPct, priceFloorArs])
  const selected = optimization.robustRecommendation
  const base = optimization.baseRecommendation
  const rows = useMemo(() => bestPerQuantity(optimization.candidates), [optimization.candidates])

  if (!selected || !base) return null
  const stable = !optimization.selectionChanges
  const negativeDownside = selected.worstMarginPct < 0

  return <section className="regulatory-card">
    <div className="reg-card-head">
      <div><span className="eyebrow">Robust quantity optimizer</span><h2>¿La cantidad recomendada sobrevive un escenario adverso?</h2></div>
      <span className={`confidence ${stable ? '' : 'warning'}`}>{stable ? 'Selección estable' : 'Selección cambia'}</span>
    </div>
    <p className="reg-intro">Criterio maximin: para cada cantidad y modo, ShippingAPP toma el peor Economic score entre los escenarios visibles y recomienda la alternativa financiable con el mejor peor resultado. No asigna probabilidades.</p>

    <div className="readiness-grid">
      <label className="readiness-field"><span>Stress de demanda</span><small>Supuesto editable; no es forecast.</small><input type="number" min="0" max="100" step="5" value={demandDownPct} onChange={(e) => setDemandDownPct(Number(e.target.value))} /></label>
      <label className="readiness-field"><span>Piso de precio local</span><small>{empiricalFloor ? `P25 live disponible: ${ars(empiricalFloor)}` : 'P25 live no disponible; editá un piso manual si querés stress de precio.'}</small><input type="number" min="0" step="1000" value={priceFloorArs} onChange={(e) => setPriceFloorArs(Number(e.target.value))} /></label>
    </div>
    {empiricalFloor && priceFloorArs !== empiricalFloor && <button type="button" onClick={() => setPriceFloorArs(empiricalFloor)}>Restaurar P25 live</button>}

    <div className="method-card" style={{ marginTop: 14 }}>
      <b>Escenarios activos</b><p>{optimization.scenarios.map((item) => item.label).join(' · ')}</p>
    </div>

    <div className="recommendation" style={{ marginTop: 14 }}>
      <div className="recommendation-top">
        <div><span className="eyebrow">Cantidad robusta</span><strong>{selected.affordable ? `${selected.quantity} unidades` : 'No hay escenario financiable'}</strong></div>
        <div className="score"><span>Worst-case score</span><b>{selected.robustScore}</b><small>/100</small></div>
      </div>
      <div className="mode">{modeLabel(selected.mode)} · Base: {base.quantity} u. / {modeLabel(base.mode)}{optimization.selectionChanges ? ' · La selección cambia bajo stress' : ' · Misma selección bajo stress'}</div>
      <div className="metric-grid">
        <div><span>Peor margen</span><b>{pct(selected.worstMarginPct)}</b></div>
        <div><span>Peor inventario</span><b>{selected.worstInventoryMonths.toFixed(1)} meses</b></div>
        <div><span>Score base</span><b>{selected.baseScore}/100</b></div>
        <div><span>Caída de score</span><b>{selected.scoreDrop} pts</b></div>
        <div><span>Cash inicial</span><b>{usd(selected.base.cashRequiredUsd)}</b></div>
        <div><span>Piso usado</span><b>{optimization.stress.marketFloorArs ? ars(optimization.stress.marketFloorArs) : 'Sin stress precio'}</b></div>
      </div>
    </div>

    {optimization.selectionChanges && <div className="analysis-banner"><b>Recomendación frágil.</b> El ganador base cambia cuando aplicamos los stresses seleccionados. Tratá la cantidad robusta como punto de partida para cotizar, no como una cantidad “óptima” exacta.</div>}
    {negativeDownside && <div className="analysis-banner"><b>Margen negativo en downside.</b> Incluso la alternativa robusta pierde margen en al menos uno de los escenarios activos.</div>}

    <details className="assumptions" style={{ marginTop: 14 }}><summary>Comparar cantidades bajo stress</summary>
      <div className="table-wrap"><table><thead><tr><th>Cantidad</th><th>Modo</th><th>Base</th><th>Peor score</th><th>Peor margen</th><th>Peor inventario</th><th>Cash</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.quantity}-${row.mode}`}><td>{row.quantity}</td><td>{modeLabel(row.mode)}</td><td>{row.baseScore}</td><td><b>{row.robustScore}</b></td><td>{pct(row.worstMarginPct)}</td><td>{row.worstInventoryMonths.toFixed(1)} m</td><td>{usd(row.base.cashRequiredUsd)}</td></tr>)}</tbody></table></div>
    </details>
    <p className="assumption-note">El P25 proviene de comparables publicados cuando está disponible. El stress de demanda lo define el usuario porque ShippingAPP todavía no observa ventas reales.</p>
  </section>
}
