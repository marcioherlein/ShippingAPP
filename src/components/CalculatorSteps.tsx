import UiIcon from './UiIcon'

const labels = ['Producto', 'Datos del envío', 'Clasificación', 'Resultados'] as const

export default function CalculatorSteps({ current, progress = false }: { current: 1 | 2 | 3 | 4; progress?: boolean }) {
  const steps = <ol className="calculator-steps" aria-label={progress ? undefined : 'Pasos de la calculadora'} aria-hidden={progress || undefined}>
    {labels.map((label, index) => {
      const step = index + 1
      return <li key={label} aria-current={current === step ? 'step' : undefined} data-complete={current > step || undefined}>
        <span className="calculator-step-number" aria-hidden="true">{current > step ? <UiIcon name="check" size={14} /> : step}</span>
        <span>{label}</span>
      </li>
    })}
  </ol>
  return progress
    ? <div role="progressbar" aria-label={`Paso ${current} de 4 · ${labels[current - 1]}`} aria-valuemin={1} aria-valuemax={4} aria-valuenow={current}>{steps}</div>
    : steps
}
