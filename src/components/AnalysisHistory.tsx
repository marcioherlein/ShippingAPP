import React, { useEffect, useState } from 'react'
import { deleteAnalysisHistoryItem, getAnalysisHistoryItem, listAnalysisHistory, type AnalysisHistoryItem, type AnalysisHistorySummary } from '../lib/analysisHistory'
import './AnalysisHistory.css'

function money(value: number | null | undefined) {
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
  const [detail, setDetail] = useState<AnalysisHistoryItem | null>(null)
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
    setDetail(null)
    void load()
  }, [open])

  useEffect(() => {
    const refresh = () => {
      if (open && !detail) void load()
    }
    window.addEventListener('shippingapp:history-updated', refresh)
    return () => window.removeEventListener('shippingapp:history-updated', refresh)
  }, [open, detail])

  const openAnalysis = async (id: string) => {
    setOpeningId(id)
    setError('')
    try {
      setDetail(await getAnalysisHistoryItem(id))
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
      if (detail?.id === id) setDetail(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos eliminar este análisis.')
    } finally {
      setDeletingId(null)
    }
  }

  const detailResult = detail?.result as any
  const detailAnalysis = detailResult?.analysis ?? null
  const detailPipeline = detailResult?.pipelineSummary ?? null

  return <div className="analysis-history-control">
    <button type="button" className="analysis-history-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span aria-hidden="true">◷</span> Historial
    </button>

    {open && <div className="analysis-history-panel" role="dialog" aria-label="Historial de análisis">
      <div className="analysis-history-head">
        <div><b>{detail ? 'Análisis guardado' : 'Tu historial'}</b><small>{detail ? dateLabel(detail.createdAt) : 'Sólo vos podés ver estos análisis.'}</small></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar historial">×</button>
      </div>

      {error && <div className="analysis-history-error">{error}</div>}

      {detail ? <div className="analysis-history-detail">
        <button type="button" className="analysis-history-back" onClick={() => setDetail(null)}>← Volver al historial</button>
        <h3>{detailAnalysis?.product?.name || 'Análisis guardado'}</h3>
        <div className="analysis-history-metrics">
          <span><small>Costo total</small><b>{money(detailPipeline?.totalCostUsd)}</b></span>
          <span><small>Costo/u.</small><b>{money(detailPipeline?.unitCostUsd)}</b></span>
          <span><small>NCM</small><b>{detailAnalysis?.customs?.ncmCandidate || '—'}</b></span>
        </div>
        <div className="analysis-history-detail-grid">
          <div><small>Modo logístico</small><b>{detailPipeline?.selectedMode === 'lcl' ? 'Marítimo LCL' : detailPipeline?.selectedMode === 'air' ? 'Aéreo' : '—'}</b></div>
          <div><small>Cantidad base</small><b>{typeof detailPipeline?.baseQuantity === 'number' ? `${detailPipeline.baseQuantity.toLocaleString('es-AR')} u.` : '—'}</b></div>
          <div><small>Origen</small><b>{detailAnalysis?.product?.originCountry || '—'}</b></div>
          <div><small>FOB unitario</small><b>{money(detailAnalysis?.product?.unitPriceUsd)}</b></div>
        </div>
        {detailAnalysis?.sourceUrl && !String(detailAnalysis.sourceUrl).startsWith('manual://') && <a className="analysis-history-source" href={String(detailAnalysis.sourceUrl)} target="_blank" rel="noreferrer">Abrir fuente del producto ↗</a>}
        <button type="button" className="analysis-history-delete-detail" onClick={() => void remove(detail.id)} disabled={deletingId === detail.id}>{deletingId === detail.id ? 'Eliminando…' : 'Eliminar de mi historial'}</button>
      </div> : <>
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
              <button type="button" onClick={() => void openAnalysis(item.id)} disabled={openingId === item.id}>{openingId === item.id ? 'Abriendo…' : 'Abrir análisis'}</button>
              <button type="button" className="danger" onClick={() => void remove(item.id)} disabled={deletingId === item.id}>{deletingId === item.id ? 'Eliminando…' : 'Eliminar'}</button>
            </div>
          </article>)}
        </div>

        {loading && <div className="analysis-history-loading">Cargando historial…</div>}
        {!loading && cursor && <button type="button" className="analysis-history-more" onClick={() => void load(cursor, true)}>Cargar más</button>}
      </>}
    </div>}
  </div>
}
