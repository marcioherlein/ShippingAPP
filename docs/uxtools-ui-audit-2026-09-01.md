# ShippingAPP UI Audit — Tommy Geoco / UXTools Framework

Date: 2026-09-01
Framework source: `tommygeoco/ui-audit` (`SKILL.md` + relevant references)
ShippingAPP baseline: `7cd663743bf52ec2fc0e664e69b7c7247389bea8`

## Executive summary

This audit applies Tommy Geoco's UI Audit / Making UX Decisions framework to ShippingAPP. The framework treats design quality as contextual: first define jobs-to-be-done and macro bets, then evaluate hierarchy, style, accessibility, usability, onboarding, forms, system feedback and error handling.

ShippingAPP's strongest design choice is not its glass styling. It is the decision to stop when classification or cost inputs are uncertain instead of fabricating a complete answer. That behavior aligns directly with the product's primary macro bet: **Accuracy**.

The current UI supports that bet reasonably well through progressive disclosure, explicit pipeline stages, confidence language and traceable cost breakdowns. However, several implementation choices undermine the same promise: upstream edits can leave stale downstream calculation state, critical secondary text is visually weak, keyboard/screen-reader support is incomplete, and the visual system has accumulated overlapping CSS systems, icon styles and typography decisions.

The highest-value redesign is therefore not more polish. It is to make **state correctness, confidence, hierarchy and accessibility** feel as rigorous as the underlying import engine.

## Macro bets

| Category | Description | Alignment |
|---|---|---|
| Accuracy | Users must trust classification, landed-cost and market evidence. The app explicitly blocks uncertain NCM/cost states instead of inventing values. | Strong |
| Efficiency | Reduce customs/import complexity into only the decisions and missing facts that materially affect a quote. | Strong |
| Innovation | Conversational import copilot and progressive classification are differentiated interaction bets. | Moderate |
| Velocity | Existing React/CSS patterns allow rapid product iteration, but style fragmentation now creates regression risk. | Moderate |

### Design implication

When these bets conflict, **Accuracy > Efficiency > Innovation > visual novelty**. A glass effect, chat metaphor or faster path should never obscure uncertainty, create stale calculations, or make evidence harder to inspect.

## Jobs to be done

1. **Importer with a known product**
   - User: person or business considering an import into Argentina
   - Situation: already has a product, supplier or listing
   - Motivation: understand the real landed cost and regulatory/logistics implications
   - Outcome: decide whether to import, how much, and by which mode without becoming a customs expert

2. **User looking for a product**
   - User: entrepreneur/importer with an idea but no supplier selected
   - Situation: knows roughly what they want to source
   - Motivation: find viable Alibaba products and turn one into a complete import case
   - Outcome: move from product idea to comparable landed-cost decision quickly

3. **Opportunity explorer**
   - User: entrepreneur looking for import opportunities
   - Situation: does not yet have a specific product
   - Motivation: discover candidates with credible local economics
   - Outcome: identify opportunities worth deeper investigation without treating weak evidence as fact

---

# 1. Visual Hierarchy

| Check | Status | Notes |
|---|---|---|
| Page purpose understandable immediately | PASS | Hero states the core job: tell ShippingAPP what you want to import and it builds the case. |
| Primary entry decision obvious | PASS | Three entry intents are visually grouped and placed immediately after the introductory assistant message. |
| Step progression visible | PASS | Five named stages provide strong orientation: Objetivo → Tu operación → Presupuesto → Producto → Resultado. |
| Primary CTA differentiated from secondary actions | PASS | Main continuation actions use the saturated primary treatment; edit/secondary actions are visually lighter. |
| Related information grouped by proximity | PASS | Operation, budget, confirmation and pipeline stages use distinct cards/regions. |
| Most important result receives strongest visual weight | PASS | Final cost result and pipeline completion receive dedicated result sections rather than being buried in metadata. |
| Heading system is semantically/visually disciplined | WARN | Large hero/H2 hierarchy is clear, but the implementation mixes semantic headings with many `b`, `span`, `small` labels. Some card titles are visual headings without heading semantics. |
| Type scale is limited and reusable | FAIL | CSS uses many one-off sizes (9, 10, 11, 12, 13, 14, 15, 17, 18, 22, 23, 24, 27, 28–44, 42–76 etc.) rather than a defined 5–7 level scale. |
| Visual weight reflects decision importance | WARN | Glass cards, gradients, borders and shadows appear on many surfaces. When too many surfaces are elevated, important vs supporting content becomes less distinct. |
| Supporting metadata remains readable | FAIL | Repeated 9–12px metadata and light gray text are too visually weak for information that often affects trust and interpretation. |

