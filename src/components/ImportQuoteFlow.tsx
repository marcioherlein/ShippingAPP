import React, { useEffect, useMemo, useRef, useState } from 'react'
import { importFreightValues } from '../data/importFreightValues'
import { compareLandedCost, type ImportEntityType, type ImportPurpose, type ModeCostBreakdown, type SensitiveProductCategory, type TransportMode } from '../lib/landedCostEngine'
import { optimizeQuantity, type BuyStrategy } from '../lib/quantityOptimizer'
import { buildImporterSummary, estimateLocalPrice, type ImporterSummary } from '../lib/importerSummary'
import { mercadoLibreSearchUrl, googleShoppingArUrl } from '../lib/marketSearchLinks'
import type { QuotePrefill } from '../lib/hotProducts'
import { ars, usd } from '../lib/format'
import DsSelect from './DsSelect'
import UiIcon from './UiIcon'

const interventionLabels: Record<SensitiveProductCategory, string> = {
  unknown: 'No sé todavía',
  none: 'No requiere intervención',
  food: 'Alimentos',
  toys: 'Juguetes',
  cosmetics: 'Cosméticos',
  medicines: 'Medicamentos',
  supplements: 'Suplementos',
  plants: 'Plantas / Flores',
}

const modeLabels: Record<TransportMode, string> = {
  fcl: 'FCL referencia',
  lcl: 'LCL',
  air: 'Aéreo',
  courier: 'Courier comercial',
}

const strategyLabels: Record<BuyStrategy, string> = {
  test: 'Prueba: menor riesgo',
  normal: 'Normal: balance costo/stock',
  aggressive: 'Agresiva: bajar costo unitario',
}

const originCountries = importFreightValues.rates.map((row) => row[0])
const interventionFeeUsd = importFreightValues.expenses.lcl.extras.sensitiveProductCategory

type NumberFieldProps = {
  label: string
  hint?: string
  value: number
  min?: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}

export type JourneyQuoteSetup = {
  budgetUsd?: number
  quantity?: number
  purpose?: ImportPurpose
  entityType?: ImportEntityType
  hasImporterSignature?: 'yes' | 'no' | 'unknown'
  sensitiveCategory?: SensitiveProductCategory
}

type ImportQuoteFlowProps = {
  prefill?: QuotePrefill | null
  setup?: JourneyQuoteSetup | null
}

function NumberField({ label, hint, value, min = 0, step = 1, suffix, onChange }: NumberFieldProps) {
  return <label className="field"><span>{label}</span>{hint && <small>{hint}</small>}<div className="input-wrap"><input type="number" min={min} step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} />{suffix && <small>{suffix}</small>}</div></label>
}

function checklistSignal(ok: boolean, label: string) {
  return <span className={`ds-status-pill ${ok ? 'is-pass' : 'is-warn'}`}><UiIcon name={ok ? 'check' : 'warning'} size={14} />{ok ? 'OK' : label}</span>
}

function decisionCopy(mode: 'lcl' | 'air' | 'courier' | null, marginPct: number | null, blockers: string[]) {
  const label = mode === 'lcl' ? 'LCL' : mode === 'air' ? 'aéreo' : mode === 'courier' ? 'Courier comercial' : ''
  if (!mode) return { title: 'Completá datos', body: 'Faltan datos para comparar LCL contra aéreo.' }
  if (blockers.length) return { title: 'Faltan datos clave', body: 'El costo se calcula, pero la decisión queda abierta hasta cerrar checklist.' }
  if (marginPct === null) return { title: `Menor costo logístico: ${label}`, body: 'Esta comparación sólo elige el flete más barato. Falta un precio argentino confiable para decidir si importar es rentable.' }
  if (marginPct !== null && marginPct < 0) return { title: 'No conviene con estos datos', body: `${label} es el menor costo logístico, pero el costo unitario supera el precio local cargado.` }
  if (marginPct !== null && marginPct < 20) return { title: 'Margen débil', body: `${label} gana por costo, pero el margen rápido queda bajo para absorber errores, demoras o gastos no modelados.` }
  return { title: `Conviene ${label}`, body: `${label} es el menor costo entre las opciones accionables. FCL queda sólo como referencia.` }
}

function strategyCopy(strategy: BuyStrategy) {
  if (strategy === 'test') return 'prioriza no pasarse de presupuesto ni inmovilizar stock.'
  if (strategy === 'aggressive') return 'acepta más stock si baja el costo unitario.'
  return 'balancea costo unitario, presupuesto y meses de stock.'
}

const verdictClass: Record<string, string> = {
  excelente: 'importer-verdict importer-verdict-excelente',
  si: 'importer-verdict importer-verdict-si',
  no: 'importer-verdict importer-verdict-no',
  ajusta: 'importer-verdict importer-verdict-ajusta',
  fragil: 'importer-verdict importer-verdict-fragil',
  'sin-mercado': 'importer-verdict importer-verdict-neutral',
  'faltan-datos': 'importer-verdict importer-verdict-neutral',
}

type VerdictSignal = { label: string; title: string; detail: string; tone: 'positive' | 'warning' | 'negative' | 'neutral' }

