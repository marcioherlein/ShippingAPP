import React from 'react'
import NumberField from './NumberField'
import FreightRateUpload from './FreightRateUpload'
import type { Inputs } from '../lib/types'

type Props = { inputs: Inputs; setInputs: React.Dispatch<React.SetStateAction<Inputs>> }

export default function LogisticsPanel({ inputs, setInputs }: Props) {
  return (
    <section className="panel">
      <div className="section-heading"><span>03</span><div><h2>Logística</h2><p>Tarifas de screening con peso cobrable y W/M.</p></div></div>
      <FreightRateUpload inputs={inputs} setInputs={setInputs} />
      <div className="field-grid" style={{ marginTop: 14 }}>
        <NumberField label="Aéreo" value={inputs.airUsdKg} prefix="USD" suffix="/kg cobrable" step={0.1} onChange={(v) => setInputs({ ...inputs, airUsdKg: v })} />
        <NumberField label="Mínimo aéreo" value={inputs.airMinimumUsd} prefix="USD" onChange={(v) => setInputs({ ...inputs, airMinimumUsd: v })} />
        <NumberField label="Marítimo LCL" value={inputs.seaUsdCbm} prefix="USD" suffix="/W/M" onChange={(v) => setInputs({ ...inputs, seaUsdCbm: v })} />
        <NumberField label="Mínimo marítimo" value={inputs.seaMinimumUsd} prefix="USD" onChange={(v) => setInputs({ ...inputs, seaMinimumUsd: v })} />
        <NumberField label="Costos fijos logísticos manuales" value={inputs.fixedFeesUsd} prefix="USD" onChange={(v) => setInputs({ ...inputs, fixedFeesUsd: v })} />
      </div>
      <p className="assumption-note">Aéreo: se cobra el mayor entre peso real y volumétrico. LCL: se modela W/M como el mayor entre CBM y toneladas métricas. Una rate sheet importada reemplaza sólo rate + mínimo; sus cargos fijos quedan pendientes de mapeo para evitar doble conteo.</p>
    </section>
  )
}
