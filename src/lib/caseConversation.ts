import { readProductDraft, writeProductDraft } from './productDraft'
export type CaseMessage = { role: 'assistant' | 'user'; text: string }
export function readCaseConversation(sourceUrl: string): CaseMessage[] {
  const saved = readProductDraft<{ sourceUrl: string; messages: CaseMessage[] }>('case-conversation')
  return saved?.sourceUrl === sourceUrl && Array.isArray(saved.messages) ? saved.messages : []
}
export function writeCaseConversation(sourceUrl: string, messages: CaseMessage[]) {
  writeProductDraft('case-conversation', { sourceUrl, messages })
}
export function recordCaseAnswer(sourceUrl: string, question: string, answer: string) {
  const messages = readCaseConversation(sourceUrl)
  const next = [...messages, { role: 'assistant' as const, text: question }, { role: 'user' as const, text: answer }]
  writeCaseConversation(sourceUrl, next)
  window.dispatchEvent(new CustomEvent('shippingapp:conversation-updated'))
  return next
}
