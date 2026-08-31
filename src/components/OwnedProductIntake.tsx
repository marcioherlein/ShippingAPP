import React, { useState } from 'react'
import { isAlibabaUrl } from '../lib/productIntake'

type Props = {
  onAlibabaLink: (url: string) => Promise<void>
  onDescribeProduct: (description: string) => void
}

type Mode = 'link' | 'describe' | null

export default function OwnedProductIntake({ onAlibabaLink, onDescribeProduct }: Props) {
  const [mode, setMode] = useState<Mode>(null)
  const [link, setLink] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submitLink = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = link.trim()
    if (!value || loading) return
    if (!isAlibabaUrl(value)) {
      setError('Pegá una URL de producto de Alibaba. Si no tenés link, elegí “Describir el producto”.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await onAlibabaLink(value)
    } catch (err) {
      setError(err instanceof Error
        ? `${err.message} Podés reintentar o describir el producto sin link.`
        : 'No pude leer esa publicación. Podés reintentar o describir el producto sin link.')
    } finally {
      setLoading(false)
    }
  }

  const submitDescription = (event: React.FormEvent) => {
    event.preventDefault()
    const value = description.replace(/\s+/g, ' ').trim()
    if (value.length < 8) {
      setError('Contame un poco más: qué es el producto y, si lo sabés, material o cómo funciona.')
      return
    }
    setError('')
    onDescribeProduct(value)
  }

  return <section className="owned-product-intake" aria-label="Cómo cargar tu producto">
    <div className="owned-product-intro">
      <span className="eyebrow">Tu producto</span>
      <h2>Elegí la forma más fácil.</h2>
      <p>No hace falta saber de aduana ni completar una ficha entera. Primero identifico el producto; después te pregunto únicamente lo que realmente falte para clasificar y cotizar.</p>
    </div>

    {mode === null && <div className="owned-product-options">
      <button type="button" onClick={() => setMode('link')}>
        <span className="owned-product-option-icon">↗</span>
        <b>Pegar link de Alibaba</b>
        <small>Intento traer título, tipo, specs, precio, MOQ, peso, volumen y origen. Después sólo confirmás o completás faltantes.</small>
        <em>Más rápido</em>
      </button>
      <button type="button" onClick={() => setMode('describe')}>
        <span className="owned-product-option-icon">✎</span>
        <b>Describir el producto</b>
        <small>Decime qué es en una frase. Primero resuelvo la clasificación; los datos de logística se piden después sólo si hacen falta.</small>
      </button>
    </div>}

    {mode === 'link' && <form className="owned-product-entry" onSubmit={(event) => void submitLink(event)}>
      <div className="owned-product-entry-head">
        <div><b>Pegá la publicación de Alibaba</b><small>ShippingAPP intenta lectura propia primero; Parse.bot y Browser Run quedan como respaldo.</small></div>
        <button type="button" onClick={() => { setMode(null); setError('') }}>Cambiar</button>
      </div>
      <div className="owned-product-link-row">
        <input
          type="url"
          value={link}
          onChange={(event) => setLink(event.target.value.slice(0, 2200))}
          placeholder="https://www.alibaba.com/product-detail/..."
          autoComplete="off"
          disabled={loading}
        />
        <button className="journey-primary-action" type="submit" disabled={loading || !link.trim()}>{loading ? 'Leyendo…' : 'Leer producto'} <span>→</span></button>
      </div>
      {loading && <p className="owned-product-progress">Estoy leyendo la publicación y cruzando las fuentes disponibles. No voy a inventar un dato que Alibaba no exponga.</p>}
    </form>}

    {mode === 'describe' && <form className="owned-product-entry" onSubmit={submitDescription}>
      <div className="owned-product-entry-head">
        <div><b>¿Qué producto es?</b><small>Escribilo como se lo explicarías a una persona. No hace falta conocer la NCM.</small></div>
        <button type="button" onClick={() => { setMode(null); setError('') }}>Cambiar</button>
      </div>
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value.slice(0, 1200))}
        placeholder="Ej. Reloj de pulsera mecánico automático, caja de acero inoxidable, no es smartwatch."
        rows={4}
        autoFocus
      />
      <div className="owned-product-entry-actions">
        <small>Después te voy a pedir sólo las características que el nomenclador necesite para distinguir la posición correcta.</small>
        <button className="journey-primary-action" type="submit" disabled={description.trim().length < 8}>Continuar <span>→</span></button>
      </div>
    </form>}

    {error && <div className="pipeline-warning owned-product-error"><b>No pude continuar todavía.</b><span>{error}</span></div>}
  </section>
}
