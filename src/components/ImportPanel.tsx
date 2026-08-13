import React from 'react'
import NumberField from './NumberField'
import type { Inputs } from '../lib/types'

type Props = { inputs: Inputs; setInputs: React.Dispatch<React.SetStateAction<Inputs>> }

export default function ImportPanel({ inputs, setInputs }: Props) {
  return <section className="panel warning-panel">
    <div className="section-heading"><span>04</span><div><h2>Modelo económico transitorio</h2><p>Se reemplazará por tributos calculados por NCM y perfil fiscal.</p></div></div>
    <div className="field-grid">
      <NumberField label="Seguro" value={inputs.insurancePct} suffix="%" step={0.1} onChange={(v) => setInputs({ ...inputs, insurancePct: v })} />
      <NumberField label="Proxy cargos importación" value={inputs.importChargesPct} suffix="% CIF" step={0.1} onChange={(v) => setInputs({ ...inputs, importChargesPct: v })} />
    </div>
    <p className="assumption-note">Este porcentaje NO representa la obligación tributaria vigente. El Regulatory Engine muestra los conceptos reales que deben sustituir este proxy: derecho por NCM, tasa de estadística, IVA, percepciones y tributos jurisdiccionales.</p>
  </section>
}
