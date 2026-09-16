import React, { useEffect, useId, useMemo, useState } from 'react'
import { manualNcmProfile, searchManualNcm, type ManualNcmIndex } from '../lib/manualNcm'
import type { CustomsProfile } from '../lib/customsClassification'
export default function ManualNcmPicker({ customs, onSelect }: { customs: CustomsProfile; onSelect: (value: CustomsProfile) => void }) {
  const selectionName = useId()
  const [index, setIndex] = useState<ManualNcmIndex | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [chapter, setChapter] = useState('')
  const [selected, setSelected] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    fetch('/data/ncm-index.json', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('No pude cargar el nomenclador.')
      const data = await response.json()
      if (!Array.isArray(data.records) || !data.meta?.sourceDate) throw new Error('El nomenclador no está disponible.')
      setIndex(data)
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [retry])
  const chapters = useMemo(() => index ? [...new Set(index.records.map(row => row[0].slice(0, 2)))].sort() : [], [index])
  const results = useMemo(() => index ? searchManualNcm(index, query, chapter) : [], [index, query, chapter])
  return <section className="manual-ncm-picker">
    <h3>Buscar en el nomenclador</h3>
    <p>Buscá por producto o código y filtrá por capítulo. Validamos que la posición exista y tenga aranceles; revisá que la descripción corresponda a tu producto.</p>
    {!index && !error && <p role="status">Cargando nomenclador…</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Reintentar</button></p>}
    {index && <>
      <label>Producto o código NCM<input value={query} onChange={event => { setQuery(event.target.value); setSelected(''); setConfirmed(false) }} type="search" autoComplete="off" placeholder="Ej. crema, raquetas, 3304" /></label>
      <label>Capítulo<select value={chapter} onChange={event => { setChapter(event.target.value); setSelected(''); setConfirmed(false) }}><option value="">Todos los capítulos</option>{chapters.map(value => <option key={value} value={value}>Capítulo {value}</option>)}</select></label>
      <p role="status">{results.length === 60 ? 'Primeras 60 posiciones. Agregá palabras para acotar.' : `${results.length} posiciones encontradas.`}</p>
      <div className="manual-ncm-results" role="group" aria-label="Posiciones del nomenclador">{results.map(([code, label]) => <label key={code}><input type="radio" name={selectionName} checked={selected === code} onChange={() => { setSelected(code); setConfirmed(false) }} /><span><b>{code}</b> {label}</span></label>)}</div>
      {results.length === 0 && <p className="manual-ncm-empty">No encontramos coincidencias. Probá con el nombre general del producto o elegí otro capítulo.</p>}
      {selected && <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Revisé la descripción y corresponde a mi producto.</label>}
      <p id={`${selectionName}-help`} className="manual-ncm-selection-help">{!selected ? 'Elegí una posición para continuar.' : !confirmed ? 'Confirmá que la descripción corresponde a tu producto.' : 'Posición elegida. Podés continuar.'}</p>
      <button type="button" aria-describedby={`${selectionName}-help`} className="journey-primary-action" disabled={!selected || !confirmed} onClick={() => { try { onSelect(manualNcmProfile(customs, index, selected)) } catch (error) { setError((error as Error).message) } }}>Usar esta posición</button>
    </>}
  </section>
}
