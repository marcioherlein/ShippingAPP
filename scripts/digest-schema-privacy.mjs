export const EXPECTED_DIGEST_RECIPIENT_COLUMNS = [
  'run_id',
  'user_id',
  'status',
  'attempt_count',
  'email_event_id',
  'error_code',
  'created_at',
  'updated_at',
  'processed_at',
]

export function validateDigestRecipientColumns(columns) {
  const normalized = Array.isArray(columns) ? columns.map((column) => String(column)) : []
  if (JSON.stringify(normalized) !== JSON.stringify(EXPECTED_DIGEST_RECIPIENT_COLUMNS)) {
    throw new Error(`Stage 7 scheduler recipient schema contains unexpected columns: ${JSON.stringify(normalized)}`)
  }
  return true
}
