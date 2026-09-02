const STORAGE_KEY = 'shippingapp:journey:v1'
const URL_KEY = 'journey'

export type PersistedJourneyState = {
  v: 1
  intent: 'have_product' | 'search_product' | 'discover'
  purpose?: 'resale' | 'own_use' | 'unknown'
  entityType?: 'company' | 'individual' | 'unknown'
  signature?: 'yes' | 'no' | 'unknown'
  sensitiveCategory?: 'none' | 'food' | 'toys' | 'cosmetics' | 'medicines' | 'supplements' | 'unknown'
  budgetMode?: 'budget' | 'units' | 'unknown'
  budgetUsd?: number
  unitsMin?: number
  unitsMax?: number
  step: 1 | 2 | 3
}

type HistoryMode = 'replace' | 'push'

const intentByCopy: Array<[string, PersistedJourneyState['intent']]> = [
  ['Ya tengo un producto', 'have_product'],
  ['Quiero buscarlo', 'search_product'],
  ['Quiero descubrir', 'discover'],
]

const purposeByCopy: Record<string, PersistedJourneyState['purpose']> = {
  Reventa: 'resale',
  'Uso propio': 'own_use',
  'No sé': 'unknown',
  'Todavía no sé': 'unknown',
}

const entityByCopy: Record<string, PersistedJourneyState['entityType']> = {
  Empresa: 'company',
  Persona: 'individual',
  'Persona humana': 'individual',
  'No sé': 'unknown',
  'Todavía no sé': 'unknown',
}

const signatureByCopy: Record<string, PersistedJourneyState['signature']> = {
  Sí: 'yes',
  No: 'no',
  'No sé': 'unknown',
  'Sí, tengo firma/importador': 'yes',
  'No tengo firma/importador': 'no',
  'Todavía no sé': 'unknown',
}

const sensitiveByCopy: Record<string, PersistedJourneyState['sensitiveCategory']> = {
  'No es categoría sensible': 'none',
  Alimentos: 'food',
  Juguetes: 'toys',
  Cosméticos: 'cosmetics',
  Medicamentos: 'medicines',
  Suplementos: 'supplements',
  'Todavía no sé': 'unknown',
}

const budgetByCopy: Record<string, PersistedJourneyState['budgetMode']> = {
  'Tengo presupuesto': 'budget',
  'Tengo rango de unidades': 'units',
  'Todavía no sé': 'unknown',
}

function encodeState(state: PersistedJourneyState) {
  const encoded = btoa(JSON.stringify(state))
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeState(value: string | null): PersistedJourneyState | null {
  if (!value) return null
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
    const parsed = JSON.parse(atob(padded)) as Partial<PersistedJourneyState>
    if (parsed.v !== 1 || !['have_product', 'search_product', 'discover'].includes(parsed.intent || '')) return null
    const rawStep = Number(parsed.step)
    const step: 1 | 2 | 3 = rawStep >= 3 ? 3 : rawStep === 2 ? 2 : 1
    return { ...parsed, v: 1, intent: parsed.intent as PersistedJourneyState['intent'], step }
  } catch {
    return null
  }
}

function textOf(element: Element | null) {
  return element?.textContent?.trim() || ''
}

function mapByPrefix<T>(copy: string, mapping: Record<string, T>) {
  const entry = Object.entries(mapping).find(([label]) => copy === label || copy.startsWith(label))
  return entry?.[1]
}

function selectedRadioCopy(label: string) {
  const group = Array.from(document.querySelectorAll<HTMLElement>('[role="radiogroup"]'))
    .find((candidate) => candidate.getAttribute('aria-label') === label)
  return textOf(group?.querySelector('[role="radio"][aria-checked="true"]'))
}

function completedCardValues(number: '01' | '02') {
  const card = Array.from(document.querySelectorAll<HTMLElement>('.journey-question-card'))
    .find((candidate) => textOf(candidate.querySelector('.journey-question-head > span')) === number)
  return Array.from(card?.querySelectorAll<HTMLElement>('.journey-complete-row > span') || []).map(textOf)
}

function captureIntent() {
  const copy = textOf(document.querySelector('.journey-bubble.user b'))
  if (copy.includes('Ya tengo el producto')) return 'have_product' as const
  if (copy.includes('Quiero buscar un producto')) return 'search_product' as const
  if (copy.includes('Quiero explorar oportunidades')) return 'discover' as const
  return null
}

