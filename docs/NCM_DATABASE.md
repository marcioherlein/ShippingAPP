# ShippingAPP NCM tariff database

ShippingAPP keeps two customs layers separate:

1. **Official nomenclature retrieval** (`public/data/ncm-index.json`) decides which NCM code is a candidate. The AI may only rerank codes already present in the deterministic shortlist.
2. **Normalized tariff database** (`NCM_DB`, Cloudflare D1) resolves AEC, statistics rate and reference IVA for the exact selected NCM.

A tariff is allowed into economics only when the full-catalog NCM confidence is `high` or `medium`, the D1 row matches that exact code and the normalized row has `status = 'ok'`. Missing bindings, missing codes, malformed rates and source conflicts fail closed.

## Source normalization

The source workbook `Archivo NCM para APP.xlsx` produced:

- 3,808 source rows
- 10,435 NCM occurrences
- 10,434 unique NCM codes
- 10,433 rows with usable core rates
- 1 conflict: `8472.90.20` (AEC 5% vs 7% in two source rows)

Chapter, heading, subheading and section are derived from the NCM code. Spreadsheet chapter/section labels are not trusted as keys. `IVA Adic.`, `Ganancias` and `IIBB` are retained as source-reference fields only and are not promoted as universal NCM-level taxes.

## D1 schema

`db/ncm-schema.sql` defines the production schema. The normalized SQL seed is generated from the audited workbook and should be kept as `NCM_D1_seed_only.sql` while provisioning.

### Provisioning flow

From the repository root while authenticated to the correct Cloudflare account:

```bash
npm run ncm:d1:create
```

Cloudflare returns a `database_id`. Configure it without editing JSON manually:

```bash
npm run ncm:d1:configure -- <database_id>
```

Then create the schema and load the normalized seed:

```bash
npm run ncm:d1:schema
npm run ncm:d1:seed
npm run ncm:d1:verify
```

The final verification must report:

- `expected_records = 10434`
- `actual_records = 10434`
- `conflicts = 1`

The configurator preserves any other D1 bindings and replaces an existing `NCM_DB` binding rather than duplicating it. It refuses placeholders and malformed database IDs.

Do not invent or commit a database ID before the Cloudflare resource exists.

## Runtime query

The Worker uses an exact lookup:

```sql
SELECT t.code, t.aec_pct, t.statistics_pct, t.iva_pct, t.status,
       m.source_file, m.source_sha256, m.record_count
FROM ncm_tariffs t
LEFT JOIN ncm_dataset_meta m ON m.id = t.dataset_id
WHERE t.code = ?1 AND t.is_current = 1
LIMIT 1;
```

There is deliberately no nearest-code tariff fallback.

## Conflict policy

`8472.90.20` is imported as `status = 'conflict'` with NULL core rates. ShippingAPP must not choose 5% or 7% automatically. A validated source correction can create a new dataset/version later and mark the corrected row current.

## Validation gates

Before promoting a new workbook snapshot:

- SQLite/D1 integrity check succeeds.
- `code` is unique in the current dataset.
- all `status='ok'` rows have AEC/statistics/IVA in `[0,100]`.
- every conflict preserves all source variants for audit.
- repository Vitest suite passes.
- Vite build passes.
- Wrangler deployment dry-run passes.

The database is a screening/decision-support source, not a customs ruling. SIM openings and CIVUCE/interventions remain separate verification layers.
