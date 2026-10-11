/** Reports configuration categories only. Never return or log credential values. */
export function clerkEnvironmentStatus(env) {
  const value = name => typeof env[name] === 'string' ? env[name].trim() : ''
  const publishable = value('CLERK_PUBLISHABLE_KEY')
  const secret = value('CLERK_SECRET_KEY')
  const jwt = value('CLERK_JWT_KEY')
  const mode = (key, prefix) => {
    const match = key.match(new RegExp(`^${prefix}_(live|test)_[A-Za-z0-9+/=_-]+$`))
    return match?.[1] === 'live' ? 'production' : match?.[1] === 'test' ? 'development' : 'invalid'
  }
  const configured = [publishable, secret, jwt].filter(Boolean).length
  if (!configured) return { environment: 'missing', configurationValid: false }
  if (configured !== 3) return { environment: 'incomplete', configurationValid: false }
  const publicMode = mode(publishable, 'pk')
  const secretMode = mode(secret, 'sk')
  if (publicMode === 'invalid' || secretMode === 'invalid') return { environment: 'invalid', configurationValid: false }
  if (publicMode !== secretMode) return { environment: 'mixed', configurationValid: false }
  return { environment: publicMode, configurationValid: true }
}
