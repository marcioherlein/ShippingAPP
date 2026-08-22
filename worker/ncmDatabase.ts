import type { NcmSearchIndex } from './ncmRetrieval'

export type D1ResultLike<T> = { results?: T[]; success?: boolean }
export type D1PreparedStatementLike = {
  bind: (...values: unknown[]) => D1PreparedStatementLike
  all: <T = Record<string, unknown>>() => Promise<D1ResultLike<T>>
  first: <T = Record<string, unknown>>(column?: string) => Promise<T | null>
}
export type D1DatabaseLike = {
  prepare: (sql: string) => D1PreparedStatementLike
}

export type NcmTariffLookup =
  | {
      status: 'available'
      code: string
      aecPct: number | null
      statisticsRatePct: number | null
      ivaPct: number | null
      ivaAdditionalPct: number | null
      sourceGroupDescription: string | null
      sourceRows: string
      source: string
    }
  | { status: 'not_configured' | 'not_found' | 'unavailable'; code: string; source: string; reason: string }

type VersionRow = {
  id: number
  source_name: string
  source_file: string
  source_date: string | null
  schema_version: number
  record_count: number
}

type CodeRow = { code: string; official_label: string }
type TariffRow = {
  code: string
  aec_pct: number | null
  statistics_rate_pct: number | null
  iva_pct: number | null
  iva_additional_pct: number | null
  source_group_description: string | null
  source_rows: string
  source_name: string
  source_file: string
}

let cachedD1Index: Promise<NcmSearchIndex> | null = null

async function activeVersion(db: D1DatabaseLike): Promise<VersionRow | null> {
  return db.prepare(`
    SELECT id, source_name, source_file, source_date, schema_version, record_count
    FROM ncm_dataset_versions
    WHERE active = 1
    ORDER BY id DESC
    LIMIT 1
  `).first<VersionRow>()
}

export async function loadNcmIndexFromD1(db: D1DatabaseLike): Promise<NcmSearchIndex> {
  if (!cachedD1Index) {
    cachedD1Index = (async () => {
      const version = await activeVersion(db)
      if (!version) throw new Error('NCM D1 has no active dataset version')
      if (version.schema_version !== 1) throw new Error(`NCM D1 schema version ${version.schema_version} is unsupported`)

      const response = await db.prepare(`
        SELECT code, official_label
        FROM ncm_codes
        WHERE version_id = ?1 AND active = 1
        ORDER BY code
      `).bind(version.id).all<CodeRow>()
      const rows = Array.isArray(response.results) ? response.results : []
      const records: Array<[string, string]> = rows
        .filter((row) => /^\d{4}\.\d{2}\.\d{2}$/.test(row.code) && typeof row.official_label === 'string' && row.official_label.trim().length > 0)
        .map((row) => [row.code, row.official_label.trim()])

      if (records.length < 10000 || Math.abs(records.length - version.record_count) > 10) {
        throw new Error(`NCM D1 failed integrity checks (${records.length}/${version.record_count} usable records)`)
      }

      return {
        meta: {
          source: `ShippingAPP D1 · ${version.source_name}`,
          sourceFile: version.source_file,
          sourceDate: version.source_date || 'unknown',
          parserSchema: 2,
          indexSchema: 3,
          recordCount: records.length,
          tariffDataIncluded: true,
          simOpeningsIncluded: false,
          recordShape: '[ncmCode,label]',
        },
        records,
      }
    })().catch((error) => {
      cachedD1Index = null
      throw error
    })
  }
  return cachedD1Index
}

export async function lookupNcmTariff(db: D1DatabaseLike | undefined, code: string | null): Promise<NcmTariffLookup> {
  if (!code) return { status: 'not_found', code: '', source: 'ShippingAPP NCM D1', reason: 'No NCM code was selected.' }
  if (!db) {
    return {
      status: 'not_configured', code, source: 'ShippingAPP NCM D1',
      reason: 'NCM_DB is not bound. Classification can use the static ARCA snapshot, but tariff lookup remains unavailable.',
    }
  }

  try {
    const row = await db.prepare(`
      SELECT t.code, t.aec_pct, t.statistics_rate_pct, t.iva_pct, t.iva_additional_pct,
             t.source_group_description, t.source_rows, v.source_name, v.source_file
      FROM ncm_tariffs t
      JOIN ncm_dataset_versions v ON v.id = t.version_id
      WHERE v.active = 1 AND t.validation_status = 'validated' AND t.code = ?1
      ORDER BY v.id DESC
      LIMIT 1
    `).bind(code).first<TariffRow>()

    if (!row) {
      return {
        status: 'not_found', code, source: 'ShippingAPP NCM D1',
        reason: 'No validated tariff row exists for this NCM in the active dataset. Conflicting rows fail closed.',
      }
    }

    return {
      status: 'available',
      code: row.code,
      aecPct: row.aec_pct,
      statisticsRatePct: row.statistics_rate_pct,
      ivaPct: row.iva_pct,
      ivaAdditionalPct: row.iva_additional_pct,
      sourceGroupDescription: row.source_group_description,
      sourceRows: row.source_rows,
      source: `${row.source_name} · ${row.source_file}`,
    }
  } catch (error) {
    return {
      status: 'unavailable', code, source: 'ShippingAPP NCM D1',
      reason: error instanceof Error ? error.message : 'NCM D1 tariff lookup failed',
    }
  }
}

export function resetNcmDatabaseCacheForTests() {
  cachedD1Index = null
}
