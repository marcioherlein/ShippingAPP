import React from 'react'
import NumberField from './NumberField'
import type { Inputs } from '../lib/types'

type Props = {
  inputs: Inputs
  setInputs: React.Dispatch<React.SetStateAction<Inputs>>
}

export default function MarketPanel({ inputs, setInputs }: Props) {
  return (
    <section className="panel">
      <div className="section-heading">
        <span>02</span>
        <div><h2>Mercado y capital</h2><p>Supuestos para medir atractivo económico.</p></div>
      </div>
      <div className="field-grid">
        <NumberField label="Precio de venta local" value={inputs.marketPriceArs} prefix="$" suffix="ARS" onChange={(value) => setInputs({ ...inputs, marketPriceArs: value })} />
        <NumberField label="Tipo de cambio" value={inputs.usdArs} prefix="$" suffix="ARS/USD" onChange={(value) => setInputs({ ...inputs, usdArs: value })} />
        <NumberField label="Demanda mensual estimada" value={inputs.monthlyDemand} suffix="unid." onChange={(value) => setInputs({ ...inputs, monthlyDemand: value })} />
        <NumberField label="Capital disponible" value={inputs.capitalAvailableUsd} prefix="USD" onChange={(value) => setInputs({ ...inputs, capitalAvailableUsd: value })} />
      </div>
    </section>
  )
}
