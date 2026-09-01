export type EmailPreferenceScope = 'transactional' | 'digest' | 'alerts' | 'marketing'
export type EmailTemplateKey = 'welcome' | 'usage' | 'weekly_digest' | 'alert' | 'billing'

export type EmailBranding = {
  appName: string
  supportEmail?: string | null
}

export type EmailTemplateInput = {
  displayName?: string | null
  creditsRemaining?: number | null
  creditsGranted?: number | null
  productTitle?: string | null
  marketPriceArs?: number | null
  grossMarginPct?: number | null
  planName?: string | null
  billingStatus?: string | null
  summaryLines?: string[]
  unsubscribeUrl?: string | null
}

export type RenderedEmail = {
  templateKey: EmailTemplateKey
  preferenceScope: EmailPreferenceScope
  subject: string
  html: string
  text: string
}

const TEMPLATE_SCOPES: Record<EmailTemplateKey, EmailPreferenceScope> = {
  welcome: 'transactional',
  usage: 'alerts',
  weekly_digest: 'digest',
  alert: 'alerts',
  billing: 'transactional',
}

function boundedText(value: unknown, fallback: string, max = 240) {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized ? normalized.slice(0, max) : fallback
}

export function escapeEmailHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null
  } catch {
    return null
  }
}

function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function ars(value: unknown) {
  const parsed = number(value)
  return parsed == null ? null : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(parsed)
}

function pct(value: unknown) {
  const parsed = number(value)
  return parsed == null ? null : `${parsed.toFixed(1)}%`
}

function unsubscribeFooter(input: EmailTemplateInput, scope: EmailPreferenceScope) {
  if (scope === 'transactional') return { html: '', text: '' }
  const url = safeUrl(input.unsubscribeUrl)
  if (!url) return { html: '', text: '' }
  const escaped = escapeEmailHtml(url)
  return {
    html: `<p style="margin-top:28px;font-size:12px;color:#667085">Podés desactivar este tipo de email en <a href="${escaped}">tus preferencias</a>.</p>`,
    text: `\n\nDesactivar este tipo de email: ${url}`,
  }
}

function layout(branding: EmailBranding, heading: string, bodyHtml: string, bodyText: string, footer: { html: string; text: string }) {
  const appName = escapeEmailHtml(boundedText(branding.appName, 'ShippingAPP', 80))
  const support = branding.supportEmail && !/[\r\n]/.test(branding.supportEmail)
    ? `<p style="font-size:12px;color:#98a2b3">Ayuda: ${escapeEmailHtml(branding.supportEmail)}</p>`
    : ''
  const html = `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#101828"><div style="max-width:640px;margin:0 auto;padding:32px 20px"><div style="background:rgba(255,255,255,.94);border:1px solid rgba(16,24,40,.08);border-radius:24px;padding:28px;box-shadow:0 16px 48px rgba(16,24,40,.08)"><p style="margin:0 0 18px;font-weight:700">${appName}</p><h1 style="margin:0 0 16px;font-size:24px;line-height:1.2">${escapeEmailHtml(heading)}</h1>${bodyHtml}${footer.html}${support}</div></div></body></html>`
  const text = `${branding.appName}\n\n${heading}\n\n${bodyText}${footer.text}${branding.supportEmail ? `\n\nAyuda: ${branding.supportEmail}` : ''}`
  return { html, text }
}

export function emailPreferenceScopeForTemplate(templateKey: EmailTemplateKey) {
  return TEMPLATE_SCOPES[templateKey]
}

