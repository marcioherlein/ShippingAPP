import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  deleteAnalysisHistoryItem,
  getAnalysisHistoryItem,
  listAnalysisHistory,
  type AnalysisHistoryItem,
  type AnalysisHistorySummary,
} from '../lib/analysisHistory'
import { canRestoreSavedQuote } from '../lib/savedQuote'
import UiIcon from './UiIcon'

type Props = {
  onOpen: (item: AnalysisHistoryItem) => void
  onNewCalculation: () => void
}

function money(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
    : 'Sin dato'
}

function dateLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible'
    : new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(date)
}

function modeLabel(value: unknown) {
  return value === 'lcl' ? 'Marítimo LCL' : value === 'air' ? 'Aéreo' : value === 'courier' ? 'Courier' : 'Sin definir'
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').trim()
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function legacyFields(item: AnalysisHistoryItem) {
  const input = object(item.input)
  const result = object(item.result)
  const analysis = object(result.analysis ?? result.productAnalysis)
  const product = object(analysis.product)
  const customs = object(analysis.customs)
  const summary = object(result.pipelineSummary)
  return {
    name: typeof product.name === 'string' ? product.name : typeof input.productName === 'string' ? input.productName : 'Cálculo guardado',
    total: summary.totalCostUsd,
    unit: summary.unitCostUsd,
    ncm: typeof customs.ncmCandidate === 'string' ? customs.ncmCandidate : 'Sin dato',
    mode: summary.selectedMode,
  }
}

export default function SavedCalculations({ onOpen, onNewCalculation }: Props) {
  const titleId = useId()
  const searchId = useId()
  const [items, setItems] = useState<AnalysisHistorySummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [failedOpenId, setFailedOpenId] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AnalysisHistoryItem | null>(null)
  const [legacyIds, setLegacyIds] = useState<Set<string>>(() => new Set())
  const [announcement, setAnnouncement] = useState('')
  const mounted = useRef(false)
  const listRequest = useRef(0)
  const detailRequest = useRef(0)
  const actionBusy = useRef(false)
  const section = useRef<HTMLElement>(null)
  const detailTitle = useRef<HTMLHeadingElement>(null)
  const lastOpenButton = useRef<HTMLButtonElement | null>(null)
  const retryCursor = useRef<string | null>(null)

  const load = useCallback(async (nextCursor: string | null = null) => {
    const request = ++listRequest.current
    retryCursor.current = nextCursor
    setLoading(true)
    setLoadError('')
    try {
      const page = await listAnalysisHistory({ cursor: nextCursor, limit: 12 })
      if (!mounted.current || request !== listRequest.current) return
      setItems(current => nextCursor
        ? [...current, ...page.items.filter(item => !current.some(existing => existing.id === item.id))]
        : page.items)
      setCursor(page.nextCursor)
      setLoaded(true)
    } catch (cause) {
      if (mounted.current && request === listRequest.current) {
        setLoadError(cause instanceof Error ? cause.message : 'No pudimos cargar tus cálculos.')
      }
    } finally {
      if (mounted.current && request === listRequest.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void load()
    const refresh = () => { void load() }
    window.addEventListener('shippingapp:history-updated', refresh)
    return () => {
      mounted.current = false
      listRequest.current += 1
      detailRequest.current += 1
      window.removeEventListener('shippingapp:history-updated', refresh)
    }
  }, [load])

  useEffect(() => {
    if (detail) detailTitle.current?.focus()
  }, [detail])

  const open = async (id: string, trigger?: HTMLButtonElement) => {
    if (actionBusy.current) return
    actionBusy.current = true
    if (trigger) lastOpenButton.current = trigger
    const request = ++detailRequest.current
    setOpeningId(id)
    setActionError('')
    setFailedOpenId(null)
    try {
      const item = await getAnalysisHistoryItem(id)
      if (!mounted.current || request !== detailRequest.current) return
      if (canRestoreSavedQuote(item)) onOpen(item)
      else {
        setLegacyIds(current => new Set(current).add(id))
        setDetail(item)
      }
    } catch (cause) {
      if (mounted.current && request === detailRequest.current) {
        setActionError(cause instanceof Error ? cause.message : 'No pudimos abrir este cálculo.')
        setFailedOpenId(id)
      }
    } finally {
      actionBusy.current = false
      if (mounted.current && request === detailRequest.current) setOpeningId(null)
    }
  }

  const remove = async (item: AnalysisHistorySummary) => {
    if (actionBusy.current || !window.confirm(`¿Eliminar «${item.productName}» de tus cálculos guardados?`)) return
    actionBusy.current = true
    setDeletingId(item.id)
    setActionError('')
    setFailedOpenId(null)
    try {
      await deleteAnalysisHistoryItem(item.id)
      if (!mounted.current) return
      // A list request made before the deletion cannot resurrect its old row.
      listRequest.current += 1
      setLoading(false)
      setItems(current => current.filter(existing => existing.id !== item.id))
      setDetail(current => current?.id === item.id ? null : current)
      setAnnouncement(`Eliminaste ${item.productName} de tus cálculos guardados.`)
      section.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
    } catch (cause) {
      if (mounted.current) setActionError(cause instanceof Error ? cause.message : 'No pudimos eliminar este cálculo.')
    } finally {
      actionBusy.current = false
      if (mounted.current) setDeletingId(null)
    }
  }

  const filteredItems = useMemo(() => {
    const search = normalize(query)
    return search ? items.filter(item => normalize(item.productName).includes(search)) : items
  }, [items, query])
  const legacy = detail ? legacyFields(detail) : null
  const busy = !!openingId || !!deletingId

  return <section ref={section} className="saved-calculations" aria-labelledby={titleId}>
    <div className="saved-calculations-heading">
      <div><h2 id={titleId}>Tus cálculos</h2><p>Volvé a tus presupuestos con los datos y las tarifas del momento en que los guardaste.</p></div>
      <button type="button" className="saved-calculations-primary" onClick={onNewCalculation}>Nuevo cálculo <UiIcon name="arrow-right" /></button>
    </div>

    <div className="saved-calculations-toolbar">
      <div className="saved-calculations-search"><label htmlFor={searchId}>Buscar en los cálculos cargados</label><div><UiIcon name="search" /><input id={searchId} type="search" placeholder="Buscar un producto…" value={query} onChange={event => setQuery(event.target.value)} /></div></div>
      {loaded && <p className="saved-calculations-count" role="status">{query.trim() ? `${filteredItems.length} coincidencia${filteredItems.length === 1 ? '' : 's'}` : `${items.length} cálculo${items.length === 1 ? '' : 's'} cargado${items.length === 1 ? '' : 's'}`}{cursor ? ' · hay más para cargar' : ''}</p>}
    </div>

    {loadError && <div className="saved-calculations-state saved-calculations-error" role="alert"><p>{loadError}</p><button type="button" className="saved-calculations-secondary" onClick={() => void load(retryCursor.current)} disabled={loading}>Reintentar cargar cálculos</button></div>}
    {actionError && <div className="saved-calculations-state saved-calculations-error" role="alert"><p>{actionError}</p>{failedOpenId && <button type="button" className="saved-calculations-secondary" onClick={() => void open(failedOpenId)} disabled={busy}>Reintentar abrir cálculo</button>}</div>}
    {loading && <p className="saved-calculations-state" role="status">{items.length ? 'Cargando cálculos…' : 'Buscando tus cálculos guardados…'}</p>}

    {!loading && loaded && !loadError && items.length === 0 && <div className="saved-calculations-state saved-calculations-empty"><UiIcon name="product" size={32} /><h3>Tu próxima importación empieza acá.</h3><p>Todavía no guardaste ningún cálculo. Calculá un producto y guardá el resultado para volver a consultarlo.</p><button type="button" className="saved-calculations-primary" onClick={onNewCalculation}>Calcular mi primer producto <UiIcon name="arrow-right" /></button></div>}

    {items.length > 0 && filteredItems.length === 0 && <div className="saved-calculations-state"><h3>No hay coincidencias en los cálculos cargados.</h3><p>Probá otro nombre{cursor ? ' o cargá más cálculos' : ''}.</p><button type="button" className="saved-calculations-secondary" onClick={() => setQuery('')}>Limpiar búsqueda</button></div>}

    {filteredItems.length > 0 && <div className="saved-calculations-table-wrap"><table className="saved-calculations-table"><caption className="sr-only">Cálculos de importación guardados en tu cuenta. Importes en USD.</caption><thead><tr><th scope="col">Producto</th><th scope="col">Modalidad</th><th scope="col">Costo por unidad</th><th scope="col">Inversión total</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead><tbody>
      {filteredItems.map(item => <tr key={item.id}>
        <th scope="row" className="saved-calculations-product"><span>{item.productName}</span><small className="saved-calculations-date"><time dateTime={item.createdAt}>{dateLabel(item.createdAt)}</time>{item.ncmCode ? ` · NCM ${item.ncmCode}` : ''}</small></th>
        <td data-label="Modalidad"><span className="saved-calculations-mode">{modeLabel(item.selectedMode)}</span></td>
        <td className="saved-calculations-amount" data-label="Costo por unidad">{money(item.unitCostUsd)}</td>
        <td className="saved-calculations-amount" data-label="Inversión total">{money(item.totalCostUsd)}</td>
        <td className="saved-calculations-actions"><button type="button" className="saved-calculations-secondary" onClick={event => void open(item.id, event.currentTarget)} disabled={busy} aria-label={`${legacyIds.has(item.id) ? 'Ver detalle' : 'Abrir cálculo'}: ${item.productName}`}>{openingId === item.id ? 'Abriendo…' : legacyIds.has(item.id) ? 'Ver detalle' : 'Abrir cálculo'} <UiIcon name="arrow-right" size={16} /></button><button type="button" className="saved-calculations-delete" onClick={() => void remove(item)} disabled={busy} aria-label={`Eliminar cálculo: ${item.productName}`}>{deletingId === item.id ? 'Eliminando…' : 'Eliminar'}</button></td>
      </tr>)}
    </tbody></table></div>}

    {cursor && <div className="saved-calculations-pagination"><button type="button" className="saved-calculations-secondary" disabled={loading || busy} onClick={() => void load(cursor)}>Cargar más cálculos</button></div>}
    <p className="sr-only" role="status">{announcement}</p>

    {detail && legacy && <section className="saved-calculations-detail" aria-label="Detalle de cálculo anterior">
      <div className="saved-calculations-detail-head"><div><span>Versión anterior</span><h3 ref={detailTitle} tabIndex={-1}>{legacy.name}</h3><p>Guardado el {dateLabel(detail.createdAt)}</p></div><button type="button" className="saved-calculations-secondary" onClick={() => { setDetail(null); lastOpenButton.current?.focus() }}>Cerrar detalle</button></div>
      <p>Este registro conserva un resumen anterior. No tiene todos los datos necesarios para reabrir el comparador. Los importes son históricos; iniciá un nuevo cálculo para estimar costos actuales.</p>
      <dl className="saved-calculations-detail-grid"><div><dt>Inversión total · USD</dt><dd>{money(legacy.total)}</dd></div><div><dt>Costo por unidad · USD</dt><dd>{money(legacy.unit)}</dd></div><div><dt>Modalidad</dt><dd>{modeLabel(legacy.mode)}</dd></div><div><dt>NCM guardada</dt><dd>{legacy.ncm}</dd></div></dl>
      <button type="button" className="saved-calculations-primary" onClick={onNewCalculation}>Iniciar un nuevo cálculo <UiIcon name="arrow-right" /></button>
    </section>}
  </section>
}