function buildVerdictSignals(summary: ImporterSummary, quote: ReturnType<typeof compareLandedCost>, budgetUsd: number, prefill: QuotePrefill | null): VerdictSignal[] {
  const marketLive = prefill?.marketStatus === 'live' && Number(prefill.marketPriceArs) > 0
  const margin = summary.profitPct
  const commercial: VerdictSignal = margin === null
    ? { label: 'Rentabilidad', title: 'No evaluada', detail: 'Falta un precio argentino confiable.', tone: 'neutral' }
    : margin < 0
      ? { label: 'Rentabilidad', title: 'Pierde dinero', detail: `${Math.abs(margin).toFixed(0)}% de margen negativo.`, tone: 'negative' }
      : margin < 10
        ? { label: 'Rentabilidad', title: 'Margen crítico', detail: `${margin.toFixed(0)}% deja casi ningún colchón.`, tone: 'negative' }
        : margin < 20
          ? { label: 'Rentabilidad', title: 'Margen ajustado', detail: `${margin.toFixed(0)}% antes de costos no modelados.`, tone: 'warning' }
          : { label: 'Rentabilidad', title: margin >= 35 ? 'Margen fuerte' : 'Margen viable', detail: `${margin.toFixed(0)}% de margen bruto estimado.`, tone: 'positive' }

  const savings = quote.bestMode === 'courier' ? null : quote.lclVsAir.savingsUsd
  const logistics: VerdictSignal = quote.bestMode
    ? { label: 'Logística', title: quote.bestMode === 'lcl' ? 'Conviene LCL' : quote.bestMode === 'air' ? 'Conviene aéreo' : 'Conviene Courier comercial', detail: savings ? `Ahorro estimado: ${usd(savings)} frente a la alternativa.` : 'Es la opción accionable de menor costo.', tone: 'positive' }
    : { label: 'Logística', title: 'Sin comparación', detail: 'Faltan peso, volumen u origen.', tone: 'neutral' }

  const capital: VerdictSignal = budgetUsd <= 0
    ? { label: 'Capital', title: 'No evaluado', detail: `La operación requiere ${usd(summary.needsCapitalUsd)}.`, tone: 'neutral' }
    : summary.needsCapitalUsd <= budgetUsd
      ? { label: 'Capital', title: 'Entra en presupuesto', detail: `Quedan ${usd(budgetUsd - summary.needsCapitalUsd)} de margen.`, tone: 'positive' }
      : { label: 'Capital', title: 'Supera el presupuesto', detail: `Faltan ${usd(summary.needsCapitalUsd - budgetUsd)}.`, tone: 'negative' }

  const market: VerdictSignal = marketLive
    ? { label: 'Mercado argentino', title: 'Benchmark confirmado', detail: `${prefill?.marketComparableCount || 0} comparables${prefill?.marketConfidence !== null && prefill?.marketConfidence !== undefined ? ` · confianza ${prefill.marketConfidence}%` : ''}.`, tone: 'positive' }
    : summary.sellPriceUsd !== null
      ? { label: 'Mercado argentino', title: 'Estimación, no es un benchmark', detail: 'Usamos un precio local estimado (×1.6 sobre el costo puesto). Verificá con las búsquedas antes de decidir.', tone: 'warning' }
      : { label: 'Mercado argentino', title: 'Evidencia insuficiente', detail: 'No se usa un precio local no validado para declarar rentabilidad.', tone: 'warning' }

  const customsKnown = Boolean(prefill?.ncmCode) && (prefill?.classificationConfidence === 'high' || prefill?.classificationConfidence === 'medium')
  const customs: VerdictSignal = customsKnown
    ? { label: 'Aduana', title: 'Clasificación disponible', detail: 'Aranceles incorporados al cálculo.', tone: 'positive' }
    : prefill?.provisional
      ? { label: 'Aduana', title: 'Clasificación estimada', detail: 'Apliqué un arancel conservador. Verificá la posición antes de operar.', tone: 'warning' }
      : { label: 'Aduana', title: 'Requiere validación', detail: 'El costo aduanero todavía contiene supuestos.', tone: 'warning' }

  return [commercial, market, capital, logistics, customs]
}

function MarketSearchButtons({ productName }: { productName: string }) {
  return <div className="market-search-actions">
    <a className="market-search-button" href={mercadoLibreSearchUrl(productName)} target="_blank" rel="noreferrer">
      Buscar en MercadoLibre <UiIcon name="external-link" size={15} />
    </a>
    <a className="market-search-button" href={googleShoppingArUrl(productName)} target="_blank" rel="noreferrer">
      Buscar en Google Shopping <UiIcon name="external-link" size={15} />
    </a>
  </div>
}

