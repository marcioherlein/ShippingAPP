import React, { useMemo, useState } from 'react'
import { applyFreightRate, parseFreightRateCsv, selectFreightRate, type FreightImportResult } from '../lib/freightRateImport'
import type { Inputs } from '../lib/types'

type Props = { inputs: Inputs; setInputs: React.Dispatch<React.SetStateAction<Inputs>> }

function todayLocal() {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export default function FreightRateUpload({ inputs, setInputs }: Props) {
  const [result, setResult] = useState<FreightImportResult>({ records: [], issues: [] })
  const [origin, setOrigin] = useState('Shanghai')
  const [destination, setDestination] = useState('Buenos Aires')
  const [mode, setMode] = useState<'air' | 'sea_lcl'>('air')
  const [asOf, setAsOf] = useState(todayLocal())
  const [appliedId, setAppliedId] = useState<string | null>(null)

  const selection = useMemo(() => selectFreightRate(result.records, mode, origin, destination, asOf), [result.records, mode, origin, destination, asOf])

  const onFile = async (file?: File) => {
    if (!file) return
    const parsed = parseFreightRateCsv(await file.text())
    setResult(parsed)
    setAppliedId(null)
  }

  const apply = () => {
    if (!selection) return
    setInputs((current) => applyFreightRate(current, selection))
    setAppliedId(selection.record.id)
  }

  return <details className="manual-details">
    <summary>Usar cotización / rate sheet CSV</summary>
    <div className="readiness-grid" style={{ marginTop: 12 }}>
      <label className="readiness-field"><span>Origen exacto</span><small>Debe coincidir con el lane del archivo.</small><input value={origin} onChange={(e) => setOrigin(e.target.value)} /></label>
      <label className="readiness-field"><span>Destino exacto</span><small>Sin matching difuso en MVP 0.7.</small><input value={destination} onChange={(e) => setDestination(e.target.value)} /></label>
      <label className="readiness-field"><span>Modo</span><small>La unidad debe ser compatible.</small><select value={mode} onChange={(e) => setMode(e.target.value as 'air' | 'sea_lcl')}><option value="air">Aéreo · USD/kg</option><option value="sea_lcl">Marítimo LCL · USD/W/M</option></select></label>
      <label className="readiness-field"><span>Fecha de cálculo</span><small>Sólo se consideran rates vigentes.</small><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
      <label className="readiness-field"><span>Archivo CSV</span><small>USD únicamente. Quotes tienen prioridad sobre rate sheets y benchmarks.</small><input type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} /></label>
      <div className="readiness-field"><span>Plantilla</span><small>Columnas normalizadas para el MVP.</small><a href="/freight-rate-template.csv">Abrir plantilla CSV ↗</a></div>
    </div>

    {result.records.length > 0 && <p className="assumption-note">{result.records.length} rate(s) válidos cargados. {result.issues.length ? `${result.issues.length} fila(s) rechazadas.` : 'Sin filas rechazadas.'}</p>}
    {result.issues.length > 0 && <div className="analysis-banner"><b>Filas no utilizadas.</b> {result.issues.slice(0, 3).map((issue) => `Fila ${issue.row}: ${issue.message}`).join(' · ')}{result.issues.length > 3 ? ` · +${result.issues.length - 3} más` : ''}</div>}

    {selection ? <section className="extraction-card" style={{ marginTop: 12 }}>
      <div className="reg-card-head"><div><span className="eyebrow">Rate seleccionado</span><h3>{selection.record.provider}</h3></div><span className="confidence">{selection.record.sourceType}</span></div>
      <div className="fact-grid">
        <div><span>Lane</span><b>{selection.record.origin} → {selection.record.destination}</b></div>
        <div><span>Rate</span><b>USD {selection.record.rate.toFixed(2)} / {selection.record.rateUnit === 'kg' ? 'kg' : 'W/M'}</b></div>
        <div><span>Mínimo</span><b>USD {selection.record.minimumUsd.toFixed(0)}</b></div>
        <div><span>Vigencia</span><b>{selection.record.validFrom} → {selection.record.validTo}</b></div>
        <div><span>Cargos adicionales informados</span><b>USD {selection.pendingFixedChargesUsd.toFixed(0)}</b></div>
        <div><span>Recibida</span><b>{selection.record.receivedAt}</b></div>
      </div>
      <p className="assumption-note"><strong>No se aplican automáticamente los USD {selection.pendingFixedChargesUsd.toFixed(0)} de origin/destination/surcharges.</strong> Primero debemos mapear qué cubre la rate sheet contra “Costos fijos logísticos” para evitar doble conteo.</p>
      <button type="button" onClick={apply}>{appliedId === selection.record.id ? 'Rate aplicado ✓' : 'Aplicar rate + mínimo'}</button>
    </section> : result.records.length > 0 ? <div className="analysis-banner"><b>Sin rate aplicable.</b> No hay una cotización vigente con coincidencia exacta de origen, destino y modo para {asOf}.</div> : null}
  </details>
}
