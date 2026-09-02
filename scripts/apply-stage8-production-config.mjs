import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

function clean(value, max = 4096) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max || /[\r\n]/.test(trimmed)) return null
  return trimmed
}

function httpsOrigin(value) {
  const candidate = clean(value, 2048)
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null
    return url.origin
  } catch {
    return null
  }
}

function headerValue(value, max = 320) {
  return clean(value, max)
}

export function applyStage8ProductionConfig(baseConfig, env = process.env) {
  if (!baseConfig || typeof baseConfig !== 'object' || Array.isArray(baseConfig)) throw new Error('wrangler_config_invalid')
  const vars = { ...(baseConfig.vars || {}) }

  const publicOrigin = httpsOrigin(env.STAGE8_PUBLIC_BASE_URL)
  if (env.STAGE8_PUBLIC_BASE_URL && !publicOrigin) throw new Error('stage8_public_base_url_invalid')
  if (publicOrigin) vars.EMAIL_PUBLIC_BASE_URL = publicOrigin

  const appName = clean(env.STAGE8_EMAIL_APP_NAME, 80)
  if (env.STAGE8_EMAIL_APP_NAME && !appName) throw new Error('stage8_email_app_name_invalid')
  if (appName) vars.EMAIL_APP_NAME = appName

  const authorizedParties = clean(env.STAGE8_CLERK_AUTHORIZED_PARTIES, 4096)
  if (env.STAGE8_CLERK_AUTHORIZED_PARTIES && !authorizedParties) throw new Error('stage8_authorized_parties_invalid')
  if (authorizedParties) vars.CLERK_AUTHORIZED_PARTIES = authorizedParties

  for (const [source, target] of [
    ['STAGE8_EMAIL_FROM', 'EMAIL_FROM'],
    ['STAGE8_EMAIL_REPLY_TO', 'EMAIL_REPLY_TO'],
    ['STAGE8_EMAIL_SUPPORT_EMAIL', 'EMAIL_SUPPORT_EMAIL'],
  ]) {
    const value = headerValue(env[source])
    if (env[source] && !value) throw new Error(`${source.toLowerCase()}_invalid`)
    if (value) vars[target] = value
  }

  // No environment/repository variable is allowed to control the send switch.
  // Preserve the version-controlled value from wrangler.jsonc so activation can
  // happen only through a reviewed code change. Today that value is `false`.
  if (vars.EMAIL_SENDING_ENABLED !== 'true') vars.EMAIL_SENDING_ENABLED = 'false'

  return { ...baseConfig, vars }
}

export function applyStage8ProductionConfigFile(inputPath, outputPath = inputPath, env = process.env) {
  const parsed = JSON.parse(fs.readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, ''))
  const next = applyStage8ProductionConfig(parsed, env)
  fs.writeFileSync(outputPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [inputPath = '.wrangler.production.json', outputPath = inputPath] = process.argv.slice(2)
  const next = applyStage8ProductionConfigFile(inputPath, outputPath)
  console.log(`Stage 8 production vars prepared; sending=${next.vars?.EMAIL_SENDING_ENABLED}`)
}