export function renderApplicationEmail(
  templateKey: EmailTemplateKey,
  input: EmailTemplateInput,
  branding: EmailBranding = { appName: 'ShippingAPP' },
): RenderedEmail {
  const displayName = boundedText(input.displayName, '', 120)
  const greeting = displayName ? `Hola ${displayName},` : 'Hola,'
  const scope = emailPreferenceScopeForTemplate(templateKey)
  const footer = unsubscribeFooter(input, scope)

  if (templateKey === 'welcome') {
    const subject = `Bienvenido a ${boundedText(branding.appName, 'ShippingAPP', 80)}`
    const bodyText = `${greeting}\nTu cuenta ya está lista. Tus análisis, créditos y productos seguidos quedan asociados a tu sesión autenticada.`
    const bodyHtml = `<p>${escapeEmailHtml(greeting)}</p><p>Tu cuenta ya está lista. Tus análisis, créditos y productos seguidos quedan asociados a tu sesión autenticada.</p>`
    const rendered = layout(branding, 'Tu cuenta está lista', bodyHtml, bodyText, footer)
    return { templateKey, preferenceScope: scope, subject, ...rendered }
  }

  if (templateKey === 'usage') {
    const remaining = Math.max(0, Math.trunc(number(input.creditsRemaining) ?? 0))
    const granted = Math.max(0, Math.trunc(number(input.creditsGranted) ?? 0))
    const subject = `Te quedan ${remaining} créditos en ${boundedText(branding.appName, 'ShippingAPP', 80)}`
    const bodyText = `${greeting}\nTe quedan ${remaining} de ${granted} créditos disponibles en tu período actual.`
    const bodyHtml = `<p>${escapeEmailHtml(greeting)}</p><p>Te quedan <strong>${remaining}</strong> de <strong>${granted}</strong> créditos disponibles en tu período actual.</p>`
    const rendered = layout(branding, 'Estado de tus créditos', bodyHtml, bodyText, footer)
    return { templateKey, preferenceScope: scope, subject, ...rendered }
  }

  if (templateKey === 'weekly_digest') {
    const lines = Array.isArray(input.summaryLines)
      ? input.summaryLines.slice(0, 12).map((line) => boundedText(line, '', 280)).filter(Boolean)
      : []
    const bodyText = `${greeting}\n${lines.length ? lines.map((line) => `• ${line}`).join('\n') : 'No hubo cambios relevantes en tus productos seguidos esta semana.'}`
    const bodyHtml = `<p>${escapeEmailHtml(greeting)}</p>${lines.length ? `<ul>${lines.map((line) => `<li>${escapeEmailHtml(line)}</li>`).join('')}</ul>` : '<p>No hubo cambios relevantes en tus productos seguidos esta semana.</p>'}`
    const rendered = layout(branding, 'Tu resumen semanal de importación', bodyHtml, bodyText, footer)
    return { templateKey, preferenceScope: scope, subject: `Tu resumen semanal · ${boundedText(branding.appName, 'ShippingAPP', 80)}`, ...rendered }
  }

  if (templateKey === 'alert') {
    const product = boundedText(input.productTitle, 'Producto seguido', 240)
    const price = ars(input.marketPriceArs)
    const margin = pct(input.grossMarginPct)
    const details = [price ? `Precio de mercado: ${price}` : null, margin ? `Margen bruto estimado: ${margin}` : null].filter(Boolean) as string[]
    const bodyText = `${greeting}\nDetectamos un cambio relevante en ${product}.${details.length ? `\n${details.join('\n')}` : ''}`
    const bodyHtml = `<p>${escapeEmailHtml(greeting)}</p><p>Detectamos un cambio relevante en <strong>${escapeEmailHtml(product)}</strong>.</p>${details.length ? `<ul>${details.map((line) => `<li>${escapeEmailHtml(line)}</li>`).join('')}</ul>` : ''}`
    const rendered = layout(branding, 'Alerta de producto', bodyHtml, bodyText, footer)
    return { templateKey, preferenceScope: scope, subject: `Alerta · ${product}`, ...rendered }
  }

  const plan = boundedText(input.planName, 'tu plan', 80)
  const status = boundedText(input.billingStatus, 'actualizado', 80)
  const subject = `Estado de facturación · ${boundedText(branding.appName, 'ShippingAPP', 80)}`
  const bodyText = `${greeting}\nEl estado de ${plan} fue actualizado: ${status}.`
  const bodyHtml = `<p>${escapeEmailHtml(greeting)}</p><p>El estado de <strong>${escapeEmailHtml(plan)}</strong> fue actualizado: <strong>${escapeEmailHtml(status)}</strong>.</p>`
  const rendered = layout(branding, 'Actualización de facturación', bodyHtml, bodyText, footer)
  return { templateKey, preferenceScope: scope, subject, ...rendered }
}
