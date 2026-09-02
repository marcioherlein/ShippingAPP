import { readTrustedUserId } from './auth'
import { BillingProviderError, createBillingProvider, resolveBillingBackUrl, resolveBillingPlanConfiguration, type BillingProvider, type BillingProviderSubscription } from './billingProvider'
import { verifyMercadoPagoWebhook } from './mercadoPagoWebhook'
import { BillingRepository, type BillingSubscriptionRow, type BillingSubscriptionStatus } from './persistence/billingRepository'
import type { D1DatabaseLike } from './persistence/d1'

type Env = Record<string, unknown> & { DB?: D1DatabaseLike }
type Dependencies = { provider?: BillingProvider; clock?: () => Date; randomId?: () => string; fetcher?: typeof fetch }
const json = (body: unknown, status = 200) => Response.json(body, { status })

function envText(env: Env, key: string, max = 2048) { const raw=env[key]; if(typeof raw!=='string') return null; const v=raw.trim(); return v&&v.length<=max&&!/[\r\n]/.test(v)?v:null }
function validEmail(value: unknown) { if(typeof value!=='string'||value.length>320||/[\r\n]/.test(value)) return null; const v=value.trim(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)?v:null }
function validKey(value: string | null) { if(!value) return null; const v=value.trim(); return v.length>=8&&v.length<=120&&!/[\r\n]/.test(v)?v:null }
async function stableId(prefix:string, ...parts:string[]) { const data=new TextEncoder().encode(parts.join('\u001f')); const digest=await crypto.subtle.digest('SHA-256',data); const h=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join(''); return `${prefix}_${h.slice(0,40)}` }

export function mapMercadoPagoSubscriptionStatus(status: string): BillingSubscriptionStatus {
  const value=String(status||'').toLowerCase()
  if(value==='authorized') return 'active'
  if(value==='paused') return 'paused'
  if(value==='cancelled'||value==='canceled') return 'canceled'
  if(value==='expired') return 'expired'
  return 'pending'
}

function publicSubscription(row: BillingSubscriptionRow) { return { id:row.id, planId:row.plan_id, status:row.status, cancelAtPeriodEnd:row.cancel_at_period_end===1, updatedAt:row.updated_at } }

function validateProviderResource(local: BillingSubscriptionRow, provider: BillingProviderSubscription, expectedEmail: string | null) {
  if(local.provider_subscription_id && local.provider_subscription_id!==provider.id) return 'provider_subscription_mismatch'
  if(provider.externalReference!==local.id) return 'external_reference_mismatch'
  if(!local.provider_plan_id || provider.providerPlanId!==local.provider_plan_id) return 'provider_plan_mismatch'
  if(provider.payerEmail && expectedEmail && provider.payerEmail.toLowerCase()!==expectedEmail.toLowerCase()) return 'provider_payer_mismatch'
  return null
}

async function applyProviderResource(repo: BillingRepository, local: BillingSubscriptionRow, provider: BillingProviderSubscription, expectedEmail: string | null) {
  const invalid=validateProviderResource(local,provider,expectedEmail); if(invalid) throw new Error(invalid)
  const updated=await repo.applyProviderState({ subscriptionId:local.id,userId:local.user_id,providerSubscriptionId:provider.id,providerCustomerId:provider.payerId,providerStatus:provider.status,providerVersion:provider.version,internalStatus:mapMercadoPagoSubscriptionStatus(provider.status) })
  if(!updated) throw new Error('billing_reconcile_write_failed')
  return updated
}

async function fetchAuthorizedPaymentPreapprovalId(env:Env,id:string,fetcher:typeof fetch) {
  const token=envText(env,'MERCADOPAGO_BILLING_ACCESS_TOKEN',1024); if(!token) throw new BillingProviderError('billing_provider_not_configured',503)
  let response:Response
  try { response=await fetcher(`https://api.mercadopago.com/authorized_payments/${encodeURIComponent(id)}`,{headers:{authorization:`Bearer ${token}`,accept:'application/json'},signal:AbortSignal.timeout(12000)}) } catch { throw new BillingProviderError('billing_provider_unavailable') }
  if(!response.ok) throw new BillingProviderError(response.status===401||response.status===403?'billing_provider_unauthorized':'billing_provider_rejected',response.status===401||response.status===403?503:502)
  let body:any; try { body=await response.json() } catch { throw new BillingProviderError('billing_provider_invalid_response') }
  const value=typeof body?.preapproval_id==='string'?body.preapproval_id.trim():''
  if(!value||value.length>191) throw new BillingProviderError('billing_provider_invalid_response')
  return value
}

