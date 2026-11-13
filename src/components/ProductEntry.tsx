import { lazy, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { readProductDraft, writeProductDraft } from '../lib/productDraft'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import type { SensitiveProductCategory } from '../lib/landedCostEngine'
import LoadingBoundary from './LoadingBoundary'
import UiIcon, { type UiIconName } from './UiIcon'

const OwnedProductIntake = lazy(() => import('./OwnedProductIntake'))
const UrlAnalyzer = lazy(() => import('./UrlAnalyzer'))

export type PreparedProduct = {
  intent: 'have_product' | 'search_product'
  analysis: ProductAnalysisV2
  sensitiveCategory?: SensitiveProductCategory
}

type Method = 'link' | 'search' | 'form'
const methods: { id: Method; label: string; icon: UiIconName }[] = [
  { id: 'link', label: 'Pegar enlace', icon: 'link' },
  { id: 'search', label: 'Buscar producto', icon: 'search' },
  { id: 'form', label: 'Cargar manualmente', icon: 'edit' },
]

export default function ProductEntry({ onProduct }: { onProduct: (product: PreparedProduct) => void }) {
  const [method, setMethod] = useState<Method>(() => {
    const saved = readProductDraft<Method>('entry-method')
    return methods.find(item => item.id === saved)?.id ?? 'link'
  })
  const id = useId()
  const tabList = useRef<HTMLDivElement>(null)

  useEffect(() => { writeProductDraft('entry-method', method) }, [method])

  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = methods.length - 1
    const position = { ArrowRight: (index + 1) % methods.length, ArrowLeft: (index + last) % methods.length, Home: 0, End: last }[event.key]
    if (position === undefined) return
    event.preventDefault()
    tabList.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[position]?.focus()
  }

  return <section id="elegir-producto" className="calculator-entry" aria-labelledby={id + '-title'}>
    <h2 id={id + '-title'} tabIndex={-1}>¿Qué querés importar?</h2>
    <div className="calculator-entry-card">
      <div className="calculator-tabs" role="tablist" aria-label="Forma de cargar el producto" ref={tabList}>
        {methods.map((item, index) => <button key={item.id} type="button" role="tab"
          id={id + '-' + item.id} aria-controls={id + '-panel'} aria-selected={method === item.id}
          data-method={item.id} tabIndex={method === item.id ? 0 : -1} onKeyDown={event => moveTabFocus(event, index)} onClick={() => setMethod(item.id)}>
          <UiIcon name={item.icon} size={17} />{item.label}
        </button>)}
      </div>
      <div className="calculator-entry-pane" id={id + '-panel'} role="tabpanel" aria-labelledby={id + '-' + method}>
        <LoadingBoundary label="Cargando la ficha del producto…">
          {method === 'search'
            ? <UrlAnalyzer key="search" compact deferCalculation onAnalysis={analysis => onProduct({ intent: 'search_product', analysis })}
                onManualFallback={async sourceUrl => {
                  const { createManualProductAnalysis } = await import('../lib/productConfirmation')
                  onProduct({ intent: 'search_product', analysis: createManualProductAnalysis(sourceUrl || 'manual://product') })
                }} />
            : <OwnedProductIntake key={method} entryMode={method} onManualFallback={() => {
                  setMethod('form')
                  tabList.current?.querySelector<HTMLButtonElement>('[data-method="form"]')?.focus()
                }}
                onAlibabaLink={async (url, signal) => {
                  const { ingestAlibabaUrlV2 } = await import('../lib/productAnalysisV2')
                  if (signal?.aborted) return
                  const analysis = await ingestAlibabaUrlV2(url, signal)
                  if (!signal?.aborted) onProduct({ intent: 'have_product', analysis })
                }}
                onStructuredData={async data => {
                  const { createPrefilledAnalysis } = await import('../lib/productConfirmation')
                  onProduct({ intent: 'have_product', analysis: createPrefilledAnalysis(data), sensitiveCategory: data.sensitiveCategory })
                }} />}
        </LoadingBoundary>
      </div>
    </div>
  </section>
}
