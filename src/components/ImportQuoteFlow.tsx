import React, { useMemo, useState } from 'react'
import { importFreightValues } from '../data/importFreightValues'
import { compareLandedCost, type ImportEntityType, type ImportPurpose, type SensitiveProductCategory, type TransportMode } from '../lib/landedCostEngine'
import { usd } from '../lib/format'

const sensitiveLabels: Record<SensitiveProductCategory, string> = {
  unknown: 'No sé todavía',
  none: 'Ninguna de estas',
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

const originCountries = importFreightValues.rates.map((row) => row[0])

type NumberFieldProps = {
  label: string
  hint?: string
  value: number
  min?: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}

function NumberField({ label, hint, value, min = 0, step = 1, suffix, onChange }: NumberFieldProps) {
  return <label className="field"><span>{label}</span>{hint && <small>{hint}</small>}<div className="input-wrap"><input type="number" min={min} step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} />{suffix && <small>{suffix}</small>}</div></label>
}

function checklistSignal(ok: boolean, label: string) {
  return <span className={ok ? 'score-pill' : 'score-pill warning-pill'}>{ok ? 'OK' : label}</span>
}

export default function ImportQuoteFlow() {
  const [productName, setProductName] = useState('Paleta de pádel carbono')
  const [originCountry, setOriginCountry] = useState('China')
  const [quantity, setQuantity] = useState(100)
  const [unitPriceUsd, setUnitPriceUsd] = useState(40)
  const [unitWeightKg, setUnitWeightKg] = useState(1)
  const [unitVolumeCbm, setUnitVolumeCbm] = useState(0.01)
  const [dutyRatePct, setDutyRatePct] = useState(16)
  const [statisticsRatePct, setStatisticsRatePct] = useState(3)
  const [vatRatePct, setVatRatePct] = useState(21)
  const [vatAdditionalRatePct, setVatAdditionalRatePct] = useState(20)
  const [gainsRatePct, setGainsRatePct] = useState(6)
  const [iibbRatePct, setIibbRatePct] = useState(2.5)
  const [localSellPriceUsd, setLocalSellPriceUsd] = useState(150)
  const [purpose, setPurpose] = useState<ImportPurpose>('resale')
  const [entityType, setEntityType] = useState<ImportEntityType>('company')
  const [hasImporterSignature, setHasImporterSignature] = useState<'yes' | 'no' | 'unknown'>('no')
  const [sensitiveCategory, setSensitiveCategory] = useState<SensitiveProductCategory>('toys')

  const quote = useMemo(() => compareLandedCost({
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
  }), [originCountry, quantity, unitPriceUsd, unitWeightKg, unitVolumeCbm, dutyRatePct, statisticsRatePct, vatRatePct, vatAdditionalRatePct, gainsRatePct, iibbRatePct, purpose, entityType, hasImporterSignature, sensitiveCategory])

  const lcl = quote.modes.lcl
  const air = quote.modes.air
  const fcl = quote.modes.fcl
  const winner = quote.bestMode ? quote.modes[quote.bestMode] : null
  const marginPct = winner && localSellPriceUsd > 0 ? ((localSellPriceUsd - winner.unitCostUsd) / localSellPriceUsd) * 100 : null

  return <section className="manual-quote-shell">
    <div className="table-title">
      <div><span className="eyebrow">Nuevo flujo principal</span><h2>Input → checklist → fletes → costo final</h2></div>
      <small>{importFreightValues.meta.source}</small>
    </div>

    <div className="workspace manual-quote-workspace">
      <aside className="inputs-column">
        <section className="panel">
          <div className="section-heading"><span>01</span><div><h2>Producto y operación</h2><p>Datos mínimos para calcular FOB, flete, CIF e impuestos.</p></div></div>
          <label className="field field-wide"><span>Producto</span><input value={productName} onChange={(e) => setProductName(e.target.value)} /></label>
          <label className="field field-wide"><span>Origen</span><select value={originCountry} onChange={(e) => setOriginCountry(e.target.value)}>{originCountries.map((country) => <option key={country} value={country}>{country}</option>)}</select></label>
          <div className="field-grid">
            <NumberField label="Cantidad" value={quantity} onChange={setQuantity} suffix="u." />
            <NumberField label="Precio FOB unitario" value={unitPriceUsd} onChange={setUnitPriceUsd} step={0.01} suffix="USD" />
            <NumberField label="Peso unitario" value={unitWeightKg} onChange={setUnitWeightKg} step={0.01} suffix="kg" />
            <NumberField label="Volumen unitario" value={unitVolumeCbm} onChange={setUnitVolumeCbm} step={0.001} suffix="m³" />
          </div>
        </section>

        <section className="panel">
          <div className="section-heading"><span>02</span><div><h2>Checklist real</h2><p>Las 4 preguntas que cambian el costo/camino.</p></div></div>
          <div className="field-grid">
            <label className="field"><span>Uso</span><select value={purpose} onChange={(e) => setPurpose(e.target.value as ImportPurpose)}><option value="resale">Reventa</option><option value="own_use">Uso propio</option><option value="unknown">No sé</option></select></label>
            <label className="field"><span>Importa como</span><select value={entityType} onChange={(e) => setEntityType(e.target.value as ImportEntityType)}><option value="company">Empresa</option><option value="individual">Persona humana</option><option value="unknown">No sé</option></select></label>
            <label className="field"><span>Firma importador</span><select value={hasImporterSignature} onChange={(e) => setHasImporterSignature(e.target.value as 'yes' | 'no' | 'unknown')}><option value="yes">Tiene firma</option><option value="no">No tiene firma</option><option value="unknown">No sé</option></select></label>
            <label className="field"><span>Categoría sensible</span><select value={sensitiveCategory} onChange={(e) => setSensitiveCategory(e.target.value as SensitiveProductCategory)}>{(Object.keys(sensitiveLabels) as SensitiveProductCategory[]).map((key) => <option key={key} value={key}>{sensitiveLabels[key]}</option>)}</select></label>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading"><span>03</span><div><h2>NCM e impuestos</h2><p>Por ahora manual/editable; luego lo trae el nomenclador.</p></div></div>
          <div className="field-grid">
            <NumberField label="Derecho importación" value={dutyRatePct} onChange={setDutyRatePct} step={0.1} suffix="%" />
            <NumberField label="Tasa estadística" value={statisticsRatePct} onChange={setStatisticsRatePct} step={0.1} suffix="%" />
            <NumberField label="IVA" value={vatRatePct} onChange={setVatRatePct} step={0.1} suffix="%" />
            <NumberField label="IVA adicional" value={vatAdditionalRatePct} onChange={setVatAdditionalRatePct} step={0.1} suffix="%" />
            <NumberField label="Ganancias" value={gainsRatePct} onChange={setGainsRatePct} step={0.1} suffix="%" />
            <NumberField label="IIBB" value={iibbRatePct} onChange={setIibbRatePct} step={0.1} suffix="%" />
            <NumberField label="Precio venta local" hint="Para margen unitario rápido" value={localSellPriceUsd} onChange={setLocalSellPriceUsd} step={0.01} suffix="USD" />
          </div>
        </section>
      </aside>

      <section className="results-column">
        <section className="recommendation">
          <div className="recommendation-top">
            <div><span className="eyebrow">Output principal</span><strong>{winner ? modeLabels[winner.mode] : 'Pendiente'}</strong></div>
            <div className="score"><span>Costo/u.</span><b>{winner ? usd(winner.unitCostUsd) : '-'}</b></div>
          </div>
          <p className="mode">{productName || 'Producto'} · {originCountry} · {quantity} unidades · FOB total {usd(quantity * unitPriceUsd)}</p>
          <div className="metric-grid">
            <div><span>LCL final</span><b>{usd(lcl.totalCostUsd)}</b></div>
            <div><span>Aéreo final</span><b>{usd(air.totalCostUsd)}</b></div>
            <div><span>Margen rápido</span><b>{marginPct === null ? '-' : `${marginPct.toFixed(1)}%`}</b></div>
          </div>
        </section>

        <section className="table-card">
          <div className="table-title"><div><span className="eyebrow">Proceso</span><h2>Fletes, CIF, impuestos y gastos</h2></div><small>{quote.origin ? `${quote.origin.region} · ${quote.origin.capital}` : quote.status}</small></div>
          <div className="table-scroll"><table><thead><tr><th>Modo</th><th>Flete</th><th>CIF</th><th>Base IVA</th><th>Impuestos</th><th>Gastos</th><th>Total</th><th>Unitario</th></tr></thead><tbody>{([lcl, air, fcl] as const).map((mode) => {
            const taxes = mode.dutyUsd + mode.statisticsUsd + mode.vatUsd + mode.vatAdditionalUsd + mode.gainsUsd + mode.iibbUsd
            const expenses = mode.fixedDestinationUsd + mode.noImporterSignatureUsd + mode.sensitiveCategoryUsd
            const selected = winner?.mode === mode.mode
            return <tr key={mode.mode} className={selected ? 'selected-row' : undefined}><td><b>{modeLabels[mode.mode]}</b>{selected && <em>menor costo total</em>}</td><td>{usd(mode.freightCostUsd)}<br /><small>{mode.chargeableUnits} {mode.mode === 'air' ? 'kg cobrables' : mode.mode === 'lcl' ? 'WM' : 'cont.'}</small></td><td>{usd(mode.cifUsd)}</td><td>{usd(mode.baseVatUsd)}</td><td>{usd(taxes)}</td><td>{usd(expenses)}</td><td><b>{usd(mode.totalCostUsd)}</b></td><td><b>{usd(mode.unitCostUsd)}</b></td></tr>
          })}</tbody></table></div>
          <div className="analysis-banner" style={{ marginTop: 16 }}><b>LCL vs Aéreo:</b> {quote.lclVsAir.cheaperMode === 'lcl' ? `LCL ahorra ${usd(quote.lclVsAir.savingsUsd || 0)} vs aéreo.` : quote.lclVsAir.cheaperMode === 'air' ? `Aéreo ahorra ${usd(quote.lclVsAir.savingsUsd || 0)} vs LCL.` : 'empate con los datos actuales.'} FCL queda como referencia de contenedor entero.</div>
        </section>

        <section className="method-card">
          <h3>Checklist status</h3>
          <div className="metric-grid">
            <div><span>Uso propio/reventa</span><b>{checklistSignal(quote.checklist.ownUseOrResaleKnown, 'Falta')}</b></div>
            <div><span>Empresa/persona</span><b>{checklistSignal(quote.checklist.entityTypeKnown, 'Falta')}</b></div>
            <div><span>Firma importador</span><b>{checklistSignal(quote.checklist.importerSignatureKnown, 'Falta')}</b></div>
          </div>
          <p>{quote.checklist.needsSensitiveCategoryReview ? 'Categoría sensible: requiere explicación/control separado antes de decidir operación.' : 'Categoría sensible no activada.'}</p>
          {quote.checklist.blockers.length > 0 && <ul className="tax-assumptions">{quote.checklist.blockers.map((item) => <li key={item}>{item}</li>)}</ul>}
        </section>
      </section>
    </div>
  </section>
}