function captureStep(): 1 | 2 | 3 {
  const active = document.querySelector('.journey-question-card.active .journey-question-head > span')?.textContent?.trim()
  if (active === '01') return 1
  if (active === '02') return 2
  return 3
}

function finitePositive(value: string | undefined) {
  if (value === undefined) return undefined
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function captureOperation() {
  const completed = completedCardValues('01')
  const purposeCopy = selectedRadioCopy('¿Para qué lo traés?') || completed[0] || ''
  const entityCopy = selectedRadioCopy('¿Quién importa?') || completed[1] || ''
  const signatureCopy = selectedRadioCopy('¿Tenés firma/importador para operar?') || completed[2] || ''
  const sensitiveCopy = completed[3] || ''
  const selectValue = document.querySelector<HTMLSelectElement>('#journey-sensitive-category')?.value

  return {
    purpose: mapByPrefix(purposeCopy, purposeByCopy),
    entityType: mapByPrefix(entityCopy, entityByCopy),
    signature: mapByPrefix(signatureCopy, signatureByCopy),
    sensitiveCategory: (selectValue || mapByPrefix(sensitiveCopy, sensitiveByCopy)) as PersistedJourneyState['sensitiveCategory'],
  }
}

function captureBudget() {
  const selectedCopy = selectedRadioCopy('Presupuesto o rango')
  const completedCopy = completedCardValues('02')[0] || ''
  const activeMode = mapByPrefix(selectedCopy, budgetByCopy)

  if (activeMode === 'budget') {
    return {
      budgetMode: activeMode,
      budgetUsd: finitePositive(document.querySelector<HTMLInputElement>('.journey-number-field input')?.value),
    }
  }

  if (activeMode === 'units') {
    const inputs = document.querySelectorAll<HTMLInputElement>('.journey-range-fields input')
    return {
      budgetMode: activeMode,
      unitsMin: finitePositive(inputs[0]?.value),
      unitsMax: finitePositive(inputs[1]?.value),
    }
  }

  if (activeMode === 'unknown') return { budgetMode: activeMode }

  const units = completedCopy.match(/([\d.]+)\s*[–-]\s*([\d.]+)\s*unidades/i)
  if (units) {
    return {
      budgetMode: 'units' as const,
      unitsMin: finitePositive(units[1].replace(/\./g, '')),
      unitsMax: finitePositive(units[2].replace(/\./g, '')),
    }
  }

  const budget = completedCopy.match(/Hasta USD\s*([\d.]+)/i)
  if (budget) {
    return {
      budgetMode: 'budget' as const,
      budgetUsd: finitePositive(budget[1].replace(/\./g, '')),
    }
  }

  if (completedCopy.includes('por definir')) return { budgetMode: 'unknown' as const }
  return {}
}

export function captureJourneyState(): PersistedJourneyState | null {
  const intent = captureIntent()
  if (!intent) return null
  return {
    v: 1,
    intent,
    ...captureOperation(),
    ...captureBudget(),
    step: captureStep(),
  }
}

function urlForState(state: PersistedJourneyState | null) {
  const url = new URL(window.location.href)
  if (state) url.searchParams.set(URL_KEY, encodeState(state))
  else url.searchParams.delete(URL_KEY)
  return `${url.pathname}${url.search}${url.hash}`
}

function writeState(state: PersistedJourneyState | null, mode: HistoryMode) {
  if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  else localStorage.removeItem(STORAGE_KEY)

  const nextUrl = urlForState(state)
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (nextUrl === currentUrl) return
  if (mode === 'push') window.history.pushState({ shippingAppJourney: true }, '', nextUrl)
  else window.history.replaceState({ shippingAppJourney: true }, '', nextUrl)
}

function readStoredState() {
  const fromUrl = decodeState(new URL(window.location.href).searchParams.get(URL_KEY))
  if (fromUrl) return fromUrl
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedJourneyState
    if (parsed.v !== 1 || !parsed.intent) return null
    return { ...parsed, step: parsed.step >= 3 ? 3 : parsed.step === 2 ? 2 : 1 } as PersistedJourneyState
  } catch {
    return null
  }
}

