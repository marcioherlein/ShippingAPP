# GlobalShipping — Master Implementation Prompt
## Unified fix plan: chatbot clarity, design continuity, "para qué se usa" loop, auth reset, NCM flow

**Version:** 1.0 — 2026-10-02  
**Status:** Ready for batch execution  
**Scope:** UX, design system, classification logic, auth persistence, result dossier  

---

## Problem Registry

Six distinct failures identified from live testing (screenshots 2026-10-02):

| ID  | Name                              | Severity | Impact                                                  |
|-----|-----------------------------------|----------|---------------------------------------------------------|
| P1  | Chatbot unit ambiguity            | High     | User doesn't know if weight is kg or g; inputs wrong data |
| P2  | Design Frankenstein               | High     | Chatbot UI → confirmation screen → result are 3 different design systems; no continuity |
| P3  | "Para qué se usa" for obvious products | Critical | App asks a speaker's function — this should never happen |
| P4  | "Para qué se usa" asked twice     | Critical | Function is collected in chatbot context AND asked again in classification; user gives up |
| P5  | Auth login resets journey state   | Critical | User fills chatbot → hits auth wall → logs in → all state gone, same screen reappears |
| P6  | NCM doesn't auto-start            | Critical | After confirmation, no NCM lookup fires; instead shows another "para qué se usa" instead of classification checklist |

---

## Design Direction (all batches must follow)

**Tone:** Apple clarity × Palantir data precision  
**Typography rule:** No heading larger than 24px inside a workflow step (the app is a tool, not a marketing page)  
**Component grammar:**  
- Single thread: conversation cards share one visual container, no hard cuts between chatbot → confirmation → classification → result  
- Surface: `--ds-surface` white card, `--ds-shadow-2` box-shadow, `--ds-radius-2xl` 22px radius  
- Accent: `var(--ds-brand)` #4f5de4 only for interactive state and primary CTAs  
- Data: monospace numbers via `font-variant-numeric: tabular-nums`  
- Labels: 11px / 700 / letter-spacing .10em / `#8e8e93` — Palantir-style field label  

**Anti-patterns to eliminate:**  
- `clamp(28px, 4vw, 44px)` headings inside workflow steps  
- Mixed border-radius values (22px in chatbot, 12px in confirmation, 16px in result)  
- White cards inside gray cards inside white sections (triple nesting)  
- Asking the same question at two different steps  

---

## 10-Batch Implementation Plan

---

### Batch 01 — Chatbot Input: Units, Validation, Receipt Format
**Addresses:** P1  
**Files:** `src/components/OwnedProductIntake.tsx`, `src/styles/progressive-product-confirmation.css`

**Problem:** "¿Cuánto pesa por unidad?" has unit only in placeholder text (disappears on focus). No persistent unit badge. Receipt bubble shows raw number with no unit.

**Design spec:**
- Each numeric input gets an inline right-aligned unit badge inside the input frame: `USD` for price, `kg` for weight, `m³` for volume, `u.` for MOQ
- Unit badge: `font-size: 13px; font-weight: 600; color: #8e8e93; padding-left: 8px; white-space: nowrap`
- Input row becomes `display: flex; align-items: center` with the unit badge as a non-editable sibling
- Receipt bubbles (answered steps shown as user bubbles): format as `15 USD`, `0.35 kg`, `0.002 m³`, `50 u.`

**Technical spec:**
- Add `CHAT_UNITS: Record<ChatStep, string | null>` to `OwnedProductIntake.tsx`  
  ```ts
  const CHAT_UNITS: Record<ChatStep, string | null> = {
    name: null, price: 'USD', origin: null, weight: 'kg', moq: 'u.', volume: 'm³'
  }
  ```
- Wrap `chatbot-dock-input` + unit in `chatbot-dock-input-wrap`:  
  ```tsx
  <div className="chatbot-dock-input-wrap">
    <input ... />
    {CHAT_UNITS[chatStep] && <span className="chatbot-dock-unit" aria-hidden="true">{CHAT_UNITS[chatStep]}</span>}
  </div>
  ```
