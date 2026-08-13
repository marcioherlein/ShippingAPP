import React from 'react'
import NumberField from './NumberField'
import type { Inputs } from '../lib/types'

type Props = { inputs: Inputs; setInputs: React.Dispatch<React.SetStateAction<Inputs>> }

export default function ImportPanel({ inputs, setInputs }: Props) {
  return <section className="panel warning-panel">
    <div className="section-heading"><span>04</span><div><h2>Tributos de importación</h2><p>Supuestos versionados que alimentan cash y costo económico.</p></div></div>
    <div className="field-grid">
      <NumberField label="Seguro" value={inputs.insurancePct} suffix="%" step={0.1} onChange={(v) => setInputs({ ...inputs, insurancePct: v })} />
      <NumberField label="Derecho importación" value={inputs.dutyRatePct} suffix="% CIF" step={0.1} onChange={(v) => setInputs({ ...inputs, dutyRatePct: v, dutyRateVerified: false })} />
      <NumberField label="Tasa estadística" value={inputs.statisticsRatePct} suffix="%" step={0.1} onChange={(v) => setInputs({ ...inputs, statisticsRatePct: v })} />
      <NumberField label="IVA importación" value={inputs.vatRatePct} suffix="%" step={0.1} onChange={(v) => setInputs({ ...inputs, vatRatePct: v })} />
      <NumberField label="Percepción IVA" value={inputs.vatPerceptionPct} suffix="%" step={0.1} onChange={(v) => setInputs({ ...inputs, vatPerceptionPct: v })} />
      <NumberField label="Percepción Ganancias" value={inputs.gainsPerceptionPct} suffix="%" step={0.1} onChange={(v) => setInputs({ ...inputs, gainsPerceptionPct: v })} />
      <NumberField label="Percepción IIBB" value={inputs.iibbPerceptionPct} suffix="%" step={0.1} onChange={(v) => setInputs({ ...inputs, iibbPerceptionPct: v })} />
    </div>
    <label className="tax-verification"><input type="checkbox" checked={inputs.dutyRateVerified} onChange={(e) => setInputs({ ...inputs, dutyRateVerified: e.target.checked })} /><span>Confirmé el derecho contra NCM + Arancel Integrado vigente</span></label>
    <p className="assumption-note">Para la paleta de pádel se usa 20% como referencia provisional hasta validar la NCM 9506.59.00 en Arancel Integrado. La tasa de estadística aplica 3% con topes legales; IIBB queda en 0 hasta resolver jurisdicción/padrón.</p>
  </section>
}