function ArgentinaMarketCard({ prefill, localSellPriceUsd, productName }: { prefill: QuotePrefill | null; localSellPriceUsd: number; productName: string }) {
  const marketPriceArs = Number(prefill?.marketPriceArs) || 0
  const hasMarket = prefill?.marketStatus === 'live' && marketPriceArs > 0
  const fx = Number(prefill?.fxArsPerUsd) || 0
  const estimateUsd = localSellPriceUsd > 0 ? localSellPriceUsd : 0
  const estimateArs = estimateUsd > 0 && fx > 0 ? estimateUsd * fx : 0
  return <section className={`table-card argentina-market-card${hasMarket ? '' : ' market-missing'}`} aria-labelledby="argentina-market-title">
    <div className="table-title"><div><span className="eyebrow">Mercado argentino</span><h2 id="argentina-market-title">Precios encontrados en Argentina</h2></div><small>{hasMarket ? 'Evidencia vigente' : 'Estimación local (no es un benchmark)'}</small></div>
    {hasMarket ? <>
      <div className="market-price-hero"><span>Precio usado para calcular el margen</span><strong>{ars(marketPriceArs)}</strong><small>{localSellPriceUsd > 0 ? `${usd(localSellPriceUsd)} al tipo de cambio disponible` : 'Conversión USD no disponible'}</small></div>
      <div className="market-price-range">
        <div><span>25% más barato</span><b>{prefill?.marketP25Ars ? ars(prefill.marketP25Ars) : '—'}</b></div>
        <div><span>Precio mediano</span><b>{prefill?.marketMedianArs ? ars(prefill.marketMedianArs) : '—'}</b></div>
        <div><span>25% más caro</span><b>{prefill?.marketP75Ars ? ars(prefill.marketP75Ars) : '—'}</b></div>
      </div>
      {prefill?.marketComparables?.length ? <div className="market-comparables"><h3>Publicaciones comparables</h3>{prefill.marketComparables.map((item) => item.permalink
        ? <a key={item.id} href={item.permalink} target="_blank" rel="noreferrer"><span>{item.title}</span><b>{ars(item.priceArs)}</b></a>
        : <div key={item.id}><span>{item.title}</span><b>{ars(item.priceArs)}</b></div>)}</div> : null}
      <p className="market-provenance"><b>{prefill?.marketComparableCount || 0} comparables aceptados</b>{prefill?.marketConfidence !== null && prefill?.marketConfidence !== undefined ? ` · confianza ${prefill.marketConfidence}%` : ''}<br />Fuente: {prefill?.marketSource || 'mercado argentino'}{prefill?.fxSourceDate ? ` · tipo de cambio ${prefill.fxSourceDate}` : ''}</p>
    </> : <div className="market-estimate">
      <p className="market-estimate-lead">No pudimos traer precios comparables automáticamente. Buscá el producto en Argentina en dos clics y compará con la estimación:</p>
      <MarketSearchButtons productName={productName} />
      {estimateUsd > 0 ? <div className="market-price-hero market-estimate-hero">
        <span>Precio local estimado (no verificado)</span>
        <strong>{estimateArs > 0 ? ars(estimateArs) : usd(estimateUsd)}</strong>
        <small>Costo puesto × margen típico de reventa (×1.6){estimateArs > 0 ? ` · ${usd(estimateUsd)} al tipo de cambio disponible` : ''}. Verificá con las búsquedas de arriba.</small>
      </div> : null}
      <p className="market-estimate-note">Precargamos este valor en el campo editable “Precio venta local” de los supuestos. Reemplazalo cuando tengas un precio real.</p>
    </div>}
  </section>
}

function perUnit(value: number, quantity: number) {
  return quantity > 0 ? value / quantity : 0
}

function unitBreakdown(mode: ModeCostBreakdown, quantity: number) {
  return [
    ['Producto FOB', perUnit(mode.fobUsd, quantity)],
    ['Flete internacional', perUnit(mode.freightCostUsd, quantity)],
    ['Derecho de importación', perUnit(mode.dutyUsd, quantity)],
    ['Tasa estadística', perUnit(mode.statisticsUsd, quantity)],
    ['IVA', perUnit(mode.vatUsd, quantity)],
    ['IVA adicional', perUnit(mode.vatAdditionalUsd, quantity)],
    ['Percepción Ganancias', perUnit(mode.gainsUsd, quantity)],
    ['Percepción IIBB', perUnit(mode.iibbUsd, quantity)],
    ['Gastos destino', perUnit(mode.fixedDestinationUsd, quantity)],
    ['Costo firma/importador', perUnit(mode.noImporterSignatureUsd, quantity)],
    ['Trámite de intervención', perUnit(mode.sensitiveCategoryUsd, quantity)],
  ] as const
}

