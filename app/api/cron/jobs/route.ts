import { expireReservations } from '@/lib/payments/fulfill'
import { deliverPendingWebhooks } from '@/lib/webhooks/merchant'
import { errorResponse, successResponse } from '@/lib/api/errors'
import { getCronSecret } from '@/lib/env'

export async function POST(request: Request) {
  const secret = getCronSecret()
  const header = request.headers.get('authorization') ?? ''
  if (secret && header !== `Bearer ${secret}`) {
    return errorResponse(401, 'UNAUTHORIZED', 'Invalid cron secret')
  }
  const expired = await expireReservations()
  const delivered = await deliverPendingWebhooks()
  return successResponse({ expired, delivered }, 'Jobs ran')
}
