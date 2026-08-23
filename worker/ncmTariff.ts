export type NcmTariffRecord = [code: string, aecPct: number | null, statisticsPct: number | null, ivaPct: number | null]

export type NcmTariffShard = {
  meta: {
    sourceFile: string
    sourceSha256: string
    schemaVersion: number
    sourceRows: number
    occurrences: number
    recordCount: number
    conflictCount: number
  }
  prefix: string
  records: NcmTariffRecord[]
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

type Assets = { fetch: (request: Request) => Promise<Response> }

const shardCache = new Map<string, Promise<NcmTariffShard>>()

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

export function lookupTariffInShard(shard: NcmTariffShard, code: string): NcmTariffResult {
  const hierarchy = ncmHierarchy(code)
  const base = {
    code,
    ...hierarchy,
    source: `${shard.meta.sourceFile} · normalized tariff snapshot`,
    sourceSha256: shard.meta.sourceSha256,
    recordCount: shard.meta.recordCount,
  }
  if (shard.meta.schemaVersion !== 1 || shard.prefix !== code[0] || !Array.isArray(shard.records)) {
    return { status: 'unavailable', ...base, aecPct: null, statisticsPct: null, ivaPct: null }
  }
  const row = shard.records.find((record) => Array.isArray(record) && record[0] === code)
  if (!row) return { status: 'missing', ...base, aecPct: null, statisticsPct: null, ivaPct: null }
  const [, aecPct, statisticsPct, ivaPct] = row
  if (aecPct === null || statisticsPct === null || ivaPct === null) {
    return { status: 'conflict', ...base, aecPct: null, statisticsPct: null, ivaPct: null }
  }
  if (!validRate(aecPct) || !validRate(statisticsPct) || !validRate(ivaPct)) {
    return { status: 'unavailable', ...base, aecPct: null, statisticsPct: null, ivaPct: null }
  }
  return { status: 'ok', ...base, aecPct, statisticsPct, ivaPct }
}

async function loadShard(requestUrl: string, assets: Assets, prefix: string): Promise<NcmTariffShard> {
  if (!/^[0-9]$/.test(prefix)) throw new Error('Invalid NCM tariff shard prefix')
  if (!shardCache.has(prefix)) {
    shardCache.set(prefix, (async () => {
      const url = new URL(`/data/ncm-tariffs/${prefix}.json`, requestUrl)
      const response = await assets.fetch(new Request(url.toString()))
      if (!response.ok) throw new Error(`NCM tariff shard unavailable (${response.status})`)
      const shard = await response.json() as NcmTariffShard
      if (shard?.meta?.schemaVersion !== 1 || shard?.prefix !== prefix || !Array.isArray(shard.records) || shard.meta.recordCount < 10000) {
        throw new Error('NCM tariff shard failed integrity checks')
      }
      return shard
    })().catch((error) => {
      shardCache.delete(prefix)
      throw error
    }))
  }
  return shardCache.get(prefix)!
}

export async function lookupNcmTariff(requestUrl: string, assets: Assets, code: string): Promise<NcmTariffResult> {
  const hierarchy = ncmHierarchy(code)
  if (!hierarchy.chapter) {
    return { status: 'missing', code, ...hierarchy, aecPct: null, statisticsPct: null, ivaPct: null, source: 'Invalid NCM code', sourceSha256: null, recordCount: null }
  }
  try {
    return lookupTariffInShard(await loadShard(requestUrl, assets, code[0]), code)
  } catch {
    return { status: 'unavailable', code, ...hierarchy, aecPct: null, statisticsPct: null, ivaPct: null, source: 'NCM tariff snapshot unavailable', sourceSha256: null, recordCount: null }
  }
}

export function resetNcmTariffCacheForTests() { shardCache.clear() }
