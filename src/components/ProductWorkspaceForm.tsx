import React, { useEffect, useState } from 'react'
import type { ManualProductChatData } from '../lib/productConfirmation'
import { readProductDraft, writeProductDraft } from '../lib/productDraft'

type Draft = { name: string; use: string; material: string }
export default function ProductWorkspaceForm({ onSubmit }: { onSubmit: (data: ManualProductChatData) => void }) {
  const [draft, setDraft] = useState<Draft>(() => readProductDraft<Draft>('workspace-product') || { name: '', use: '', material: '' })
  useEffect(() => { writeProductDraft('workspace-product', draft) }, [draft])
  return <form className="workspace-product-form" onSubmit={event => {
    event.preventDefault()
    if (draft.name.trim().length < 3 || draft.use.trim().length < 2) return
    onSubmit({ name: draft.name.trim(), use: draft.use.trim(), material: draft.material.trim(), unitPriceUsd: 0, originCountry: '', packedWeightKg: 0, moq: 0, volumeCbm: null, sensitiveCategory: 'unknown' })
  }}>
    <div className="workspace-section-heading"><span className="eyebrow">Ficha de producto</span><h3>Empezá con lo que sabés.</h3><p>Definí el producto. En el siguiente panel podés completar la oferta, el embalaje y la clasificación sin responder un chat.</p></div>
    <label><span>Nombre y modelo del producto</span><input required minLength={3} maxLength={300} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Ej. Lámpara LED de escritorio, modelo X1" /></label>
    <label><span>Función o uso principal</span><textarea required minLength={2} maxLength={2000} value={draft.use} onChange={e => setDraft({ ...draft, use: e.target.value })} placeholder="Qué hace, cómo funciona y para qué se utiliza" /></label>
    <label><span>Material y características <small>Opcional</small></span><input maxLength={1000} value={draft.material} onChange={e => setDraft({ ...draft, material: e.target.value })} placeholder="Ej. Aluminio, alimentación USB, 10 W" /></label>
    <p className="workspace-help">Los datos que no conozcas quedan pendientes. No generamos precios, medidas ni aranceles para completar la ficha.</p>
    <button type="submit" className="journey-primary-action" disabled={draft.name.trim().length < 3 || draft.use.trim().length < 2}>Crear ficha de importación</button>
  </form>
}
