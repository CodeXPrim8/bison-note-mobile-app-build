import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

export async function readIdempotency(scope: string, key: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('idempotency_keys')
    .select('request_hash, response, status_code, expires_at')
    .eq('scope', scope)
    .eq('key', key)
    .maybeSingle()
  if (!data) return null
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null
  return data as {
    request_hash: string
    response: unknown
    status_code: number
    expires_at: string
  }
}

export async function writeIdempotency(
  scope: string,
  key: string,
  payload: unknown,
  response: unknown,
  statusCode: number,
) {
  const admin = createAdminClient()
  await admin.from('idempotency_keys').upsert(
    {
      scope,
      key,
      request_hash: hashPayload(payload),
      response,
      status_code: statusCode,
      expires_at: new Date(Date.now() + DEFAULT_TTL_MS).toISOString(),
    },
    { onConflict: 'scope,key' },
  )
}

export { hashPayload }