### Hierarchy decision

Keep the five-stage journey and the strong result-first structure. Reduce the number of competing elevated surfaces and strengthen the visual hierarchy of evidence/confidence metadata.

---

# 2. Visual Style

| Check | Status | Notes |
|---|---|---|
| Spacing scale defined | FAIL | The CSS uses many arbitrary values rather than a documented 4/8-based token scale. |
| Same relationships use consistent spacing | WARN | Major journey cards are reasonably consistent, but specialized CSS files introduce many local spacing decisions. |
| Brand/action color system coherent | PASS | Indigo/blue is consistently used for primary actions and active progress states. |
| Semantic success/warning treatments coherent | PASS | Green completion and amber blocked/warning states are distinguishable and reinforced with text/icons. |
| Contrast accessible | FAIL | Several secondary text tokens are below WCAG AA for normal text; `#94a3b8` on white is a recurring example. |
| Elevation levels controlled | FAIL | Multiple cards use large shadows, glass backgrounds and blur regardless of interaction/elevation role. The interface lacks a small named elevation system. |
| Border/radius system controlled | WARN | Rounded styling is consistent in spirit but uses many radii (7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28, 30+). |
| Single icon style | FAIL | Unicode symbols (`▣`, `⌕`, `✦`, arrows, checkmarks, exclamation) coexist with CSS-created marks and other component icon treatments. |
| Single typography system | FAIL | `base.css` establishes Inter/system while `visual-consistency.css` globally overrides with SAP 72 / 72 Brand. This is design-system drift. |
| Body text meets minimum readable sizing | FAIL | Much explanatory and functional text is 10–14px. The framework targets 16px body text. |
| Motion is purposeful | PASS | Motion is generally tied to feedback, hover or progress rather than decorative cinematic effects. |
| Reduced motion respected | FAIL | Smooth scrolling, spinners and progress animations do not expose a `prefers-reduced-motion` fallback. |
| Glass/texture supports hierarchy rather than decoration | WARN | The glass aesthetic is coherent, but it is applied widely enough that surface hierarchy is sometimes flattened rather than clarified. |

### Visual-style decision

Create tokens before adding further Liquid Glass polish. A coherent system should define type, spacing, radii, elevation, semantic colors and icons first; glass becomes a surface treatment applied only to selected levels.

---

# 3. Accessibility

| Check | Status | Notes |
|---|---|---|
| Native semantic controls used | PASS | Core actions use `button`, `input`, `select`, `textarea`, `details` and `summary` rather than clickable divs. |
| Keyboard activation available for core controls | PASS | Native elements inherit Enter/Space behavior. |
| Focus always visible | FAIL | Native input outline is removed and focus styling is not systematically restored across buttons, selects, textareas, summaries and links. Some mobile navigation CSS explicitly suppresses outline. |
| Logical focus order | WARN | DOM order broadly follows the journey, but programmatic scrolling changes visual location without focus management. |
| Dynamic status announced | FAIL | Processing, blocked and ready states are visually rich but lack a consistent `aria-live`/`role=status` strategy. |
| Progress uses semantic progressbar | FAIL | The calculation progress bar has an `aria-label` but not full progressbar semantics/value attributes. |
| Selection controls expose selected state semantically | FAIL | Chip buttons visually behave like radio groups but do not consistently expose `aria-pressed`, `role=radiogroup` or native radio semantics. |
| Form labels present | PASS | Inputs are generally wrapped in labels or paired with explicit label text. |
| Related form fields grouped semantically | FAIL | Sets such as purpose/entity/importer-signature are visually grouped but not represented as `fieldset`/`legend` or equivalent group semantics. |
| Error messages linked to invalid fields | FAIL | Journey-level validation is sparse and error copy is not consistently wired through `aria-invalid` / `aria-describedby`. |
| Color not sole status indicator | PASS | Progress/blocked/done states include text and symbols in addition to color. |
| Text contrast meets AA | FAIL | Important secondary/caption text frequently falls below the 4.5:1 normal-text target. |
| Touch targets meet 44px target | WARN | Many selects/inputs hit 44px; some chips and small edit actions are below the framework's target. |
| Zoom/reflow foundation | PASS | The app includes explicit width bounding, wrapping and responsive single-column behavior. |
| Reduced motion | FAIL | No consistent reduced-motion media query. |
| Page language/title present | PASS | HTML uses `lang="es"` and a page title. |
| Screen-reader tested | NOT VERIFIED | No automated or manual VoiceOver/NVDA evidence exists in CI. |

