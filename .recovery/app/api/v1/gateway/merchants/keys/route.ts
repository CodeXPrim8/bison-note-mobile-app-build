import { authenticateMerchant } from '@/lib/api/gateway-auth'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashSecretKey } from '@/lib/api/gateway-auth'
import { uniquePublicKey, uniqueSecretKey } from '@/lib/tickets/ids'

export async function GET(request: Request) {
  try {
    const merchant = await authenticateMerchant(request)
    return successResponse({
      id: merchant.id,
      business_name: merchant.business_name,
      email: merchant.email,
      public_key: merchant.public_key,
      webhook_url: merchant.webhook_url,
      is_verified: merchant.is_verified,
      commission_rate: merchant.commission_rate,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    const merchant = await authenticateMerchant(request)
    const live = process.env.NODE_ENV === 'production'
    const publicKey = uniquePublicKey(live)
    const secretKey = uniqueSecretKey(live)
    const secretHash = await hashSecretKey(secretKey)
    const admin = createAdminClient()
    await admin
      .from('gateway_merchants')
      .update({
        public_key: publicKey,
        secret_key_prefix: secretKey.slice(0, 20),
        secret_key_hash: secretHash,
      })
      .eq('id', merchant.id)

    return successResponse(
      {
        public_key: publicKey,
        secret_key: secretKey,
        note: 'Previous keys are revoked. Store the secret_key now.',
      },
      'Keys rotated',
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
