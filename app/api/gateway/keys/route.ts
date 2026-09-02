import { z } from 'zod'
import { requireUser } from '@/lib/api/session'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { hashSecretKey } from '@/lib/api/gateway-auth'
import { uniqueSecretKey } from '@/lib/tickets/ids'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { readBuSession } from '@/lib/auth/bu-session'
import { gatewayTableError } from '@/lib/gateway/merchant'
import { GATEWAY_SQL_HINT } from '@/lib/gateway/sql'

const schema = z.object({
  merchant_id: z.string().uuid(),
})

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const session = await readBuSession()
    const liveId =
      (await resolveLiveCelebrantId({
        id: user.id,
        email: user.email,
        phone: session?.phone_e164 || session?.phone || null,
      })) ?? user.id
    const body = schema.parse(await request.json())
    const admin = tryCreateAdminClient()
    if (!admin) throw new ApiError(503, 'GATEWAY_UNAVAILABLE', GATEWAY_SQL_HINT)
    const { data: merchant, error } = await admin
      .from('gateway_merchants')
      .select('id, user_id')
      .eq('id', body.merchant_id)
      .maybeSingle()
    gatewayTableError(error)
    if (!merchant || (merchant.user_id !== liveId && merchant.user_id !== user.id)) {
      throw new ApiError(403, 'FORBIDDEN', 'Not your merchant account')
    }
    const live = process.env.NODE_ENV === 'production'
    const secretKey = uniqueSecretKey(live)
    const secretHash = await hashSecretKey(secretKey)
    await admin
      .from('gateway_merchants')
      .update({
        secret_key_prefix: secretKey.slice(0, 20),
        secret_key_hash: secretHash,
      })
      .eq('id', body.merchant_id)
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
