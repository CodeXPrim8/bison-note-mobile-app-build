export const GATEWAY_SQL_HINT =
  'Run supabase/migrations/0024_gateway_live.sql in the live ɃU Supabase SQL editor, then try again.'

export function isMissingGatewayRelation(message?: string) {
  return (
    /gateway_merchants|webhook_deliveries|idempotency_keys/i.test(message ?? '') &&
    /does not exist|schema cache|PGRST/i.test(message ?? '')
  )
}
