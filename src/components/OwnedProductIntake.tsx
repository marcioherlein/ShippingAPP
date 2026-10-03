import { readProductDraft, writeProductDraft } from '../lib/productDraft'
import { useEffect, useRef, useState } from 'react'
import UiIcon from './UiIcon'
import { isAlibabaUrl } from '../lib/productIntake'
import type { ManualProductChatData } from '../lib/productConfirmation'
import { inferSensitiveCategoryFromName } from '../lib/productConfirmation'
import type { SensitiveProductCategory } from '../lib/landedCostEngine'

type Props = {
  onAlibabaLink: (url: string) => Promise<void>
  onStructuredData: (data: ManualProductChatData) => void
}

type Mode = 'link' | 'describe' | null
type ChatStep = 'name' | 'use' | 'material' | 'price' | 'origin' | 'weight' | 'moq' | 'volume'

const MANDATORY_STEPS: ChatStep[] = ['name', 'use', 'material', 'price', 'origin', 'weight', 'moq']
const ALL_STEPS: ChatStep[] = [...MANDATORY_STEPS, 'volume']

const CHAT_LABELS: Record<ChatStep, string> = {
  name: '¿Cómo se llama el producto?',
  use: '¿Para qué se usa?',
  material: '¿De qué está hecho?',
  price: '¿Cuánto vale al proveedor? (FOB)',
  origin: '¿De dónde viene?',
  weight: '¿Cuánto pesa por unidad?',
  moq: '¿Cuál es el mínimo del proveedor?',
  volume: '¿Cuánto ocupa por unidad?',
}
const CHAT_PLACEHOLDERS: Record<ChatStep, string> = {
  name: 'Ej. Reloj de pulsera automático',
  use: 'Ej. Mide y muestra la hora',
  material: 'Ej. Acero inoxidable, plástico ABS',
  price: 'Ej. 18.50',
  origin: 'Ej. China',
  weight: 'Ej. 0.35',
  moq: 'Ej. 100',
  volume: 'Ej. 0.008 ó 50x40x30cm',
}
const CHAT_UNITS: Partial<Record<ChatStep, string>> = {
  price: 'USD',
  weight: 'kg',
  moq: 'u.',
  volume: 'm³',
}
const CHAT_RECEIPT_FMT: Record<ChatStep, (v: string) => string> = {
  name: (v) => v,
  use: (v) => v,
  material: (v) => v || '(omitido)',
  price: (v) => `USD ${v}`,
  origin: (v) => v,
  weight: (v) => `${v} kg`,
  moq: (v) => `MOQ ${v}`,
  volume: (v) => `${v} m³`,
}

const CHAT_STEP_LABELS_SHORT: Record<ChatStep, string> = {
  name: 'Producto',
  use: 'Uso',
  material: 'Material',
  price: 'Precio',
  origin: 'Origen',
  weight: 'Peso',
  moq: 'MOQ',
  volume: 'Volumen',
}

const isNumberStep = (step: ChatStep) => ['price', 'weight', 'moq'].includes(step)

const SENSITIVE_OPTIONS: Array<{ value: SensitiveProductCategory; label: string; icon: string }> = [
  { value: 'food',        label: 'Alimentos',        icon: '🥗' },
  { value: 'toys',        label: 'Juguetes',         icon: '🧸' },
  { value: 'cosmetics',   label: 'Cosméticos',       icon: '💄' },
  { value: 'medicines',   label: 'Medicamentos',     icon: '💊' },
  { value: 'supplements', label: 'Suplementos',      icon: '🧴' },
  { value: 'plants',      label: 'Plantas / Flores', icon: '🌿' },
]

/**
 * Parse a provider dimension string (e.g. "122x20x15", "50*40*30cm", "1.2 x 0.5 x 0.3 m")
 * into a volume in m³. Returns null if the string doesn't match a dimension pattern.
 * Heuristic: if any value > 5 and no explicit unit, treat as cm.
 */