### Accessibility decision

Accessibility is the clearest gap between product intent and implementation maturity. The fixes are mostly systematic rather than redesign-heavy: focus tokens, semantic grouping, live regions, progress semantics, contrast tokens and reduced motion.

---

# 4. Usability & Cognitive Load

| Check | Status | Notes |
|---|---|---|
| Complex task chunked into 3–7 steps | PASS | Five stages match the framework's ideal wizard range. |
| All steps visible upfront | PASS | Stepper shows the complete path. |
| Current step visible | PASS | Active/completed stage styling is explicit. |
| Back/edit path exists | PASS | Previous operation and budget answers can be reopened. |
| Validation before proceeding | FAIL | `budgetAnswered` only checks that a mode was chosen; zero budget and reversed unit ranges can continue. |
| Progress preserved while editing | FAIL | Upstream edits can leave downstream result state stale rather than invalidating/recalculating dependent values. |
| Final review before consequential result | PASS | Product identity/classification confirmation occurs before the cost pipeline. |
| Fields minimized | PASS | Classification asks for missing distinguishing facts rather than exposing a full customs form immediately. |
| Smart defaults used | PASS | Budget and unit defaults reduce blank-state effort; product-derived fields are prefetched. |
| Progressive disclosure used | PASS | Advanced/missing fields appear based on analysis state. This is one of the strongest UX choices in the product. |
| Recognition over recall | PASS | Summary sidebar and completed-answer chips keep prior choices visible. |
| Single-column form bias on mobile | PASS | Mobile media queries collapse major grids. |
| Main conversation actually behaves conversationally | WARN | The copy is conversational, but much of the interaction remains a wizard/cards form. The metaphor is useful but not yet fully earned. |
| Choice count controlled | PASS | Entry and operation questions keep option sets small. |
| Long content protected | PASS | CSS explicitly handles long URLs/text with wrapping and min-width constraints. |
| Browser/deep-link state preservation | FAIL | The guided case is primarily in local component state; browser back/deep linking does not represent journey state. |
| Abandonment recovery | WARN | SaaS history exists elsewhere in the product architecture, but the live guided form itself does not clearly communicate autosave/recovery during the flow. |

### Cognitive-load decision

Do not make the journey shorter simply to reduce clicks. The current five-step decomposition is appropriate for an intrinsically complex task. Reduce **extraneous** load instead: invalid states, repeated microcopy, ambiguous confidence metadata, style noise and stale data.

---

# 5. System Feedback

| Check | Status | Notes |
|---|---|---|
| Immediate loading feedback | PASS | Product selection/ingestion and calculation expose loading states. |
| Long process explains what is happening | PASS | Pipeline stages explain classification, tariffs, logistics and landed-cost assembly. |
| Determinate progress used where meaningful | PASS | Pipeline exposes staged percentage progress. |
| Fake certainty avoided | PASS | The engine explicitly blocks when required evidence is missing rather than silently progressing. |
| Success state clear | PASS | `ready` results include completed pipeline and summary. |
| Error/blocker language actionable | PASS | Blockers explain what is missing and provide a path to answer/review. |
| System/network error recovery consistent | WARN | Some ingestion failures fall back gracefully, but recovery interaction is not standardized across all sources/components. |
| Disabled actions explain why | FAIL | Primary buttons can become disabled without an adjacent explicit reason; the user must infer which unanswered field is blocking progress. |
| Empty/no-result states consistently designed | WARN | Discovery and source flows have fallbacks, but empty-state patterns are not clearly standardized across the application. |
| Contextual help available | PASS | The journey frequently explains why a field matters before asking for it. |
| Feedback exposed to assistive technology | FAIL | Visual feedback does not consistently map to live-region semantics. |

### Feedback decision

The content strategy for feedback is strong. The next maturity step is to make feedback **systematic and accessible**, not to add more messages.

---

# 6. Error Prevention & Recovery

| Check | Status | Notes |
|---|---|---|
| Invalid options constrained | PASS | Selects constrain several categorical choices; number fields use `min`/`step`. |
| Cross-field constraints enforced | FAIL | Unit min/max relationship is not validated before continuing. |
| Positive financial inputs enforced in journey | FAIL | Budget mode can be selected with a zero budget and still satisfy continuation logic. |
| Guidance before errors | PASS | Copy explains implications and expected data before input. |
| Error language human and non-technical | PASS | User-facing pipeline blockers generally avoid raw implementation errors. |
| Recovery path available | PASS | Blocked pipeline offers “Responder lo que falta” or choosing another product. |
| Third-party degradation handled | PASS | Alibaba ingestion can fall back to manual completion rather than crashing the case. |
| Stale dependent results prevented | FAIL | Editing upstream cost inputs does not consistently invalidate downstream `ready` state/summary. |
| Destructive reset protected | WARN | “Nuevo caso” clears the current journey immediately; once persistent/valuable case state exists, confirmation or undo should be considered. |
| Autosave/recovery communicated | WARN | Persistent account/history capabilities exist, but the live form does not visibly expose save status. |

