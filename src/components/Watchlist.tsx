import React, { useEffect, useId, useState } from 'react'
import {
  getWatchlistItem,
  listWatchlist,
  refreshWatchlistItem,
  removeWatchlistItem,
  type WatchlistItem,
  type WatchlistSnapshot,
} from '../lib/watchlist'
import './Watchlist.css'
import { useAccountPanel } from '../hooks/useAccountPanel'

function ars(value: number | null | undefined) {
  return value == null ? '—' : `$ ${Math.round(value).toLocaleString('es-AR')}`
}

function pct(value: number | null | undefined, suffix = '%') {
  if (value == null) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}${suffix}`
}

function dateLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function statusLabel(snapshot: WatchlistSnapshot | null) {
  if (!snapshot) return 'Sin observaciones'
  if (snapshot.marketStatus === 'live' || snapshot.marketStatus === 'baseline') return 'Dato confirmado'
  if (snapshot.marketStatus === 'insufficient') return 'Evidencia insuficiente'
  if (snapshot.marketStatus === 'configuration_required') return 'Fuente no configurada'
  if (snapshot.marketStatus === 'unavailable') return 'Sin dato nuevo'
  return snapshot.marketStatus
}

export default function Watchlist() {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [detail, setDetail] = useState<WatchlistItem | null>(null)
  const { panelRef, triggerRef, focusAfterRemoval } = useAccountPanel(open, () => setOpen(false), detail?.id)
  const [loading, setLoading] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setItems(await listWatchlist())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos cargar tus productos seguidos.')
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
    window.addEventListener('shippingapp:watchlist-updated', refresh)
    return () => window.removeEventListener('shippingapp:watchlist-updated', refresh)
  }, [open, detail])

  const openItem = async (id: string) => {
    setOpeningId(id)
    setError('')
    try {
      setDetail(await getWatchlistItem(id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos abrir este seguimiento.')
    } finally {
      setOpeningId(null)
    }
  }

  const refreshItem = async (id: string) => {
    setRefreshingId(id)
    setError('')
    try {
      const updated = await refreshWatchlistItem(id)
      setItems((current) => current.map((item) => item.id === id ? { ...item, ...updated, snapshots: updated.snapshots.slice(0, 2) } : item))
      if (detail?.id === id) setDetail(updated)
      window.dispatchEvent(new CustomEvent('shippingapp:watchlist-updated'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos actualizar este seguimiento.')
    } finally {
      setRefreshingId(null)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('¿Dejar de seguir este producto? Las observaciones anteriores se conservan si después lo volvés a seguir.')) return
    const previousFocus = document.activeElement
    setRemovingId(id)
    setError('')
    try {
      await removeWatchlistItem(id)
      focusAfterRemoval(previousFocus)
      setItems((current) => current.filter((item) => item.id !== id))
      if (detail?.id === id) setDetail(null)
      window.dispatchEvent(new CustomEvent('shippingapp:watchlist-updated'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos quitar este seguimiento.')
    } finally {
      setRemovingId(null)
    }
  }

  return <div className="watchlist-control">
    <button type="button" ref={triggerRef} className="watchlist-trigger" aria-haspopup="dialog" aria-controls={open ? panelId : undefined} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span aria-hidden="true">☆</span> Seguimiento
    </button>

    {open && <div ref={panelRef} id={panelId} className="watchlist-panel" role="dialog" aria-label="Productos seguidos">
      <div className="watchlist-head">
        <div>
          <b>{detail ? detail.title : 'Productos seguidos'}</b>
          <small>{detail ? 'Observaciones de precio, costo y margen.' : 'Productos que elegiste seguir desde un presupuesto guardado.'}</small>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar seguimiento">×</button>
      </div>

      {error && <div className="watchlist-error" role="alert">{error}{!detail && <button type="button" onClick={() => { void load(); panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus() }} disabled={loading}>Reintentar</button>}</div>}

      {detail ? <div className="watchlist-detail">
        <button type="button" className="watchlist-back" data-account-panel-start onClick={() => setDetail(null)}>← Volver al seguimiento</button>
        <div className="watchlist-detail-actions">
          <button type="button" onClick={() => void refreshItem(detail.id)} disabled={refreshingId === detail.id}>{refreshingId === detail.id ? 'Actualizando…' : 'Actualizar ahora'}</button>
          <button type="button" className="danger" onClick={() => void remove(detail.id)} disabled={removingId === detail.id}>{removingId === detail.id ? 'Quitando…' : 'Dejar de seguir'}</button>
        </div>
        <div className="watchlist-timeline">
          {detail.snapshots.length === 0 ? <div className="watchlist-empty"><b>Todavía no hay observaciones.</b></div> : detail.snapshots.map((snapshot) => <article key={snapshot.id} className="watchlist-snapshot">
            <div className="watchlist-snapshot-head"><b>{dateLabel(snapshot.observedAt)}</b><span data-status={snapshot.marketStatus}>{statusLabel(snapshot)}</span></div>
            <div className="watchlist-metrics">
              <span><small>Precio mercado</small><b>{ars(snapshot.marketPriceArs)}</b></span>
              <span><small>Costo puesto/u.</small><b>{ars(snapshot.landedCostArs)}</b></span>
              <span><small>Margen bruto</small><b>{pct(snapshot.grossMarginPct)}</b></span>
            </div>
            <div className="watchlist-provenance"><small>Fuente</small><b>{snapshot.marketSource || 'Sin fuente de mercado utilizable'}</b><span>Observado {dateLabel(snapshot.observedAt)}</span></div>
          </article>)}
        </div>
      </div> : <>
        {!loading && items.length === 0 && !error && <div className="watchlist-empty">
          <b>Todavía no seguís ningún producto.</b>
          <span>Abrí un análisis guardado y elegí “Seguir producto”.</span>
        </div>}

        <div className="watchlist-list">
          {items.map((item) => <article className="watchlist-item" key={item.id}>
            <div className="watchlist-title"><b>{item.title}</b><small>{item.ncmCode ? `NCM ${item.ncmCode}` : 'NCM no disponible'}</small></div>
            <div className="watchlist-status-row"><span data-status={item.latestSnapshot?.marketStatus || 'unknown'}>{statusLabel(item.latestSnapshot)}</span><small>{item.latestSnapshot ? dateLabel(item.latestSnapshot.observedAt) : 'Sin fecha'}</small></div>
            <div className="watchlist-metrics">
              <span><small>Mercado</small><b>{ars(item.latestSnapshot?.marketPriceArs)}</b><em>{pct(item.changes.marketPricePct)}</em></span>
              <span><small>Costo puesto/u.</small><b>{ars(item.latestSnapshot?.landedCostArs)}</b><em>{pct(item.changes.landedCostPct)}</em></span>
              <span><small>Margen</small><b>{pct(item.latestSnapshot?.grossMarginPct)}</b><em>{pct(item.changes.grossMarginPoints, ' pp')}</em></span>
            </div>
            {item.latestSnapshot?.marketStatus === 'unavailable' && <p className="watchlist-warning">La última actualización no tuvo evidencia de mercado suficiente. No se reutilizó el precio anterior como si fuera actual.</p>}
            <div className="watchlist-actions">
              <button type="button" onClick={() => void openItem(item.id)} disabled={openingId === item.id}>{openingId === item.id ? 'Abriendo…' : 'Ver historial'}</button>
              <button type="button" onClick={() => void refreshItem(item.id)} disabled={refreshingId === item.id}>{refreshingId === item.id ? 'Actualizando…' : 'Actualizar'}</button>
              <button type="button" className="danger" onClick={() => void remove(item.id)} disabled={removingId === item.id}>{removingId === item.id ? 'Quitando…' : 'Quitar'}</button>
            </div>
          </article>)}
        </div>
        {loading && <div className="watchlist-loading" role="status">Cargando seguimiento…</div>}
      </>}
    </div>}
  </div>
}
