import { pathToFileURL } from 'node:url'
import { clerkEnvironmentStatus } from './lib/clerkEnvironment.mjs'

export function validateClerkDeployment(env) {
  const status = clerkEnvironmentStatus(env)
  // Development remains deployable for testing, but is never launch-ready.
  if (!status.configurationValid && status.environment !== 'missing') {
    throw new Error(`Clerk deployment configuration is ${status.environment}. Configure matching publishable, secret and JWT keys from the same instance.`)
  }
  return status
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const status = validateClerkDeployment(process.env)
    console.log(`Clerk environment: ${status.environment}`)
    if (status.environment !== 'production') {
      console.log('::warning::Clerk production authentication is not configured. This deployment is not evidence of launch readiness.')
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