export default function ImportQuoteFlow({ prefill = null, setup = null }: ImportQuoteFlowProps) {
  const [productName, setProductName] = useState(prefill?.productName ?? '')
  const [originCountry, setOriginCountry] = useState(prefill?.originCountry ?? 'China')
  const [quantity, setQuantity] = useState(setup?.quantity ?? prefill?.quantity ?? 100)
  const [unitPriceUsd, setUnitPriceUsd] = useState(prefill?.unitPriceUsd ?? 0)
  const [unitWeightKg, setUnitWeightKg] = useState(prefill?.unitWeightKg ?? 0)
  const [unitVolumeCbm, setUnitVolumeCbm] = useState(prefill?.unitVolumeCbm ?? 0)
  const [dutyRatePct, setDutyRatePct] = useState(prefill?.dutyRatePct ?? 16)
  const [statisticsRatePct, setStatisticsRatePct] = useState(prefill?.statisticsRatePct ?? 3)
  const [vatRatePct, setVatRatePct] = useState(prefill?.vatRatePct ?? 21)
  const [vatAdditionalRatePct, setVatAdditionalRatePct] = useState(prefill?.vatAdditionalRatePct ?? 20)
  const [gainsRatePct, setGainsRatePct] = useState(prefill?.gainsRatePct ?? 6)
  const [iibbRatePct, setIibbRatePct] = useState(prefill?.iibbRatePct ?? 2.5)
  const [localSellPriceUsd, setLocalSellPriceUsd] = useState(prefill?.localSellPriceUsd ?? 0)
  const [budgetUsd, setBudgetUsd] = useState(setup?.budgetUsd ?? prefill?.budgetUsd ?? 0)
  const [moq, setMoq] = useState(prefill?.moq ?? 1)
  const [monthlyDemand, setMonthlyDemand] = useState(prefill?.monthlyDemand ?? 0)
  const [strategy, setStrategy] = useState<BuyStrategy>('normal')
  const [purpose, setPurpose] = useState<ImportPurpose>(setup?.purpose ?? 'unknown')
  const [entityType, setEntityType] = useState<ImportEntityType>(setup?.entityType ?? 'unknown')
  const [hasImporterSignature, setHasImporterSignature] = useState<'yes' | 'no' | 'unknown'>(setup?.hasImporterSignature ?? 'unknown')
  const [sensitiveCategory, setSensitiveCategory] = useState<SensitiveProductCategory>(setup?.sensitiveCategory ?? prefill?.sensitiveCategory ?? 'unknown')
  const capitalGoodEligible = prefill?.capitalGoodEligible ?? false
  const [capitalGoodUse, setCapitalGoodUse] = useState(false)

  const landedInput = {
    originCountry,
    quantity,
    unitPriceUsd,
    unitWeightKg,
    unitVolumeCbm,
    dutyRatePct,
    statisticsRatePct,
    vatRatePct,
    vatAdditionalRatePct,
    gainsRatePct,
    iibbRatePct,
    purpose,
    entityType,
    hasImporterSignature: hasImporterSignature === 'unknown' ? null : hasImporterSignature === 'yes',
    sensitiveCategory,
    capitalGoodEligible,
    capitalGoodUse,
  }

  const quote = useMemo(() => compareLandedCost(landedInput), [originCountry, quantity, unitPriceUsd, unitWeightKg, unitVolumeCbm, dutyRatePct, statisticsRatePct, vatRatePct, vatAdditionalRatePct, gainsRatePct, iibbRatePct, purpose, entityType, hasImporterSignature, sensitiveCategory, capitalGoodEligible, capitalGoodUse])

  const optimizer = useMemo(() => optimizeQuantity({
    ...landedInput,
    budgetUsd,
    moq,
    monthlyDemand,
    strategy,
    localSellPriceUsd,
  }), [originCountry, quantity, unitPriceUsd, unitWeightKg, unitVolumeCbm, dutyRatePct, statisticsRatePct, vatRatePct, vatAdditionalRatePct, gainsRatePct, iibbRatePct, purpose, entityType, hasImporterSignature, sensitiveCategory, capitalGoodEligible, capitalGoodUse, budgetUsd, moq, monthlyDemand, strategy, localSellPriceUsd])

  const lcl = quote.modes.lcl
  const air = quote.modes.air
  const courier = quote.modes.courier
  const fcl = quote.modes.fcl
  const winner = quote.bestMode ? quote.modes[quote.bestMode] : null
  const marginPct = winner && localSellPriceUsd > 0 ? ((localSellPriceUsd - winner.unitCostUsd) / localSellPriceUsd) * 100 : null
  const decision = decisionCopy(quote.bestMode, marginPct, quote.checklist.blockers)
  const quantityRecommendation = optimizer.recommendation
  const topCandidates = optimizer.candidates.slice(0, 5)
  const breakdown = winner ? unitBreakdown(winner, quantity) : []

  const marketLive = prefill?.marketStatus === 'live' && Number(prefill?.marketPriceArs) > 0
  const marketIsEstimate = !marketLive

  // Decision 4: with no live benchmark, pre-fill the editable local price with a labeled estimate
  // (landed cost × typical resale markup) ONCE, so the user sees a usable margin instead of a dead
  // field. They can override it afterwards; we never auto-refill after that first fill.
  const estimateAutofilled = useRef(false)
  useEffect(() => {
    if (estimateAutofilled.current || marketLive || localSellPriceUsd > 0 || !winner) return
    const est = estimateLocalPrice(winner.unitCostUsd, prefill?.fxArsPerUsd)
    if (est && est > 0) {
      estimateAutofilled.current = true
      setLocalSellPriceUsd(est)
    }
  }, [marketLive, localSellPriceUsd, winner, prefill])

  const summary = useMemo(() => buildImporterSummary(quote, quantity, localSellPriceUsd, optimizer, marketIsEstimate), [quote, quantity, localSellPriceUsd, optimizer, marketIsEstimate])
  const verdictSignals = useMemo(() => buildVerdictSignals(summary, quote, budgetUsd, prefill), [summary, quote, budgetUsd, prefill])

  return <section className="manual-quote-shell journey-quote-shell">
    <div className="table-title journey-quote-title">
      <div><span className="eyebrow">Resultado calculado</span><h2>Costo unitario primero. Optimización después.</h2></div>
      <small>{prefill?.sourceLabel ?? importFreightValues.meta.source}</small>
    </div>

    {prefill && <div className="analysis-banner hot-prefill-banner"><b>Datos precargados desde el pipeline.</b> NCM, aranceles, costos de trámite y datos físicos alimentan el motor; podés revisar cualquier supuesto antes de decidir.</div>}

    {prefill?.ncmCode && <section className="quote-customs-evidence">
      <div><span className="eyebrow">Clasificación usada</span><h3>Aranceles aplicados</h3><p>Clasificación y aranceles aplicados automáticamente desde el nomenclador cargado.</p></div>
      <div className="quote-customs-facts">
        <span><small>Derecho</small><b>{dutyRatePct}%</b></span>
        <span><small>Tasa</small><b>{statisticsRatePct}%</b></span>
        <span><small>IVA</small><b>{vatRatePct}%</b></span>
        <span><small>Intervención</small><b>{sensitiveCategory !== 'none' && sensitiveCategory !== 'unknown' ? usd(interventionFeeUsd) : sensitiveCategory === 'unknown' ? 'Pendiente' : 'No aplica'}</b></span>
      </div>
      {prefill.customsMissingFacts?.length ? <p className="assumption-note">Datos pendientes de clasificación: {prefill.customsMissingFacts.slice(0, 4).join(' · ')}</p> : null}
    </section>}

    <div className="workspace manual-quote-workspace">
      <details className="inputs-column quote-assumptions">
        <summary><span><b>Revisar o corregir supuestos</b><small>Producto, operación, aranceles y optimización</small></span><em>Editar</em></summary>
        <section className="panel">
          <div className="section-heading"><span>01</span><div><h2>Producto y proveedor</h2><p>Base física y comercial usada para la simulación.</p></div></div>
          <label className="field field-wide"><span>Producto</span><input placeholder="Ej. paleta de pádel carbono" value={productName} onChange={(e) => setProductName(e.target.value)} /></label>
          <label className="field field-wide"><span>Origen</span><DsSelect ariaLabel="País de origen" value={originCountry} onChange={setOriginCountry} options={originCountries.map((country) => ({ value: country, label: country }))} /></label>
          <div className="field-grid">
            <NumberField label="Cantidad base" hint="El costo unitario de arriba corresponde a esta cantidad, no a importar literalmente 1 unidad." value={quantity} onChange={setQuantity} suffix="u." />
            <NumberField label="Precio FOB unitario" value={unitPriceUsd} onChange={setUnitPriceUsd} step={0.01} suffix="USD" />
            <NumberField label="Peso unitario" value={unitWeightKg} onChange={setUnitWeightKg} step={0.01} suffix="kg" />
            <NumberField label="Volumen unitario" value={unitVolumeCbm} onChange={setUnitVolumeCbm} step={0.001} suffix="m³" />
          </div>
        </section>

        <section className="panel journey-profile-panel">
          <div className="section-heading"><span>02</span><div><h2>Tu operación</h2><p>Viene del diálogo inicial y sigue siendo editable.</p></div></div>
          <div className="field-grid">
            <label className="field"><span>Uso</span><DsSelect ariaLabel="Uso" value={purpose} onChange={(v) => setPurpose(v as ImportPurpose)} options={[{ value: 'resale', label: 'Reventa' }, { value: 'own_use', label: 'Uso propio' }, { value: 'unknown', label: 'No sé' }]} /></label>
            <label className="field"><span>Importa como</span><DsSelect ariaLabel="Importa como" value={entityType} onChange={(v) => setEntityType(v as ImportEntityType)} options={[{ value: 'company', label: 'Empresa' }, { value: 'individual', label: 'Persona humana' }, { value: 'unknown', label: 'No sé' }]} /></label>
            <label className="field"><span>Firma/importador</span><DsSelect ariaLabel="Firma de importador" value={hasImporterSignature} onChange={(v) => setHasImporterSignature(v as 'yes' | 'no' | 'unknown')} options={[{ value: 'yes', label: 'Tiene firma' }, { value: 'no', label: 'No tiene firma' }, { value: 'unknown', label: 'No sé' }]} /></label>
            <label className="field"><span>Grupo con intervención</span><small>Alimentos, juguetes, cosméticos, medicamentos y suplementos suman automáticamente {usd(interventionFeeUsd)} por trámite a la operación.</small><DsSelect ariaLabel="Grupo con intervención" value={sensitiveCategory} onChange={(v) => setSensitiveCategory(v as SensitiveProductCategory)} options={(Object.keys(interventionLabels) as SensitiveProductCategory[]).map((key) => ({ value: key, label: interventionLabels[key] }))} /></label>
            {capitalGoodEligible && <label className="field"><span>NCM marcada Bien de Uso</span><small>Esto puede llevar tasa estadística y percepciones a 0 en el modelo.</small><DsSelect ariaLabel="NCM marcada Bien de Uso" value={capitalGoodUse ? 'yes' : 'no'} onChange={(v) => setCapitalGoodUse(v === 'yes')} options={[{ value: 'no', label: 'No aplicar tratamiento' }, { value: 'yes', label: 'Sí, se usará como Bien de Uso' }]} /></label>}
          </div>
        </section>

        <details className="panel journey-advanced-taxes">
          <summary><div className="section-heading"><span>03</span><div><h2>Aranceles del nomenclador</h2><p className={!prefill?.ncmCode ? 'tariff-default-warning' : undefined}>{prefill?.ncmCode ? 'Derivados del NCM asignado; editá sólo si tenés una validación mejor.' : '⚠ Tasas aproximadas por defecto — NCM no validado. Reemplazalas por los aranceles reales de tu producto.'}</p></div></div></summary>
          <div className="field-grid">
            <NumberField label="Derecho importación" value={dutyRatePct} onChange={setDutyRatePct} step={0.1} suffix="%" />
            <NumberField label="Tasa estadística" value={statisticsRatePct} onChange={setStatisticsRatePct} step={0.1} suffix="%" />
            <NumberField label="IVA" value={vatRatePct} onChange={setVatRatePct} step={0.1} suffix="%" />
            <NumberField label="IVA adicional" value={vatAdditionalRatePct} onChange={setVatAdditionalRatePct} step={0.1} suffix="%" />
            <NumberField label="Ganancias" value={gainsRatePct} onChange={setGainsRatePct} step={0.1} suffix="%" />
            <NumberField label="IIBB" value={iibbRatePct} onChange={setIibbRatePct} step={0.1} suffix="%" />
          </div>
        </details>

        <section className="panel">
          <div className="section-heading"><span>04</span><div><h2>Optimización</h2><p>Se ejecuta después de entender el costo base por unidad.</p></div></div>
          <div className="field-grid">
            <NumberField label="Presupuesto máximo" hint="Costo final total. 0 = todavía no definido." value={budgetUsd} onChange={setBudgetUsd} step={100} suffix="USD" />
            <NumberField label="MOQ proveedor" value={moq} onChange={setMoq} min={1} suffix="u." />
            <NumberField label="Demanda mensual" hint="Opcional; 0 si no sabés" value={monthlyDemand} onChange={setMonthlyDemand} suffix="u./mes" />
            <NumberField label="Precio venta local (USD)" hint="Se precarga desde el benchmark argentino cuando hay tipo de cambio disponible; podés reemplazarlo." value={localSellPriceUsd} onChange={setLocalSellPriceUsd} step={0.01} suffix="USD" />
            <label className="field"><span>Estrategia</span><small>{strategyCopy(strategy)}</small><DsSelect ariaLabel="Estrategia de compra" value={strategy} onChange={(v) => setStrategy(v as BuyStrategy)} options={(Object.keys(strategyLabels) as BuyStrategy[]).map((key) => ({ value: key, label: strategyLabels[key] }))} /></label>
          </div>
        </section>
      </details>

      <section className="results-column result-dossier">
        <section className="result-hero">
          <div className="result-hero-main">
            <span className="eyebrow">Costo puesto por unidad</span>
            <strong className="result-hero-number">{usd(summary.unitTotalCostUsd)}</strong>
            <small>{summary.mode ? `${summary.modeLabel} · ${quantity} u. · total ${usd(summary.totalCostUsd)}` : `${quantity} u. base`}</small>
          </div>
          <div className={`result-hero-verdict ${verdictClass[summary.verdict] ?? verdictClass['faltan-datos']}`}>
            <strong>{summary.verdictHeadline}</strong>
            <span>{summary.verdictDetail}</span>
          </div>
          {prefill?.provisional && <p className="result-hero-provisional"><UiIcon name="warning" size={15} /> Clasificación estimada{prefill.provisionalLabel ? ` · ${prefill.provisionalLabel}` : ''}. Apliqué un arancel conservador; verificá la posición antes de operar.</p>}
        </section>

        <section className="result-card">
          <div className="result-card-head"><div><span className="eyebrow">Desglose</span><h2>De FOB a tu costo final, punto por punto</h2></div>{winner && <small>{modeLabels[winner.mode]} · {quantity} u.</small>}</div>
          <div className="journey-summary-list">
            {breakdown.map(([label, value]) => <div key={label}><span>{label}</span><b>{usd(value)}</b></div>)}
            <div className="journey-summary-total"><span>Costo puesto final / unidad</span><b>{winner ? usd(winner.unitCostUsd) : usd(summary.unitTotalCostUsd)}</b></div>
          </div>
          <div className="journey-summary-list journey-summary-secondary">
            <div><span>FOB total</span><b>{winner ? usd(winner.fobUsd) : '—'}</b></div>
            <div><span>Flete total</span><b>{winner ? usd(winner.freightCostUsd) : '—'}</b></div>
            <div><span>Trámite intervención</span><b>{winner && winner.sensitiveCategoryUsd > 0 ? usd(winner.sensitiveCategoryUsd) : 'No aplica'}</b></div>
            <div><span>Gastos fijos incluidos</span><b>{usd(summary.fixedCostUsd)}</b></div>
            <div><span>Total para importar {quantity} u.</span><b>{usd(summary.totalCostUsd)}</b></div>
            <div><span>Capital necesario ahora</span><b>{usd(summary.needsCapitalUsd)}</b></div>
          </div>
          {summary.logisticsFact && <p className="result-note">{summary.logisticsFact}</p>}
          {summary.freightSignals.map((s) => <p className="result-note" key={s}><UiIcon name="info" size={14} /> {s}</p>)}
          {summary.sellPriceUsd !== null && <div className="journey-summary-list journey-summary-profit">
            <div><span>Precio local usado</span><b>{usd(summary.sellPriceUsd)}</b></div>
            <div><span>Resultado por unidad</span><b>{usd(summary.profitPerUnitUsd ?? 0)}</b></div>
            <div><span>Margen bruto</span><b>{summary.profitPct?.toFixed(0)}%</b></div>
          </div>}
        </section>

        <details className="result-card result-collapsible" open>
          <summary><span className="result-collapsible-title">Mercado argentino</span><UiIcon name="chevron-down" size={16} /></summary>
          <div className="result-collapsible-body"><ArgentinaMarketCard prefill={prefill} localSellPriceUsd={localSellPriceUsd} productName={productName} /></div>
        </details>

        <details className="result-card result-collapsible">
          <summary><span className="result-collapsible-title">Veredictos del caso</span><UiIcon name="chevron-down" size={16} /></summary>
          <div className="result-collapsible-body">
            <div className="verdict-signal-list">{verdictSignals.map((signal) => <div className={`verdict-signal verdict-signal-${signal.tone}`} key={signal.label}><span>{signal.label}</span><div><b>{signal.title}</b><p>{signal.detail}</p></div></div>)}</div>
          </div>
        </details>

        <details className="result-card result-collapsible">
          <summary><span className="result-collapsible-title">Comparativa logística de fletes e impuestos</span><UiIcon name="chevron-down" size={16} /></summary>
          <div className="result-collapsible-body">
            <section className="recommendation journey-main-result unit-result-hero">
              <div className="recommendation-top">
                <div><span className="eyebrow">Resultado base</span><strong>{winner ? `${usd(winner.unitCostUsd)} por unidad puesta` : decision.title}</strong></div>
                <div className="score"><span>Cantidad base</span><b>{quantity} u.</b></div>
              </div>
              <p className="mode">{winner ? `${productName || 'Producto'} · ${originCountry} · ${modeLabels[winner.mode]} · total de la operación ${usd(winner.totalCostUsd)}.` : decision.body}</p>
              <p className="unit-result-explainer">Este valor es el costo de <b>una unidad dentro de una importación de {quantity} unidades</b>. No simula importar una unidad aislada, porque los mínimos de flete y gastos fijos distorsionarían la decisión.</p>
            </section>

            <section className="table-card">
              <div className="table-title"><div><span className="eyebrow">Comparativa logística</span><h2>LCL, aéreo, Courier y referencia FCL</h2></div><small>{quote.origin ? `${quote.origin.region} · ${quote.origin.capital}` : quote.status}</small></div>
              <div className="table-scroll"><table><thead><tr><th>Modo</th><th>Flete</th><th>CIF</th><th>Impuestos</th><th>Gastos</th><th>Total</th><th>Unitario</th></tr></thead><tbody>{([lcl, air, courier, fcl] as const).map((mode) => {
                if (!mode.available) return <tr key={mode.mode}><td>{modeLabels[mode.mode]}</td><td colSpan={6}>{mode.reason}</td></tr>
                const taxes = mode.dutyUsd + mode.statisticsUsd + mode.vatUsd + mode.vatAdditionalUsd + mode.gainsUsd + mode.iibbUsd
                const expenses = mode.fixedDestinationUsd + mode.noImporterSignatureUsd + mode.sensitiveCategoryUsd
                const selected = winner?.mode === mode.mode
                const chargeableLabel = mode.mode === 'air' || mode.mode === 'courier' ? 'kg cobrables' : mode.mode === 'lcl' ? 'WM' : `cont. de ${mode.fclContainerSize === '20ft' ? '20′' : '40′'}`
                return <tr key={mode.mode} className={selected ? 'selected-row' : undefined}><td><b>{modeLabels[mode.mode]}</b>{selected && <em>recomendado</em>}{mode.mode === 'fcl' && <em>referencia</em>}</td><td>{usd(mode.freightCostUsd)}<br /><small>{mode.chargeableUnits} {chargeableLabel}</small>{mode.mode === 'fcl' && mode.fclOptions ? <small className="fcl-options">{mode.fclOptions.map((option) => `${option.containers}×${option.size === '20ft' ? '20′ estimado' : '40′ cotizado'}: ${usd(option.freightCostUsd)}`).join(' · ')}</small> : null}</td><td>{usd(mode.cifUsd)}</td><td>{usd(taxes)}</td><td>{usd(expenses)}</td><td><b>{usd(mode.totalCostUsd)}</b></td><td><b>{usd(mode.unitCostUsd)}</b></td></tr>
              })}</tbody></table></div>
              <div className="analysis-banner" style={{ marginTop: 16 }}><b>LCL vs Aéreo:</b> {quote.lclVsAir.cheaperMode === 'lcl' ? `LCL ahorra ${usd(quote.lclVsAir.savingsUsd || 0)} vs aéreo.` : quote.lclVsAir.cheaperMode === 'air' ? `Aéreo ahorra ${usd(quote.lclVsAir.savingsUsd || 0)} vs LCL.` : 'empate con los datos actuales.'} FCL queda como referencia de contenedor entero.</div>
            </section>
          </div>
        </details>

        <details className="result-card result-collapsible">
          <summary><span className="result-collapsible-title">Optimización de cantidad</span><UiIcon name="chevron-down" size={16} /></summary>
          <div className="result-collapsible-body">
            <section className="table-card journey-quantity-card">
              <div className="table-title"><div><span className="eyebrow">Ahora sí: optimización</span><h2>{quantityRecommendation ? `${quantityRecommendation.quantity} unidades recomendadas` : budgetUsd <= 0 ? 'Definí presupuesto para optimizar' : 'Sin recomendación'}</h2></div><small>{budgetUsd > 0 ? `Presupuesto ${usd(budgetUsd)}` : 'Presupuesto abierto'}</small></div>
              <p className="assumption-note">Primero fijamos el costo unitario de la operación base. Recién después probamos cantidades para encontrar dónde bajan flete/gastos por unidad sin romper presupuesto, MOQ o stock.</p>
              {quantityRecommendation && <>
                <div className="metric-grid">
                  <div><span>Modo recomendado</span><b>{quantityRecommendation.selectedMode === 'lcl' ? 'LCL' : quantityRecommendation.selectedMode === 'air' ? 'Aéreo' : quantityRecommendation.selectedMode === 'courier' ? 'Courier comercial' : '-'}</b></div>
                  <div><span>Costo total</span><b>{usd(quantityRecommendation.totalCostUsd)}</b></div>
                  <div><span>Costo unitario</span><b>{usd(quantityRecommendation.unitCostUsd)}</b></div>
                  <div><span>Volumen estimado</span><b>{quantityRecommendation.totalVolumeCbm} m³</b></div>
                  <div><span>Stock estimado</span><b>{quantityRecommendation.monthsOfStock === null ? 'sin demanda' : `${quantityRecommendation.monthsOfStock} meses`}</b></div>
                  <div><span>Score</span><b>{quantityRecommendation.score}/100</b></div>
                </div>
                {quantityRecommendation.reasons.filter((r) => r.includes('m³')).map((r) => (
                  <p key={r} className="assumption-note importer-logistics-signal"><UiIcon name="info" size={15} /> {r}</p>
                ))}
                <p className="assumption-note">{quantityRecommendation.affordable ? 'Entra dentro del presupuesto cargado.' : 'No entra dentro del presupuesto: es la opción menos mala encontrada desde el MOQ.'} {optimizer.notes[2]}</p>
                <button className="secondary" type="button" onClick={() => setQuantity(quantityRecommendation.quantity)}>Usar esta cantidad en la simulación</button>
              </>}
              {topCandidates.length > 0 && <div className="table-scroll" style={{ marginTop: 14 }}><table><thead><tr><th>Cantidad</th><th>Modo</th><th>Total</th><th>Unitario</th><th>m³</th><th>Stock</th><th>Estado</th></tr></thead><tbody>{topCandidates.map((candidate) => <tr key={candidate.quantity} className={candidate.quantity === quantityRecommendation?.quantity ? 'selected-row' : undefined}><td><b>{candidate.quantity} u.</b></td><td>{candidate.selectedMode === 'lcl' ? 'LCL' : candidate.selectedMode === 'air' ? 'Aéreo' : candidate.selectedMode === 'courier' ? 'Courier' : '-'}</td><td>{usd(candidate.totalCostUsd)}</td><td>{usd(candidate.unitCostUsd)}</td><td>{candidate.totalVolumeCbm}</td><td>{candidate.monthsOfStock === null ? '-' : `${candidate.monthsOfStock}m`}</td><td>{candidate.affordable ? 'OK' : 'Fuera presupuesto'}</td></tr>)}</tbody></table></div>}
            </section>

            <section className="method-card journey-checklist-status">
              <h3>Datos aplicados</h3>
              <div className="metric-grid">
                <div><span>Uso propio/reventa</span><b>{checklistSignal(quote.checklist.ownUseOrResaleKnown, 'Falta')}</b></div>
                <div><span>Empresa/persona</span><b>{checklistSignal(quote.checklist.entityTypeKnown, 'Falta')}</b></div>
                <div><span>Firma importador</span><b>{checklistSignal(quote.checklist.importerSignatureKnown, 'Falta')}</b></div>
              </div>
              <p>{sensitiveCategory === 'unknown'
                ? 'Falta definir si el producto pertenece a un grupo con intervención para saber si corresponde sumar USD 200.'
                : sensitiveCategory === 'none'
                  ? 'Trámite de intervención: no aplica.'
                  : `Trámite de intervención: ${usd(interventionFeeUsd)} agregado automáticamente al costo total de la operación.`}</p>
              {quote.checklist.blockers.length > 0 && <ul className="tax-assumptions">{quote.checklist.blockers.map((item) => <li key={item}>{item}</li>)}</ul>}
            </section>
          </div>
        </details>
      </section>
    </div>
  </section>
}
