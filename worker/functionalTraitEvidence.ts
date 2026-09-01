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

export function passesFunctionalTraitEvidence(candidate: ArgentinaMarketCandidate, productName: string) {
  const target = normalize(productName)
  const evidence = evidenceText(candidate)

  if (/\bgps\b/.test(target) && !/\bgps\b/.test(evidence)) return false
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
              `Functional trait evidence guard rejected ${rejected} candidate(s) that lacked explicit GPS or graphite evidence required by the target.`,
            ]
          : result.warnings,
      }
    },
  }
}
