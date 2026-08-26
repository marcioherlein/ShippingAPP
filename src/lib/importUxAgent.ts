export type ImportUxStepId = 'product' | 'supplierData' | 'ncm' | 'budget' | 'calculate'

export type ImportUxStepStatus = 'done' | 'active' | 'blocked' | 'upcoming'

export type ImportUxFacts = {
  hasSelectedProduct: boolean
  hasSupplierData: boolean
  hasBudget: boolean
  hasQuantitySignal: boolean
  hasNcmCandidate: boolean
  productName?: string | null
  missingProductFacts?: string[]
}

export type ImportUxStep = {
  id: ImportUxStepId
  label: string
  title: string
  status: ImportUxStepStatus
  helper: string
  actionLabel: string
  anchor: string
}

export type ImportUxAudit = {
  headline: string
  summary: string
  nextAction: ImportUxStep
  steps: ImportUxStep[]
  ncmExplanation: string
  canCalculate: boolean
  progressPct: number
}

function missingNcmFacts(input: ImportUxFacts) {
  const fallback = ['material/composición', 'función principal', 'uso previsto']
  const facts = input.missingProductFacts?.filter(Boolean) ?? []
  return facts.length ? facts : fallback
}

export function auditImportUserPath(input: ImportUxFacts): ImportUxAudit {
  const productDone = input.hasSelectedProduct
  const supplierDone = productDone && input.hasSupplierData
  const ncmDone = supplierDone && input.hasNcmCandidate
  const budgetDone = supplierDone && input.hasBudget && input.hasQuantitySignal
  const canCalculate = supplierDone && budgetDone

  const steps: ImportUxStep[] = [
    {
      id: 'product',
      label: '01',
      title: 'Elegir producto',
      status: productDone ? 'done' : 'active',
      helper: productDone
        ? `${input.productName || 'Producto'} cargado como base.`
        : 'Elegí un hot product, buscá Alibaba o cargá proveedor propio.',
      actionLabel: productDone ? 'Producto listo' : 'Elegir producto',
      anchor: '#hot-products',
    },
    {
      id: 'supplierData',
      label: '02',
      title: 'Completar datos proveedor',
      status: !productDone ? 'blocked' : supplierDone ? 'done' : 'active',
      helper: supplierDone
        ? 'FOB, MOQ, peso y volumen ya alcanzan para simular flete.'
        : 'Faltan FOB, MOQ, peso o volumen. Sin eso no hay costo real.',
      actionLabel: supplierDone ? 'Datos listos' : 'Completar datos',
      anchor: '#quote',
    },
    {
      id: 'ncm',
      label: '03',
      title: 'Preparar NCM',
      status: !supplierDone ? 'blocked' : ncmDone ? 'done' : 'active',
      helper: ncmDone
        ? 'Hay una NCM candidata para revisar.'
        : `Para clasificar faltan: ${missingNcmFacts(input).join(', ')}.`,
      actionLabel: ncmDone ? 'NCM candidata' : 'Responder para NCM',
      anchor: '#ncm-guidance',
    },
    {
      id: 'budget',
      label: '04',
      title: 'Presupuesto y stock',
      status: !supplierDone ? 'blocked' : budgetDone ? 'done' : 'active',
      helper: budgetDone
        ? 'La app puede probar cantidades sin pasarse del presupuesto.'
        : 'Indicá presupuesto máximo y demanda estimada si la sabés.',
      actionLabel: budgetDone ? 'Presupuesto listo' : 'Cargar presupuesto',
      anchor: '#quote',
    },
    {
      id: 'calculate',
      label: '05',
      title: 'Ejecutar cálculo',
      status: canCalculate ? 'active' : 'upcoming',
      helper: canCalculate
        ? 'Ya podés calcular LCL vs Aéreo, FCL referencia y cantidad óptima.'
        : 'El cálculo final se habilita cuando producto, proveedor y presupuesto están mínimos.',
      actionLabel: canCalculate ? 'Ejecutar cálculo' : 'Todavía falta',
      anchor: '#quote',
    },
  ]

  const completed = steps.filter((step) => step.status === 'done').length + (canCalculate ? 1 : 0)
  const progressPct = Math.min(100, Math.round((completed / steps.length) * 100))
  const nextAction = steps.find((step) => step.status === 'active') ?? steps[steps.length - 1]

  return {
    headline: canCalculate ? 'Listo para calcular' : 'Asistente de importación',
    summary: canCalculate
      ? 'Ya hay datos suficientes para ejecutar la simulación y optimizar cantidad.'
      : 'La app revisa qué falta y te pide sólo el próximo dato necesario.',
    nextAction,
    steps,
    ncmExplanation: 'El nomenclador no se calcula automáticamente cuando faltan datos técnicos del producto. La clasificación NCM depende de material, función, uso y presentación. ShippingAPP debe pedir esos datos antes de sugerir una posición.',
    canCalculate,
    progressPct,
  }
}
