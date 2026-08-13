import React, { useState } from 'react'
import { analyzeAlibabaUrlV2, type ProductAnalysisV2 } from '../lib/productAnalysisV2'

type Props = { onAnalysis: (analysis: ProductAnalysisV2) => void; analysis?: ProductAnalysisV2 | null }

export default function UrlAnalyzer({ onAnalysis, analysis }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!url.trim()) return
    setLoading(true); setError('')
    try { onAnalysis(await analyzeAlibabaUrlV2(url.trim())) }
    catch (err) { setError(err instanceof Error ? err.message : 'No pudimos analizar ese link.') }
    finally { setLoading(false) }
  }

  return <section className="url-analyzer">
    <div className="analyzer-copy"><span className="eyebrow">Product opportunity scanner</span><h1>Pegá un producto. ShippingAPP hace el resto.</h1><p>Estimamos producto, logística, mercado y requisitos de importación antes de comprar.</p></div>
    <form className="url-form" onSubmit={submit}><div className="url-input-wrap"><input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Pegá un link de Alibaba" /><button type="submit" disabled={loading}>{loading ? 'Analizando…' : 'Analizar'}</button></div>{error && <p className="analyzer-error">{error}</p>}</form>
    {loading && <div className="analysis-progress"><b>Construyendo business case…</b><span>Extrayendo producto, estimando logística y resolviendo clasificación soportada.</span></div>}
    {analysis && !loading && <div className="extraction-card">
      <div className="extraction-top"><div><span className="eyebrow">Producto detectado</span><h2>{analysis.product.name}</h2><p>{analysis.product.category} · {analysis.product.originCountry}</p></div><span className="confidence">{analysis.confidence.overall}% confidence</span></div>
      <div className="fact-grid"><div><span>Precio proveedor</span><b>{analysis.product.unitPriceUsd ? `USD ${analysis.product.unitPriceUsd.toFixed(2)}` : 'No verificado'}</b></div><div><span>MOQ</span><b>{analysis.product.moq ? `${analysis.product.moq} u.` : 'Estimado'}</b></div><div><span>NCM candidato</span><b>{analysis.customs.ncmCandidate || 'Pendiente'}</b></div><div><span>Derecho candidato</span><b>{analysis.customs.dutyRatePct !== null ? `${analysis.customs.dutyRatePct}%` : 'Pendiente'}</b></div></div>
      <div className="customs-note"><b>{analysis.customs.dutyRateStatus === 'candidate' ? 'Clasificación para screening' : 'Clasificación pendiente'}</b><span>{analysis.customs.source} · Revisado {analysis.customs.reviewedAt}. Intervenciones: verificar en CIVUCE/VUCE.</span></div>
      <details className="assumptions"><summary>Ver supuestos y calidad de datos</summary><ul>{analysis.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></details>
    </div>}
  </section>
}
