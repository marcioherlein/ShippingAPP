import type { D1DatabaseLike, D1Value } from './d1'

export type BillingPlanRow = { id: string; code: string; name: string; monthly_credits: number; monitoring_enabled: number }
export type BillingUserRow = { id: string; email: string | null; display_name: string | null }
export type BillingSubscriptionStatus = 'pending' | 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'expired'
export type BillingSubscriptionRow = {
  id: string; user_id: string; plan_id: string; provider: string; provider_customer_id: string | null;
  provider_subscription_id: string | null; provider_plan_id: string | null; provider_status: string | null;
  provider_version: number | null; status: BillingSubscriptionStatus; current_period_start: string | null;
  current_period_end: string | null; cancel_at_period_end: number; last_provider_sync_at: string | null;
  checkout_idempotency_key: string | null; checkout_state: 'running' | 'created' | 'failed' | null;
  checkout_lease_expires_at: string | null; checkout_url: string | null; checkout_error_code: string | null;
  created_at: string; updated_at: string
}
export type BillingEventRow = {
  id: string; provider: string; provider_event_id: string; event_type: string; user_id: string | null;
  subscription_id: string | null; payload_sha256: string; status: 'received' | 'processed' | 'ignored' | 'failed';
  error_code: string | null; processing_lease_expires_at: string | null; attempt_count: number;
  created_at: string; processed_at: string | null
}

function safe(label: string, value: string, max: number, min = 1) {
  if (typeof value !== 'string' || value.length < min || value.length > max || /[\r\n]/.test(value)) throw new Error(`${label}_invalid`)
  return value
}
async function first<T>(db: D1DatabaseLike, sql: string, values: D1Value[]) { return db.prepare(sql).bind(...values).first<T>() }
async function run(db: D1DatabaseLike, sql: string, values: D1Value[]) { return db.prepare(sql).bind(...values).run() }

export class BillingRepository {
  constructor(private readonly db: D1DatabaseLike, private readonly clock: () => Date = () => new Date()) {}
  private now() { return this.clock().toISOString() }
  private lease() { return new Date(this.clock().getTime() + 10 * 60 * 1000).toISOString() }

