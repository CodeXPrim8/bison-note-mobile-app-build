import bcrypt from 'bcryptjs'
import { createAdminClient, tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'
import { ApiError } from '@/lib/api/errors'
import { GATEWAY_SQL_HINT, isMissingGatewayRelation } from '@/lib/gateway/sql'
import type { GatewayMerchant } from '@/lib/types/database'

export async function hashSecretKey(secret: string): Promise<string> {
  return bcrypt.hash(secret, 10)
}

function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? request.headers.get('x-bu-key') ?? ''
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim()
  return header.trim()
}

function throwGatewayLookupError(error: { message?: string } | null, fallback: string): never {
  if (error && isMissingGatewayRelation(error.message)) {
    throw new ApiError(503, 'GATEWAY_SQL_REQUIRED', GATEWAY_SQL_HINT)
  }
  throw new ApiError(401, 'UNAUTHORIZED', fallback)
}

export async function authenticateMerchant(request: Request): Promise<GatewayMerchant> {
  const token = bearerToken(request)
  if (!token) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Missing Bearer secret_key')
  }
  if (!token.startsWith('sk_')) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Use your secret key (sk_live_… or sk_test_…) in Authorization: Bearer')
  }

  const prefix = token.slice(0, 20)
  const admin = tryCreateAdminClient() ?? createDataClient()
  const { data, error } = await admin
    .from('gateway_merchants')
    .select('*')
    .eq('secret_key_prefix', prefix)
    .maybeSingle()

  if (error) throwGatewayLookupError(error, 'Unknown secret_key')
  if (!data) throw new ApiError(401, 'UNAUTHORIZED', 'Unknown secret_key')

  const merchant = data as GatewayMerchant
  const ok = await bcrypt.compare(token, merchant.secret_key_hash)
  if (!ok) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid secret_key')
  }
  return merchant
}

export async function findMerchantByPublicKey(publicKey: string): Promise<GatewayMerchant | null> {
  if (!publicKey.startsWith('pk_')) return null
  const admin = tryCreateAdminClient() ?? createDataClient()
  const { data, error } = await admin.from('gateway_merchants').select('*').eq('public_key', publicKey).maybeSingle()
  if (error) {
    if (isMissingGatewayRelation(error.message)) {
      throw new ApiError(503, 'GATEWAY_SQL_REQUIRED', GATEWAY_SQL_HINT)
    }
    return null
  }
  return (data as GatewayMerchant | null) ?? null
}

/** Public key (widget / hosted checkout) or secret key (server). */
export async function authenticateGatewayKey(request: Request): Promise<GatewayMerchant> {
  const token = bearerToken(request)
  if (!token) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Missing Bearer public_key or secret_key')
  }
  if (token.startsWith('sk_')) return authenticateMerchant(request)
  if (token.startsWith('pk_')) {
    const merchant = await findMerchantByPublicKey(token)
    if (!merchant) throw new ApiError(401, 'UNAUTHORIZED', 'Unknown public_key')
    return merchant
  }
  throw new ApiError(401, 'UNAUTHORIZED', 'Key must start with pk_ or sk_')
}

export { createAdminClient }
