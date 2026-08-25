import { getCronSecret } from '@/lib/env'
import { expireReservations } from '@/lib/payments/fulfill'
import { deliverPendingWebhooks } from '@/lib/webhooks/merchant'
import { errorResponse, successResponse } from '@/lib/api/errors'

export async function POST(request: Request) {
  const secret = getCronSecret()
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : header
  if (secret && token !== secret) {
    return errorResponse(401, 'UNAUTHORIZED', 'Invalid cron secret')
  }

  const expired = await expireReservations()
  const delivered = await deliverPendingWebhooks()
  return successResponse({ expired, delivered }, 'Cron complete')
}

export async function GET(request: Request) {
  return POST(request)
}
