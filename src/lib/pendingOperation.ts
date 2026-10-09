import { readProductDraft, writeProductDraft } from './productDraft'
export type PendingOperation<T> = { id: string; payload: T; status: 'running' | 'waiting_auth' | 'failed' | 'complete' }
export function readOperation<T>(stage: string) { return readProductDraft<PendingOperation<T>>(`operation-${stage}`) }
export function beginOperation<T>(stage: string, payload: T) {
  const prior = readOperation<T>(stage)
  const same = prior && prior.status !== 'complete' && JSON.stringify(prior.payload) === JSON.stringify(payload)
  const operation: PendingOperation<T> = { id: same ? prior.id : `op-${crypto.randomUUID()}`, payload, status: 'running' }
  saveOperation(stage, operation)
  return operation
}
export function saveOperation<T>(stage: string, operation: PendingOperation<T>) { writeProductDraft(`operation-${stage}`, operation) }
export function canResume<T>(operation: PendingOperation<T> | null) { return operation?.status === 'running' || operation?.status === 'waiting_auth' }
