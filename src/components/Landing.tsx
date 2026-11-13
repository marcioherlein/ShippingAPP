import { useRef } from 'react'
import AccountControls from '../auth/AccountControls'
import CalculatorSteps from './CalculatorSteps'
import ProductEntry, { type PreparedProduct } from './ProductEntry'
import UiIcon from './UiIcon'

type Props = { onStart: () => void; onProduct?: (product: PreparedProduct) => void }

export default function Landing({ onStart, onProduct }: Props) {
  const help = useRef<HTMLDetailsElement>(null)
  return <main className="workspace-landing calculator-landing" id="home">
    <a className="skip-to-quote" href="#landing-content">Ir al contenido</a>
    <div className="calculator-header-surface">
      <header className="app-header">
        <a className="app-wordmark" href="#home" aria-label="GlobalShipping inicio"><span className="workspace-brand-symbol"><UiIcon name="brand" size={21} /></span>GlobalShipping<span className="workspace-brand-dot">.</span></a>
        <nav className="calculator-landing-nav" aria-label="Navegación principal">
          <a href={onProduct ? '#elegir-producto' : '#landing-content'} aria-current="page">Calculadora</a>
          <a href="#como-funciona" onClick={() => { if (help.current) help.current.open = true }}>Cómo funciona</a>
        </nav>
        <div className="app-header-account">
          <span className="calculator-destination"><span className="calculator-flag" aria-hidden="true" />Argentina <small>USD</small></span>
          <AccountControls destination="workspace" />
        </div>
      </header>
    </div>
    <div className="calculator-shell">
      <section className="calculator-hero" id="landing-content" tabIndex={-1}>
        <div className="calculator-hero-copy">
          <p className="calculator-hero-label">Calculadora de importación</p>
          <h1>Calculá cuánto te<br className="calculator-hero-break" /> cuesta <em>importar.</em></h1>
          <p>Compará courier, aéreo y marítimo LCL. Estimá el costo por unidad y decidí cuántas traer.</p>
          {onProduct
            ? <a className="calculator-hero-cta" href="#elegir-producto" onClick={() => document.querySelector<HTMLElement>('#elegir-producto h2')?.focus({ preventScroll: true })}>Empezar cálculo <UiIcon name="arrow-right" size={17} /></a>
            : <button className="calculator-hero-cta" type="button" onClick={onStart}>Retomar mi cálculo <UiIcon name="arrow-right" size={17} /></button>}
        </div>
      </section>
      {onProduct && <><CalculatorSteps current={1} /><ProductEntry onProduct={onProduct} /></>}
      <details ref={help} className="calculator-how" id="como-funciona">
        <summary>Cómo funciona</summary>
        <ol>
          <li>Elegí un producto o completá la ficha con tus datos.</li>
          <li>Confirmá el perfil de importación, el precio del proveedor y el embalaje.</li>
          <li>Revisá la clasificación y las tarifas antes de calcular.</li>
          <li>Compará costo por unidad, inversión total y alternativas de compra.</li>
        </ol>
      </details>
      <footer className="calculator-footer">
        <b>GlobalShipping.</b>
        <nav aria-label="Páginas legales"><a href="/privacidad.html">Política de Privacidad</a><a href="/terminos.html">Términos de Uso</a></nav>
      </footer>
    </div>
  </main>
}