### Error decision

The product correctly prioritizes **prevention over fabricated recovery** in classification. Apply the same rigor to UI state: invalid cross-field inputs and stale calculated results should be structurally impossible.

---

# 7. Onboarding / First Run

| Check | Status | Notes |
|---|---|---|
| Product value proposition visible before interaction | PASS | Hero describes the outcome in user language. |
| First action obvious | PASS | Three starting conditions map to recognizable user situations. |
| Domain expertise not required to begin | PASS | Copy explicitly says the user does not need customs knowledge. |
| Learning happens in context | PASS | The interface explains NCM/import implications only as they become relevant. |
| Initial choices map to JTBD | PASS | Have product / search / discover aligns strongly with the three primary jobs. |
| First-run experience overloaded | PASS | No modal tour or tutorial blocks entry. |
| Trust proof visible early enough | WARN | “Motor activo” is not meaningful evidence by itself. Early proof of sources/methodology could better establish why users should trust the result. |
| Returning-user acceleration | WARN | Existing account/history architecture can support this, but the guided journey does not yet visibly offer “use previous profile/defaults” at entry. |

### Onboarding decision

Do not add a tour. The current contextual onboarding is better. Improve **early trust proof** and returning-user shortcuts instead.

---

# 8. Forms

| Check | Status | Notes |
|---|---|---|
| Labels persistent | PASS | Labels are visible; placeholders are not the sole label mechanism. |
| Input purpose understandable | PASS | Most labels and helper text explain what affects the import calculation. |
| Field count minimized | PASS | Missing-data logic prevents full-form overload. |
| Conditional fields used | PASS | Fields appear when needed based on product/classification state. |
| Inline validation | FAIL | Operation/budget inputs lack robust field/cross-field validation feedback. |
| Invalid fields identified specifically | FAIL | There is no consistent field-level error component with accessible association. |
| Selection controls use correct semantics | FAIL | Button chips should become native radios or expose equivalent semantic state. |
| Units shown | PASS | USD, kg, m³ and units are generally explicit. |
| Number constraints complete | WARN | HTML min/step exist, but business-rule constraints are incomplete. |
| Advanced settings separated | PASS | Advanced tariff details use disclosure rather than appearing in the primary path. |

---

# Framework scorecard

This score is directional, not a claim of automated measurement.

| Section | Pass | Warn | Fail | Not verified |
|---|---:|---:|---:|---:|
| Visual hierarchy | 6 | 2 | 2 | 0 |
| Visual style | 3 | 4 | 6 | 0 |
| Accessibility | 6 | 2 | 8 | 1 |
| Usability / cognitive load | 11 | 3 | 3 | 0 |
| System feedback | 6 | 2 | 3 | 0 |
| Error prevention / recovery | 5 | 2 | 3 | 0 |
| Onboarding | 6 | 2 | 0 | 0 |
| Forms | 6 | 1 | 3 | 0 |
| **Total** | **49** | **18** | **28** | **1** |

The numeric totals are less important than the pattern: **product reasoning and progressive disclosure are strong; implementation consistency and accessibility are not yet at the same level.**

---

# Priority fixes

## 1. P1 — Make stale calculations impossible

**Why:** Directly violates the Accuracy macro bet.

When the user edits purpose, entity type, importer signature, sensitive category, budget mode/value or unit range after a completed case, invalidate or recompute every dependent summary/result immediately. Ensure `ImportQuoteFlow` cannot retain local state initialized from outdated parent props.

Framework reference: `00-core-framework.md` → Accuracy macro bet; `26-patterns-error-handling.md` → Prevention > Recovery.

## 2. P1 — Introduce one accessible interaction-state system

Create global tokens/styles for `:focus-visible`, invalid, disabled, loading, success and warning across buttons, links, inputs, selects, textareas and summaries. Never remove native focus without a replacement.

Framework reference: `11-checklist-fidelity.md` → Component states; `27-patterns-accessibility.md` → Keyboard navigation.

## 3. P1 — Fix semantic status/progress communication

