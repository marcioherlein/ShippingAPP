# ShippingAPP NCM handoff

Last updated: 2026-08-24

## Where to continue

- Repository: `marcioherlein/ShippingAPP`
- Feature branch: `feature/ncm-tariff-database`
- Draft PR: #26 — `Normalize NCM tariff data and add D1 tariff engine`
- PR is still draft, open and **not merged**.
- Latest handoff-parent commit before this document: `95c3edda435582d7acd1a6c50c0aa0338b5c2560`
- Latest CI run for that commit: `32791379956`
- CI result: **success** — Vitest, Vite build and Wrangler deploy dry-run all passed.
- Do not merge or deploy the production Worker without explicit authorization.

## Cloudflare preview and D1

Preview Worker used for validation:

`https://shippingapp-ncm-preview.marciofabrizio.workers.dev`

D1 database:

- binding: `NCM_DB`
- database name: `shippingapp-ncm`
- database ID: `347e0be2-b9ff-4cd2-9f0f-73e93297acbe`
- exact normalized NCM records: **10,434**
- controlled source conflicts: **1**
- conflict code: `8472.90.20` — source contains AEC 5% and 7%; core tariff remains fail-closed rather than selecting one.
- verified sample: `9506.59.00` => AEC 20%, statistics 3%, IVA 21%.

The D1 data is already imported. Do **not** reload it for normal preview testing.

## Current NCM architecture

The runtime classification path is:

1. Official canonical ARCA NCM index (`public/data/ncm-index.json`).
2. Postbuild enrichment with official chapter SIM terminal vocabulary (`public/data/sim/*.json`).
3. Deterministic bilingual customs vocabulary (`worker/ncmVocabulary.ts`).
4. Bounded full-index candidate retrieval (`worker/ncmRetrieval.ts`).
5. Objective semantic reconciliation (`worker/ncmRetrievalSemantic.ts`, `worker/ncmSemantic.ts`).
6. Workers AI can expand/rerank only inside the official candidate set; it cannot invent an NCM.
7. If classification remains ambiguous, adaptive clarification asks one objective question at a time, maximum three distinct fact types (`worker/ncmClarification.ts`).
8. Low confidence or a pending clarification blocks SIM/tariff promotion and economics.
9. Medium/high exact NCM can hydrate the exact D1 tariff (`worker/ncmTariff.ts`).
10. Exact-NCM SIM opening hydration remains a separate layer.

Important fail-closed rule: classification uncertainty, source tariff conflict, missing D1 binding, malformed rates or unresolved ambiguity must never be converted into a guessed landed cost.

## Important fixes already implemented

- D1 exact tariff lookup and real production binding configuration.
- Preserved source conflict `8472.90.20` instead of choosing 5% or 7%.
- Bilingual deterministic vocabulary so English Alibaba product titles can retrieve Spanish ARCA nomenclature.
- Workers AI structured calls use documented JSON-schema mode and `max_tokens`.
- Accessory/replacement guard prevents parent-product leakage.
- Adaptive clarification UI/backend: one question at a time, max three, answers feed back into deterministic and AI classification.
- Clarification options convert unhelpful `true`/`false` values into semantic labels before reclassification.
- Semantic reconciliation prevents generic material words from outranking product identity.
- SIM search-text enrichment now preserves child-specific terminal identity. This was critical for 42.02: the parent heading mentions many article types, but `4202.92.00` has official SIM evidence explicitly containing `Mochilas`.
- Strong semantic contradiction can no longer leave an unrelated lexical `medium` candidate eligible for economics.

## Offline regression behavior now validated

`worker/ncmOfflineIntegration.test.ts` validates the common cases without Workers AI:

- carbon padel racket => `9506.59.00`
- 65W GaN USB-C wall charger => `8504.40.90`
- lithium-ion battery pack => `8507.60.00`
- Android 5G smartphone => `8517.13.00`
- LED desk lamp => `9405.21.00`
- polyester backpack => `4202.92.00`
- USB-C cable fitted with connectors => `8544.42.00`
- generic laptop => stays within `8471.30.*` but remains LOW/fail-closed when the exact child is not objectively supported
- desk-lamp shade replacement => must not become complete desk lamp `9405.21.00`

The latest green CI also includes the wider application suite, build and Wrangler dry-run.

## Last live smoke result

The **last live preview smoke was 0/8**, but it was run on preview version:

`9cf75c6a-389e-4717-b0fe-584414d9471c`

That preview predates the latest semantic runtime integration and SIM-enrichment fixes. Do not treat its 0/8 result as the state of the current branch.

That old live run showed:

- D1 itself was functioning when a usable exact candidate reached it.
- most failures were pre-D1 retrieval/confidence problems.
- USB-C had one HTTP 503 on a clarification retry; only investigate this if it reproduces after the current branch is redeployed.

The live smoke script has since been updated so that seven objectively resolvable products require exact NCM + exact D1 tariff, while the deliberately underspecified laptop passes only if it stays in `8471.30.*`, LOW and with no tariff promotion.

## Next action: redeploy current preview and run live smoke

From the user's Mac Terminal:

```bash
cd ~/Downloads/ShippingAPP
git switch feature/ncm-tariff-database
git pull origin feature/ncm-tariff-database
npm run ncm:preview:deploy
npm run ncm:live:smoke -- https://shippingapp-ncm-preview.marciofabrizio.workers.dev
```

Expected high-level result: `Live NCM smoke: 8/8 passed` where the laptop's PASS represents safe ambiguity rather than a fabricated exact `.19` classification.

If live smoke fails:

1. Do not weaken expectations merely to make the test green.
2. Inspect each result's `error`, `detail`, `searchTerms`, `confidence`, `pendingClarification`, `rationale`, `alternatives` and `tariff`.
3. Fix runtime retrieval/semantic/clarification behavior as appropriate.
4. Re-run CI before another preview deploy.

If live smoke passes:

1. Manually inspect the clarification UX in the preview browser with an intentionally ambiguous product.
2. Update PR #26 body because its old text still says D1 provisioning/seed is pending; that is stale. Record real D1 provisioning, 10,434 loaded tariffs, one preserved conflict, green CI and live preview smoke.
3. Keep PR draft until the user decides it is ready.
4. Do **not** merge without explicit authorization.

## Suggested prompt for a new chat

`Continue ShippingAPP from docs/NCM_HANDOFF.md on feature/ncm-tariff-database. Check the latest GitHub state first, then continue with the preview live smoke. Do not merge or deploy production without asking me.`
