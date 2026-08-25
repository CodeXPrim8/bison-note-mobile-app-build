import { verifyPaystackSignature, isPaystackConfigured } from '@/lib/payments/paystack'
import { failPayment, fulfillSuccessfulPayment } from '@/lib/payments/fulfill'
import { errorResponse, successResponse } from '@/lib/api/errors'

export async function POST(request: Request) {
  const raw = await request.text()
  const signature = request.headers.get('x-paystack-signature')

  if (isPaystackConfigured() && !verifyPaystackSignature(raw, signature)) {
    return errorResponse(401, 'INVALID_SIGNATURE', 'Invalid Paystack signature')
  }

  let event: { event?: string; data?: { reference?: string; status?: string } }
  try {
    event = JSON.parse(raw) as { event?: string; data?: { reference?: string; status?: string } }
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Invalid webhook body')
  }

  const reference = event.data?.reference
  if (!reference) {
    return errorResponse(400, 'NO_REFERENCE', 'Missing transaction reference')
  }

  if (event.event === 'charge.success') {
    const result = await fulfillSuccessfulPayment(reference)
    return successResponse({ reference, tickets: result.tickets.length }, 'Fulfilled')
  }

  if (event.event === 'charge.failed' || event.data?.status === 'failed') {
    await failPayment(reference, event.event)
    return successResponse({ reference }, 'Marked failed')
  }

  return successResponse({ ignored: event.event ?? 'unknown' }, 'Ignored')
}
