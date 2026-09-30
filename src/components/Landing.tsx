import React from 'react'
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
    <header className="journey-topbar">
      <a className="journey-brand" href="#home"><span className="journey-brand-mark">G</span><span>Global<b>Shipping</b></span></a>
      <div className="journey-top-actions"><button type="button" onClick={onStart}>Calcular ahora</button></div>
    </header>

    <section className="journey-landing-hero">
      <h1 className="journey-landing-headline">Recib&#xED; el valor real de tu producto <em>puesto en Argentina.</em></h1>
      <p className="journey-landing-sub">Pod&#xE9;s calcular flete, impuestos y gastos en destino en menos de 2 minutos.</p>
      <div className="journey-landing-cta-row">
        <button type="button" className="journey-landing-cta-primary" onClick={onStart}>Calcul&#xE1; ahora <span aria-hidden="true">&#x2192;</span></button>
        <button type="button" className="journey-landing-cta-secondary" onClick={scrollToHow}>Ver c&#xF3;mo funciona</button>
      </div>
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
        <a className="journey-footer-brand" href="#home"><span className="journey-brand-mark" style={{ width: '26px', height: '26px', fontSize: '13px', borderRadius: '8px' }}>G</span><span>Global<b>Shipping</b></span></a>
        <p className="journey-footer-copy">&#xA9; {new Date().getFullYear()} GlobalShipping. Calculadora de costos de importaci&#xF3;n.</p>
      </div>
      <nav className="journey-footer-links" aria-label="P&#xE1;ginas legales">
        <a href="/privacidad.html">Pol&#xED;tica de Privacidad</a>
        <a href="/terminos.html">T&#xE9;rminos de Uso</a>
      </nav>
    </footer>
  </main>
}
