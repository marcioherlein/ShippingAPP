import { inferArgentinaMarketMatchMode } from './functionalMarketMatch'
import type { ArgentinaMarketCandidate, ArgentinaMarketDiscoveryProvider } from './marketProviderContracts'

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function evidenceText(candidate: ArgentinaMarketCandidate) {
  return normalize([
    candidate.title,
    ...(candidate.attributes || []).flatMap((attribute) => [attribute.name || '', attribute.value_name || '']),
  ].join(' '))
}

function explicitNegativeGpsText(value: string) {
  const text = normalize(value)
  return /\b(?:sin|without)\s+gps\b/.test(text)
    || /\b(?:no|not)\s+(?:tiene\s+|posee\s+|incluye\s+|includes?\s+|has\s+)?gps\b/.test(text)
    || /\bgps\s+(?:no|false|none|ausente|absent)\b/.test(text)
}

function negativeBooleanValue(value: string) {
  const text = normalize(value)
  return /^(?:no|false|0|none|ninguno|ninguna|sin|n a|na)$/.test(text)
}

function affirmativeGpsAttributeValue(value: string) {
  const text = normalize(value)
  if (!text || negativeBooleanValue(text) || explicitNegativeGpsText(text)) return false
  return /^(?:si|yes|true|1)$/.test(text)
    || /\b(?:integrado|integrada|integrated|incluido|incluida|included|disponible|available|posee|tiene|con)\b/.test(text)
    || /\bgps\b/.test(text)
}

function gpsEvidenceState(candidate: ArgentinaMarketCandidate): 'positive' | 'negative' | 'unknown' {
  const title = candidate.title || ''
  if (explicitNegativeGpsText(title)) return 'negative'

  let positive = /\bgps\b/.test(normalize(title))
  for (const attribute of candidate.attributes || []) {
    const name = normalize(attribute.name || '')
    const value = attribute.value_name || ''
    const normalizedValue = normalize(value)

    if (/\bgps\b/.test(name)) {
      if (negativeBooleanValue(normalizedValue) || explicitNegativeGpsText(value)) return 'negative'
      if (affirmativeGpsAttributeValue(value)) positive = true
      continue
    }

    if (explicitNegativeGpsText(value)) return 'negative'
    if (/\bgps\b/.test(normalizedValue)) positive = true
  }

  return positive ? 'positive' : 'unknown'
}

export function passesFunctionalTraitEvidence(candidate: ArgentinaMarketCandidate, productName: string) {
  const target = normalize(productName)
  const evidence = evidenceText(candidate)

  if (/\bgps\b/.test(target) && gpsEvidenceState(candidate) !== 'positive') return false
  if (/\b(?:grafito|graphite)\b/.test(target) && !/\b(?:grafito|graphite)\b/.test(evidence)) return false
  return true
}

/**
 * Fail-closed evidence guard shared by every Argentina discovery source. It is
 * intentionally narrow: only traits that are materially different products and
 * are not yet represented in the legacy functional matcher live here.
 */
export function withFunctionalTraitEvidenceGuard(
  baseProvider: ArgentinaMarketDiscoveryProvider,
): ArgentinaMarketDiscoveryProvider {
  return {
    id: baseProvider.id,
    async discover(context) {
      const result = await baseProvider.discover(context)
      if (inferArgentinaMarketMatchMode(context.productName, context.category) !== 'functional') return result

      const before = result.candidates?.length || 0
      const candidates = (result.candidates || []).filter((candidate) => passesFunctionalTraitEvidence(candidate, context.productName))
      const rejected = before - candidates.length
      return {
        ...result,
        candidates,
        warnings: rejected > 0
          ? [
              ...(result.warnings || []),
              `Functional trait evidence guard rejected ${rejected} candidate(s) that lacked or contradicted explicit GPS/graphite evidence required by the target.`,
            ]
          : result.warnings,
      }
    },
  }
}