function waitFor<T extends Element>(resolver: () => T | null, timeoutMs = 1800) {
  return new Promise<T>((resolve, reject) => {
    const immediate = resolver()
    if (immediate) {
      resolve(immediate)
      return
    }
    const started = Date.now()
    const timer = window.setInterval(() => {
      const value = resolver()
      if (value) {
        window.clearInterval(timer)
        resolve(value)
        return
      }
      if (Date.now() - started > timeoutMs) {
        window.clearInterval(timer)
        reject(new Error('Journey restoration target did not appear'))
      }
    }, 20)
  })
}

function buttonContaining(copy: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => textOf(button).includes(copy)) || null
}

async function chooseIntent(intent: PersistedJourneyState['intent']) {
  const current = captureIntent()
  if (current === intent) return
  if (current) {
    buttonContaining('Nuevo caso')?.click()
    await waitFor(() => buttonContaining('Ya tengo un producto'))
  }
  const copy = intentByCopy.find(([, value]) => value === intent)?.[0]
  if (!copy) return
  ;(await waitFor(() => buttonContaining(copy))).click()
}

function radioFor(groupLabel: string, value: string | undefined) {
  if (!value) return null
  const group = Array.from(document.querySelectorAll<HTMLElement>('[role="radiogroup"]'))
    .find((candidate) => candidate.getAttribute('aria-label') === groupLabel)
  if (!group) return null
  return Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]'))
    .find((button) => textOf(button) === value || textOf(button).startsWith(value)) || null
}

async function selectRadio(groupLabel: string, copy: string | undefined) {
  if (!copy) return
  const radio = await waitFor(() => radioFor(groupLabel, copy))
  if (radio.getAttribute('aria-checked') !== 'true') radio.click()
}

