import React from 'react'
import NumberField from './NumberField'
import type { Inputs } from '../lib/types'

type Props = {
  inputs: Inputs
  setInputs: React.Dispatch<React.SetStateAction<Inputs>>
}

export default function ProductPanel({ inputs, setInputs }: Props) {
  const updateTier = (index: number, field: 'minQuantity' | 'unitPriceUsd', value: number) => {
    const next = inputs.priceTiers.map((tier, i) => i === index ? { ...tier, [field]: value } : tier)
    setInputs({ ...inputs, priceTiers: next })
  }

  const quantityText = inputs.quantities.join(', ')

  return (
    <section className="panel">
      <div className="section-heading">
        <span>01</span>
        <div><h2>Producto</h2><p>Datos del proveedor y del bulto.</p></div>
      </div>

      <label className="field field-wide">
        <span>Cantidades a comparar</span>
        <input
          type="text"
          value={quantityText}
          onChange={(event) => {
            const values = event.target.value.split(',').map(Number).filter((n) => n > 0)
            setInputs({ ...inputs, quantities: values })
          }}
        />
      </label>

      <div className="tier-list">
        <div className="tier-header"><span>Desde unidades</span><span>Precio por unidad</span></div>
        {inputs.priceTiers.map((tier, index) => (
          <div className="tier-row" key={index}>
            <input type="number" min="1" value={tier.minQuantity} onChange={(e) => updateTier(index, 'minQuantity', Number(e.target.value))} />
            <input type="number" min="0" step="0.1" value={tier.unitPriceUsd} onChange={(e) => updateTier(index, 'unitPriceUsd', Number(e.target.value))} />
          </div>
        ))}
      </div>

      <div className="field-grid">
        <NumberField label="Peso por unidad" value={inputs.weightKg} step={0.01} suffix="kg" onChange={(value) => setInputs({ ...inputs, weightKg: value })} />
        <NumberField label="Volumen por unidad" value={inputs.volumeCbm} step={0.001} suffix="m³" onChange={(value) => setInputs({ ...inputs, volumeCbm: value })} />
      </div>
    </section>
  )
}