- Update `CHAT_RECEIPT_FMT` to append unit: `price: (v) => `${v} USD``, etc.
- Update `placeholderWithUnit` to remove unit from placeholder (it's now in the badge)

**Audit criteria:**
- At the weight step, "kg" is visible when the input is focused and has a value
- `aria-label` on the input still includes the full context: "¿Cuánto pesa por unidad? (kg)"
- Receipt bubbles for each answered step show the value + unit

**Expected result:** User always knows what unit they're entering. No ambiguity.

---

### Batch 02 — Design Bridge: Chatbot → Confirmation Continuity
**Addresses:** P2  
**Files:** `src/styles/progressive-product-confirmation.css`, `src/components/OwnedProductIntake.tsx`, `src/components/CalculationPipeline.tsx`

**Problem:** The confirmation screen ("Esto es lo que entendí. ¿Está bien?") is a completely different visual language from the chatbot. The heading is 40px+, the cards are a different radius, the spacing is different. User experiences a jarring visual "jump."

**Design spec:**
- **Confirmation heading** (`pipeline-confirm-head h2`, `progressive-confirm-head h2`): max `font-size: 19px; font-weight: 600; letter-spacing: -.018em; color: #1d1d1f`
- **Remove** the giant eyebrow + oversized heading pattern from `CalculationPipeline`'s confirmation state
- **Adopt product-card grammar**: The "PRODUCTO DETECTADO" card should use the same `.chatbot-topbar` style header as the chatbot, creating visual continuity
- **Field grid**: Two-column grid for Función/Origen/Precio/MOQ fields — use `border: 1px solid rgba(0,0,0,0.06); border-radius: 12px; padding: 12px 14px` (same radius family as chatbot bubbles)
- **"Corregir datos" button**: Same style as chatbot's "Cambiar" button — not a full-width bordered box

**Technical spec:**
- In `src/styles/progressive-product-confirmation.css`, reduce:
  ```css
  .progressive-confirm-head h2 { font-size: 19px; letter-spacing: -.018em; }
  .pipeline-confirm-head h2 { font-size: 19px; letter-spacing: -.018em; }
  ```
- Replace `CONFIRMACIÓN INTELIGENTE` eyebrow + large title block with a compact topbar-style header matching `.chatbot-topbar`
- Normalize card border-radius across all three stages to `16px` (between chatbot's `18px` and confirmation's current `12px`)
- Remove triple-nesting: `.owned-product-intake > .progressive-confirm-head > card > inner-card` — flatten to two levels max

**Audit criteria:**
- Font-size audit: no heading inside a workflow step exceeds 22px
- Visual continuity: chatbot container and confirmation container share the same outer border-radius and background
- Screenshot at 390px: no layout shift between chatbot step and confirmation step

**Expected result:** The flow reads as one continuous thread, not three separate apps stitched together.

---

### Batch 03 — Function Inference Engine (suppress "para qué se usa" for obvious products)
**Addresses:** P3, P4  
**Files:** `src/lib/productConfirmation.ts`, `src/components/CalculationPipeline.tsx`

**Problem:** User types "Parlante bluetooth JBL" — the app still asks "¿Para qué se usa este producto?". A speaker's function is unambiguous. This question must never appear for obvious product categories.

**Design spec:**
- When function is inferred, NO question is shown. Period.
- If function cannot be inferred (truly ambiguous), a single compact inline question appears — not a separate full card with eyebrow heading "UNA PREGUNTA PARA TERMINAR"
- The question, when required, renders as a chat bubble in the existing thread, not a standalone section

**Technical spec — `src/lib/productConfirmation.ts`:**
```ts
export function inferFunctionFromProductName(name: string): string | null {
  const n = name.toLowerCase()
  const rules: [RegExp, string][] = [
    [/parlante|speaker|altavoz|bocina|bafle|soundbar/, 'Reproduce audio'],
    [/auricular|headphone|earphone|earbud|airpod|earphones/, 'Escucha audio personal'],
    [/reloj|watch|clock|smartwatch/, 'Mide y muestra la hora'],
    [/mouse|ratón|raton/, 'Periférico de puntero para computadora'],
    [/teclado|keyboard/, 'Periférico de entrada para computadora'],
    [/celular|smartphone|iphone|galaxy|motorola|telefono|teléfono/, 'Dispositivo de comunicación móvil'],
    [/tablet|ipad/, 'Dispositivo de cómputo portátil táctil'],
    [/cargador|charger|adaptador de corriente/, 'Carga baterías de dispositivos electrónicos'],
    [/cable usb|cable hdmi|cable lightning|cable tipo c|cable type c/, 'Transmite corriente o señal entre dispositivos'],
    [/lámpara|lampara|bulbo|foco|led|iluminación|iluminacion/, 'Ilumina espacios'],
    [/mochila|backpack|morral/, 'Porta objetos y pertenencias'],
    [/cargador|power bank|batería portátil/, 'Almacena y transfiere energía eléctrica'],
    [/zapato|zapatilla|calzado|sandalia|shoe|sneaker/, 'Calzado para cubrir y proteger el pie'],
    [/remera|camiseta|ropa|camisa|pantalón|vestido|shirt|jacket/, 'Prenda de vestir'],
    [/paleta|raqueta|racket|paddle/, 'Implemento deportivo para golpear pelotas'],
    [/pelota|ball|balón|balon/, 'Elemento esférico para deporte o recreación'],
    [/sartén|olla|pot|pan|wok|cocina/, 'Utensilio para cocinar alimentos'],
    [/termo|thermos|termo acero/, 'Recipiente térmico para mantener temperatura de líquidos'],
    [/botella|bottle|vaso|taza|mug|cup/, 'Recipiente para contener o servir líquidos'],
    [/lámpara|linterna|flashlight/, 'Proporciona iluminación portátil'],
    [/drone|quadcopter/, 'Vehículo aéreo no tripulado de control remoto'],
    [/router|modem|wifi/, 'Distribuye señal de red inalámbrica'],
    [/impresora|printer/, 'Transfiere contenido digital a soporte físico'],
    [/cámara|camera|webcam/, 'Captura imágenes o video'],
  ]
  for (const [pattern, fn] of rules) {
    if (pattern.test(n)) return fn
  }
  return null
}
```

- In `productConfirmationFromAnalysis` (line ~83): if `analysis.product.functionText` is null, call `inferFunctionFromProductName(name)` and assign it. This pre-fills function before any clarification cycle.
- In `CalculationPipeline.tsx` `clarificationCopy` section: if `refinement?.attempt > 0` AND `clarificationTarget === 'functionText'`, skip rendering the clarification card entirely (function was already asked; asking again is the bug).

**Audit criteria:**
- Unit test: `inferFunctionFromProductName('Parlante bluetooth JBL')` returns `'Reproduce audio'`
- Unit test: `inferFunctionFromProductName('Producto desconocido')` returns `null`
- E2E: entering "Parlante bluetooth" in the chatbot → no "para qué se usa" card ever appears → NCM classification starts immediately
- E2E: entering a truly ambiguous product → clarification card appears exactly once

**Expected result:** Obvious products never see "¿Para qué se usa?". The question appears only for genuinely ambiguous categories, and only once.

---

### Batch 04 — Auth State Persistence (no reset after login)
**Addresses:** P5  
**Files:** `src/App.tsx`, `src/auth/` (auth callback/hook), `src/lib/sessionDraft.ts` (new)

**Problem:** User fills out the chatbot, gets to the confirmation screen, hits the auth wall, logs in, and the entire journey state is wiped. They're back at the same screen, now needing to re-enter everything.

**Design spec:**
- No user-visible change during auth flow if state is restored correctly
- On return from auth, the UI should restore to exactly where they left off (same step, same product data, same analysis if present)
- One-time toast "Bienvenido de vuelta — tu cotización fue restaurada" (3s auto-dismiss)

**Technical spec:**
```ts
// src/lib/sessionDraft.ts
const DRAFT_KEY = 'gs_journey_draft_v1'

export function saveDraft(state: JourneyDraftState): void {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...state, savedAt: Date.now() })) }
  catch { /* quota exceeded — silently skip */ }
}

export function loadDraft(): JourneyDraftState | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Discard drafts older than 30 minutes
    if (Date.now() - parsed.savedAt > 30 * 60 * 1000) { sessionStorage.removeItem(DRAFT_KEY); return null }
    return parsed
  } catch { return null }
}

export function clearDraft(): void {
  sessionStorage.removeItem(DRAFT_KEY)
}
```

- `JourneyDraftState` captures: `intent`, `purpose`, `entityType`, `signature`, `sensitiveCategory`, `budgetMode`, `analysis` (serialized), `step`, `progressStep`
- In `App.tsx`: `useEffect` that runs whenever any of these values changes → calls `saveDraft(currentState)`
- On mount: call `loadDraft()`. If a draft exists AND the user just completed auth (detect via URL param `?auth_return=1` or auth hook signal) → restore state from draft, call `clearDraft()`, show toast
- Auth hook: before redirecting to auth, add `?auth_return=1` to the return URL

**Audit criteria:**
- Fill chatbot → hit "Continuar" on last step → click "Ingresar" → complete auth → land back → product data is restored, same step shown
- Refreshing the page without auth flow → draft is NOT restored (sessionStorage only, not localStorage — intentional for privacy)
- Draft older than 30 minutes → NOT restored

**Expected result:** Auth is invisible to the user's workflow. They never re-enter data.

---

### Batch 05 — NCM Auto-Trigger with Loading State
**Addresses:** P6  
**Files:** `src/App.tsx` (`confirmAndCalculate`), `src/components/CalculationPipeline.tsx`

**Problem:** After the user confirms product data, NCM classification doesn't auto-start. The app blocks waiting for clarification that's often already answered (see Batch 03). User sees nothing happen.

**Design spec:**
- After "Seguir con el producto" (or confirming chatbot data), immediately show a compact loading skeleton inside the CalculationPipeline card:
  ```
  ┌─────────────────────────────────────────────┐
  │  🔍 Clasificando posición NCM...             │
  │  [━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  │
  │  Analizando 10.504 posiciones arancelarias   │
  └─────────────────────────────────────────────┘
  ```
- Loading state uses an animated shimmer bar (CSS `@keyframes shimmer`) — same pattern as Apple's skeleton loaders
- No blocking "you must answer X first" unless truly required

**Technical spec:**
- In `App.tsx` `confirmAndCalculate` (~L358–420): remove the hard block at the `low` confidence branch when `inferFunctionFromProductName` already provided a functionText
- The `status === 'missing'` block should only prevent when there are truly zero candidates — not when confidence is just LOW
- Add `isClassifying: boolean` state to `CalculationPipeline` props; when true, render the skeleton loader instead of the blocked state card
- The pipeline's `classificationReady` condition: `resolved || (hasProvisionalClassification(customs))` (from the existing plan)

**Audit criteria:**
- After confirming a Parlante bluetooth → classification starts within 200ms, skeleton appears
- No "blocked" card appears unless the product has zero candidates after 3 attempts

**Expected result:** The app feels live and intelligent. Classification starts immediately after product confirmation.

---

### Batch 06 — NCM Disambiguation: Checklist Instead of Open Question
**Addresses:** P6 (part 2), P3 (when inference fails)  
**Files:** `worker/ncmRetrieval.ts`, `src/components/NcmDisambiguation.tsx` (new), `src/styles/ncm-clarification.css`

**Problem:** When the product is ambiguous (rare, but real), the app shows a free-text "¿Para qué se usa?" instead of presenting the system's own candidate positions. The user has no idea what to type. The NCM positions are already computed internally — just never surfaced.

**Design spec — `NcmDisambiguation` component:**
```
┌──────────────────────────────────────────────────┐
│  CLASIFICACIÓN ARANCELARIA                         │
│  Encontré 3 posiciones posibles para tu producto  │
│                                                    │
│  ¿Cuál se parece más?                             │
│  ┌────────────────────────────────────────────┐  │
│  │ ○  Parlantes portátiles                   │  │
│  │ ○  Auriculares y receptores de audio      │  │
│  │ ○  Equipos de sonido para hogar           │  │
│  └────────────────────────────────────────────┘  │
│                                                    │
│  ¿Tiene batería propia?  [Sí] [No] [No sé]       │
│  ¿Es para uso profesional?  [Sí] [No] [No sé]   │
│                                                    │
│           [Confirmar selección →]                 │
└──────────────────────────────────────────────────┘
```

**Technical spec:**
- Worker (`worker/ncmRetrieval.ts`): on LOW/missing paths, emit `disambiguation: { candidates, questions }` (from existing plan — implement it now)
- `candidates`: top 4 from `ordered` with `plainLabel` = leaf of the `>` hierarchy
- `questions`: ≤3 yes/no/no-sé questions derived from discriminating attributes between candidates
- `NcmDisambiguation.tsx`: renders candidate chips (`.journey-choice-grid`) + attribute questions (`.journey-chip-row`) — reuses existing CSS classes, no new component system
- A **direct pick** routes through `onManualNcm` → provisional tariff for that candidate
- After 3 attempts: "Continuar con estimado" option always visible (never a dead-end)

**Audit criteria:**
- Ambiguous product → disambiguation card shows within 2s of confirmation
- User picks a candidate → `onManualNcm` fires → provisional duty populates
- Free-text fallback still available ("No encuentro mi producto")
- After 3 failed attempts → "Continuar con el estimado" is visible

**Expected result:** NCM classification feels like a guided selection, not a knowledge test.

---

### Batch 07 — Provisional Classification (best-effort, never dead-end)
**Addresses:** P6 (final fallback)  
**Files:** `worker/ncmRetrieval.ts`, `src/lib/customsClassification.ts`, `src/lib/fullNcmClient.ts`, `src/lib/productAnalysisV2.ts`, `src/App.tsx`, `src/components/CalculationPipeline.tsx`

**Problem:** When classification confidence is LOW, the app dead-ends: "No pude cerrar una NCM… no voy a completar el costo con un supuesto inventado." User has no recourse. A real importer expects an estimate, not a refusal.

**Design spec:**
- Low confidence → show amber "Estimado" state, not red "blocked" state:
  ```
  ⚠ Posición arancelaria estimada — verificá antes de operar
  NCM 8518.22.00 · Parlantes · 18% arancel estimado
  Basado en las 3 posiciones más probables para este producto
  ```
- Color: `--ds-warning` amber, not `--ds-danger` red
- The calculation proceeds with the provisional rate; the user can override

**Technical spec (additive — zero existing tests broken):**
- `worker/ncmRetrieval.ts` LOW branch: add `provisional: true`, `provisionalCode`, `provisionalDutyRatePct` (highest from top candidates = conservative estimate)
- `src/lib/fullNcmClient.ts` `mergeFullCustomsProfile`: copy `provisional*` fields onto profile while leaving `dutyRatePct: null` / `'FAIL-CLOSED CLIENT'` strings intact
- `src/lib/productAnalysisV2.ts`: add `hasProvisionalClassification()`, `effectiveDutyRatePct()` helpers
- `src/App.tsx` `confirmAndCalculate`: use `effectiveDutyRatePct(customs)` — proceeds when provisional available
- `CalculationPipeline.tsx`: `classificationReady = resolved || hasProvisionalClassification(customs)` — proceed if provisional

**Test contracts to preserve (verbatim strings, do not change):**
- `"FAIL-CLOSED CLIENT"` in fullNcmClient tests
- `"Confidence LOW"` in ncmRetrieval tests
- `"conflicto"` in conflict-branch tests
- `importerSummary.test.ts` `sin-mercado` with default `marketIsEstimate: false`

**Audit criteria:**
- LOW confidence product → provisional amber badge visible, calculation proceeds
- Existing 327+ unit tests pass unchanged
- New tests: `provisional: true` emitted by worker LOW branch; `effectiveDutyRatePct` returns provisional rate when confirmed is null

**Expected result:** Every product reaches a result. "No pude clasificar" is gone from user-facing UI.

---

### Batch 08 — Result Dossier Unification
**Addresses:** P2 (result phase)  
**Files:** `src/components/ImportQuoteFlow.tsx`, `src/styles/output-redesign.css`, `src/styles/pipeline.css`

**Problem:** The result is split across `CalculationPipeline` (4 step-boxes) and `ImportQuoteFlow` (~25 card treatments). User sees too many separate sections, duplicated data, different radii and backgrounds.

**Design spec (one dossier):**
```
┌─────────────────────────────────────────────────┐
│  USD 23.40  Costo puesto por unidad              │
│  ✓ Cálculo completo · NCM 8518.22.00             │
├─────────────────────────────────────────────────┤
│  Desglose                                        │
│  FOB proveedor          USD 20.00                │
│  Arancel (18%)          USD 3.60                 │
│  IVA importación        USD 4.91                 │
│  Flete LCL est.         USD 2.40                 │
│  Gastos locales         USD 1.20                 │
│  ─────────────────────────────────────────────  │
│  Total por unidad       USD 23.40                │
├─────────────────────────────────────────────────┤
│  ▸ Mercado argentino                            │
│  ▸ Veredictos                                   │
│  ▸ Comparativa logística                        │
│  ▸ Optimización                                 │
└─────────────────────────────────────────────────┘
```

**Technical spec:**
- `ImportQuoteFlow.tsx`: collapse to ONE `<h2>` hero + ONE `.journey-summary-list` breakdown + 4 `<details>` collapsibles
- Exactly one `<h1>` in the entire page (accessibility contract: already tested)
- Deduplicate `.unit-breakdown-list` (defined in both `pipeline.css` and `output-redesign.css`) — keep one, delete the other
- Fold `progressive-product-confirmation.css` variants into the shared `.result-card` token
- CSS tokens: `--ds-radius-2xl: 22px`, `--ds-surface: #fff`, `--ds-shadow-2` everywhere — no custom values

**Audit criteria:**
- `product-quality.e2e.ts` one-h1 test passes
- No more than 2 distinct border-radius values in the result section
- Visual review: result fits on screen without scroll at 390px for a standard product

**Expected result:** One card. One number. Expandable details. Nothing duplicated.

---

### Batch 09 — Market Price: Links + Labeled Estimate
**Addresses:** Missing market data (known gap)  
**Files:** `src/lib/marketSearchLinks.ts` (new), `src/lib/importerSummary.ts`, `src/components/ImportQuoteFlow.tsx` (`ArgentinaMarketCard`)

**Problem:** When no live market benchmark is available, the price section shows an empty field and a blocked "Evidencia insuficiente" state. User has no way to estimate what to charge.

**Design spec:**
```
┌─────────────────────────────────────────────────┐
│  Precio en Argentina                             │
│  Estimación no verificada                        │
│                                                  │
│  ~ARS 38.000  (costo × margen típico ×1.6)      │
│  Este número pre-cargó el campo editable ↓      │
│                                                  │
│  [🔍 Buscar en MercadoLibre AR]                 │
│  [🛍 Buscar en Google Shopping AR]              │
│                                                  │
│  Podés corregir el precio con lo que encontrés  │
└─────────────────────────────────────────────────┘
```

**Technical spec:**
```ts
// src/lib/marketSearchLinks.ts
export const mercadoLibreSearchUrl = (name: string) =>
  `https://listado.mercadolibre.com.ar/${encodeURIComponent(name).replace(/%20/g, '-')}`

export const googleShoppingArUrl = (name: string) =>
  `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(name + ' precio argentina')}&gl=ar&hl=es`
```

- `src/lib/importerSummary.ts`: add `TYPICAL_RESALE_MARKUP = 1.6`, `estimateLocalPrice(unitLandedCostUsd, fxArsPerUsd)` → `Math.round(unitLandedCostUsd * TYPICAL_RESALE_MARKUP * fxArsPerUsd)`
- `ImportQuoteFlow.tsx` `ArgentinaMarketCard`: when `marketStatus !== 'live'` and FX present → show estimate + both search links + pre-fill editable field
- Verdict honesty: append "(sobre precio estimado, no verificado)" — never promote to `marketStatus: 'live'`
- `sin-mercado` verdict: kept as-is when `marketIsEstimate: false` (default) — existing test unchanged

**Audit criteria:**
- `importerSummary.test.ts` passes unchanged (default `marketIsEstimate: false`)
- New test: `estimateLocalPrice(20, 1200) === 38400`
- No benchmark product → search buttons and labeled estimate visible, not a blocked state

**Expected result:** Every result has an actionable market section, even without live benchmark data.

---

### Batch 10 — End-to-End Audit + Regression Guard
**Addresses:** All P1–P6, catch regressions  
**Files:** `tests/e2e/`, `src/lib/*.test.ts`, `worker/*.test.ts`

**Audit scope:**

**A. Full flow smoke (Playwright):**
1. Landing → Calcular ahora → fill operation profile → select "Tengo rango de unidades"
2. Fill chatbot: Parlante bluetooth JBL / 20 / China / 0.35 / 10 / skip volume
3. Verify: NO "para qué se usa" card appears
4. Verify: NCM loading skeleton appears within 500ms
5. Result renders: single hero price, no blocked states

**B. Auth restore (Playwright):**
1. Fill chatbot steps 1-3 → check sessionStorage has draft
2. Mock auth return (set ?auth_return=1) → reload
3. Verify: chatbot state restored, no data re-entry required

**C. Unit regressions:**
- `./node_modules/.bin/vitest run src/` — 327+ tests pass
- `./node_modules/.bin/vitest run worker/` — all NCM tests pass, including FAIL-CLOSED strings
- New tests added in Batches 03, 04, 07, 09

**D. Design contract:**
- `product-quality.e2e.ts`: exactly one `<h1>`, 44px touch targets
- `accessibility.e2e.ts`: no serious axe violations
- `p2-semantics.e2e.ts`: radio groups, progressive reveal all pass

**E. Performance:**
- Time from product confirmation to first classification result: < 3s (Cloudflare Worker warm)
- LCP on landing: < 1.5s (existing, regression check)

**F. Copy contract:**
- `landingCopyContract.test.ts` passes — no banned phrases introduced
- No "supuesto inventado" in user-facing strings (may only appear in internal error context)

**Expected result:** Full pipeline works end-to-end. Every edge case has a test. No regressions from Batches 01–09.

---

## Agent Execution Map

Each batch can be assigned to a specialized agent. Independent batches can run in parallel.

| Batch | Type               | Can parallelize with |
|-------|--------------------|----------------------|
| 01    | UI + CSS           | 02, 04               |
| 02    | CSS + Component    | 01, 04               |
| 03    | Logic + Tests      | 04, 09               |
| 04    | State management   | 01, 02               |
| 05    | App flow logic     | depends on 03        |
| 06    | Worker + Component | depends on 03, 05    |
| 07    | Worker + Lib       | depends on 06        |
| 08    | Result component   | 09                   |
| 09    | Lib + Component    | 08                   |
| 10    | Audit (read-only)  | none — runs last     |

**Suggested execution order:**
- Wave 1 (parallel): Batch 01, 02, 04
- Wave 2 (parallel): Batch 03, 09
- Wave 3 (sequential): Batch 05 → 06 → 07
- Wave 4: Batch 08
- Wave 5: Batch 10 (audit)

---

---

## Audit Findings (2026-10-02 — two code-auditing agents ran against HEAD)

These findings update the technical specs above with exact line numbers and root causes.

### Finding A — Units exist in code but disappear on focus
`OwnedProductIntake.tsx` line 34-39: `CHAT_UNITS` constant IS defined. It's folded into `placeholderWithUnit` at line 164-166, which puts `(kg)` inside the placeholder string. Placeholder disappears when the field has focus or a value. **Fix**: make units a sibling badge, not part of placeholder (Batch 01 spec unchanged).

### Finding B — Giant heading: import order bug in `main.tsx`
Root cause: `design-system.css` is imported at `main.tsx` line 14, **one line after** `progressive-product-confirmation.css` (line 13). Both target `.pipeline-confirm-head h2` / `.progressive-confirm-head h2` with equal specificity (0,1,1). `design-system.css` contains `--ds-type-title: clamp(1.75rem, 4vw, 2.75rem)` (= 28–44px), which wins because it's last. The 17px/18px fixes in `pipeline.css` and `progressive-product-confirmation.css` are silently overridden.  
**Precise Batch 02 fix**: add `!important` to the font-size cap in `progressive-product-confirmation.css` line 19, OR restructure the `design-system.css` variable to be `18px` rather than `clamp(...)`. Adding `!important` is one-line and safe.

### Finding C — `inferFunctionFromProductName` ALREADY EXISTS at `productConfirmation.ts:30`
The function is already implemented (line 30) and already called as fallback in `productConfirmationFromAnalysis` (line 126): `functionText: cleanText(analysis.product.functionText || inferFunctionFromProductName(name), 500)`. **The inference is working.** The bug is elsewhere:

The NCM classifier returns `missingFacts` containing "función…" REGARDLESS of whether `functionText` was pre-filled locally. The clarification card at `CalculationPipeline.tsx:357` fires when `classifierAskedForMore = !classificationReady && missingFacts.length > 0` — it does NOT check if `draft.functionText` is already non-empty. 

**Precise Batch 03 fix (one-line change)**: at `CalculationPipeline.tsx:357`, add `&& !draft.functionText` to the render condition:
```tsx
{classifierAskedForMore && !refinementExhausted && !draft.functionText && ...}
```
This suppresses the clarification card when function text is already populated (from inference or a previous answer). The second-pass suppress (existing `refinement.attempt > 0 && target === 'functionText'` check) remains as a safety net.

### Finding D — `canConfirm` still requires clarification even when `functionText` is filled
At `CalculationPipeline.tsx:254-257`: `clarificationSatisfied = !classifierAskedForMore || identityEdited || clarification.trim().length >= 3`. If the card is hidden (via Finding C fix) but `classifierAskedForMore` is still `true` (because missingFacts is non-empty), the confirm button stays disabled.

**Precise fix**: change `clarificationSatisfied` to also accept when `draft.functionText` is non-empty:
```tsx
const clarificationSatisfied = !classifierAskedForMore || identityEdited 
  || clarification.trim().length >= 3 
  || (clarificationTarget === 'functionText' && !!draft.functionText)
```

### Finding E — Auth state reset: Clerk remount, not explicit reset
There is NO `resetJourney()` call triggered by auth events (confirmed). The likely cause is Clerk's `<ClerkProvider>` causing React to remount `App` when `isSignedIn` changes, wiping all `useState`. A recovery chain exists (`shippingapp:journey-restored` + sessionStorage draft), but it fires after the remount renders the blank state for one frame, causing the user to see the empty confirmation screen.

**Precise Batch 04 fix**: in `ClerkShell.tsx`, on the `isSignedIn` transition event (line 85-91), dispatch `shippingapp:auth-resolved` and ensure `App.tsx` immediately restores from `journeyPersistence` before its first render of the restored state. Also: save a `sessionStorage` auth-return marker (`gs_auth_return`) before the Clerk sign-in redirect, read and clear it on mount, and trigger a priority restore pass.

### Finding F — NCM auto-fires correctly, not blocked at `confirmAndCalculate`
`confirmAndCalculate` (App.tsx line 388-394) calls `enrichProductAnalysisV2` immediately when no classification exists. The blocking behavior the user sees is from `canConfirm` in `CalculationPipeline.tsx` being disabled (requiring clarification textarea input) — meaning the user CAN'T even click confirm to trigger the NCM call. This is a gate-before-call issue.  
**Batch 05 is still correct**: removing the clarification gate when `draft.functionText` is non-empty (Finding D fix) will unblock the path to NCM classification.

---

## Non-Negotiable Constraints

1. **Never ask "¿Para qué se usa?" twice.** One product, one question at most.
2. **Never dead-end on NCM.** Provisional estimate is always available.
3. **Auth must not reset state.** SessionStorage draft survives auth flow.
4. **Design tokens are shared.** No component invents its own radius/shadow/color.
5. **Test contracts are inviolable.** Verbatim strings "FAIL-CLOSED CLIENT", "conflicto", "Confidence LOW" must survive unchanged.
6. **Exactly one `<h1>` per page.** Accessibility contract.
7. **44px minimum touch targets.** All interactive elements.
8. **No heading > 22px inside a workflow step.** Marketing typography stays on the landing.
