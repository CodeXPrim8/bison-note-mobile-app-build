import { expireReservations } from '@/lib/payments/fulfill'
import { deliverPendingWebhooks } from '@/lib/webhooks/merchant'
import { autoReverseFailedDebits } from '@/lib/wallet/reverse'
import { errorResponse, successResponse } from '@/lib/api/errors'
import { getCronSecret } from '@/lib/env'

export async function POST(request: Request) {
  const secret = getCronSecret()
  const header = request.headers.get('authorization') ?? ''
  const production = process.env.VERCEL_ENV === 'production'
  if (!secret) {
    if (production) {
      return errorResponse(401, 'UNAUTHORIZED', 'Cron secret is not configured')
    }
  } else if (header !== `Bearer ${secret}`) {
    return errorResponse(401, 'UNAUTHORIZED', 'Invalid cron secret')
  }
  const expired = await expireReservations()
  const delivered = await deliverPendingWebhooks()
  const reversals = await autoReverseFailedDebits({ limit: 200 })
  return successResponse({ expired, delivered, reversals }, 'Jobs ran')
}
