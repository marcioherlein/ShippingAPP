export type D1StatementLike = {
  bind: (...values: unknown[]) => D1StatementLike
  first: <T = Record<string, unknown>>() => Promise<T | null>
}

export type D1DatabaseLike = {
  prepare: (sql: string) => D1StatementLike
}

export type NcmTariffResult = {
  status: 'ok' | 'conflict' | 'missing' | 'unavailable'
  code: string
  chapter: string | null
  heading: string | null
  subheading: string | null
  section: string | null
  aecPct: number | null
  statisticsPct: number | null
  ivaPct: number | null
  source: string
  sourceSha256: string | null
  recordCount: number | null
}

type TariffRow = {
  code: string
  aec_pct: number | null
  statistics_pct: number | null
  iva_pct: number | null
  status: string
  source_file: string | null
  source_sha256: string | null
  record_count: number | null
}

function validRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

export function sectionForChapter(chapter: number): string | null {
  const ranges: Array<[number, number, string]> = [
    [1,5,'I'],[6,14,'II'],[15,15,'III'],[16,24,'IV'],[25,27,'V'],[28,38,'VI'],[39,40,'VII'],
    [41,43,'VIII'],[44,46,'IX'],[47,49,'X'],[50,63,'XI'],[64,67,'XII'],[68,70,'XIII'],[71,71,'XIV'],
    [72,83,'XV'],[84,85,'XVI'],[86,89,'XVII'],[90,92,'XVIII'],[93,93,'XIX'],[94,96,'XX'],[97,97,'XXI'],
  ]
  return ranges.find(([from, to]) => chapter >= from && chapter <= to)?.[2] ?? null
}

export function ncmHierarchy(code: string) {
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(code)) return { chapter: null, heading: null, subheading: null, section: null }
  const chapter = code.slice(0, 2)
  return {
    chapter,
    heading: code.slice(0, 4),
    subheading: code.slice(0, 7),
    section: sectionForChapter(Number(chapter)),
  }
}

function resultFromRow(code: string, row: TariffRow | null): NcmTariffResult {
  const hierarchy = ncmHierarchy(code)
  const base = {
    code,
    ...hierarchy,
    source: row?.source_file ? `${row.source_file} · normalized D1 tariff snapshot` : 'NCM tariff D1 database',
    sourceSha256: row?.source_sha256 ?? null,
    recordCount: typeof row?.record_count === 'number' ? row.record_count : null,
  }
  if (!row) return { status: 'missing', ...base, aecPct: null, statisticsPct: null, ivaPct: null }
  if (row.status === 'conflict') return { status: 'conflict', ...base, aecPct: null, statisticsPct: null, ivaPct: null }
  if (row.status !== 'ok' || !validRate(row.aec_pct) || !validRate(row.statistics_pct) || !validRate(row.iva_pct)) {
    return { status: 'unavailable', ...base, aecPct: null, statisticsPct: null, ivaPct: null }
  }
  return { status: 'ok', ...base, aecPct: row.aec_pct, statisticsPct: row.statistics_pct, ivaPct: row.iva_pct }
}

export async function lookupNcmTariff(db: D1DatabaseLike | null | undefined, code: string): Promise<NcmTariffResult> {
  const hierarchy = ncmHierarchy(code)
  if (!hierarchy.chapter) {
    return { status: 'missing', code, ...hierarchy, aecPct: null, statisticsPct: null, ivaPct: null, source: 'Invalid NCM code', sourceSha256: null, recordCount: null }
  }
  if (!db) {
    return { status: 'unavailable', code, ...hierarchy, aecPct: null, statisticsPct: null, ivaPct: null, source: 'NCM tariff D1 binding not configured', sourceSha256: null, recordCount: null }
  }
  try {
    const row = await db.prepare(`
      SELECT t.code, t.aec_pct, t.statistics_pct, t.iva_pct, t.status,
             m.source_file, m.source_sha256, m.record_count
      FROM ncm_tariffs t
      LEFT JOIN ncm_dataset_meta m ON m.id = t.dataset_id
      WHERE t.code = ?1 AND t.is_current = 1
      LIMIT 1
    `).bind(code).first<TariffRow>()
    return resultFromRow(code, row)
  } catch {
    return { status: 'unavailable', code, ...hierarchy, aecPct: null, statisticsPct: null, ivaPct: null, source: 'NCM tariff D1 query failed', sourceSha256: null, recordCount: null }
  }
}