Add `role="status"` / `aria-live="polite"` for processing/blocker/result changes and `role="progressbar"` with min/max/current values for calculation progress.

Framework reference: `25-patterns-feedback.md`; `27-patterns-accessibility.md`.

## 4. P1 — Validate the operation before progression

Add accessible inline validation for:
- positive budget when budget mode is selected
- positive unit min/max
- `unitsMin <= unitsMax`
- any other cross-field rules required by the cost engine

Do not merely disable the CTA; tell the user what must change.

Framework reference: `11-checklist-fidelity.md` → Validation; `26-patterns-error-handling.md` → Cross-field validation.

## 5. P1 — Replace low-contrast functional text tokens

Secondary does not mean unreadable. Create AA-compliant text tokens for primary, secondary, tertiary and disabled text and apply them consistently.

Framework reference: `12-checklist-visual-style.md` → Color accessibility; `27-patterns-accessibility.md` → Contrast.

## 6. P2 — Consolidate visual scaffolding into tokens

Define one system for:
- type scale
- spacing scale
- radii
- elevation
- semantic colors
- motion durations/easing
- icon library

Then progressively remove overlapping CSS decisions. Choose one product font system rather than Inter plus a later SAP 72 override.

Framework reference: `00-core-framework.md` → Scaffolding; `12-checklist-visual-style.md`.

## 7. P2 — Use glass only where elevation has meaning

Keep the premium translucent aesthetic but assign it to named surfaces (e.g. shell, elevated result, sticky summary) instead of every card. This will make the primary decision/result visually stronger.

Framework reference: `12-checklist-visual-style.md` → Texture & elevation.

## 8. P2 — Replace pseudo-radio chips with accessible selection groups

Use native radios inside fieldsets where practical, styled as chips/cards. This gives selected-state semantics, arrow-key behavior and group labels automatically.

Framework reference: `27-patterns-accessibility.md`; `11-checklist-fidelity.md`.

## 9. P2 — Respect reduced motion

Add a global reduced-motion mode that disables smooth scrolling, progress scanning, spinner movement where unnecessary and hover transforms/transitions.

Framework reference: `12-checklist-visual-style.md`; `27-patterns-accessibility.md`.

## 10. P2 — Strengthen early trust evidence

Replace generic “Motor de importación activo” trust language with compact verifiable signals when available: source freshness, live/degraded provider status, or a concise “how estimates are built” disclosure. Avoid making operational uptime look like evidence quality.

Framework reference: macro bet Accuracy + contextual trust/usability evaluation.

## 11. P3 — Make the conversation metaphor earn its space

Either deepen the conversational model (free-text answers, system extraction, short clarification loops) or visually simplify the chat chrome around form-like choices. Avoid maintaining two metaphors simultaneously if the interaction is mostly a wizard.

Framework reference: `22-patterns-cognitive-load.md` → minimize extraneous load and consistent patterns.

## 12. P3 — Add returning-user acceleration

When identity/account infrastructure is mature, offer saved operation defaults and recent cases at entry. This supports Efficiency without weakening first-run clarity.

Framework reference: `22-patterns-cognitive-load.md` → smart defaults/offload to system.

---

# Recommended implementation sequence

### Batch A — Accuracy gate
1. state invalidation / prop synchronization
2. cross-field validation
3. regression tests for edited completed cases

### Batch B — Accessibility foundation
1. focus-visible system
2. contrast tokens
3. live regions + progressbar semantics
4. radio/fieldset semantics
5. reduced motion

### Batch C — Design-system scaffolding
1. typography tokens
2. spacing scale
3. radii/elevation tokens
4. icon library
5. glass surface rules

### Batch D — Trust and interaction refinement
1. source/evidence status language
2. conversational-vs-wizard simplification
3. returning-user shortcuts

### Batch E — Quality gates
Add browser-level regression coverage for:
- keyboard-only primary journey
- accessibility scan (axe or equivalent)
- state invalidation after edits
- reversed/invalid unit ranges
- reduced-motion rendering
- critical result/trust states

---

# What this audit does not claim

`tommygeoco/ui-audit` is an AI design skill/framework, not an executable browser scanner. Its npm package exports `SKILL.md`, `CLAUDE.md` and reference files; it does not provide a CLI that automatically opens and scores a deployed URL. This report is therefore a structured framework execution against the current ShippingAPP codebase.

A final browser pass should still verify pixel-level spacing, actual rendered contrast through translucent surfaces, zoom at 200%, keyboard focus order, VoiceOver/NVDA behavior and mobile touch targets on the deployed build.
