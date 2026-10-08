import React from 'react'
import AppHeader from './AppHeader'
import { preferredScrollBehavior } from '../lib/motionPreference'

type Props = { onStart: () => void }

/**
 * Landing is its own top-level screen (not the top of the app's scroll), so the
 * primary CTA enters the tool with an instant view switch instead of an anchor
 * smooth-scroll — the main "salto" the redesign removes. "Ver cómo funciona"
 * scrolls within this screen to the steps section.
 */
export default function Landing({ onStart }: Props) {
  const scrollToHow = () => {
    document.getElementById('como-funciona')?.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' })
  }

  return <main className="journey-app journey-landing-view" id="home">
    <AppHeader />

    <section className="journey-landing-hero">
      <div className="journey-landing-ambient" aria-hidden="true" />
      <div className="journey-landing-grid" aria-hidden="true" />

      <span className="journey-landing-eyebrow">Calculadora de costo de importaci&#xF3;n</span>
      <h1 className="journey-landing-headline">Recib&#xED; el valor real de tu producto <em>puesto en Argentina.</em></h1>
      <p className="journey-landing-sub">Pod&#xE9;s calcular flete, impuestos y gastos en destino en menos de 2 minutos.</p>
      <div className="journey-landing-cta-row">
        <button type="button" className="journey-landing-cta-primary" onClick={onStart}>Calcul&#xE1; ahora <span aria-hidden="true">&#x2192;</span></button>
        <button type="button" className="journey-landing-cta-secondary" onClick={scrollToHow}>Ver c&#xF3;mo funciona</button>
      </div>

      <div className="journey-landing-stats" aria-label="M&#xE9;tricas del producto">
        <div className="journey-landing-stat">
          <span className="journey-landing-stat-value">10.504</span>
          <span className="journey-landing-stat-label">posiciones NCM</span>
        </div>
        <div className="journey-landing-stat">
          <span className="journey-landing-stat-value">+1.200</span>
          <span className="journey-landing-stat-label">consultas calculadas</span>
        </div>
        <div className="journey-landing-stat">
          <span className="journey-landing-stat-value">&lt;2 min</span>
          <span className="journey-landing-stat-label">cotizaci&#xF3;n completa</span>
        </div>
      </div>

      <DemoPreview onStart={onStart} />
    </section>

    <section className="journey-how-it-works" id="como-funciona">
      <h2 className="journey-how-it-works-title">Consegu&#xED; en 3 pasos tu costo real</h2>
      <div className="journey-how-steps">
        <div className="journey-how-step">
          <div className="journey-how-step-number">1</div>
          <b>Describ&#xED; tu producto</b>
          <p>Peg&#xE1; el link del proveedor, escrib&#xED; el nombre o cont&#xE1;nos qu&#xE9; quer&#xE9;s importar. Con eso arrancamos.</p>
        </div>
        <div className="journey-how-step">
          <div className="journey-how-step-number">2</div>
          <b>Clasificamos el NCM</b>
          <p>GlobalShipping identifica el c&#xF3;digo arancelario y busca los derechos, IVA e impuestos que aplican espec&#xED;ficamente a ese producto.</p>
        </div>
        <div className="journey-how-step">
          <div className="journey-how-step-number">3</div>
          <b>Obt&#xE9;n el costo puesto</b>
          <p>Precio de compra + arancel + IVA importaci&#xF3;n + Ingresos Brutos + flete estimado LCL/a&#xE9;reo. Todo visible, nada inventado.</p>
        </div>
      </div>
      <div className="journey-landing-cta-row journey-landing-cta-row-secondary">
        <button type="button" className="journey-landing-cta-primary" onClick={onStart}>Empezar mi c&#xE1;lculo <span aria-hidden="true">&#x2192;</span></button>
      </div>
    </section>

    <div className="journey-trust-strip">
      <span className="journey-trust-chip"><span className="journey-trust-chip-check">&#x2713;</span>Basado en NCM del MERCOSUR</span>
      <span className="journey-trust-chip"><span className="journey-trust-chip-check">&#x2713;</span>Fletes Internacionales Reales</span>
      <span className="journey-trust-chip"><span className="journey-trust-chip-check">&#x2713;</span>+1.000 categor&#xED;as arancelarias</span>
      <span className="journey-trust-chip"><span className="journey-trust-chip-check">&#x2713;</span>C&#xE1;lculo en tiempo real</span>
    </div>

    <footer className="journey-footer">
      <div className="journey-footer-left">
        <a className="journey-footer-brand" href="#home"><span>GlobalShipping</span></a>
        <p className="journey-footer-copy">&#xA9; {new Date().getFullYear()} GlobalShipping. Calculadora de costos de importaci&#xF3;n.</p>
      </div>
      <nav className="journey-footer-links" aria-label="P&#xE1;ginas legales">
        <a href="/privacidad.html">Pol&#xED;tica de Privacidad</a>
        <a href="/terminos.html">T&#xE9;rminos de Uso</a>
      </nav>
    </footer>
  </main>
}

/**
 * A calm, static preview of a finished quote — the "demo" that shows a visitor
 * what they get before they start. Pure markup (no data), styled to mirror the
 * app's result surface so the landing and the tool feel like one product.
 */
function DemoPreview({ onStart }: { onStart: () => void }) {
  return (
    <button type="button" className="journey-demo" onClick={onStart} aria-label="Ver un ejemplo de c&#xE1;lculo y empezar">
      <div className="journey-demo-chrome">
        <span className="journey-demo-dot" /><span className="journey-demo-dot" /><span className="journey-demo-dot" />
        <span className="journey-demo-chrome-label">globalshipping.app / cotizaci&#xF3;n</span>
      </div>
      <div className="journey-demo-body">
        <div className="journey-demo-head">
          <div className="journey-demo-thumb" aria-hidden="true">&#x1F3A7;</div>
          <div className="journey-demo-head-text">
            <b>Auriculares Bluetooth</b>
            <small>NCM 8518.30.00 &middot; 100 unidades</small>
          </div>
          <span className="journey-demo-badge">C&#xE1;lculo completo</span>
        </div>

        <div className="journey-demo-progress"><span /></div>

        <ul className="journey-demo-lines">
          <li><span>Precio FOB</span><b>USD 12,00</b></li>
          <li><span>Arancel de importaci&#xF3;n</span><b>USD 2,16</b></li>
          <li><span>IVA importaci&#xF3;n</span><b>USD 2,98</b></li>
          <li><span>Flete LCL + gastos</span><b>USD 3,40</b></li>
        </ul>

        <div className="journey-demo-total">
          <div>
            <small>Costo unitario puesto en Argentina</small>
            <b>USD 20,54</b>
          </div>
          <span className="journey-demo-cta" aria-hidden="true">Probarlo &#x2192;</span>
        </div>
      </div>
    </button>
  )
}