async function checkout(request:Request,env:Env,userId:string,repo:BillingRepository,provider:BillingProvider,deps:Dependencies) {
  const operationKey=validKey(request.headers.get('idempotency-key')); if(!operationKey) return json({error:'Idempotency-Key requerido.',code:'billing_idempotency_key_required'},400)
  let body:any; try { body=await request.json() } catch { return json({error:'JSON inválido.',code:'invalid_json'},400) }
  const requestedPlan=typeof body?.planCode==='string'?body.planCode.trim():''
  const configuration=resolveBillingPlanConfiguration(env,requestedPlan); if(!configuration) return json({error:'Plan no disponible.',code:'billing_plan_unavailable'},400)
  const plan=await repo.getPlanByCode(configuration.planCode); if(!plan||plan.code==='free') return json({error:'Plan no disponible.',code:'billing_plan_unavailable'},400)
  const user=await repo.getUser(userId); const payerEmail=validEmail(user?.email); if(!payerEmail) return json({error:'Tu cuenta no tiene un email verificable para facturación.',code:'billing_email_unavailable'},409)
  const backUrl=resolveBillingBackUrl(env); if(!backUrl) return json({error:'Billing no está configurado.',code:'billing_back_url_unavailable'},503)
  if(!provider.configured) return json({error:'Billing no está configurado.',code:'billing_provider_not_configured'},503)
  const subscriptionId=await stableId('sub',userId,operationKey); const attemptId=(deps.randomId??(()=>crypto.randomUUID()))()
  const reserved=await repo.reserveCheckout({attemptId,subscriptionId,userId,planId:plan.id,provider:'mercadopago',providerPlanId:configuration.providerPlanId,idempotencyKey:operationKey})
  if(reserved.kind==='collision') return json({error:'La clave de idempotencia pertenece a otra operación.',code:'billing_idempotency_collision'},409)
  if(reserved.kind==='existing') {
    if(reserved.attempt.status==='created'&&reserved.attempt.checkout_url) return json({status:'pending',subscription:publicSubscription(reserved.subscription),checkoutUrl:reserved.attempt.checkout_url,replayed:true})
    if(reserved.subscription.provider_subscription_id) {
      try { const current=await provider.getSubscription(reserved.subscription.provider_subscription_id); const updated=await applyProviderResource(repo,reserved.subscription,current,payerEmail); await repo.markCheckoutCreated({userId,subscriptionId,providerSubscriptionId:current.id,providerCustomerId:current.payerId,providerStatus:current.status,providerVersion:current.version,internalStatus:updated.status,checkoutUrl:current.checkoutUrl}); return json({status:updated.status,subscription:publicSubscription(updated),checkoutUrl:current.checkoutUrl,replayed:true}) } catch { return json({status:'processing',subscription:publicSubscription(reserved.subscription),replayed:true},202) }
    }
    return json({status:'processing',subscription:publicSubscription(reserved.subscription),replayed:true},202)
  }
  try {
    const created=await provider.createSubscription({providerPlanId:configuration.providerPlanId,payerEmail,externalReference:subscriptionId,backUrl,idempotencyKey:operationKey})
    const current=await provider.getSubscription(created.id)
    const invalid=validateProviderResource(reserved.subscription,current,payerEmail); if(invalid) { await repo.markCheckoutFailed(userId,subscriptionId,invalid); return json({error:'Mercado Pago devolvió una suscripción inconsistente.',code:'billing_provider_identity_mismatch'},502) }
    const updated=await repo.markCheckoutCreated({userId,subscriptionId,providerSubscriptionId:current.id,providerCustomerId:current.payerId,providerStatus:current.status,providerVersion:current.version,internalStatus:mapMercadoPagoSubscriptionStatus(current.status),checkoutUrl:current.checkoutUrl??created.checkoutUrl})
    if(!updated) throw new Error('billing_checkout_persistence_failed')
    return json({status:updated.status,subscription:publicSubscription(updated),checkoutUrl:current.checkoutUrl??created.checkoutUrl,replayed:false},201)
  } catch(error) { const code=error instanceof BillingProviderError?error.code:'billing_checkout_failed'; await repo.markCheckoutFailed(userId,subscriptionId,code); return json({error:'No pudimos iniciar el checkout.',code},error instanceof BillingProviderError?error.status:502) }
}

async function reconcileOwned(request:Request, userId:string, repo:BillingRepository, provider:BillingProvider) {
  let body:any; try { body=await request.json() } catch { return json({error:'JSON inválido.',code:'invalid_json'},400) }
  const id=typeof body?.subscriptionId==='string'?body.subscriptionId:''; if(!id) return json({error:'subscriptionId requerido.',code:'billing_subscription_required'},400)
  const local=await repo.getSubscriptionForUser(userId,id); if(!local) return json({error:'Suscripción no encontrada.',code:'billing_subscription_not_found'},404)
  if(!local.provider_subscription_id) return json({status:local.status,subscription:publicSubscription(local)})
  const user=await repo.getUser(userId); const email=validEmail(user?.email)
  try { const current=await provider.getSubscription(local.provider_subscription_id); const updated=await applyProviderResource(repo,local,current,email); return json({status:updated.status,subscription:publicSubscription(updated)}) } catch(error) { return json({error:'No pudimos reconciliar la suscripción.',code:error instanceof BillingProviderError?error.code:'billing_reconcile_failed'},502) }
}

