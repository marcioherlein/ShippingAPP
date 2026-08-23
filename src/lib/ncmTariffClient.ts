import type { CustomsProfile } from './customsClassification'

type RemoteTariff = {
  status?: 'ok' | 'conflict' | 'missing' | 'unavailable'
  code?: string
  aecPct?: number | null
  statisticsPct?: number | null
  ivaPct?: number | null
  source?: string
  sourceSha256?: string | null
}

type RemoteClassification = {
  code?: string | null
  confidence?: 'high' | 'medium' | 'low' | 'missing'
  tariff?: RemoteTariff | null
}

function strong(value: RemoteClassification['confidence']) {
  return value === 'high' || value === 'medium'
}

function validRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

export function applyRemoteTariffEvidence(base: CustomsProfile, raw: unknown): CustomsProfile {
  if (!raw || typeof raw !== 'object') return base
  const full = raw as RemoteClassification
  const tariff = full.tariff
  if (!full.code || !tariff || tariff.code !== full.code || base.ncmCandidate !== full.code || !strong(full.confidence)) return base

  if (tariff.status === 'conflict') {
    return {
      ...base,
      dutyRatePct: null,
      dutyRateStatus: 'missing',
      missingFacts: [...new Set([...base.missingFacts, `Resolver conflicto tarifario del NCM ${full.code} en la fuente normalizada`])],
      rationale: [...base.rationale, `La base tarifaria tiene valores contradictorios para ${full.code}; economics queda bloqueado.`],
      source: `${base.source} Tarifa ${full.code}: CONFLICTO en snapshot normalizada; no se elige una alícuota arbitrariamente.`,
    }
  }

  if (tariff.status !== 'ok' || !validRate(tariff.aecPct) || !validRate(tariff.statisticsPct)) {
    return {
      ...base,
      dutyRatePct: null,
      dutyRateStatus: 'missing',
      rationale: [...base.rationale, `La clasificación NCM es utilizable, pero la tarifa exacta ${full.code} no está disponible en la snapshot normalizada.`],
      source: `${base.source} Tarifa exacta ${full.code} no disponible; economics bloqueado fail-closed.`,
    }
  }

  return {
    ...base,
    dutyRatePct: tariff.aecPct,
    dutyRateStatus: 'candidate',
    statisticsRatePct: tariff.statisticsPct,
    rationale: [
      ...base.rationale,
      `Tarifa exacta hidratada por NCM ${full.code}: AEC ${tariff.aecPct}% · Tasa estadística ${tariff.statisticsPct}%${validRate(tariff.ivaPct) ? ` · IVA referencia ${tariff.ivaPct}%` : ''}.`,
    ],
    source: `${base.source} Tarifa: ${tariff.source || 'snapshot NCM normalizada'}${tariff.sourceSha256 ? ` · SHA256 ${tariff.sourceSha256.slice(0, 12)}…` : ''}.`,
  }
}