function parseDimensionsToCbm(value: string): number | null {
  const trimmed = value.trim()
  // Already a plain number in m³
  const plain = Number(trimmed)
  if (Number.isFinite(plain) && plain > 0) return plain
  // Dimension string: N sep N sep N [unit]
  const m = trimmed.match(/^([\d.]+)\s*[x×*]\s*([\d.]+)\s*[x×*]\s*([\d.]+)\s*(cm|mm|m)?$/i)
  if (!m) return null
  const d1 = Number(m[1]), d2 = Number(m[2]), d3 = Number(m[3])
  if (!Number.isFinite(d1) || !Number.isFinite(d2) || !Number.isFinite(d3)) return null
  if (d1 <= 0 || d2 <= 0 || d3 <= 0) return null
  const unit = (m[4] || '').toLowerCase()
  let scale: number
  if (unit === 'cm') scale = 0.01
  else if (unit === 'mm') scale = 0.001
  else if (unit === 'm') scale = 1
  else scale = (d1 > 5 || d2 > 5 || d3 > 5) ? 0.01 : 1
  const cbm = d1 * scale * d2 * scale * d3 * scale
  return cbm > 0 ? cbm : null
}

function validateChatInput(step: ChatStep, value: string): boolean {
  const trimmed = value.trim()
  if (step === 'name') return trimmed.length >= 3
  if (step === 'use') return trimmed.length >= 2
  if (step === 'material') return trimmed.length >= 2
  if (step === 'origin') return trimmed.length >= 2
  if (step === 'volume') return parseDimensionsToCbm(trimmed) !== null
  const n = Number(trimmed)
  return Number.isFinite(n) && n > 0
}

type EntryDraft = { mode: Mode; link: string; chatStep?: ChatStep; chatAnswers?: Partial<Record<ChatStep, string>>; chatInput?: string }

