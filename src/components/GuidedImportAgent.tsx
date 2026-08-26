import React from 'react'
import { auditImportUserPath, type ImportUxFacts } from '../lib/importUxAgent'

type GuidedImportAgentProps = {
  facts: ImportUxFacts
}

const statusLabels = {
  done: 'Completado',
  active: 'Activo',
  blocked: 'Bloqueado',
  upcoming: 'Próximo',
}

export default function GuidedImportAgent({ facts }: GuidedImportAgentProps) {
  const audit = auditImportUserPath(facts)

  return <section className="guided-import-agent" aria-labelledby="guided-import-agent-title">
    <div className="guided-agent-main">
      <div className="guided-agent-copy">
        <span className="eyebrow">UX Agent</span>
        <h2 id="guided-import-agent-title">{audit.headline}</h2>
        <p>{audit.summary}</p>
      </div>
      <div className="guided-agent-score" aria-label={`Progreso del flujo ${audit.progressPct}%`}>
        <span>{audit.progressPct}%</span>
        <small>flujo listo</small>
      </div>
    </div>

    <div className="guided-agent-next" role="status" aria-live="polite">
      <span>Próximo paso</span>
      <b>{audit.nextAction.title}</b>
      <p>{audit.nextAction.helper}</p>
      <a href={audit.nextAction.anchor}>{audit.nextAction.actionLabel}</a>
    </div>

    <ol className="guided-agent-steps" aria-label="Camino guiado de importación">
      {audit.steps.map((step) => <li className={`guided-step guided-step-${step.status}`} key={step.id}>
        <a href={step.anchor} aria-label={`${step.label}. ${step.title}. Estado: ${statusLabels[step.status]}`}>
          <span className="guided-step-index">{step.label}</span>
          <span className="guided-step-body">
            <b>{step.title}</b>
            <small>{step.helper}</small>
          </span>
          <em>{statusLabels[step.status]}</em>
        </a>
      </li>)}
    </ol>

    <div className="guided-ncm-note" id="ncm-guidance">
      <span>NCM / nomenclador</span>
      <p>{audit.ncmExplanation}</p>
    </div>
  </section>
}
