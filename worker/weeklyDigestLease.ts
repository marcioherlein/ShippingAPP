import { emailRuntimeStatus } from './emailService'
import { DigestRepository } from './persistence/digestRepository'
import type { D1DatabaseLike } from './persistence/d1'
import { runWeeklyDigestScheduler, weeklyDigestPeriod, type DigestEnv, type DigestSchedulerResult } from './weeklyDigest'

const LEASE_MS = 10 * 60 * 1000
const DEFAULT_BATCH_SIZE = 50

type SchedulerDependencies = Parameters<typeof runWeeklyDigestScheduler>[1]
type LeaseEnv = DigestEnv & { DB?: D1DatabaseLike }

function schedulerReady(env: LeaseEnv) {
  const runtime = emailRuntimeStatus(env)
  return runtime.sendingEnabled
    && runtime.providerConfigured
    && runtime.senderConfigured
    && runtime.unsubscribeConfigured
}

function leaseOwner() {
  return `digest-${crypto.randomUUID()}`
}

export async function runWeeklyDigestSchedulerWithLease(
  env: LeaseEnv,
  dependencies: SchedulerDependencies = {},
): Promise<DigestSchedulerResult> {
  const clock = dependencies.clock ?? (() => new Date())
  const now = clock()
  const period = weeklyDigestPeriod(now)

  // Preserve the scheduler's existing fail-closed/no-op semantics without
  // creating lock state when there is nothing eligible to execute yet.
  if (!env.DB || !period.due || !schedulerReady(env)) {
    return runWeeklyDigestScheduler(env, { ...dependencies, clock: () => now })
  }

  const repo = new DigestRepository(env.DB, () => now)
  const run = await repo.getOrCreateRun({
    id: crypto.randomUUID(),
    runKey: period.runKey,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    dueAt: period.dueAt,
  })
  if (run.completed_at) {
    return runWeeklyDigestScheduler(env, { ...dependencies, clock: () => now })
  }

  const owner = leaseOwner()
  const expiresAt = new Date(now.getTime() + LEASE_MS).toISOString()
  const acquired = await env.DB.prepare(
    `UPDATE digest_runs
     SET lease_owner = ?, lease_expires_at = ?, updated_at = ?
     WHERE id = ?
       AND completed_at IS NULL
       AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`
  ).bind(owner, expiresAt, now.toISOString(), run.id, now.toISOString()).run()

  if (Number(acquired.meta?.changes ?? 0) !== 1) {
    return {
      status: 'running',
      runKey: period.runKey,
      dueAt: period.dueAt,
      batchSize: dependencies.batchSize ?? DEFAULT_BATCH_SIZE,
      eligibleCount: await repo.countEligibleUsers(),
      summary: await repo.summary(run.id),
    }
  }

  try {
    return await runWeeklyDigestScheduler(env, { ...dependencies, clock: () => now })
  } finally {
    const releasedAt = new Date().toISOString()
    await env.DB.prepare(
      `UPDATE digest_runs
       SET lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
       WHERE id = ? AND lease_owner = ?`
    ).bind(releasedAt, run.id, owner).run()
  }
}
