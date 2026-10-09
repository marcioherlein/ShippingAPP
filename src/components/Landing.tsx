import React, { useEffect, useState } from 'react'

type Props = { onStart: () => void }

export default function Landing({ onStart }: Props) {
  const [navScrolled, setNavScrolled] = useState(false)

  const scrollToHow = () => {
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    document.getElementById('como-funciona')?.scrollIntoView({ behavior, block: 'start' })
  }

  // Frosted-glass nav on scroll
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 48)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Scroll-reveal IntersectionObserver
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.gs-reveal')
    if (!('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('is-visible'))
      return
    }
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible')
          observer.unobserve(e.target)
        }
      }),
      { threshold: 0.14 }
    )
    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <main className="gs-landing" id="home">

      {/* ── Frosted-glass nav ── */}
      <header className={`gs-nav${navScrolled ? ' gs-nav--scrolled' : ''}`} role="banner">
        <div className="gs-nav__inner">
          <a className="gs-brand" href="#home" aria-label="GlobalShipping inicio">
            <span>Global<b>Shipping</b></span>
          </a>
          <button type="button" className="gs-nav__cta" onClick={onStart}>
            Calculá ahora →
          </button>
        </div>
      </header>

      {/* ── Dark cinematic hero ── */}
      <section className="gs-hero" aria-label="Hero">

        {/* Background: orbs + scrim + grain + grid */}
        <div className="gs-hero__bg" aria-hidden="true">
          <div className="gs-orb gs-orb--1" />
          <div className="gs-orb gs-orb--2" />
          <div className="gs-orb gs-orb--3" />
          <div className="gs-hero__scrim" />
          <div className="gs-hero__grain" />
          <div className="gs-hero__grid" />
        </div>

        <div className="gs-hero__inner">
          {/* Eyebrow badge */}
          <div className="gs-hero__badge" role="status">
            <span className="gs-hero__badge-dot" aria-hidden="true" />
            Calculadora de importaci&#xF3;n · Argentina
          </div>

          {/* Headline — Playfair Display */}
          <h1 className="gs-hero__headline">
            Conocé el costo real de tu producto <em>puesto en Argentina.</em>
          </h1>

          <p className="gs-hero__sub">
            Clasificaci&#xF3;n NCM autom&#xE1;tica, aranceles reales e IVA importaci&#xF3;n calculados en menos de 2 minutos.
          </p>

          {/* CTAs */}
          <div className="gs-hero__actions">
            <button type="button" className="gs-btn-primary" onClick={onStart}>
              Calcul&#xE1; ahora
              <svg width="16" height="16" aria-hidden="true" fill="none" viewBox="0 0 20 20">
                <path d="M4 10h12M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button type="button" className="gs-btn-secondary" onClick={scrollToHow}>
              Ver c&#xF3;mo funciona
            </button>
          </div>

          {/* Glass stats */}
          <div className="gs-hero__stats" role="list" aria-label="Métricas del producto">
            <div className="gs-stat" role="listitem">
              <span className="gs-stat__value">10.504</span>
              <span className="gs-stat__label">posiciones NCM</span>
            </div>
            <div className="gs-stat-divider" aria-hidden="true" />
            <div className="gs-stat" role="listitem">
              <span className="gs-stat__value">+1.200</span>
              <span className="gs-stat__label">consultas calculadas</span>
            </div>
            <div className="gs-stat-divider" aria-hidden="true" />
            <div className="gs-stat" role="listitem">
              <span className="gs-stat__value">&lt;2 min</span>
              <span className="gs-stat__label">cotizaci&#xF3;n completa</span>
            </div>
          </div>
        </div>

        {/* Scroll cue */}
        <button type="button" className="gs-scroll-cue" onClick={scrollToHow} aria-label="Ver más">
          <svg width="22" height="22" fill="none" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 4v12M6 12l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Mountain wave into white section */}
        <div className="gs-hero__wave" aria-hidden="true" />
      </section>

      {/* ── Demo preview — floats up from hero bottom ── */}
      <div className="gs-demo-wrap">
        <DemoPreview onStart={onStart} />
      </div>

      {/* ── How it works ── */}
      <section className="gs-how" id="como-funciona" aria-labelledby="how-title">
        <div className="gs-how__inner">
          <h2 className="gs-how__title gs-reveal" id="how-title">
            Consegu&#xED; en 3 pasos tu costo real
          </h2>

          <div className="gs-how__steps">
            <div className="gs-how-step gs-reveal gs-reveal-d1">
              <div className="gs-how-step__number" aria-hidden="true">1</div>
              <b>Describ&#xED; tu producto</b>
              <p>Peg&#xE1; el link del proveedor, escrib&#xED; el nombre o cont&#xE1;nos qu&#xE9; quer&#xE9;s importar. Con eso arrancamos.</p>
            </div>

            <div className="gs-how-step gs-reveal gs-reveal-d2">
              <div className="gs-how-step__number" aria-hidden="true">2</div>
              <b>Clasificamos el NCM</b>
              <p>GlobalShipping identifica el c&#xF3;digo arancelario y busca los derechos, IVA e impuestos que aplican espec&#xED;ficamente a ese producto.</p>
            </div>

            <div className="gs-how-step gs-reveal gs-reveal-d3">
              <div className="gs-how-step__number" aria-hidden="true">3</div>
              <b>Obten&#xE9; el costo puesto</b>
              <p>Precio de compra + arancel + IVA importaci&#xF3;n + Ingresos Brutos + flete estimado LCL/a&#xE9;reo. Todo visible, nada inventado.</p>
            </div>
          </div>

          <div className="gs-how__cta gs-reveal">
            <button type="button" className="gs-btn-primary" onClick={onStart}>
              Empezar mi c&#xE1;lculo
              <svg width="16" height="16" aria-hidden="true" fill="none" viewBox="0 0 20 20">
                <path d="M4 10h12M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* ── Trust strip ── */}
      <div className="journey-trust-strip" role="list" aria-label="Garantías">
        <span className="journey-trust-chip" role="listitem"><span className="journey-trust-chip-check" aria-hidden="true">&#x2713;</span>Basado en NCM del MERCOSUR</span>
        <span className="journey-trust-chip" role="listitem"><span className="journey-trust-chip-check" aria-hidden="true">&#x2713;</span>Fletes Internacionales Reales</span>
        <span className="journey-trust-chip" role="listitem"><span className="journey-trust-chip-check" aria-hidden="true">&#x2713;</span>+1.000 categor&#xED;as arancelarias</span>
        <span className="journey-trust-chip" role="listitem"><span className="journey-trust-chip-check" aria-hidden="true">&#x2713;</span>C&#xE1;lculo en tiempo real</span>
      </div>

      {/* ── Dark footer ── */}
      <footer className="gs-footer" role="contentinfo">
        <div className="gs-footer__inner">
          <div>
            <a className="gs-footer__brand" href="#home" aria-label="GlobalShipping inicio">
              <span>Global<b>Shipping</b></span>
            </a>
            <p className="gs-footer__copy">&#xA9; {new Date().getFullYear()} GlobalShipping. Calculadora de costos de importaci&#xF3;n.</p>
          </div>
          <nav className="gs-footer__links" aria-label="P&#xE1;ginas legales">
            <a href="/privacidad.html">Pol&#xED;tica de Privacidad</a>
            <a href="/terminos.html">T&#xE9;rminos de Uso</a>
          </nav>
        </div>
      </footer>

      {/* ── Floating chat FAB ── */}
      <button type="button" className="gs-chat-fab" onClick={onStart} aria-label="Empezar cálculo">
        <svg width="18" height="18" aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-4.13-.888L3 21l1.338-4.07A7.91 7.91 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
          <path d="M8 12h.01M12 12h.01M16 12h.01" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"/>
        </svg>
        <span>Calcul&#xE1; ahora</span>
      </button>

    </main>
  )
}

/**
 * Static preview of a finished quote — shows a visitor what they get before
 * they start. Pure markup, no live data.
 */
function DemoPreview({ onStart }: { onStart: () => void }) {
  return (
    <button
      type="button"
      className="journey-demo gs-reveal"
      onClick={onStart}
      aria-label="Ver un ejemplo de cálculo y empezar"
    >
      <div className="journey-demo-chrome">
        <span className="journey-demo-dot" />
        <span className="journey-demo-dot" />
        <span className="journey-demo-dot" />
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
