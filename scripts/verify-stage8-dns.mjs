import dns from 'node:dns/promises'
import { pathToFileURL } from 'node:url'

function required(env, key) {
  const value = env[key]
  if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value)) throw new Error(`${key.toLowerCase()}_required`)
  return value.trim()
}

function hostName(value) {
  const normalized = value.toLowerCase().replace(/^\.+|\.+$/g, '')
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(normalized) || !normalized.includes('.')) throw new Error('stage8_dns_name_invalid')
  return normalized
}

function dnsName(value) {
  const normalized = value.toLowerCase().replace(/^\.+|\.+$/g, '')
  if (!/^[a-z0-9_](?:[a-z0-9._-]*[a-z0-9_])?$/.test(normalized) || !normalized.includes('.')) throw new Error('stage8_dns_name_invalid')
  return normalized
}

function flattenTxt(rows) {
  return rows.map((parts) => parts.join('')).filter(Boolean)
}

async function defaultTxt(name) {
  try { return flattenTxt(await dns.resolveTxt(name)) } catch { return [] }
}

async function defaultHostResolves(host) {
  try {
    const rows = await dns.lookup(host, { all: true })
    return rows.length > 0
  } catch {
    try {
      const names = await dns.resolveCname(host)
      return names.length > 0
    } catch {
      return false
    }
  }
}

function hasFragment(records, fragment) {
  const needle = fragment.trim().toLowerCase()
  return records.some((record) => record.toLowerCase().includes(needle))
}

export async function verifyStage8Dns(env = process.env, dependencies = {}) {
  const resolveTxt = dependencies.resolveTxt ?? defaultTxt
  const hostResolves = dependencies.hostResolves ?? defaultHostResolves
  const publicOrigin = new URL(required(env, 'STAGE8_PUBLIC_BASE_URL'))
  if (publicOrigin.protocol !== 'https:' || publicOrigin.username || publicOrigin.password || publicOrigin.search || publicOrigin.hash) {
    throw new Error('stage8_public_base_url_https_required')
  }
  const publicHost = hostName(publicOrigin.hostname)
  if (!(await hostResolves(publicHost))) throw new Error(`stage8_public_host_unresolved:${publicHost}`)

  const emailDomain = hostName(required(env, 'STAGE8_EMAIL_DOMAIN'))
  const spfName = dnsName(env.STAGE8_SPF_RECORD_NAME?.trim() || emailDomain)
  const spfFragment = required(env, 'STAGE8_SPF_EXPECTED_FRAGMENT')
  const dkimName = dnsName(required(env, 'STAGE8_DKIM_RECORD_NAME'))
  const dkimFragment = required(env, 'STAGE8_DKIM_EXPECTED_FRAGMENT')
  const dmarcName = dnsName(env.STAGE8_DMARC_RECORD_NAME?.trim() || `_dmarc.${emailDomain}`)

  const [spf, dkim, dmarc] = await Promise.all([resolveTxt(spfName), resolveTxt(dkimName), resolveTxt(dmarcName)])
  if (!hasFragment(spf, spfFragment)) throw new Error(`stage8_spf_not_verified:${spfName}`)
  if (!hasFragment(dkim, dkimFragment)) throw new Error(`stage8_dkim_not_verified:${dkimName}`)
  if (!hasFragment(dmarc, 'v=DMARC1')) throw new Error(`stage8_dmarc_not_verified:${dmarcName}`)

  return {
    publicHost,
    emailDomain,
    spf: { name: spfName, verified: true },
    dkim: { name: dkimName, verified: true },
    dmarc: { name: dmarcName, verified: true },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await verifyStage8Dns()
  console.log(JSON.stringify({ status: 'ok', ...result }))
}
