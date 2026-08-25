import { hashSecretKey, authenticateMerchant } from '@/lib/api/gateway-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { uniqueSecretKey } from '@/lib/tickets/ids'

export async function POST(request: Request) {
  try {
    const merchant = await authenticateMerchant(request)
    const live = process.env.NODE_ENV === 'production'
    const secretKey = uniqueSecretKey(live)
    const secretHash = await hashSecretKey(secretKey)
    const admin = createAdminClient()
    await admin
      .from('gateway_merchants')
      .update({
        secret_key_prefix: secretKey.slice(0, 20),
        secret_key_hash: secretHash,
      })
      .eq('id', merchant.id)
    return successResponse(
      {
        secret_key: secretKey,
        note: 'Store the secret_key now. It will not be shown again.',
      },
      'Secret rotated',
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
