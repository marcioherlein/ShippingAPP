function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseRegexIssue(issue) {
  const match = String(issue || '').match(/^(missing|forbidden) \/(.*)\/([a-z]*)$/i)
  if (!match) return null
  try {
    return { kind: match[1].toLowerCase(), regex: new RegExp(match[2], match[3]) }
  } catch {
    return null
  }
}

function semanticAliasSatisfies(issue, normalizedTitle) {
  if (/ranura\|pan/.test(String(issue || ''))) {
    return /\b2\s*(?:ranuras?|rodajas?|rebanadas?|panes?)\b/i.test(normalizedTitle)
  }
  return false
}

export function classifyTitleEvidenceWarning(warning) {
  const title = String(warning?.title || '')
  const normalizedTitle = normalizeText(title)
  const parsed = parseRegexIssue(warning?.issue)

  if (!parsed) {
    return { ...warning, classification: 'unresolved_title_evidence', resolution: null }
  }

  if (parsed.kind === 'missing') {
    // Re-run the same evidence check on accent-normalized text. This removes
    // false warnings such as Cámara/camara, Kärcher/karcher, eléctrico/electr.
    parsed.regex.lastIndex = 0
    if (parsed.regex.test(normalizedTitle)) {
      return { ...warning, classification: 'resolved_title_normalization', resolution: 'accent_normalization' }
    }
    if (semanticAliasSatisfies(warning?.issue, normalizedTitle)) {
      return { ...warning, classification: 'resolved_title_synonym', resolution: 'semantic_count_synonym' }
    }
  }

  return {
    ...warning,
    classification: 'unresolved_title_evidence',
    resolution: null,
    note: 'The public benchmark response does not expose structured retailer attributes, so missing title evidence is not sufficient to label this candidate a false positive.',
  }
}

export function refineTitleEvidenceWarnings(warnings = []) {
  const classified = warnings.map(classifyTitleEvidenceWarning)
  return {
    resolved: classified.filter((row) => row.classification !== 'unresolved_title_evidence'),
    unresolved: classified.filter((row) => row.classification === 'unresolved_title_evidence'),
  }
}

export function summarizeResults(results = []) {
  const total = results.length
  const liveRows = results.filter((row) => row.status === 'live')
  const titleEvidenceLive = liveRows.filter((row) => row.titleEvidencePass).length
  const modeCorrect = results.filter((row) => row.modeCorrect).length
  return {
    total,
    live: liveRows.length,
    liveRate: total ? liveRows.length / total : 0,
    titleEvidenceLive,
    titleEvidenceLiveRate: total ? titleEvidenceLive / total : 0,
    liveWithUnresolvedTitleEvidenceWarnings: liveRows.length - titleEvidenceLive,
    modeCorrect,
    modeAccuracy: total ? modeCorrect / total : 0,
  }
}

export function upgradeMixed48Audit(legacy) {
  const results = (legacy.results || []).map((row) => {
    const legacyTitleViolations = Array.isArray(row.violations) ? row.violations : []
    const refined = refineTitleEvidenceWarnings(legacyTitleViolations)
    const { violations: _violations, apparentPrecisionPass: _apparentPrecisionPass, ...rest } = row
    return {
      ...rest,
      legacyTitleViolations,
      resolvedTitleWarnings: refined.resolved,
      titleEvidenceWarnings: refined.unresolved,
      titleEvidencePass: refined.unresolved.length === 0,
      titleEvidenceAssessment: refined.unresolved.length
        ? 'unresolved_title_evidence'
        : 'title_evidence_consistent',
    }
  })

  const byMode = (mode) => results.filter((row) => row.mode === mode)
  const groups = Object.fromEntries(
    [...new Set(results.map((row) => row.group))].map((group) => [group, summarizeResults(results.filter((row) => row.group === group))]),
  )
  const unresolvedLiveWarnings = results
    .filter((row) => row.status === 'live' && row.titleEvidenceWarnings.length)
    .map((row) => ({ id: row.id, warnings: row.titleEvidenceWarnings }))

  return {
    status: 'audit_complete_v2',
    baseUrl: legacy.baseUrl,
    corpusSize: legacy.corpusSize,
    minimumComparables: legacy.minimumComparables,
    concurrency: legacy.concurrency,
    methodology: {
      matcherEvidence: 'Production matching may use title plus structured retailer attributes.',
      auditEvidence: 'This audit receives comparable titles but not structured retailer attributes.',
      interpretation: 'titleEvidenceWarnings are unresolved observability warnings, not confirmed matcher false positives.',
    },
    overall: summarizeResults(results),
    exact: summarizeResults(byMode('exact')),
    functional: summarizeResults(byMode('functional')),
    groups,
    requestErrors: legacy.requestErrors,
    modeErrors: legacy.modeErrors,
    liveWithUnresolvedTitleEvidenceWarnings: unresolvedLiveWarnings.length,
    unresolvedLiveWarnings,
    resolvedTitleWarningCount: results.reduce((sum, row) => sum + row.resolvedTitleWarnings.length, 0),
    retailerAcceptedContribution: legacy.retailerAcceptedContribution,
    highDispersionLive: legacy.highDispersionLive,
    legacyTitleOnlyMetrics: {
      overallPreciseLive: legacy.overall?.preciseLive ?? null,
      overallPreciseLiveRate: legacy.overall?.preciseLiveRate ?? null,
      suspiciousLiveBenchmarks: legacy.suspiciousLiveBenchmarks ?? null,
      note: 'Retained only for apples-to-apples comparison with historical runs; these fields were title-only and should not be interpreted as true matcher precision.',
    },
    results,
  }
}
