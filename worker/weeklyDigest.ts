import { emailRuntimeStatus, sendApplicationEmail, type SendApplicationEmailResult } from './emailService'
import { DigestRepository, type DigestRecipientRow, type DigestRunSummary } from './persistence/digestRepository'
import type { D1DatabaseLike } from './persistence/d1'
import { WatchlistRepository, parseWatchlistSnapshotPayload, type WatchlistSnapshotRow } from './persistence/watchlistRepository'

export type DigestEnv = Record<string, unknown> & { DB?: D1DatabaseLike }

export type DigestSchedulerResult = {
  status: 'disabled' | 'configuration_required' | 'not_due' | 'running' | 'completed' | 'partial'
  runKey: string
  dueAt: string
  batchSize: number
  eligibleCount?: number
  summary?: DigestRunSummary
  code?: string
}

type DigestContent = {
  summaryLines: string[]
  itemCount: number
}

type DigestSchedulerDependencies = {
  clock?: () => Date
  randomId?: () => string
  batchSize?: number
  maxAttempts?: number
  sendEmail?: (env: DigestEnv, input: Parameters<typeof sendApplicationEmail>[1]) => Promise<SendApplicationEmailResult>
  buildDigest?: (db: D1DatabaseLike, userId: string, timezone: string, now: Date) => Promise<DigestContent | null>
}

const DEFAULT_BATCH_SIZE = 50
const MAX_BATCH_SIZE = 100
const DEFAULT_MAX_ATTEMPTS = 3
const FRESHNESS_MS = 9 * 24 * 60 * 60 * 1000
const WEEKLY_DUE_UTC_HOUR = 11

function safeBatchSize(value: number | undefined) {
  if (value == null) return DEFAULT_BATCH_SIZE
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_BATCH_SIZE) throw new Error('digest_batch_size_invalid')
  return value
}

function safeAttempts(value: number | undefined) {
  if (value == null) return DEFAULT_MAX_ATTEMPTS
  if (!Number.isSafeInteger(value) || value < 1 || value > 10) throw new Error('digest_attempt_limit_invalid')
  return value
}

export function weeklyDigestPeriod(now: Date) {
  const instant = new Date(now)
  if (Number.isNaN(instant.getTime())) throw new Error('digest_clock_invalid')
  const start = new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate(), 0, 0, 0, 0))
  const daysSinceMonday = (start.getUTCDay() + 6) % 7
  start.setUTCDate(start.getUTCDate() - daysSinceMonday)
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
  const due = new Date(start)
  due.setUTCHours(WEEKLY_DUE_UTC_HOUR, 0, 0, 0)
  return {
    runKey: `weekly:${start.toISOString().slice(0, 10)}`,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    dueAt: due.toISOString(),
    due: instant.getTime() >= due.getTime(),
  }
}

function safeTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('es-AR', { timeZone: value }).format(new Date())
    return value
  } catch {
    return 'UTC'
  }
}

function localDate(value: string, timezone: string) {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return null
  try {
    return new Intl.DateTimeFormat('es-AR', { timeZone: safeTimezone(timezone), day: '2-digit', month: '2-digit' }).format(new Date(time))
  } catch {
    return null
  }
}

function ars(value: number | null) {
  if (value == null || !Number.isFinite(value) || value < 0) return null
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
}