async function cancelOwned(request:Request,userId:string,repo:BillingRepository,provider:BillingProvider) {
  let body:any; try { body=await request.json() } catch { return json({error:'JSON inválido.',code:'invalid_json'},400) }
  const id=typeof body?.subscriptionId==='string'?body.subscriptionId:''; const local=id?await repo.getSubscriptionForUser(userId,id):null
  if(!local) return json({error:'Suscripción no encontrada.',code:'billing_subscription_not_found'},404)
  if(!local.provider_subscription_id) return json({error:'La suscripción todavía no existe en el proveedor.',code:'billing_subscription_pending'},409)
  const user=await repo.getUser(userId); const email=validEmail(user?.email)
  try { await provider.cancelSubscription(local.provider_subscription_id); const current=await provider.getSubscription(local.provider_subscription_id); const updated=await applyProviderResource(repo,local,current,email); return json({status:updated.status,subscription:publicSubscription(updated)}) } catch(error) { return json({error:'No pudimos cancelar la suscripción.',code:error instanceof BillingProviderError?error.code:'billing_cancel_failed'},502) }
}

async function webhook(request:Request,env:Env,repo:BillingRepository,provider:BillingProvider,deps:Dependencies) {
  const secret=envText(env,'MERCADOPAGO_WEBHOOK_SECRET',512); if(!secret||secret.length<32) return json({error:'Webhook no configurado.',code:'billing_webhook_not_configured'},503)
  const verified=await verifyMercadoPagoWebhook(request,secret); if(!verified) return json({error:'Firma inválida.',code:'invalid_webhook_signature'},401)
  const reserved=await repo.reserveBillingEvent({id:(deps.randomId??(()=>crypto.randomUUID()))(),provider:'mercadopago',providerEventId:verified.providerEventId,eventType:verified.topic,payloadSha256:verified.payloadSha256})
  if(reserved.kind==='collision') return json({error:'Evento en conflicto.',code:'billing_event_collision'},409)
  if(reserved.kind==='replay') return json({ok:true,replayed:true})
  if(verified.topic==='subscription_preapproval_plan') { await repo.completeBillingEvent({eventId:reserved.event.id,status:'ignored'}); return json({ok:true,ignored:true}) }
  try {
    const providerSubscriptionId=verified.topic==='subscription_preapproval' ? verified.resourceId : await fetchAuthorizedPaymentPreapprovalId(env,verified.resourceId,deps.fetcher??fetch)
    const current=await provider.getSubscription(providerSubscriptionId)
    let local=await repo.getSubscriptionByProviderId('mercadopago',current.id)
    if(!local&&current.externalReference) local=await repo.getSubscriptionById(current.externalReference)
    if(!local) { await repo.completeBillingEvent({eventId:reserved.event.id,status:'ignored'}); return json({ok:true,ignored:true}) }
    const user=await repo.getUser(local.user_id); const invalid=validateProviderResource(local,current,validEmail(user?.email))
    if(invalid) { await repo.completeBillingEvent({eventId:reserved.event.id,status:'failed',userId:local.user_id,subscriptionId:local.id,errorCode:invalid}); return json({error:'Provider identity mismatch.',code:'billing_provider_identity_mismatch'},409) }
    const updated=await applyProviderResource(repo,local,current,validEmail(user?.email)); await repo.completeBillingEvent({eventId:reserved.event.id,status:'processed',userId:updated.user_id,subscriptionId:updated.id}); return json({ok:true})
  } catch(error) { const code=error instanceof BillingProviderError?error.code:'billing_webhook_reconcile_failed'; await repo.completeBillingEvent({eventId:reserved.event.id,status:'failed',errorCode:code}); return json({error:'Webhook temporalmente no procesado.',code},502) }
}

export function isBillingRoute(pathname:string) { return pathname==='/api/billing'||pathname==='/api/billing/checkout'||pathname==='/api/billing/reconcile'||pathname==='/api/billing/cancel'||pathname==='/api/billing/webhook/mercadopago' }
export async function handleBilling(request:Request,env:Env,deps:Dependencies={}):Promise<Response> {
  if(!env.DB) return json({error:'Billing storage no configurado.',code:'billing_store_unavailable'},503)
  const url=new URL(request.url); const repo=new BillingRepository(env.DB,deps.clock); const provider=deps.provider??createBillingProvider(env,deps.fetcher)
  if(url.pathname==='/api/billing/webhook/mercadopago'&&request.method==='POST') return webhook(request,env,repo,provider,deps)
  const userId=readTrustedUserId(request); if(!userId) return json({error:'Unauthorized.',code:'unauthorized'},401)
  if(url.pathname==='/api/billing'&&request.method==='GET') return json({subscriptions:(await repo.listUserSubscriptions(userId)).map(publicSubscription)})
  if(url.pathname==='/api/billing/checkout'&&request.method==='POST') return checkout(request,env,userId,repo,provider,deps)
  if(url.pathname==='/api/billing/reconcile'&&request.method==='POST') return reconcileOwned(request,userId,repo,provider)
  if(url.pathname==='/api/billing/cancel'&&request.method==='POST') return cancelOwned(request,userId,repo,provider)
  return json({error:'Not found.',code:'not_found'},404)
}
