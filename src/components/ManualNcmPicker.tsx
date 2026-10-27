import React, { useEffect, useId, useMemo, useState } from 'react'
import { manualNcmProfile, searchManualNcm, type ManualNcmIndex } from '../lib/manualNcm'
import type { CustomsProfile } from '../lib/customsClassification'
import DsSelect from './DsSelect'
import { loadManualNcmIndex } from '../lib/loadManualNcmIndex'
import { readProductDraft, writeProductDraft } from '../lib/productDraft'
export default function ManualNcmPicker({ customs, recoveryKey = customs.description || '', onSelect }: { customs: CustomsProfile; recoveryKey?: string; onSelect: (value: CustomsProfile) => void }) {
  const selectionName = useId()
  const storageKey = `manual-ncm:${recoveryKey}`
  const [saved] = useState(() => readProductDraft<{ query: string; chapter: string; selected: string; confirmed: boolean }>(storageKey))
  const [index, setIndex] = useState<ManualNcmIndex | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState(saved?.query || saved?.selected || '')
  const [chapter, setChapter] = useState(saved?.chapter || '')
  const [selected, setSelected] = useState(saved?.selected || '')
  const [confirmed, setConfirmed] = useState(saved?.confirmed || false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    loadManualNcmIndex(controller.signal).then(data => {
      if (!controller.signal.aborted) setIndex(data)
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [retry])
  useEffect(() => { writeProductDraft(storageKey, { query, chapter, selected, confirmed }) }, [storageKey, query, chapter, selected, confirmed])
  const chapters = useMemo(() => index ? [...new Set(index.records.map(row => row[0].slice(0, 2)))].sort() : [], [index])
  const searchReady = query.trim().length >= 2 || !!chapter
  const results = useMemo(() => index && searchReady ? searchManualNcm(index, query, chapter) : [], [index, query, chapter, searchReady])
  const selectedVisible = results.some(([code]) => code === selected)
  return <section className="manual-ncm-picker">
    <h3>Buscar en el nomenclador</h3>
    <p>Buscá por producto o código y filtrá por capítulo. Validamos que la posición exista y tenga aranceles; revisá que la descripción corresponda a tu producto.</p>
    {!index && !error && <p role="status">Cargando nomenclador…</p>}
    {!index && error && <div className="manual-ncm-load-error" role="alert">
      <b>{error}</b>
      <p>El buscador del nomenclador no está disponible en este momento. Podés reintentar; si sigue fallando, guardá el NCM que uses habitualmente o el que te pase tu despachante y cargalo cuando vuelva el servicio.</p>
      <button type="button" className="pipeline-secondary" onClick={() => setRetry(value => value + 1)}>Reintentar</button>
    </div>}
    {index && <>
      <p className="ncm-catalog-source">Fuente: {index.meta.source} · Actualización: {index.meta.sourceDate}</p>
      <label>Producto o código NCM<input autoFocus value={query} onChange={event => { setQuery(event.target.value); setSelected(''); setConfirmed(false) }} type="search" autoComplete="off" placeholder="Ej. crema, raquetas, 3304" /></label>
      <label>Capítulo<DsSelect ariaLabel="Capítulo del nomenclador" value={chapter} onChange={value => { setChapter(value); setSelected(''); setConfirmed(false) }} options={[{ value: '', label: 'Todos los capítulos' }, ...chapters.map(value => ({ value, label: `Capítulo ${value}` }))]} /></label>
      <p role="status">{!searchReady ? 'Escribí al menos dos caracteres del producto o código, o elegí un capítulo para buscar.' : results.length === 60 ? 'Hay 60 o más coincidencias. Agregá palabras para acotar.' : `${results.length} posiciones encontradas.`}</p>
      <div className="manual-ncm-results" role="group" aria-label="Posiciones del nomenclador">{results.map(([code, label]) => <label key={code}><input type="radio" name={selectionName} checked={selected === code} onChange={() => { setSelected(code); setConfirmed(false) }} /><span><b>{code}</b> {label}</span></label>)}</div>
      {searchReady && results.length === 0 && <p className="manual-ncm-empty">No encontramos coincidencias. Probá con el nombre general del producto o elegí otro capítulo.</p>}
      {selectedVisible && <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Revisé la descripción y corresponde a mi producto.</label>}
      <p id={`${selectionName}-help`} className="manual-ncm-selection-help">{!searchReady ? 'Empezá por buscar tu producto o una posición conocida.' : !selectedVisible ? 'Elegí una posición para continuar.' : !confirmed ? 'Confirmá que la descripción corresponde a tu producto.' : 'Posición elegida. Podés continuar.'}</p>
      {error && <p className="manual-ncm-selection-error" role="alert">{error}</p>}
      <button type="button" aria-describedby={`${selectionName}-help`} className="journey-primary-action" disabled={!selectedVisible || !confirmed} onClick={() => { try { onSelect(manualNcmProfile(customs, index, selected)) } catch (error) { setError((error as Error).message) } }}>Usar esta posición</button>
    </>}
  </section>
}