  getPlanByCode(code: string) { return first<BillingPlanRow>(this.db, 'SELECT id, code, name, monthly_credits, monitoring_enabled FROM plans WHERE code = ? AND active = 1 LIMIT 1', [safe('plan_code', code, 40)]) }
  getUser(userId: string) { return first<BillingUserRow>(this.db, 'SELECT id, email, display_name FROM users WHERE id = ?', [safe('user_id', userId, 64)]) }
  getSubscriptionForUser(userId: string, subscriptionId: string) { return first<BillingSubscriptionRow>(this.db, 'SELECT * FROM subscriptions WHERE id = ? AND user_id = ?', [safe('subscription_id', subscriptionId, 64), safe('user_id', userId, 64)]) }
  getSubscriptionById(subscriptionId: string) { return first<BillingSubscriptionRow>(this.db, 'SELECT * FROM subscriptions WHERE id = ?', [safe('subscription_id', subscriptionId, 64)]) }
  getSubscriptionByProviderId(provider: string, providerSubscriptionId: string) { return first<BillingSubscriptionRow>(this.db, 'SELECT * FROM subscriptions WHERE provider = ? AND provider_subscription_id = ?', [safe('provider', provider, 40), safe('provider_subscription_id', providerSubscriptionId, 191)]) }
  async listUserSubscriptions(userId: string) { return (await this.db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 20').bind(safe('user_id', userId, 64)).all<BillingSubscriptionRow>()).results }

  async reserveCheckout(input: { subscriptionId: string; userId: string; planId: string; provider: string; providerPlanId: string; idempotencyKey: string }) {
    const now=this.now(); const userId=safe('user_id',input.userId,64); const planId=safe('plan_id',input.planId,64)
    const subscriptionId=safe('subscription_id',input.subscriptionId,64); const provider=safe('provider',input.provider,40)
    const providerPlanId=safe('provider_plan_id',input.providerPlanId,191); const key=safe('idempotency_key',input.idempotencyKey,120,8); const lease=this.lease()
    const inserted=await run(this.db, `INSERT INTO subscriptions (id,user_id,plan_id,provider,provider_customer_id,provider_subscription_id,status,current_period_start,current_period_end,cancel_at_period_end,created_at,updated_at,provider_plan_id,provider_status,provider_version,last_provider_sync_at,checkout_idempotency_key,checkout_state,checkout_lease_expires_at,checkout_url,checkout_error_code) VALUES (?,?,?,?,NULL,NULL,'pending',NULL,NULL,0,?,?,?,NULL,NULL,NULL,?,'running',?,NULL,NULL) ON CONFLICT(id) DO NOTHING`, [subscriptionId,userId,planId,provider,now,now,providerPlanId,key,lease])
    let row=await this.getSubscriptionForUser(userId,subscriptionId); if(!row) throw new Error('billing_subscription_reservation_failed')
    if(row.plan_id!==planId||row.provider!==provider||row.provider_plan_id!==providerPlanId||row.checkout_idempotency_key!==key) return {kind:'collision' as const,subscription:row}
    if(Number(inserted.meta?.changes??0)===1) return {kind:'started' as const,subscription:row}
    if(row.checkout_state==='created') return {kind:'existing' as const,subscription:row}
    if(row.checkout_state==='running'&&row.checkout_lease_expires_at&&row.checkout_lease_expires_at>now) return {kind:'existing' as const,subscription:row}
    const retry=await run(this.db, `UPDATE subscriptions SET checkout_state='running',checkout_lease_expires_at=?,checkout_error_code=NULL,updated_at=? WHERE id=? AND user_id=? AND checkout_idempotency_key=? AND (checkout_state='failed' OR checkout_lease_expires_at<=?)`, [lease,now,subscriptionId,userId,key,now])
    row=await this.getSubscriptionForUser(userId,subscriptionId); if(!row) throw new Error('billing_checkout_retry_failed')
    return Number(retry.meta?.changes??0)===1 ? {kind:'started' as const,subscription:row} : {kind:'existing' as const,subscription:row}
  }

  async markCheckoutCreated(input:{userId:string;subscriptionId:string;providerSubscriptionId:string;providerCustomerId:string|null;providerStatus:string;providerVersion:number|null;internalStatus:BillingSubscriptionStatus;checkoutUrl:string|null}) {
    const now=this.now(); const r=await run(this.db, `UPDATE subscriptions SET provider_subscription_id=?,provider_customer_id=?,provider_status=?,provider_version=?,status=?,last_provider_sync_at=?,checkout_state='created',checkout_url=?,checkout_error_code=NULL,updated_at=? WHERE id=? AND user_id=?`, [safe('provider_subscription_id',input.providerSubscriptionId,191),input.providerCustomerId,safe('provider_status',input.providerStatus,80),input.providerVersion,input.internalStatus,now,input.checkoutUrl,now,safe('subscription_id',input.subscriptionId,64),safe('user_id',input.userId,64)])
    if(Number(r.meta?.changes??0)!==1) throw new Error('billing_checkout_persistence_failed'); return this.getSubscriptionForUser(input.userId,input.subscriptionId)
  }
  async markCheckoutFailed(userId:string,subscriptionId:string,code:string) { const now=this.now(); await run(this.db, `UPDATE subscriptions SET checkout_state='failed',checkout_error_code=?,updated_at=? WHERE id=? AND user_id=? AND checkout_state='running'`, [safe('error_code',code,80),now,safe('subscription_id',subscriptionId,64),safe('user_id',userId,64)]) }

  async applyProviderState(input:{subscriptionId:string;userId:string;providerSubscriptionId:string;providerCustomerId:string|null;providerStatus:string;providerVersion:number|null;internalStatus:BillingSubscriptionStatus}) {
    const now=this.now(); const subscriptionId=safe('subscription_id',input.subscriptionId,64); const userId=safe('user_id',input.userId,64)
    const providerSubscriptionId=safe('provider_subscription_id',input.providerSubscriptionId,191); const providerStatus=safe('provider_status',input.providerStatus,80)
    const sql = input.providerVersion == null
      ? `UPDATE subscriptions SET provider_subscription_id=?,provider_customer_id=?,provider_status=?,provider_version=NULL,status=?,last_provider_sync_at=?,updated_at=? WHERE id=? AND user_id=? AND provider_version IS NULL`
      : `UPDATE subscriptions SET provider_subscription_id=?,provider_customer_id=?,provider_status=?,provider_version=?,status=?,last_provider_sync_at=?,updated_at=? WHERE id=? AND user_id=? AND (provider_version IS NULL OR provider_version<=?)`
    const values: D1Value[] = input.providerVersion == null
      ? [providerSubscriptionId,input.providerCustomerId,providerStatus,input.internalStatus,now,now,subscriptionId,userId]
      : [providerSubscriptionId,input.providerCustomerId,providerStatus,input.providerVersion,input.internalStatus,now,now,subscriptionId,userId,input.providerVersion]
    const r=await run(this.db,sql,values)
    const current=await this.getSubscriptionForUser(userId,subscriptionId); if(!current) throw new Error('billing_subscription_update_failed')
    if(Number(r.meta?.changes??0)===1) return current
    if(input.providerVersion != null && current.provider_version != null && current.provider_version > input.providerVersion) return current
    if(input.providerVersion == null && current.provider_version != null) return current
    throw new Error('billing_subscription_update_failed')
  }

  getBillingEvent(provider:string,providerEventId:string) { return first<BillingEventRow>(this.db,'SELECT * FROM billing_events WHERE provider=? AND provider_event_id=?',[safe('provider',provider,40),safe('provider_event_id',providerEventId,191)]) }
  async reserveBillingEvent(input:{id:string;provider:string;providerEventId:string;eventType:string;payloadSha256:string}) {
    const now=this.now(); const lease=this.lease(); const provider=safe('provider',input.provider,40); const providerEventId=safe('provider_event_id',input.providerEventId,191)
    const inserted=await run(this.db, `INSERT INTO billing_events (id,provider,provider_event_id,event_type,user_id,subscription_id,payload_sha256,status,error_code,created_at,processed_at,processing_lease_expires_at,attempt_count) VALUES (?,?,?,?,NULL,NULL,?,'received',NULL,?,NULL,?,1) ON CONFLICT(provider,provider_event_id) DO NOTHING`, [safe('event_id',input.id,64),provider,providerEventId,safe('event_type',input.eventType,120),safe('payload_sha256',input.payloadSha256,64,64),now,lease])
    let event=await this.getBillingEvent(provider,providerEventId); if(!event) throw new Error('billing_event_reservation_failed')
    if(event.payload_sha256!==input.payloadSha256||event.event_type!==input.eventType) return {kind:'collision' as const,event}
    if(Number(inserted.meta?.changes??0)===1) return {kind:'ready' as const,event}
    if(event.status==='processed'||event.status==='ignored') return {kind:'replay' as const,event}
    if(event.status==='received'&&event.processing_lease_expires_at&&event.processing_lease_expires_at>now) return {kind:'replay' as const,event}
    const retry=await run(this.db, `UPDATE billing_events SET status='received',error_code=NULL,processed_at=NULL,processing_lease_expires_at=?,attempt_count=attempt_count+1 WHERE id=? AND ((status='failed') OR (status='received' AND (processing_lease_expires_at IS NULL OR processing_lease_expires_at<=?)))`, [lease,event.id,now])
    event=await this.getBillingEvent(provider,providerEventId); if(!event) throw new Error('billing_event_retry_failed')
    return Number(retry.meta?.changes??0)===1 ? {kind:'ready' as const,event} : {kind:'replay' as const,event}
  }
  async completeBillingEvent(input:{eventId:string;status:'processed'|'ignored'|'failed';userId?:string|null;subscriptionId?:string|null;errorCode?:string|null}) { const now=this.now(); await run(this.db, `UPDATE billing_events SET status=?,user_id=?,subscription_id=?,error_code=?,processed_at=?,processing_lease_expires_at=NULL WHERE id=? AND status='received'`, [input.status,input.userId??null,input.subscriptionId??null,input.errorCode??null,now,safe('event_id',input.eventId,64)]); return first<BillingEventRow>(this.db,'SELECT * FROM billing_events WHERE id=?',[input.eventId]) }
}
