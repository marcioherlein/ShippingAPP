# ShippingAPP NCM D1 engine

## Purpose

The NCM engine separates three concerns that must not be mixed:

1. **Official nomenclature**: exact NCM code and official ARCA label.
2. **Tariff data**: AEC, statistics rate, VAT and additional VAT associated with a validated NCM/version.
3. **Importer/operation tax rules**: perceptions such as Ganancias or IIBB, which must remain outside the intrinsic NCM tariff table because their applicability depends on the importer and transaction.

The application keeps the current static ARCA JSON as a fail-safe until the Cloudflare D1 binding is provisioned. When `NCM_DB` is available, `/api/ncm-classify` uses D1 as the catalog source and performs an exact tariff lookup after classification.

## Source normalization

`Archivo NCM para APP.xlsx` must be normalized before import:

- split cells containing multiple NCM codes into one record per code;
- derive chapter, heading, subheading and section from the code itself;
- retain grouped Excel descriptions only as source traceability, never as the official code label;
- join the exact official label from `public/data/ncm-index.json` by NCM code;
- reject duplicate tariff rows with incompatible values;
- never choose an arbitrary value for a conflict.

The August 2026 source audit found one blocked tariff conflict: `8472.90.20` has incompatible AEC values in the spreadsheet source. It must remain without a validated tariff until reconciled against the authoritative tariff source.

## D1 schema

The schema lives at:

```text
migrations/0001_ncm_engine.sql
```

It creates:

- `ncm_dataset_versions`
- `ncm_codes`
- `ncm_tariffs`
- `ncm_aliases`
- `ncm_codes_fts` (FTS5)

Every import is versioned. Application reads only the active version.

## Provision the Cloudflare database

Create the database with Wrangler:

```bash
npx wrangler d1 create shippingapp-ncm
```

Cloudflare returns a database ID. Add the resulting binding to `wrangler.jsonc` only after that resource exists:

```jsonc
{
  "d1_databases": [
    {
      "binding": "NCM_DB",
      "database_name": "shippingapp-ncm",
      "database_id": "<CLOUDFLARE_DATABASE_ID>",
      "migrations_dir": "migrations"
    }
  ]
}
```

Do not invent or commit a placeholder database ID.

Apply the schema:

```bash
npx wrangler d1 execute shippingapp-ncm --remote --file=migrations/0001_ncm_engine.sql
```

## Build the canonical seed

The canonical seed must join the exact ARCA labels already tracked by ShippingAPP with the normalized tariff dataset generated from the spreadsheet.

```bash
node scripts/build-ncm-d1-seed.mjs \
  public/data/ncm-index.json \
  /path/to/ncm-tariffs-normalized.json \
  /tmp/ncm-d1-seed.sql
```

The builder fails if:

- a normalized tariff code is duplicated;
- a normalized tariff code does not exist in the official NCM catalog;
- the input schemas are invalid.

Blocked conflicts are excluded from `ncm_tariffs` but the official code remains in `ncm_codes`, so classification continues while tariff economics fail closed.

Import the seed:

```bash
npx wrangler d1 execute shippingapp-ncm --remote --file=/tmp/ncm-d1-seed.sql
```

Then run a remote integrity check:

```bash
npx wrangler d1 execute shippingapp-ncm --remote --command="SELECT v.id, v.source_date, v.record_count, COUNT(c.code) AS code_count FROM ncm_dataset_versions v JOIN ncm_codes c ON c.version_id=v.id WHERE v.active=1 GROUP BY v.id;"
```

The active catalog should contain more than 10,000 NCM positions and must agree with `record_count` within the application integrity tolerance.

## Runtime behavior

With `NCM_DB` bound:

1. Load the active official NCM catalog from D1.
2. AI expands commercial product language into customs vocabulary.
3. Deterministic retrieval creates a shortlist only from official codes.
4. AI may rerank only those allowed codes; it cannot create a new NCM.
5. An exact `ncm_tariffs` lookup is performed for the selected code.
6. If no validated tariff exists, tariff economics remain unavailable instead of using a guessed rate.
7. SIM hydration remains a separate official-data layer.

Without `NCM_DB`:

- classification continues from `/data/ncm-index.json`;
- tariff lookup reports `not_configured`;
- the deployment remains backward-compatible.

## Test gates

Before deployment, run:

```bash
npx --yes vitest@3.2.4 run
npm run build
npx --yes wrangler@latest deploy --dry-run --outdir .wrangler-dry-run
```

The suite includes a real-world Alibaba-title retrieval corpus. Exact 8-digit NCM assertions are used only for products whose commercial facts support that precision. Ambiguous products assert the correct heading/family and rely on the classifier's missing-fact/confidence logic rather than manufacturing certainty.

A green CI run is required before this branch is eligible for merge. Corpus failures are treated as retrieval defects or insufficient-fact cases; they must not be bypassed by weakening the expectation to an unrelated code.
