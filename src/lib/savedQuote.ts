import type { AnalysisHistoryItem } from './analysisHistory'
import type { PurchaseQuoteSnapshot } from '../components/PurchaseQuoteResult'

export type RestorableSavedQuote = AnalysisHistoryItem & {
  input: Record<string, unknown>
  result: PurchaseQuoteSnapshot
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** Older history records remain readable, but cannot recreate a full quote. */
export function canRestoreSavedQuote(item: AnalysisHistoryItem): item is RestorableSavedQuote {
  const { input, result } = item
  if (!record(input) || !record(result)) return false
  if (!['have_product', 'search_product', 'discover'].includes(String(input.intent))) return false
  if (!['budget', 'units', 'unknown'].includes(String(input.budgetMode))) return false
  if (result.version !== 1 || !record(result.analysis) || !record(result.analysis.product)
    || !record(result.analysis.customs) || !record(result.pipelineSummary) || !record(result.purchasePlan)
    || !Array.isArray(result.conversation)) return false
  return typeof result.analysis.sourceUrl === 'string'
    && typeof result.analysis.product.name === 'string'
    && typeof result.quotedAt === 'string'
    && result.conversation.every(message => record(message)
      && (message.role === 'user' || message.role === 'assistant') && typeof message.text === 'string')
}
