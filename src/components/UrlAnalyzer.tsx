import React, { useState } from 'react'
import { analyzeAlibabaUrl, type ProductAnalysis } from '../lib/productAnalysis'

type Props = { onAnalysis: (analysis: ProductAnalysis) => void; analysis?: ProductAnalysis | null }

export default function UrlAnalyzer({ onAnalysis, analysis }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!url.trim()) return
    setLoading(true); setError('')
    try { onAnalysis(await analyzeAlibabaUrl(url.trim())) }
    catch (err) { setError(err instanceof Error ? err.message : 'No pudimos analizar ese link.') }
    finally { setLoading(false) }
  }

  return <section className="url-analyzer">
    <div className="analyzer-copy">
      <span className="eyebrow">Product opportunity scanner</span>
      <h1>Pegá un producto. ShippingAPP hace el resto.</h1>
      <p>Estimamos producto, MOQ, logística y mercado para darte un business case rápido antes de comprar.</p>
    </div>
    <form className="url-form" onSubmit={submit}>
      <div className="url-input-wrap">
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Pegá un link de Alibaba" />
        <button type="submit" disabled={loading}>{loading ? 'Analizando…' : 'Analizar'}</button>
      </div>
      {error && <p className="analyzer-error">{error}</p>}
    </form>
    {loading && <div className="analysis-progress"><b>Construyendo business case…</b><span>Extrayendo datos y completando faltantes con benchmarks.</span></div>}
    {analysis && !loading && <div className="extraction-card">
      <div className="extraction-top"><div><span className="eyebrow">Producto detectado</span><h2>{analysis.product.name}</h2><p>{analysis.product.category} · {analysis.product.originCountry}</p></div><span className="confidence">{analysis.confidence.overall}% confidence</span></div>
      <div className="fact-grid">
        <div><span>Precio proveedor</span><b>{analysis.product.unitPriceUsd ? `USD ${analysis.product.unitPriceUsd.toFixed(2)}` : 'No verificado'}</b></div>
        <div><span>MOQ</span><b>{analysis.product.moq ? `${analysis.product.moq} u.` : 'Estimado'}</b></div>
        <div><span>Peso logístico</span><b>{analysis.product.packedWeightKg.toFixed(2)} kg/u.</b></div>
        <div><span>Volumen</span><b>{analysis.product.volumeCbm.toFixed(3)} m³/u.</b></div>
      </div>
      <details className="assumptions"><summary>Ver supuestos y calidad de datos</summary><ul>{analysis.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></details>
    </div>}
  </section>
}
