import bcrypt from 'bcryptjs'
import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError } from '@/lib/api/errors'
import type { GatewayMerchant } from '@/lib/types/database'

export async function hashSecretKey(secret: string): Promise<string> {
  return bcrypt.hash(secret, 10)
}

export async function authenticateMerchant(request: Request): Promise<GatewayMerchant> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Missing Bearer secret_key')
  }
  if (!token.startsWith('sk_')) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid secret_key')
  }

  const prefix = token.slice(0, 20)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('gateway_merchants')
    .select('*')
    .eq('secret_key_prefix', prefix)
    .maybeSingle()

  if (error || !data) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Unknown secret_key')
  }

  const merchant = data as GatewayMerchant
  const ok = await bcrypt.compare(token, merchant.secret_key_hash)
  if (!ok) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid secret_key')
  }
  return merchant
}

export async function findMerchantByPublicKey(publicKey: string): Promise<GatewayMerchant | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('gateway_merchants')
    .select('*')
    .eq('public_key', publicKey)
    .maybeSingle()
  return (data as GatewayMerchant | null) ?? null
}
