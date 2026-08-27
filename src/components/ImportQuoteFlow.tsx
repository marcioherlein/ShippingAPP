import React, { useMemo, useState } from 'react'
import { importFreightValues } from '../data/importFreightValues'
import { compareLandedCost, type ImportEntityType, type ImportPurpose, type ModeCostBreakdown, type SensitiveProductCategory, type TransportMode } from '../lib/landedCostEngine'
import { optimizeQuantity, type BuyStrategy } from '../lib/quantityOptimizer'
import type { QuotePrefill } from '../lib/hotProducts'
import { usd } from '../lib/format'

const interventionLabels: Record<SensitiveProductCategory, string> = {
  unknown: 'No sé todavía',
  none: 'No requiere intervención',
  food: 'Alimentos',
  toys: 'Juguetes',
  cosmetics: 'Cosméticos',
  medicines: 'Medicamentos',
  supplements: 'Suplementos',
}

const modeLabels: Record<TransportMode, string> = {
  fcl: 'FCL referencia',
  lcl: 'LCL',
  air: 'Aéreo',
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
  return <span className={ok ? 'score-pill' : 'score-pill warning-pill'}>{ok ? 'OK' : label}</span>
}

function decisionCopy(mode: 'lcl' | 'air' | null, marginPct: number | null, blockers: string[]) {
  if (!mode) return { title: 'Completá datos', body: 'Faltan datos para comparar LCL contra aéreo.' }
  if (blockers.length) return { title: 'Faltan datos clave', body: 'El costo se calcula, pero la decisión queda abierta hasta cerrar checklist.' }
  if (marginPct !== null && marginPct < 0) return { title: 'No conviene con estos datos', body: `${mode === 'lcl' ? 'LCL' : 'Aéreo'} es el menor costo logístico, pero el costo unitario supera el precio local cargado.` }
  if (marginPct !== null && marginPct < 20) return { title: 'Margen débil', body: `${mode === 'lcl' ? 'LCL' : 'Aéreo'} gana por costo, pero el margen rápido queda bajo para absorber errores, demoras o gastos no modelados.` }
  return { title: `Conviene ${mode === 'lcl' ? 'LCL' : 'aéreo'}`, body: `${mode === 'lcl' ? 'LCL' : 'Aéreo'} es el menor costo entre las opciones accionables. FCL queda sólo como referencia.` }
}

