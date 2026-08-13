import React, { useMemo, useState } from 'react'
import ProductPanel from './components/ProductPanel'
import MarketPanel from './components/MarketPanel'
import LogisticsPanel from './components/LogisticsPanel'
import ImportPanel from './components/ImportPanel'
import Recommendation from './components/Recommendation'
import ScenarioTable from './components/ScenarioTable'
import { demoInputs } from './data/demo'
import { bestPerQuantity, calculate, recommend } from './lib/optimizer'

export default function App() {
  const [inputs, setInputs] = useState(demoInputs)
  const [product, setProduct] = useState('Paleta de pádel OEM carbon')
  const results = useMemo(() => calculate(inputs), [inputs])
  const rows = useMemo(() => bestPerQuantity(results), [results])
  const selected = useMemo(() => recommend(results), [results])

  return <main>
    <header className="topbar"><a className="brand" href="#">Shipping<span>APP</span></a><span className="mvp-badge">MVP 0.1</span></header>
    <section className="hero">
      <div><span className="eyebrow">Import opportunity analyzer</span><h1>¿Conviene importar este producto?</h1><p>Compará cantidades, transporte, landed cost y margen antes de comprometer capital.</p></div>
      <button className="secondary" onClick={() => setInputs(demoInputs)}>Restaurar demo</button>
    </section>
    <div className="demo-banner"><b>Datos de demostración.</b> No son una cotización de flete ni una determinación aduanera.</div>
    <div className="workspace">
      <aside className="inputs-column">
        <label className="product-name"><span>Producto</span><input value={product} onChange={(e) => setProduct(e.target.value)} /></label>
        <ProductPanel inputs={inputs} setInputs={setInputs} />
        <MarketPanel inputs={inputs} setInputs={setInputs} />
        <LogisticsPanel inputs={inputs} setInputs={setInputs} />
        <ImportPanel inputs={inputs} setInputs={setInputs} />
      </aside>
      <section className="results-column">
        <div className="sticky-results"><div className="result-heading"><span className="eyebrow">Business case</span><h2>{product || 'Producto sin nombre'}</h2></div><Recommendation result={selected} /></div>
        <ScenarioTable rows={rows} selected={selected} />
        <section className="method-card"><h3>Cómo se calcula el score</h3><p>Margen 40% · eficiencia del capital 30% · inventario 20% · capacidad de financiar la operación 10%.</p><p>La recomendación es una heurística de decisión del MVP y no sustituye validación comercial, aduanera o fiscal.</p></section>
      </section>
    </div>
  </main>
}
