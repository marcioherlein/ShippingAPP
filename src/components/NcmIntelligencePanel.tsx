import React, { useMemo } from 'react'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import { buildProductRequirements } from '../lib/productRequirements'

const statusLabels = { pass: 'OK', blocker: 'BLOQUEA', verify: 'VERIFICAR', info: 'INFO' }
const sourceUrls = {
  ARCA: 'https://serviciosweb.afip.gob.ar/aduana/arancelintegrado/default.asp',
  CIVUCE: 'https://www.argentina.gob.ar/vuce/que-es-civuce',
  VUCE: 'https://www.argentina.gob.ar/vuce',
}

export default function NcmIntelligencePanel({ analysis }: { analysis: ProductAnalysisV2 }) {
  const customs = analysis.customs
  const requirements = useMemo(() => buildProductRequirements(customs, analysis.product.originCountry), [customs, analysis.product.originCountry])
  const fullCatalog = customs.catalogScope.includes('Full ARCA snapshot')

  return <section className="regulatory-section">
    <section className="regulatory-card">
      <div className="reg-card-head">
        <div><span className="eyebrow">NCM Intelligence · MVP 1.1</span><h2>{customs.ncmCandidate ? `NCM candidata ${customs.ncmCandidate}` : 'Clasificación todavía no resuelta'}</h2></div>
        <span className={`confidence ${customs.classificationConfidence === 'high' ? 'good' : 'warning'}`}>{customs.classificationConfidence.toUpperCase()}</span>
      </div>
      <p className="reg-intro">{fullCatalog
        ? 'La búsqueda se ejecutó contra la snapshot completa cargada del nomenclador ARCA. La IA sólo puede reordenar una shortlist de códigos existentes: no puede crear una NCM. Esta capa resuelve candidatos; aranceles, aperturas SIM fuera del seed especializado e intervenciones se validan por separado.'
        : 'El full-catalog no amplió la clasificación y ShippingAPP conserva el clasificador seed fail-closed. La salida sigue siendo screening, no una clasificación vinculante.'}</p>

      <div className="fact-grid">
        <div><span>Descripción NCM</span><b>{customs.description || 'Sin posición candidata'}</b></div>
        <div><span>Apertura SIM candidata</span><b>{customs.simOpeningCandidate ? `${customs.simOpeningCandidate.code} · ${customs.simOpeningCandidate.description}` : 'No hidratada / no resuelta'}</b></div>
        <div><span>Derecho candidato</span><b>{customs.dutyRatePct === null ? 'Pendiente de validación tarifaria' : `${customs.dutyRatePct}% · screening`}</b></div>
        <div><span>Fuente NCM</span><b>ARCA · snapshot {customs.catalogSourceDate}</b></div>
        <div><span>Intervenciones</span><b>VERIFICAR CIVUCE</b></div>
      </div>

      {customs.rationale.length > 0 && <div className="assumptions"><b>Por qué llegó acá</b><ul>{customs.rationale.map((item) => <li key={item}>{item}</li>)}</ul></div>}
      {customs.missingFacts.length > 0 && <div className="analysis-banner"><b>Datos que mejorarían la clasificación:</b> {customs.missingFacts.join(' · ')}</div>}

      {customs.alternatives.length > 0 && <div className="docs-list">
        {customs.alternatives.map((candidate) => <div className="doc-row" key={candidate.code}><span>Alternativa</span><div><b>{candidate.code} · {candidate.description}</b><p>Score relativo {candidate.score}. Se conserva como alternativa para revisión; no se usa en el landed cost mientras no sea el candidato principal con evidencia suficiente.</p></div><i>○</i></div>)}
      </div>}

      <div className="source-links">
        <a href={sourceUrls.ARCA} target="_blank" rel="noreferrer">ARCA Arancel Integrado ↗</a>
        <a href={sourceUrls.CIVUCE} target="_blank" rel="noreferrer">CIVUCE ↗</a>
      </div>
      <p className="docs-note">Cobertura de clasificación: {customs.catalogScope}. La snapshot global no contiene semántica tarifaria ni aperturas SIM; no confundir cobertura NCM con cobertura completa de requisitos.</p>
    </section>

    <section className="regulatory-card">
      <div className="reg-card-head"><div><span className="eyebrow">Requirements Intelligence</span><h2>Qué hay que resolver para esta mercadería</h2></div></div>
      <p className="reg-intro">La NCM dispara búsquedas y verificaciones; no demuestra por sí sola que una intervención, prohibición o reglamento técnico aplique o no. ShippingAPP mantiene en VERIFICAR lo que CIVUCE todavía no fue consultado de forma estructurada.</p>
      <div className="requirement-groups">
        <div className="requirement-group">
          {requirements.map((item) => <article className={`requirement ${item.status}`} key={item.id}>
            <span className="status-chip">{statusLabels[item.status]}</span>
            <div><b>{item.title}</b><p>{item.explanation}</p><p><strong>Próximo paso:</strong> {item.nextStep}</p><div className="source-links"><a href={sourceUrls[item.source]} target="_blank" rel="noreferrer">{item.source} ↗</a></div></div>
          </article>)}
        </div>
      </div>
    </section>
  </section>
}
