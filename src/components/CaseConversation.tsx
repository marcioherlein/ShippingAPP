import React, { useEffect, useState } from 'react'
import { readCaseConversation, type CaseMessage } from '../lib/caseConversation'
export default function CaseConversation({ sourceUrl, messages: supplied }: { sourceUrl: string; messages?: CaseMessage[] }) {
  const [messages, setMessages] = useState(() => supplied ?? readCaseConversation(sourceUrl))
  useEffect(() => {
    if (supplied) { setMessages(supplied); return }
    const refresh = () => setMessages(readCaseConversation(sourceUrl))
    refresh(); window.addEventListener('shippingapp:conversation-updated', refresh)
    return () => window.removeEventListener('shippingapp:conversation-updated', refresh)
  }, [sourceUrl, supplied])
  return <section className="case-conversation" aria-label="Historial de la conversación"><h2>Tu conversación</h2>{messages.map((message, index) => <p key={index} className={`case-message ${message.role}`}><span>{message.role === 'user' ? 'Vos' : 'GlobalShipping'}</span>{message.text}</p>)}</section>
}