export default function OwnedProductIntake({ onAlibabaLink, onStructuredData }: Props) {
  const [draft] = useState(() => readProductDraft<EntryDraft>('entry'))
  const [mode, setMode] = useState<Mode>(draft?.mode === 'link' ? 'link' : draft?.mode === 'describe' ? 'describe' : null)
  const [link, setLink] = useState(draft?.link || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [chatStep, setChatStep] = useState<ChatStep>(draft?.chatStep || 'name')
  const [chatAnswers, setChatAnswers] = useState<Partial<Record<ChatStep, string>>>(draft?.chatAnswers || {})
  const [chatInput, setChatInput] = useState(draft?.chatInput || '')
  const [volumeMode, setVolumeMode] = useState<'dims' | 'cbm'>('dims')
  const [dimL, setDimL] = useState('')
  const [dimW, setDimW] = useState('')
  const [dimH, setDimH] = useState('')
  const [dimUnit, setDimUnit] = useState<'cm' | 'm'>('cm')
  const [awaitingSensitive, setAwaitingSensitive] = useState(false)
  const [pendingChatAnswers, setPendingChatAnswers] = useState<Partial<Record<ChatStep, string>>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => { writeProductDraft('entry', { mode, link, chatStep, chatAnswers, chatInput }) }, [mode, link, chatStep, chatAnswers, chatInput])

  useEffect(() => {
    if (mode === 'describe') {
      const timer = setTimeout(() => inputRef.current?.focus(), 40)
      return () => clearTimeout(timer)
    }
  }, [mode, chatStep])

  useEffect(() => {
    if (mode === 'describe' && threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [mode, chatStep])

  const submitLink = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = link.trim()
    if (!value || loading) return
    if (!isAlibabaUrl(value)) {
      setError('Pegá una URL de producto de Alibaba. Si no tenés link, elegí "Describir el producto".')
      return
    }
    setLoading(true)
    setError('')
    try {
      await onAlibabaLink(value)
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      const message = /expected pattern|string did not match/i.test(raw)
        ? 'Falló transitoriamente la sesión del navegador. Reintená; el enlace es válido y no se consumió ningún análisis.'
        : raw || 'No pude leer esa publicación.'
      setError(`${message} También podés describir el producto sin link.`)
    } finally {
      setLoading(false)
    }
  }

  const answeredSteps = ALL_STEPS.filter(
    (s) => ALL_STEPS.indexOf(s) < ALL_STEPS.indexOf(chatStep) && chatAnswers[s] !== undefined,
  )

  const finalizeChat = (answers: Partial<Record<ChatStep, string>>, sensitiveCategory?: SensitiveProductCategory) => {
    if (sensitiveCategory === undefined) {
      const inferred = inferSensitiveCategoryFromName(answers.name || '')
      if (inferred === 'unknown') {
        setPendingChatAnswers(answers)
        setAwaitingSensitive(true)
        return
      }
      sensitiveCategory = inferred
    }
    const data: ManualProductChatData = {
      name: (answers.name || '').trim(),
      use: (answers.use || '').trim(),
      material: (answers.material || '').trim(),
      unitPriceUsd: Number(answers.price) || 0,
      originCountry: (answers.origin || '').trim(),
      packedWeightKg: Number(answers.weight) || 0,
      moq: Number(answers.moq) || 1,
      volumeCbm: answers.volume && Number(answers.volume) > 0 ? Number(answers.volume) : null,
      sensitiveCategory,
    }
    onStructuredData(data)
  }

  const advanceStep = (rawValue: string) => {
    let value = rawValue.trim()
    // Normalize dimension strings (e.g. "122x20x15cm") to a plain m³ decimal so the receipt
    // and finalizeChat both see a clean number rather than the raw dimension expression.
    if (chatStep === 'volume' && !Number.isFinite(Number(value))) {
      const cbm = parseDimensionsToCbm(value)
      if (cbm !== null) value = parseFloat(cbm.toFixed(6)).toString()
    }
    const newAnswers = { ...chatAnswers, [chatStep]: value }
    setChatAnswers(newAnswers)
    setChatInput('')
    const nextIdx = ALL_STEPS.indexOf(chatStep) + 1
    if (nextIdx >= ALL_STEPS.length) {
      finalizeChat(newAnswers)
    } else {
      setChatStep(ALL_STEPS[nextIdx])
    }
  }

  const editAnswer = (step: ChatStep) => {
    const idx = ALL_STEPS.indexOf(step)
    const cleared = { ...chatAnswers }
    ALL_STEPS.slice(idx).forEach((s) => delete cleared[s])
    setChatAnswers(cleared)
    if (step === 'volume') {
      setChatInput(chatAnswers[step] || '')
      setVolumeMode('cbm')
      setDimL('')
      setDimW('')
      setDimH('')
    } else {
      setChatInput(chatAnswers[step] || '')
    }
    setChatStep(step)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (validateChatInput(chatStep, chatInput)) advanceStep(chatInput)
    }
  }

  const resetDescribe = () => {
    setChatStep('name')
    setChatAnswers({})
    setChatInput('')
    setVolumeMode('dims')
    setDimL('')
    setDimW('')
    setDimH('')
    setDimUnit('cm')
    setAwaitingSensitive(false)
    setPendingChatAnswers({})
  }

  const dimsAreValid = () => {
    const l = parseFloat(dimL), w = parseFloat(dimW), h = parseFloat(dimH)
    return l > 0 && w > 0 && h > 0
  }

  const advanceVolumeStep = () => {
    if (volumeMode === 'cbm') {
      advanceStep(chatInput)
    } else {
      const scale = dimUnit === 'cm' ? 0.01 : 1
      const l = parseFloat(dimL), w = parseFloat(dimW), h = parseFloat(dimH)
      const cbm = l * scale * w * scale * h * scale
      advanceStep(parseFloat(cbm.toFixed(6)).toString())
    }
  }

  const currentUnit = CHAT_UNITS[chatStep] ?? null

  return <section className="owned-product-intake" aria-label="Cómo cargar tu producto">
    <div className="owned-product-intro">
      <span className="eyebrow">Tu producto</span>
      <h2>Elegí la forma más fácil.</h2>
      <p>Cargar, leer y completar el producto no consume un análisis. El crédito se usa recién cuando pedís clasificar la NCM y calcular la importación.</p>
    </div>

    {mode === null && <div className="owned-product-options">
      <button type="button" onClick={() => setMode('link')}>
        <span className="owned-product-option-icon"><UiIcon name="external-link" size={19} /></span>
        <b>Pegar link de Alibaba</b>
        <small>Intento traer título, tipo, specs, precio, MOQ, peso, volumen y origen. Después sólo confirmás o completás faltantes.</small>
        <em>Lectura gratis</em>
      </button>
      <button type="button" onClick={() => { resetDescribe(); setMode('describe') }}>
        <span className="owned-product-option-icon"><UiIcon name="edit" size={19} /></span>
        <b>Describir el producto</b>
        <small>Te pregunto una cosa por vez: nombre, precio, origen, peso y MOQ. Listo en 30 segundos.</small>
      </button>
    </div>}

    {mode === 'link' && <form className="owned-product-entry" onSubmit={(event) => void submitLink(event)}>
      <div className="owned-product-entry-head">
        <div><b>Pegá la publicación de Alibaba</b><small>GlobalShipping intenta lectura propia primero; Browser Run y Parse.bot quedan como respaldo. Esta lectura no consume un análisis.</small></div>
        <button type="button" onClick={() => { setMode(null); setError('') }}>Cambiar</button>
      </div>
      <div className="owned-product-link-row">
        <input
          type="url"
          aria-label="Enlace de Alibaba"
          value={link}
          onChange={(event) => setLink(event.target.value.slice(0, 2200))}
          placeholder="https://www.alibaba.com/product-detail/..."
          autoComplete="off"
          disabled={loading}
        />
        <button className="journey-primary-action" type="submit" disabled={loading || !link.trim()}>{loading ? 'Leyendo…' : 'Leer producto'} <UiIcon name="arrow-right" size={16} /></button>
      </div>
      {loading && <p className="owned-product-progress" role="status">Estoy leyendo la publicación y cruzando las fuentes disponibles. No voy a inventar un dato que Alibaba no exponga.</p>}
    </form>}

    {mode === 'describe' && <div className="product-chatbot">
      <div className="chatbot-topbar">
        <b>Ingresá el producto</b>
        <button type="button" onClick={() => { setMode(null); setError('') }}>Cambiar</button>
      </div>

      <div className="chatbot-thread" ref={threadRef}>
        {answeredSteps.length > 0 && (
          <div className="chatbot-receipt-bar">
            {answeredSteps.map((step) => (
              <button
                key={step}
                type="button"
                className="chatbot-receipt-chip"
                onClick={() => editAnswer(step)}
                title={`${CHAT_LABELS[step]} — tocá para editar`}
              >
                <span className="chatbot-receipt-chip-label">{CHAT_STEP_LABELS_SHORT[step]}</span>
                <span className="chatbot-receipt-chip-value">{CHAT_RECEIPT_FMT[step](chatAnswers[step] || '')}</span>
              </button>
            ))}
          </div>
        )}
        <div key={chatStep} className="chatbot-msg assistant chatbot-msg-enter">
          {CHAT_LABELS[chatStep]}
          {(chatStep === 'volume' || chatStep === 'material') && <span className="chatbot-optional-tag"> · Opcional</span>}
        </div>
      </div>

      <div className="chatbot-input-dock">
        {chatStep === 'volume' ? <>
          <div className="chatbot-vol-tabs">
            <button type="button" className={`chatbot-vol-tab${volumeMode === 'dims' ? ' active' : ''}`} onClick={() => setVolumeMode('dims')}>Medidas</button>
            <button type="button" className={`chatbot-vol-tab${volumeMode === 'cbm' ? ' active' : ''}`} onClick={() => setVolumeMode('cbm')}>Volumen m³</button>
          </div>
          {volumeMode === 'dims' ? (
            <div className="chatbot-dims-row">
              <label className="chatbot-dim-field">
                <span>Largo</span>
                <input type="number" min="0.001" step="any" value={dimL} onChange={(e) => setDimL(e.target.value)} placeholder="50" autoFocus />
              </label>
              <label className="chatbot-dim-field">
                <span>Ancho</span>
                <input type="number" min="0.001" step="any" value={dimW} onChange={(e) => setDimW(e.target.value)} placeholder="40" />
              </label>
              <label className="chatbot-dim-field">
                <span>Alto</span>
                <input
                  type="number" min="0.001" step="any" value={dimH}
                  onChange={(e) => setDimH(e.target.value)} placeholder="30"
                  onKeyDown={(e) => { if (e.key === 'Enter' && dimsAreValid()) advanceVolumeStep() }}
                />
              </label>
              <div className="chatbot-dim-unit-toggle">
                <button type="button" className={dimUnit === 'cm' ? 'active' : ''} onClick={() => setDimUnit('cm')}>cm</button>
                <button type="button" className={dimUnit === 'm' ? 'active' : ''} onClick={() => setDimUnit('m')}>m</button>
              </div>
              <button type="button" className="chatbot-send-btn chatbot-dims-send" disabled={!dimsAreValid()} onClick={advanceVolumeStep}>
                Continuar <UiIcon name="arrow-right" size={14} />
              </button>
            </div>
          ) : (
            <div className="chatbot-dock-row">
              <div className="chatbot-dock-input-wrap">
                <input
                  ref={inputRef}
                  className="chatbot-dock-input"
                  type="number" min="0.0001" step="any"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && validateChatInput('volume', chatInput)) advanceVolumeStep() }}
                  placeholder="ej. 0.008"
                  autoFocus
                />
                <span className="chatbot-dock-unit" aria-hidden="true">m³</span>
              </div>
              <button type="button" className="chatbot-send-btn" disabled={!validateChatInput('volume', chatInput)} onClick={advanceVolumeStep}>
                Continuar <UiIcon name="arrow-right" size={14} />
              </button>
            </div>
          )}
          <button type="button" className="chatbot-skip-btn" onClick={() => finalizeChat(chatAnswers)}>
            No sé / omitir
          </button>
        </> : <>
          <div className="chatbot-dock-row">
            <div className="chatbot-dock-input-wrap">
              <input
                ref={inputRef}
                className="chatbot-dock-input"
                type={isNumberStep(chatStep) ? 'number' : 'text'}
                inputMode={isNumberStep(chatStep) ? 'decimal' : 'text'}
                min={isNumberStep(chatStep) ? '0.001' : undefined}
                step={isNumberStep(chatStep) ? 'any' : undefined}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={CHAT_PLACEHOLDERS[chatStep]}
                aria-label={CHAT_LABELS[chatStep]}
                autoFocus
              />
              {currentUnit && <span className="chatbot-dock-unit" aria-hidden="true">{currentUnit}</span>}
            </div>
            <button
              type="button"
              className="chatbot-send-btn"
              disabled={!validateChatInput(chatStep, chatInput)}
              onClick={() => advanceStep(chatInput)}
            >
              Continuar <UiIcon name="arrow-right" size={14} />
            </button>
          </div>
          {chatStep === 'material' && (
            <button type="button" className="chatbot-skip-btn" onClick={() => advanceStep('')}>
              No sé / omitir
            </button>
          )}
        </>}
      </div>
    </div>}

    {mode === 'describe' && awaitingSensitive && <div className="product-chatbot">
      <div className="chatbot-topbar">
        <b>Ingresá el producto</b>
        <button type="button" onClick={() => setAwaitingSensitive(false)}>Volver</button>
      </div>
      <div className="chatbot-thread" ref={threadRef}>
        <div className="chatbot-msg assistant chatbot-msg-enter">
          ¿Tu producto entra en alguna de estas categorías?
          <span className="chatbot-optional-tag"> · Solo si aplica</span>
        </div>
      </div>
      <div className="chatbot-sensitive-grid">
        {SENSITIVE_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className="chatbot-sensitive-chip"
            onClick={() => { setAwaitingSensitive(false); finalizeChat(pendingChatAnswers, value) }}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="chatbot-sensitive-none"
          onClick={() => { setAwaitingSensitive(false); finalizeChat(pendingChatAnswers, 'none') }}
        >
          Ninguna de estas
        </button>
      </div>
    </div>}

    {error && <div className="pipeline-warning owned-product-error" role="alert"><b>No pude continuar todavía.</b><span>{error}</span></div>}
  </section>
}
