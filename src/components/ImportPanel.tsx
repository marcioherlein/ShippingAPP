import React from 'react'
import NumberField from './NumberField'
import type { Inputs } from '../lib/types'

type Props = { inputs: Inputs; setInputs: React.Dispatch<React.SetStateAction<Inputs>> }

export default function ImportPanel({ inputs, setInputs }: Props) {
  return <section className="panel warning-panel">
    <div className="section-heading"><span>04</span><div><h2>Supuestos de importación</h2><p>Valores editables del modelo.</p></div></div>
    <div className="field-grid">
      <NumberField label="Seguro" value={inputs.insurancePct} suffix="%" step={0.1} onChange={(v) => setInputs({ ...inputs, insurancePct: v })} />
      <NumberField label="Cargos de importación" value={inputs.importChargesPct} suffix="% CIF" step={0.1} onChange={(v) => setInputs({ ...inputs, importChargesPct: v })} />
    </div>
    <p className="assumption-note">Supuestos de demo: aún no se determina NCM ni la obligación legal aplicable.</p>
  </section>
}