function pct(value: number) {
  if (!Number.isFinite(value)) return null
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function payload(row: WatchlistSnapshotRow | null) {
  if (!row) return null
  try {
    const parsed = parseWatchlistSnapshotPayload(row) as any
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function unusableMarketStatus(status: unknown) {
  return ['unavailable', 'insufficient', 'configuration_required', 'unknown'].includes(String(status ?? 'unknown'))
}

export function digestLineFromSnapshots(input: {
  title: string
  latest: WatchlistSnapshotRow | null
  previous: WatchlistSnapshotRow | null
  timezone: string
  now: Date
}) {
  const title = String(input.title || 'Producto seguido').trim().replace(/\s+/g, ' ').slice(0, 160) || 'Producto seguido'
  if (!input.latest) return `${title}: todavía no hay snapshots para comparar.`

  const latestAt = Date.parse(input.latest.observed_at)
  if (!Number.isFinite(latestAt)) return `${title}: el último snapshot no tiene una fecha válida; no se informa movimiento.`
  if (input.now.getTime() - latestAt > FRESHNESS_MS) {
    const date = localDate(input.latest.observed_at, input.timezone)
    return `${title}: sin actualización reciente${date ? ` (último dato ${date})` : ''}; no se informa movimiento.`
  }

  const latestPayload = payload(input.latest)
  const latestStatus = latestPayload?.provenance?.market?.status ?? 'unknown'
  if (!latestPayload || unusableMarketStatus(latestStatus) || input.latest.market_price_ars == null) {
    return `${title}: sin dato nuevo de mercado confiable esta semana; no se informa movimiento.`
  }

  const market = ars(input.latest.market_price_ars)
  const margin = number(latestPayload?.grossMarginPct)
  const current = [market ? `mercado ${market}` : null, margin != null ? `margen ${margin.toFixed(1)}%` : null].filter(Boolean).join(' · ')

  if (!input.previous) return `${title}: ${current || 'snapshot actualizado'}; primera referencia disponible.`
  const previousPayload = payload(input.previous)
  const previousStatus = previousPayload?.provenance?.market?.status ?? 'unknown'
  if (!previousPayload || unusableMarketStatus(previousStatus) || input.previous.market_price_ars == null || input.previous.market_price_ars <= 0) {
    return `${title}: ${current || 'snapshot actualizado'}; la referencia anterior no permite calcular un cambio confiable.`
  }

  const marketMove = ((Number(input.latest.market_price_ars) - Number(input.previous.market_price_ars)) / Number(input.previous.market_price_ars)) * 100
  const previousMargin = number(previousPayload?.grossMarginPct)
  const marginMove = margin != null && previousMargin != null ? margin - previousMargin : null
  const changes = [
    pct(marketMove) ? `precio ${pct(marketMove)}` : null,
    marginMove != null ? `margen ${marginMove >= 0 ? '+' : ''}${marginMove.toFixed(1)} pp` : null,
  ].filter(Boolean).join(' · ')
  return `${title}: ${current || 'snapshot actualizado'}${changes ? ` · cambio: ${changes}` : ''}.`
}

export async function buildWeeklyDigestForUser(db: D1DatabaseLike, userId: string, timezone: string, now: Date): Promise<DigestContent | null> {
  const watchlist = new WatchlistRepository(db, () => now)
  const items = (await watchlist.listActiveForUser(userId)).slice(0, 12)
  if (!items.length) return null

  const lines: string[] = []
  for (const item of items) {
    const snapshots = await watchlist.listSnapshotsForUser(userId, item.id, 2)
    lines.push(digestLineFromSnapshots({
      title: item.title,
      latest: snapshots[0] ?? null,
      previous: snapshots[1] ?? null,
      timezone: safeTimezone(timezone),
      now,
    }))
  }
  return { summaryLines: lines, itemCount: items.length }
}

function mapDelivery(result: SendApplicationEmailResult) {
  if (result.status === 'sent') return { status: 'sent' as const, errorCode: null }
  if (result.status === 'suppressed') return { status: 'suppressed' as const, errorCode: null }
  if (result.status === 'queued') return { status: 'queued' as const, errorCode: result.code ?? null }
  if (result.status === 'failed') return { status: 'failed' as const, errorCode: result.code ?? 'digest_delivery_failed' }
  if (result.code === 'recipient_email_unavailable') return { status: 'skipped' as const, errorCode: result.code }
  return { status: 'blocked' as const, errorCode: result.code ?? 'digest_delivery_not_configured' }
}

async function processRecipient(input: {
  repo: DigestRepository
  runId: string
  runKey: string
  recipient: Pick<DigestRecipientRow, 'user_id'>
  timezone: string
  env: DigestEnv
  now: Date
  sendEmail: NonNullable<DigestSchedulerDependencies['sendEmail']>
  buildDigest: NonNullable<DigestSchedulerDependencies['buildDigest']>
}) {
  const { repo, runId, runKey, recipient, timezone, env, now, sendEmail, buildDigest } = input
  try {
    if (!env.DB) throw new Error('digest_store_not_configured')
    const digest = await buildDigest(env.DB, recipient.user_id, timezone, now)
    if (!digest?.itemCount) {
      await repo.markRecipient({ runId, userId: recipient.user_id, status: 'skipped', errorCode: 'digest_empty_watchlist' })
      return
    }
    const result = await sendEmail(env, {
      userId: recipient.user_id,
      templateKey: 'weekly_digest',
      templateInput: { summaryLines: digest.summaryLines },
      idempotencyKey: `weekly-digest:${runKey}:${recipient.user_id}`,
    })
    const mapped = mapDelivery(result)
    await repo.markRecipient({
      runId,
      userId: recipient.user_id,
      status: mapped.status,
      emailEventId: result.eventId ?? null,
      errorCode: mapped.errorCode,
    })
  } catch {
    await repo.markRecipient({ runId, userId: recipient.user_id, status: 'failed', errorCode: 'digest_processing_failed' })
  }
}

function runtimeReady(env: DigestEnv) {
  const runtime = emailRuntimeStatus(env)
  return {
    runtime,
    ready: runtime.sendingEnabled && runtime.providerConfigured && runtime.senderConfigured && runtime.unsubscribeConfigured,
  }
}

export async function digestSchedulerDryRun(env: DigestEnv, now: Date = new Date()) {
  const period = weeklyDigestPeriod(now)
  const configured = runtimeReady(env)
  if (!env.DB) return { status: 'configuration_required', runKey: period.runKey, dueAt: period.dueAt, eligibleCount: 0, sendingEnabled: configured.runtime.sendingEnabled }
  const repo = new DigestRepository(env.DB, () => now)
  return {
    status: period.due ? 'due' : 'not_due',
    runKey: period.runKey,
    dueAt: period.dueAt,
    eligibleCount: await repo.countEligibleUsers(),
    sendingEnabled: configured.runtime.sendingEnabled,
    providerConfigured: configured.runtime.providerConfigured,
    senderConfigured: configured.runtime.senderConfigured,
    unsubscribeConfigured: configured.runtime.unsubscribeConfigured,
    batchSize: DEFAULT_BATCH_SIZE,
    policy: 'weekly-once-per-user; hourly-reconciler; Monday 11:00 UTC due time',
  }
}

export async function digestRuntimeStatus(env: DigestEnv, now: Date = new Date()) {
  const dryRun = await digestSchedulerDryRun(env, now)
  if (!env.DB) return { ...dryRun, latestRun: null }
  const repo = new DigestRepository(env.DB, () => now)
  const latest = await repo.latestRun()
  return { ...dryRun, latestRun: latest ? await repo.summary(latest.id) : null }
}

export async function runWeeklyDigestScheduler(env: DigestEnv, dependencies: DigestSchedulerDependencies = {}): Promise<DigestSchedulerResult> {
  const clock = dependencies.clock ?? (() => new Date())
  const now = clock()
  const period = weeklyDigestPeriod(now)
  const batchSize = safeBatchSize(dependencies.batchSize)
  const maxAttempts = safeAttempts(dependencies.maxAttempts)

  if (!env.DB) return { status: 'configuration_required', runKey: period.runKey, dueAt: period.dueAt, batchSize, code: 'digest_store_not_configured' }
  const configured = runtimeReady(env)
  if (!configured.runtime.sendingEnabled) {
    return { status: 'disabled', runKey: period.runKey, dueAt: period.dueAt, batchSize, code: 'email_sending_disabled' }
  }
  if (!configured.ready) {
    return { status: 'configuration_required', runKey: period.runKey, dueAt: period.dueAt, batchSize, code: 'digest_email_configuration_incomplete' }
  }
  if (!period.due) return { status: 'not_due', runKey: period.runKey, dueAt: period.dueAt, batchSize }

  const repo = new DigestRepository(env.DB, clock)
  let run = await repo.getOrCreateRun({
    id: (dependencies.randomId ?? (() => crypto.randomUUID()))(),
    runKey: period.runKey,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    dueAt: period.dueAt,
  })
  if (run.completed_at) {
    const summary = await repo.summary(run.id)
    return { status: summary.status === 'partial' ? 'partial' : 'completed', runKey: period.runKey, dueAt: period.dueAt, batchSize, summary }
  }
  run = (await repo.bumpInvocation(run.id)) ?? run

  const sendEmail = dependencies.sendEmail ?? ((sendEnv, input) => sendApplicationEmail(sendEnv, input))
  const buildDigest = dependencies.buildDigest ?? buildWeeklyDigestForUser
  let processedThisInvocation = 0

  const retryable = await repo.listRetryable(run.id, maxAttempts, batchSize)
  for (const recipient of retryable) {
    const pref = await env.DB.prepare("SELECT COALESCE(timezone, 'UTC') AS timezone FROM email_preferences WHERE user_id = ?").bind(recipient.user_id).first<{ timezone: string }>()
    await processRecipient({
      repo,
      runId: run.id,
      runKey: run.run_key,
      recipient,
      timezone: pref?.timezone ?? 'UTC',
      env,
      now,
      sendEmail,
      buildDigest,
    })
    processedThisInvocation += 1
  }

  let current = (await repo.getRun(run.id)) ?? run
  const remaining = Math.max(0, batchSize - processedThisInvocation)
  if (remaining > 0) {
    const eligible = await repo.listEligibleAfter(current.cursor_user_id, remaining)
    for (const user of eligible) {
      const recipient = await repo.ensureRecipient(run.id, user.user_id)
      if (recipient.attempt_count < maxAttempts && ['pending', 'queued', 'failed'].includes(recipient.status)) {
        await processRecipient({
          repo,
          runId: run.id,
          runKey: run.run_key,
          recipient,
          timezone: user.timezone,
          env,
          now,
          sendEmail,
          buildDigest,
        })
      }
      await repo.setCursor(run.id, user.user_id)
      processedThisInvocation += 1
    }
  }

  current = (await repo.getRun(run.id)) ?? current
  const moreEligible = await repo.hasEligibleAfter(current.cursor_user_id)
  const retryableRemaining = await repo.retryableCount(run.id, maxAttempts)
  if (!moreEligible && retryableRemaining === 0) {
    const before = await repo.summary(run.id)
    const hasFailures = before.failed > 0 || before.blocked > 0 || before.queued > 0 || before.pending > 0
    await repo.finalize(run.id, hasFailures ? 'partial' : 'completed', hasFailures ? 'digest_recipient_failures' : null)
  }

  const summary = await repo.summary(run.id)
  return {
    status: summary.status === 'completed' ? 'completed' : summary.status === 'partial' ? 'partial' : 'running',
    runKey: period.runKey,
    dueAt: period.dueAt,
    batchSize,
    eligibleCount: await repo.countEligibleUsers(),
    summary,
  }
}
