export type RouteAccess = 'public' | 'operational' | 'provider_callback' | 'provider_webhook'
export type TargetAccess = 'public' | 'authenticated' | 'internal' | 'provider_callback' | 'provider_webhook'
export type CostRisk = 'low' | 'medium' | 'high'

export type RoutePolicy = {
  id: string
  path: string
  methods: readonly string[]
  currentAccess: RouteAccess
  targetAccess: TargetAccess
  targetMetered: boolean
  costRisk: CostRisk
  externalProviders: readonly string[]
  notes: string
}

export const API_ROUTE_POLICIES: readonly RoutePolicy[] = [
  {
    id: 'image-proxy',
    path: '/api/image-proxy',
    methods: ['GET', 'HEAD'],
    currentAccess: 'public',
    targetAccess: 'public',
    targetMetered: false,
    costRisk: 'medium',
    externalProviders: ['remote product image host'],
    notes: 'Public image relay. Must retain SSRF/domain restrictions in imageProxy.',
  },
  {
    id: 'runtime-smoke',
    path: '/api/runtime-smoke',
    methods: ['GET'],
    currentAccess: 'operational',
    targetAccess: 'internal',
    targetMetered: false,
    costRisk: 'low',
    externalProviders: [],
    notes: 'Used by GitHub Actions production smoke checks. Keep response free of secrets.',
  },
  {
    id: 'alibaba-native-probe',
    path: '/api/alibaba-native-probe',
    methods: ['POST'],
    currentAccess: 'operational',
    targetAccess: 'internal',
    targetMetered: false,
    costRisk: 'high',
    externalProviders: ['Cloudflare Browser / Alibaba'],
    notes: 'Diagnostic route that deliberately bypasses Parse.bot. Must not remain a public production compute surface.',
  },
  {
    id: 'mercadolibre-oauth-callback',
    path: '/oauth/mercadolibre/callback',
    methods: ['GET'],
    currentAccess: 'provider_callback',
    targetAccess: 'provider_callback',
    targetMetered: false,
    costRisk: 'low',
    externalProviders: ['Mercado Libre'],
    notes: 'Bootstrap/admin OAuth callback; authorization codes are sensitive and must never be logged.',
  },
  {
    id: 'mercadolibre-api-callback-alias',
    path: '/api/mercadolibre/callback',
    methods: ['GET'],
    currentAccess: 'provider_callback',
    targetAccess: 'provider_callback',
    targetMetered: false,
    costRisk: 'low',
    externalProviders: ['Mercado Libre'],
    notes: 'Legacy callback alias. Candidate for removal once production OAuth flow is finalized.',
  },
  {
    id: 'mercadolibre-notifications',
    path: '/api/mercadolibre/notifications',
    methods: ['GET', 'POST'],
    currentAccess: 'provider_webhook',
    targetAccess: 'provider_webhook',
    targetMetered: false,
    costRisk: 'low',
    externalProviders: ['Mercado Libre'],
    notes: 'Currently acknowledges notifications without processing them. Future processing must verify authenticity/idempotency.',
  },
  {
    id: 'mercadolibre-status',
    path: '/api/mercadolibre/status',
    methods: ['GET'],
    currentAccess: 'operational',
    targetAccess: 'internal',
    targetMetered: false,
    costRisk: 'medium',
    externalProviders: ['Mercado Libre'],
    notes: 'Performs authenticated identity check; intended for operations, not end users.',
  },
  {
    id: 'mercadolibre-benchmark',
    path: '/api/mercadolibre/benchmark',
    methods: ['POST'],
    currentAccess: 'public',
    targetAccess: 'authenticated',
    targetMetered: true,
    costRisk: 'medium',
    externalProviders: ['Mercado Libre'],
    notes: 'Market benchmark provider call. Stage 2 auth and Stage 5 metering required.',
  },
  {
    id: 'chat',
    path: '/api/chat',
    methods: ['POST'],
    currentAccess: 'public',
    targetAccess: 'authenticated',
    targetMetered: false,
    costRisk: 'medium',
    externalProviders: ['Cloudflare Workers AI'],
    notes: 'Conversational Import Analyst. Authentication target; final metering policy intentionally deferred.',
  },
  {
    id: 'intake',
    path: '/api/intake',
    methods: ['POST'],
    currentAccess: 'public',
    targetAccess: 'authenticated',
    targetMetered: true,
    costRisk: 'high',
    externalProviders: ['Cloudflare Workers AI', 'Mercado Libre', 'BCRA'],
    notes: 'AI intake plus market and FX hydration. Expensive and a primary entitlement boundary.',
  },
  {
    id: 'opportunity-search',
    path: '/api/opportunity-search',
    methods: ['POST'],
    currentAccess: 'public',
    targetAccess: 'authenticated',
    targetMetered: true,
    costRisk: 'high',
    externalProviders: ['Parse.bot / Alibaba'],
    notes: 'External Alibaba opportunity search. High abuse/cost risk.',
  },
  {
    id: 'discover',
    path: '/api/discover',
    methods: ['POST'],
    currentAccess: 'public',
    targetAccess: 'authenticated',
    targetMetered: true,
    costRisk: 'high',
    externalProviders: ['Cloudflare Browser / Alibaba'],
    notes: 'Live Alibaba browser discovery. High compute/provider cost.',
  },
  {
    id: 'ncm-classify',
    path: '/api/ncm-classify',
    methods: ['POST'],
    currentAccess: 'public',
    targetAccess: 'authenticated',
    targetMetered: true,
    costRisk: 'medium',
    externalProviders: ['Cloudflare Workers AI'],
    notes: 'NCM/SIM classification uses local assets plus AI.',
  },
  {
    id: 'analyze',
    path: '/api/analyze',
    methods: ['POST'],
    currentAccess: 'public',
    targetAccess: 'authenticated',
    targetMetered: true,
    costRisk: 'high',
    externalProviders: ['Parse.bot / Alibaba', 'Cloudflare Browser', 'Cloudflare Workers AI', 'Mercado Libre', 'BCRA'],
    notes: 'Full import analysis. Primary paid-work boundary for Stage 5.',
  },
] as const

export function resolveRoutePolicy(pathname: string, method: string) {
  const normalizedMethod = method.toUpperCase()
  return API_ROUTE_POLICIES.find((route) => route.path === pathname && route.methods.includes(normalizedMethod)) ?? null
}