function dispatchControlledChange(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

async function restoreOperation(state: PersistedJourneyState) {
  const purposeCopy = Object.entries(purposeByCopy).find(([, value]) => value === state.purpose && !value?.includes?.('Todavía'))?.[0]
    || Object.entries(purposeByCopy).find(([, value]) => value === state.purpose)?.[0]
  const entityCopy = Object.entries(entityByCopy).find(([label, value]) => value === state.entityType && ['Empresa', 'Persona', 'No sé'].includes(label))?.[0]
  const signatureCopy = Object.entries(signatureByCopy).find(([label, value]) => value === state.signature && ['Sí', 'No', 'No sé'].includes(label))?.[0]

  await selectRadio('¿Para qué lo traés?', state.purpose === 'unknown' ? 'No sé' : purposeCopy)
  await selectRadio('¿Quién importa?', state.entityType === 'unknown' ? 'No sé' : entityCopy)
  await selectRadio('¿Tenés firma/importador para operar?', state.signature === 'unknown' ? 'No sé' : signatureCopy)

  if (state.sensitiveCategory) {
    const select = await waitFor(() => document.querySelector<HTMLSelectElement>('#journey-sensitive-category'))
    if (select.value !== state.sensitiveCategory) dispatchControlledChange(select, state.sensitiveCategory)
  }
}

async function restoreBudget(state: PersistedJourneyState) {
  const budgetCopy = Object.entries(budgetByCopy).find(([, value]) => value === state.budgetMode)?.[0]
  await selectRadio('Presupuesto o rango', budgetCopy)

  if (state.budgetMode === 'budget' && state.budgetUsd) {
    const input = await waitFor(() => document.querySelector<HTMLInputElement>('.journey-number-field input'))
    dispatchControlledChange(input, String(state.budgetUsd))
  }

  if (state.budgetMode === 'units') {
    const first = await waitFor(() => document.querySelectorAll<HTMLInputElement>('.journey-range-fields input')[0] || null)
    const second = await waitFor(() => document.querySelectorAll<HTMLInputElement>('.journey-range-fields input')[1] || null)
    if (state.unitsMin) dispatchControlledChange(first, String(state.unitsMin))
    if (state.unitsMax) dispatchControlledChange(second, String(state.unitsMax))
  }
}

function currentStep() {
  if (!captureIntent()) return 0
  return captureStep()
}

async function moveBackward(target: 1 | 2 | 3) {
  if (currentStep() >= 3 && target <= 2) {
    const budgetCard = Array.from(document.querySelectorAll<HTMLElement>('.journey-question-card'))
      .find((card) => textOf(card.querySelector('.journey-question-head > span')) === '02')
    budgetCard?.querySelector<HTMLButtonElement>('.journey-question-head button')?.click()
    await waitFor(() => document.querySelector('.journey-question-card.active .journey-question-head > span')?.textContent?.trim() === '02' ? document.querySelector('.journey-question-card.active') : null)
  }
  if (currentStep() >= 2 && target === 1) {
    const operationCard = Array.from(document.querySelectorAll<HTMLElement>('.journey-question-card'))
      .find((card) => textOf(card.querySelector('.journey-question-head > span')) === '01')
    operationCard?.querySelector<HTMLButtonElement>('.journey-question-head button')?.click()
    await waitFor(() => document.querySelector('.journey-question-card.active .journey-question-head > span')?.textContent?.trim() === '01' ? document.querySelector('.journey-question-card.active') : null)
  }
}

export async function restoreJourneyState(state: PersistedJourneyState) {
  await chooseIntent(state.intent)
  await moveBackward(state.step)

  if (currentStep() === 1) await restoreOperation(state)
  if (state.step === 1) return

  if (currentStep() === 1) {
    const continueOperation = await waitFor(() => buttonContaining('Seguir con presupuesto'))
    if (!continueOperation.disabled) continueOperation.click()
  }

  await waitFor(() => document.querySelector('.journey-question-card.active .journey-question-head > span')?.textContent?.trim() === '02' ? document.querySelector('.journey-question-card.active') : null)
  await restoreBudget(state)
  if (state.step === 2) return

  const continueBudget = await waitFor(() => buttonContaining('Seguir con el producto'))
  if (!continueBudget.disabled) continueBudget.click()
}

export function installJourneyPersistence() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined

  let restoring = false
  let scheduled = false
  let historyMode: HistoryMode = 'replace'

  const schedulePersist = (mode: HistoryMode = 'replace') => {
    if (restoring) return
    if (mode === 'push') historyMode = 'push'
    if (scheduled) return
    scheduled = true
    window.setTimeout(() => {
      scheduled = false
      const state = captureJourneyState()
      writeState(state, historyMode)
      historyMode = 'replace'
    }, 25)
  }

  const onClick = (event: MouseEvent) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button')
    if (!button) return
    const copy = textOf(button)

    if (copy === 'Cambiar') {
      event.preventDefault()
      event.stopPropagation()
      localStorage.removeItem(STORAGE_KEY)
      const url = new URL(window.location.href)
      url.searchParams.delete(URL_KEY)
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
      buttonContaining('Nuevo caso')?.click()
      return
    }

    if (copy.includes('Nuevo caso')) {
      localStorage.removeItem(STORAGE_KEY)
      schedulePersist('replace')
      return
    }

    if (intentByCopy.some(([label]) => copy.includes(label)) || copy.includes('Seguir con presupuesto') || copy.includes('Seguir con el producto') || copy === 'Editar') {
      schedulePersist('push')
      return
    }

    if (button.getAttribute('role') === 'radio') schedulePersist('replace')
  }

  const onChange = (event: Event) => {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) schedulePersist('replace')
  }

  const restore = async (state: PersistedJourneyState | null) => {
    restoring = true
    try {
      if (!state) {
        buttonContaining('Nuevo caso')?.click()
        localStorage.removeItem(STORAGE_KEY)
        return
      }
      await restoreJourneyState(state)
      writeState(state, 'replace')
    } finally {
      restoring = false
    }
  }

  const onPopState = () => {
    const fromUrl = decodeState(new URL(window.location.href).searchParams.get(URL_KEY))
    void restore(fromUrl)
  }

  document.addEventListener('click', onClick, true)
  document.addEventListener('change', onChange, true)
  document.addEventListener('input', onChange, true)
  window.addEventListener('popstate', onPopState)

  const observer = new MutationObserver(() => schedulePersist('replace'))
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-checked'] })

  const initial = readStoredState()
  if (initial) queueMicrotask(() => void restore(initial))

  return () => {
    observer.disconnect()
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('change', onChange, true)
    document.removeEventListener('input', onChange, true)
    window.removeEventListener('popstate', onPopState)
  }
}