function strategyCopy(strategy: BuyStrategy) {
  if (strategy === 'test') return 'prioriza no pasarse de presupuesto ni inmovilizar stock.'
  if (strategy === 'aggressive') return 'acepta más stock si baja el costo unitario.'
  return 'balancea costo unitario, presupuesto y meses de stock.'
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
  const fcl = quote.modes.fcl
  const winner = quote.bestMode ? quote.modes[quote.bestMode] : null
  const marginPct = winner && localSellPriceUsd > 0 ? ((localSellPriceUsd - winner.unitCostUsd) / localSellPriceUsd) * 100 : null
  const decision = decisionCopy(quote.bestMode, marginPct, quote.checklist.blockers)
  const quantityRecommendation = optimizer.recommendation
  const topCandidates = optimizer.candidates.slice(0, 5)
  const breakdown = winner ? unitBreakdown(winner, quantity) : []

  return <section className="manual-quote-shell journey-quote-shell">
    <div className="table-title journey-quote-title">
      <div><span className="eyebrow">Resultado calculado</span><h2>Costo unitario primero. Optimización después.</h2></div>
      <small>{prefill?.sourceLabel ?? importFreightValues.meta.source}</small>
    </div>

    {prefill && <div className="analysis-banner hot-prefill-banner"><b>Datos precargados desde el pipeline.</b> NCM, aranceles, costos de trámite y datos físicos alimentan el motor; podés revisar cualquier supuesto antes de decidir.</div>}

    {prefill?.ncmCode && <section className="quote-customs-evidence">
      <div><span className="eyebrow">Clasificación usada</span><h3>NCM {prefill.ncmCode}</h3><p>Clasificación y aranceles aplicados automáticamente desde el nomenclador cargado.</p></div>
      <div className="quote-customs-facts">
        <span><small>Confianza</small><b>{prefill.classificationConfidence || 'pendiente'}</b></span>
        <span><small>SIM</small><b>{prefill.simCode || '-'}</b></span>
        <span><small>Derecho</small><b>{dutyRatePct}%</b></span>
        <span><small>Tasa</small><b>{statisticsRatePct}%</b></span>
        <span><small>IVA</small><b>{vatRatePct}%</b></span>
        <span><small>Intervención</small><b>{sensitiveCategory !== 'none' && sensitiveCategory !== 'unknown' ? usd(interventionFeeUsd) : sensitiveCategory === 'unknown' ? 'Pendiente' : 'No aplica'}</b></span>
      </div>
      {prefill.customsMissingFacts?.length ? <p className="assumption-note">Datos pendientes de clasificación: {prefill.customsMissingFacts.slice(0, 4).join(' · ')}</p> : null}
    </section>}

    <div className="workspace manual-quote-workspace">
      <aside className="inputs-column">
        <section className="panel">
          <div className="section-heading"><span>01</span><div><h2>Producto y proveedor</h2><p>Base física y comercial usada para la simulación.</p></div></div>
          <label className="field field-wide"><span>Producto</span><input placeholder="Ej. paleta de pádel carbono" value={productName} onChange={(e) => setProductName(e.target.value)} /></label>
          <label className="field field-wide"><span>Origen</span><select value={originCountry} onChange={(e) => setOriginCountry(e.target.value)}>{originCountries.map((country) => <option key={country} value={country}>{country}</option>)}</select></label>
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
            <label className="field"><span>Uso</span><select value={purpose} onChange={(e) => setPurpose(e.target.value as ImportPurpose)}><option value="resale">Reventa</option><option value="own_use">Uso propio</option><option value="unknown">No sé</option></select></label>
            <label className="field"><span>Importa como</span><select value={entityType} onChange={(e) => setEntityType(e.target.value as ImportEntityType)}><option value="company">Empresa</option><option value="individual">Persona humana</option><option value="unknown">No sé</option></select></label>
            <label className="field"><span>Firma/importador</span><select value={hasImporterSignature} onChange={(e) => setHasImporterSignature(e.target.value as 'yes' | 'no' | 'unknown')}><option value="yes">Tiene firma</option><option value="no">No tiene firma</option><option value="unknown">No sé</option></select></label>
            <label className="field"><span>Grupo con intervención</span><small>Alimentos, juguetes, cosméticos, medicamentos y suplementos suman automáticamente {usd(interventionFeeUsd)} por trámite a la operación.</small><select value={sensitiveCategory} onChange={(e) => setSensitiveCategory(e.target.value as SensitiveProductCategory)}>{(Object.keys(interventionLabels) as SensitiveProductCategory[]).map((key) => <option key={key} value={key}>{interventionLabels[key]}</option>)}</select></label>
            {capitalGoodEligible && <label className="field"><span>NCM marcada Bien de Uso</span><small>Esto puede llevar tasa estadística y percepciones a 0 en el modelo.</small><select value={capitalGoodUse ? 'yes' : 'no'} onChange={(e) => setCapitalGoodUse(e.target.value === 'yes')}><option value="no">No aplicar tratamiento</option><option value="yes">Sí, se usará como Bien de Uso</option></select></label>}
          </div>
        </section>

        <details className="panel journey-advanced-taxes">
          <summary><div className="section-heading"><span>03</span><div><h2>Aranceles del nomenclador</h2><p>Precargados automáticamente; editá sólo si tenés una validación mejor.</p></div></div></summary>
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
            <NumberField label="Precio venta local" hint="Opcional; para margen rápido" value={localSellPriceUsd} onChange={setLocalSellPriceUsd} step={0.01} suffix="USD" />
            <label className="field"><span>Estrategia</span><small>{strategyCopy(strategy)}</small><select value={strategy} onChange={(e) => setStrategy(e.target.value as BuyStrategy)}>{(Object.keys(strategyLabels) as BuyStrategy[]).map((key) => <option key={key} value={key}>{strategyLabels[key]}</option>)}</select></label>
          </div>
        </section>
      </aside>

      <section className="results-column">
        <section className="recommendation journey-main-result unit-result-hero">
          <div className="recommendation-top">
            <div><span className="eyebrow">Resultado base</span><strong>{winner ? `${usd(winner.unitCostUsd)} por unidad puesta` : decision.title}</strong></div>
            <div className="score"><span>Cantidad base</span><b>{quantity} u.</b></div>
          </div>
          <p className="mode">{winner ? `${productName || 'Producto'} · ${originCountry} · ${winner.mode === 'lcl' ? 'LCL' : 'Aéreo'} · total de la operación ${usd(winner.totalCostUsd)}.` : decision.body}</p>
          <p className="unit-result-explainer">Este valor es el costo de <b>una unidad dentro de una importación de {quantity} unidades</b>. No simula importar una unidad aislada, porque los mínimos de flete y gastos fijos distorsionarían la decisión.</p>
        </section>

        {winner && <section className="table-card unit-breakdown-card">
          <div className="table-title"><div><span className="eyebrow">Costo puesto por unidad</span><h2>De FOB a tu costo final, punto por punto</h2></div><small>{winner.mode === 'lcl' ? 'LCL' : 'Aéreo'} · {quantity} u.</small></div>
          <div className="unit-breakdown-list">
            {breakdown.map(([label, value]) => <div key={label}><span>{label}</span><b>{usd(value)}</b></div>)}
            <div className="unit-breakdown-total"><span>Costo puesto final / unidad</span><b>{usd(winner.unitCostUsd)}</b></div>
          </div>
          <div className="unit-context-grid">
            <div><span>FOB total</span><b>{usd(winner.fobUsd)}</b></div>
            <div><span>Flete total</span><b>{usd(winner.freightCostUsd)}</b></div>
            <div><span>Trámite intervención</span><b>{winner.sensitiveCategoryUsd > 0 ? usd(winner.sensitiveCategoryUsd) : 'No aplica'}</b></div>
            <div><span>Total operación</span><b>{usd(winner.totalCostUsd)}</b></div>
          </div>
        </section>}

        <section className="table-card">
          <div className="table-title"><div><span className="eyebrow">Comparativa logística</span><h2>LCL, aéreo y referencia FCL</h2></div><small>{quote.origin ? `${quote.origin.region} · ${quote.origin.capital}` : quote.status}</small></div>
          <div className="table-scroll"><table><thead><tr><th>Modo</th><th>Flete</th><th>CIF</th><th>Impuestos</th><th>Gastos</th><th>Total</th><th>Unitario</th></tr></thead><tbody>{([lcl, air, fcl] as const).map((mode) => {
            const taxes = mode.dutyUsd + mode.statisticsUsd + mode.vatUsd + mode.vatAdditionalUsd + mode.gainsUsd + mode.iibbUsd
            const expenses = mode.fixedDestinationUsd + mode.noImporterSignatureUsd + mode.sensitiveCategoryUsd
            const selected = winner?.mode === mode.mode
            return <tr key={mode.mode} className={selected ? 'selected-row' : undefined}><td><b>{modeLabels[mode.mode]}</b>{selected && <em>recomendado</em>}{mode.mode === 'fcl' && <em>referencia</em>}</td><td>{usd(mode.freightCostUsd)}<br /><small>{mode.chargeableUnits} {mode.mode === 'air' ? 'kg cobrables' : mode.mode === 'lcl' ? 'WM' : 'cont.'}</small></td><td>{usd(mode.cifUsd)}</td><td>{usd(taxes)}</td><td>{usd(expenses)}</td><td><b>{usd(mode.totalCostUsd)}</b></td><td><b>{usd(mode.unitCostUsd)}</b></td></tr>
          })}</tbody></table></div>
          <div className="analysis-banner" style={{ marginTop: 16 }}><b>LCL vs Aéreo:</b> {quote.lclVsAir.cheaperMode === 'lcl' ? `LCL ahorra ${usd(quote.lclVsAir.savingsUsd || 0)} vs aéreo.` : quote.lclVsAir.cheaperMode === 'air' ? `Aéreo ahorra ${usd(quote.lclVsAir.savingsUsd || 0)} vs LCL.` : 'empate con los datos actuales.'} FCL queda como referencia de contenedor entero.</div>
        </section>

        <section className="table-card journey-quantity-card">
          <div className="table-title"><div><span className="eyebrow">Ahora sí: optimización</span><h2>{quantityRecommendation ? `${quantityRecommendation.quantity} unidades recomendadas` : budgetUsd <= 0 ? 'Definí presupuesto para optimizar' : 'Sin recomendación'}</h2></div><small>{budgetUsd > 0 ? `Presupuesto ${usd(budgetUsd)}` : 'Presupuesto abierto'}</small></div>
          <p className="assumption-note">Primero fijamos el costo unitario de la operación base. Recién después probamos cantidades para encontrar dónde bajan flete/gastos por unidad sin romper presupuesto, MOQ o stock.</p>
          {quantityRecommendation && <>
            <div className="metric-grid">
              <div><span>Modo recomendado</span><b>{quantityRecommendation.selectedMode === 'lcl' ? 'LCL' : quantityRecommendation.selectedMode === 'air' ? 'Aéreo' : '-'}</b></div>
              <div><span>Costo total</span><b>{usd(quantityRecommendation.totalCostUsd)}</b></div>
              <div><span>Costo unitario</span><b>{usd(quantityRecommendation.unitCostUsd)}</b></div>
              <div><span>Volumen estimado</span><b>{quantityRecommendation.totalVolumeCbm} m³</b></div>
              <div><span>Stock estimado</span><b>{quantityRecommendation.monthsOfStock === null ? 'sin demanda' : `${quantityRecommendation.monthsOfStock} meses`}</b></div>
              <div><span>Score</span><b>{quantityRecommendation.score}/100</b></div>
            </div>
            <p className="assumption-note">{quantityRecommendation.affordable ? 'Entra dentro del presupuesto cargado.' : 'No entra dentro del presupuesto: es la opción menos mala encontrada desde el MOQ.'} {optimizer.notes[2]}</p>
            <button className="secondary" type="button" onClick={() => setQuantity(quantityRecommendation.quantity)}>Usar esta cantidad en la simulación</button>
          </>}
          {topCandidates.length > 0 && <div className="table-scroll" style={{ marginTop: 14 }}><table><thead><tr><th>Cantidad</th><th>Modo</th><th>Total</th><th>Unitario</th><th>m³</th><th>Stock</th><th>Estado</th></tr></thead><tbody>{topCandidates.map((candidate) => <tr key={candidate.quantity} className={candidate.quantity === quantityRecommendation?.quantity ? 'selected-row' : undefined}><td><b>{candidate.quantity} u.</b></td><td>{candidate.selectedMode === 'lcl' ? 'LCL' : candidate.selectedMode === 'air' ? 'Aéreo' : '-'}</td><td>{usd(candidate.totalCostUsd)}</td><td>{usd(candidate.unitCostUsd)}</td><td>{candidate.totalVolumeCbm}</td><td>{candidate.monthsOfStock === null ? '-' : `${candidate.monthsOfStock}m`}</td><td>{candidate.affordable ? 'OK' : 'Fuera presupuesto'}</td></tr>)}</tbody></table></div>}
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
      </section>
    </div>
  </section>
}
