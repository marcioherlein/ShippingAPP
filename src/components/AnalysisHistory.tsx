import React, { useEffect, useState } from 'react'
import { deleteAnalysisHistoryItem, getAnalysisHistoryItem, listAnalysisHistory, type AnalysisHistorySummary } from '../lib/analysisHistory'
import './AnalysisHistory.css'

function money(value: number | null) {
  return value == null ? '—' : `US$ ${Math.round(value).toLocaleString('es-AR')}`
}

function dateLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export default function AnalysisHistory() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AnalysisHistorySummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = async (nextCursor: string | null = null, append = false) => {
    setLoading(true)
    setError('')
    try {
      const page = await listAnalysisHistory({ cursor: nextCursor, limit: 12 })
      setItems((current) => append ? [...current, ...page.items] : page.items)
      setCursor(page.nextCursor)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos cargar tu historial.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    void load()
  }, [open])

  useEffect(() => {
    const refresh = () => {
      if (open) void load()
    }
    window.addEventListener('shippingapp:history-updated', refresh)
    return () => window.removeEventListener('shippingapp:history-updated', refresh)
  }, [open])

  const reopen = async (id: string) => {
    setOpeningId(id)
    setError('')
    try {
      const item = await getAnalysisHistoryItem(id)
      window.dispatchEvent(new CustomEvent('shippingapp:history-reopen', { detail: item }))
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos abrir este análisis.')
    } finally {
      setOpeningId(null)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('¿Eliminar este análisis de tu historial?')) return
    setDeletingId(id)
    setError('')
    try {
      await deleteAnalysisHistoryItem(id)
      setItems((current) => current.filter((item) => item.id !== id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos eliminar este análisis.')
    } finally {
      setDeletingId(null)
    }
  }

  return <div className="analysis-history-control">
    <button type="button" className="analysis-history-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span aria-hidden="true">◷</span> Historial
    </button>

    {open && <div className="analysis-history-panel" role="dialog" aria-label="Historial de análisis">
      <div className="analysis-history-head">
        <div><b>Tu historial</b><small>Sólo vos podés ver estos análisis.</small></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar historial">×</button>
      </div>

      {error && <div className="analysis-history-error">{error}</div>}
      {!loading && items.length === 0 && !error && <div className="analysis-history-empty"><b>Todavía no hay análisis guardados.</b><span>Cuando una cotización llegue a resultado, se guarda automáticamente acá.</span></div>}

      <div className="analysis-history-list">
        {items.map((item) => <article className="analysis-history-item" key={item.id}>
          <div className="analysis-history-title"><b>{item.productName}</b><small>{dateLabel(item.createdAt)}</small></div>
          <div className="analysis-history-metrics">
            <span><small>Costo total</small><b>{money(item.totalCostUsd)}</b></span>
            <span><small>Costo/u.</small><b>{money(item.unitCostUsd)}</b></span>
            <span><small>NCM</small><b>{item.ncmCode || '—'}</b></span>
          </div>
          <div className="analysis-history-actions">
            <button type="button" onClick={() => void reopen(item.id)} disabled={openingId === item.id}>{openingId === item.id ? 'Abriendo…' : 'Reabrir caso'}</button>
            <button type="button" className="danger" onClick={() => void remove(item.id)} disabled={deletingId === item.id}>{deletingId === item.id ? 'Eliminando…' : 'Eliminar'}</button>
          </div>
        </article>)}
      </div>

      {loading && <div className="analysis-history-loading">Cargando historial…</div>}
      {!loading && cursor && <button type="button" className="analysis-history-more" onClick={() => void load(cursor, true)}>Cargar más</button>}
    </div>}
  </div>
}
