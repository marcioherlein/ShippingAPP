import React from 'react'
import NumberField from './NumberField'
import type { Inputs } from '../lib/types'

type Props = { inputs: Inputs; setInputs: React.Dispatch<React.SetStateAction<Inputs>> }

export default function LogisticsPanel({ inputs, setInputs }: Props) {
  return (
    <section className="panel">
      <div className="section-heading"><span>03</span><div><h2>Logística</h2><p>Comparación aérea y marítima.</p></div></div>
      <div className="field-grid">
        <NumberField label="Aéreo" value={inputs.airUsdKg} prefix="USD" suffix="/kg" step={0.1} onChange={(v) => setInputs({ ...inputs, airUsdKg: v })} />
        <NumberField label="Mínimo aéreo" value={inputs.airMinimumUsd} prefix="USD" onChange={(v) => setInputs({ ...inputs, airMinimumUsd: v })} />
        <NumberField label="Marítimo LCL" value={inputs.seaUsdCbm} prefix="USD" suffix="/m³" onChange={(v) => setInputs({ ...inputs, seaUsdCbm: v })} />
        <NumberField label="Mínimo marítimo" value={inputs.seaMinimumUsd} prefix="USD" onChange={(v) => setInputs({ ...inputs, seaMinimumUsd: v })} />
        <NumberField label="Costos fijos logísticos" value={inputs.fixedFeesUsd} prefix="USD" onChange={(v) => setInputs({ ...inputs, fixedFeesUsd: v })} />
      </div>
    </section>
  )
}
