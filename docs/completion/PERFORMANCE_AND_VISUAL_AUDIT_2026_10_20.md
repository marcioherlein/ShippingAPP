# Performance and visual audit — 2026-10-20

Baseline: `c1a9e49153d5a9aa6e3bb1d95abf3651fc60ff9b` (PR #211).

## Performance changes

- The landing statically loads React and its own UI. Quote entry, analysis/search, calculation, results, Clerk integration, login and secondary account panels load when needed. Account history/watchlist/preferences mount only when the account panel opens. Chunk failures offer a visible retry while drafts remain in storage. Boundaries surround individual surfaces so loading a step does not remove the entire journey from persistence observers.
- Memoized the immutable dashboard so saving/saved feedback does not rerender financial metrics (covered by a render/formatting regression test). Memoized purchase capacity and the expensive purchase-plan calculation. Plans calculate only for ready results; saved immutable plans are reused. Typing into guided questions no longer repeatedly reads/parses stored conversation history. A regression test checks storage reads while typing.
- Coalesced simultaneous identical account GET requests within the same token-provider generation, with independently readable response bodies. Pending entries disappear on success or failure; logout/provider changes clear them. Caller-owned aborts, custom headers and all writes bypass coalescing. Protected fetches use `cache: no-store`; no private-response TTL cache was introduced.
- Hash-named JS/CSS and the versioned local font receive immutable caching. HTML revalidates and unversioned nomenclator data must revalidate. Public auth configuration remains `no-store`.
- Watchlist listing changed from one query plus one per item to two owner-scoped queries for all items and their latest two snapshots. Weekly digest also uses two queries and reads only its 12 selected items. Additive migration 0008 indexes active-item ordering and snapshot timestamp/id ordering. Tests cover two users, 100 items, 2,000 snapshots, deterministic ties and `EXPLAIN QUERY PLAN` index use. History pagination was already a single owner-scoped keyset query; its existing index was retained.
- Replaced external Google Fonts CSS and unused font loading with one local variable Inter Latin 400–700 font (48,256 bytes, OFL license included). Supplier thumbnails reserve dimensions, lazy-load and decode asynchronously; the existing image proxy cache remains in place.

### Reproducible bundle measurement

Run `npm run build`; it generates a Vite manifest and executes `scripts/measure-client-bundle.mjs`. Static imports are counted once; dynamic imports are excluded until their triggering action. These are local build measurements, not production traffic or Core Web Vitals.

| JavaScript graph | Raw bytes | gzip bytes |
|---|---:|---:|
| Baseline single entry | 693,087 | 197,120 |
| New entry | 249,657 | 77,628 |
| New landing including configured authentication | 459,599 | 132,705 |
| Quote entry including shared static dependencies | 365,164 | 114,330 |

Entry gzip decreased 60.6%; landing with configured authentication decreased 32.7%. This defers downloads; it does not claim the sum of every eventual chunk decreased by those percentages. Every build enforces budgets of 95 KB gzip for entry and 180 KB for landing with authentication. Hashes and a few bytes may change with later builds.

No production database latency traces were available. Query-count and index-plan improvements were verified against migrated SQLite/D1-compatible fixtures; no production p95 improvement is asserted.

## Agent visual audit

A separate visual agent compared the Mauro reference with the app, then interacted with every stage at 390×844 and 1440×1000. Its baseline captured 140 states; the first correction audit captured 118; the final focused audit revisited 54 states including expanded dashboard details and save feedback. Reports and screenshots are in the task artifacts under `/workspace/shipping-review/visual-{audit,reaudit,final-audit}-2026-10-20/` (baseline uses `visual-audit`).

| Coverage, both viewports | Checks and resulting changes |
|---|---|
| Landing and starting point | Product/link and search paths; consistent navy, white, Inter and left desktop stage rail |
| Operation profile | Purpose, importer type, signature and sensitive category; current task and back navigation |
| Budget / units / explore | Each capacity choice; quantity range, clear next action and preserved answers |
| Manual product identity | Name, use and material as separate explained questions; one active surface |
| Offer | Price, compact currency select, unit/pack, pack size, variant and price-quantity bounds |
| Non-USD quote | Conversion rate, source and date; original supplier currency retained |
| Origin and packaging | Country, weight, length, width, height, carton contents and calculated per-unit volume; known-volume alternative; no duplicate dimensions/volume entry |
| Review / nomenclator | Visible critical facts, edit answers, isolated manual search, focused search field, explicit confirmation and visible calculate action |
| Processing | Accessible status and motion-respecting indicator |
| Dashboard | Investment, quantity, unit cost, supplier/import/landed costs, cost composition, optimization, ordered quantity scenarios, sources, classification and FX |
| Save / edit | Sticky save action, saving/saved feedback, edit and preserved immutable saved quote |
| Supplier link | Read progress, successful guided intake, malformed link, provider failure, manual-form escape |
| Search | Loading, results, visible selection CTA, selected product, provider error, contextual sign-in |
| Recovery / navigation | New-case confirmation, restored drafts and legacy draft compatibility |

Final focused review confirmed normal (unforced) packaging clicks, confirmation visible within mobile viewport, focused NCM entry, sticky save visible after scrolling, readable price/MOQ labels, full provider-error alert and no horizontal overflow. One-scenario results do not show a misleading comparison chart. Full detail remains available through disclosures.

The visual journeys use controlled API fixtures: they establish layout, behavior and error recovery, not live supplier availability or a real Clerk login. Production workflow runtime gates separately exercise configured providers and protected API boundaries. Legal/business identity and SaaS billing stages are outside this release; existing safeguards remain unchanged.

## Validation

- Production TypeScript/Vite build and bundle budgets.
- Full Vitest suite: 183 files, 1,075 tests passed.
- Full Playwright WebKit/Chromium suite: release evidence recorded after completion.
- D1 schema validation: eight migrations, ownership/idempotency/privacy constraints and rollback probe passed.
- Nomenclator/SIM asset validation passed.
- Wrangler deployment dry run; final CI and production gates recorded in the release/PR.
- No lint script is configured in this repository; build/type checking, tests and whitespace checks were run.
