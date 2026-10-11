export function clerkEnvironmentStatus(env: Record<string, unknown>): {
  environment: 'missing' | 'incomplete' | 'invalid' | 'mixed' | 'development' | 'production'
  configurationValid: boolean
}
