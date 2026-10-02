import { readProductDraft, writeProductDraft } from '../lib/productDraft'
import React, { useEffect, useRef, useState } from 'react'
import UiIcon from './UiIcon'
import { isAlibabaUrl } from '../lib/productIntake'
import type { ManualProductChatData } from '../lib/productConfirmation'

type Props = {
  onAlibabaLink: (url: string) => Promise<void>
  onStructuredData: (data: ManualProductChatData) => void
}

type Mode = 'link' | 'describe' | null
type ChatStep = 'name' | 'price' | 'origin' | 'weight' | 'moq' | 'volume'

const MANDATORY_STEPS: ChatStep[] = ['name', 'price', 'origin', 'weight', 'moq']
const ALL_STEPS: ChatStep[] = [...MANDATORY_STEPS, 'volume']

const CHAT_LABELS: Record<ChatStep, string> = {
  name: '¿Cómo se llama el producto?',
  price: '¿Cuánto vale al proveedor? (FOB)',
  origin: '¿De dónde viene?',
  weight: '¿Cuánto pesa por unidad?',
  moq: '¿Cuál es el mínimo del proveedor?',
  volume: '¿Cuánto ocupa por unidad?',
}
const CHAT_PLACEHOLDERS: Record<ChatStep, string> = {
  name: 'Ej. Reloj de pulsera automático',
  price: 'Ej. 18.50',
  origin: 'Ej. China',
  weight: 'Ej. 0.35',
  moq: 'Ej. 100',
  volume: 'Ej. 0.008',
}
const CHAT_UNITS: Partial<Record<ChatStep, string>> = {
  price: 'USD',
  weight: 'kg',
  moq: 'u.',
  volume: 'm³',
}
const CHAT_RECEIPT_FMT: Record<ChatStep, (v: string) => string> = {
  name: (v) => v,
  price: (v) => `USD ${v}`,
  origin: (v) => v,
  weight: (v) => `${v} kg`,
  moq: (v) => `MOQ ${v}`,
  volume: (v) => `${v} m³`,
}

const isNumberStep = (step: ChatStep) => ['price', 'weight', 'moq', 'volume'].includes(step)

function validateChatInput(step: ChatStep, value: string): boolean {
  const trimmed = value.trim()
  if (step === 'name') return trimmed.length >= 3
  if (step === 'origin') return trimmed.length >= 2
  if (step === 'volume') return trimmed.length > 0 && Number.isFinite(Number(trimmed)) && Number(trimmed) > 0
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

  const finalizeChat = (answers: Partial<Record<ChatStep, string>>) => {
    const data: ManualProductChatData = {
      name: (answers.name || '').trim(),
      unitPriceUsd: Number(answers.price) || 0,
      originCountry: (answers.origin || '').trim(),
      packedWeightKg: Number(answers.weight) || 0,
      moq: Number(answers.moq) || 1,
      volumeCbm: answers.volume && Number(answers.volume) > 0 ? Number(answers.volume) : null,
    }
    onStructuredData(data)
  }

  const advanceStep = (rawValue: string) => {
    const value = rawValue.trim()
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
    setChatInput(chatAnswers[step] || '')
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
        {answeredSteps.map((step) => (
          <React.Fragment key={step}>
            <div className="chatbot-msg assistant">{CHAT_LABELS[step]}</div>
            <button
              type="button"
              className="chatbot-msg user"
              onClick={() => editAnswer(step)}
              aria-label={`${CHAT_LABELS[step]}: ${CHAT_RECEIPT_FMT[step](chatAnswers[step] || '')} — tocá para editar`}
            >
              {CHAT_RECEIPT_FMT[step](chatAnswers[step] || '')}
            </button>
          </React.Fragment>
        ))}
        <div key={chatStep} className="chatbot-msg assistant chatbot-msg-enter">
          {CHAT_LABELS[chatStep]}
          {chatStep === 'volume' && <span className="chatbot-optional-tag"> · Opcional</span>}
        </div>
      </div>

      <div className="chatbot-input-dock">
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
        {chatStep === 'volume' && (
          <button type="button" className="chatbot-skip-btn" onClick={() => finalizeChat(chatAnswers)}>
            No sé / omitir
          </button>
        )}
      </div>
    </div>}

    {error && <div className="pipeline-warning owned-product-error" role="alert"><b>No pude continuar todavía.</b><span>{error}</span></div>}
  </section>
}
