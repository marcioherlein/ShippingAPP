import React, { useMemo } from 'react'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import type { NcmClarificationOption } from '../lib/ncmClarificationClient'
import { buildProductRequirements } from '../lib/productRequirements'

const statusLabels = { pass: 'OK', blocker: 'BLOQUEA', verify: 'VERIFICAR', info: 'INFO' }
const sourceUrls = {
  ARCA: 'https://serviciosweb.afip.gob.ar/aduana/arancelintegrado/default.asp',
  CIVUCE: 'https://www.argentina.gob.ar/vuce/que-es-civuce',
  VUCE: 'https://www.argentina.gob.ar/vuce',
}

type Props = {
  analysis: ProductAnalysisV2
  onClarify?: (option: NcmClarificationOption) => void | Promise<void>
  clarifying?: boolean
  clarificationError?: string | null
}

export default function NcmIntelligencePanel({ analysis, onClarify, clarifying = false, clarificationError = null }: Props) {
  const customs = analysis.customs
  const requirements = useMemo(() => buildProductRequirements(customs, analysis.product.originCountry), [customs, analysis.product.originCountry])
  const fullCatalog = customs.catalogScope.includes('Full ARCA snapshot')
  const simConfidence = customs.simOpeningConfidence ?? 'missing'
  const simCandidate = customs.simOpeningCandidate
  const clarification = analysis.ncmClarification
  const simLabel = simCandidate
    ? `${simCandidate.code} · ${simCandidate.description}`
    : simConfidence === 'low'
      ? 'Pendiente por conflicto / baja confianza'
      : 'No resuelta automáticamente'

  return <section className="regulatory-section">
    <section className="regulatory-card">
      <div className="reg-card-head">
        <div><span className="eyebrow">NCM + SIM Intelligence · MVP 1.2</span><h2>{customs.ncmCandidate ? `NCM candidata ${customs.ncmCandidate}` : 'Clasificación todavía no resuelta'}</h2></div>
        <span className={`confidence ${customs.classificationConfidence === 'high' ? 'good' : 'warning'}`}>{customs.classificationConfidence.toUpperCase()}</span>
      </div>
      <p className="reg-intro">{fullCatalog
        ? 'La NCM se busca contra la snapshot completa del nomenclador ARCA. Después, ShippingAPP carga sólo el capítulo SIM correspondiente y puede reordenar exclusivamente las aperturas oficiales de esa NCM. La IA no puede crear ni cambiar códigos. NCM y SIM siguen siendo candidatos de screening; aranceles e intervenciones CIVUCE se validan por separado.'
        : 'El full-catalog no amplió la clasificación y ShippingAPP conserva el clasificador seed fail-closed. La salida sigue siendo screening, no una clasificación vinculante.'}</p>

      {clarification && <div className="ncm-clarification">
        <div className="ncm-clarification-head"><span>Confirmación necesaria · pregunta {clarification.round} de 3</span><b>Antes de calcular aranceles</b></div>
        <h3>{clarification.question}</h3>
        <p>{clarification.reason}</p>
        <div className="ncm-clarification-options">
          {clarification.options.map((option) => <button
            type="button"
            className="secondary"
            key={option.id}
            disabled={clarifying || !onClarify}
            onClick={() => onClarify?.(option)}
          >{clarifying ? 'Reclasificando…' : option.label}</button>)}
        </div>
        <small>ShippingAPP incorpora tu respuesta como evidencia y vuelve a clasificar. Si después de tres preguntas sigue habiendo ambigüedad, no inventa una tarifa.</small>
      </div>}

      {!clarification && analysis.ncmClarificationAnswers.length >= 3 && customs.classificationConfidence === 'low' && <div className="analysis-banner"><b>Revisión necesaria:</b> la clasificación sigue con baja confianza después de tres aclaraciones. El landed cost automático permanece bloqueado hasta una revisión de NCM.</div>}
      {clarificationError && <div className="analysis-banner"><b>No pudimos aplicar la aclaración:</b> {clarificationError}</div>}

      <div className="fact-grid">
        <div><span>Descripción NCM</span><b>{customs.description || 'Sin posición candidata'}</b></div>
        <div><span>Apertura SIM candidata</span><b>{simLabel}</b><small>{simCandidate ? `${simConfidence.toUpperCase()} confidence · VERIFICAR` : 'VERIFICAR antes de declarar'}</small></div>
        <div><span>Derecho candidato</span><b>{customs.dutyRatePct === null ? 'Pendiente de validación tarifaria' : `${customs.dutyRatePct}% · screening`}</b></div>
        <div><span>Fuente NCM/SIM</span><b>ARCA · snapshot {customs.catalogSourceDate}</b></div>
        <div><span>Intervenciones</span><b>VERIFICAR CIVUCE</b></div>
      </div>

      {customs.simSource && <div className="analysis-banner"><b>Evidencia SIM:</b> {customs.simSource}</div>}
      {customs.simAlternatives && customs.simAlternatives.length > 0 && <div className="docs-list">
        {customs.simAlternatives.map((opening) => <div className="doc-row" key={opening.code}><span>SIM alternativa</span><div><b>{opening.code} · {opening.description}</b><p>Existe dentro de la misma NCM candidata. No se usa como apertura declarativa mientras no sea la candidata principal con evidencia suficiente.</p></div><i>○</i></div>)}
      </div>}

      {customs.rationale.length > 0 && <div className="assumptions"><b>Por qué llegó acá</b><ul>{customs.rationale.map((item) => <li key={item}>{item}</li>)}</ul></div>}
      {customs.missingFacts.length > 0 && <div className="analysis-banner"><b>Datos que mejorarían la clasificación:</b> {customs.missingFacts.join(' · ')}</div>}

      {customs.alternatives.length > 0 && <div className="docs-list">
        {customs.alternatives.map((candidate) => <div className="doc-row" key={candidate.code}><span>NCM alternativa</span><div><b>{candidate.code} · {candidate.description}</b><p>Score relativo {candidate.score}. Se conserva como alternativa para revisión; no se usa en el landed cost mientras no sea el candidato principal con evidencia suficiente.</p></div><i>○</i></div>)}
      </div>}

      <div className="source-links">
        <a href={sourceUrls.ARCA} target="_blank" rel="noreferrer">ARCA Arancel Integrado ↗</a>
        <a href={sourceUrls.CIVUCE} target="_blank" rel="noreferrer">CIVUCE ↗</a>
      </div>
      <p className="docs-note">Cobertura: {customs.catalogScope}. La hidratación SIM usa assets oficiales por capítulo y no contiene campos tarifarios. Tener NCM/SIM candidata no equivale a conocer el derecho, intervenciones, prohibiciones o reglamentos aplicables.</p>
    </section>

    <section className="regulatory-card">
      <div className="reg-card-head"><div><span className="eyebrow">Requirements Intelligence</span><h2>Qué hay que resolver para esta mercadería</h2></div></div>
      <p className="reg-intro">La NCM y su apertura SIM mejoran la precisión de la consulta, pero no demuestran por sí solas que una intervención, prohibición o reglamento técnico aplique o no. ShippingAPP mantiene en VERIFICAR lo que CIVUCE todavía no fue consultado de forma estructurada.</p>
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
