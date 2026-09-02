import { verifyPaystackSignature, isPaystackConfigured } from '@/lib/payments/paystack'
import { failPayment, fulfillSuccessfulPayment } from '@/lib/payments/fulfill'
import { fulfillLiveTicketPayment, isLiveTicketReference } from '@/lib/payments/live-ticket'
import { isServiceRoleConfigured } from '@/lib/env'
import { errorResponse, successResponse } from '@/lib/api/errors'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'
import { applyPaystackTransferEvent } from '@/lib/wallet/payout'

export async function POST(request: Request) {
  const raw = await request.text()
  const signature = request.headers.get('x-paystack-signature')

  if (isPaystackConfigured() && !verifyPaystackSignature(raw, signature)) {
    return errorResponse(401, 'INVALID_SIGNATURE', 'Invalid Paystack signature')
  }

  let event: { event?: string; data?: { reference?: string; transfer_code?: string; status?: string } }
  try {
    event = JSON.parse(raw) as { event?: string; data?: { reference?: string; transfer_code?: string; status?: string } }
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Invalid webhook body')
  }

  if (event.event?.startsWith('transfer.')) {
    const db = tryCreateAdminClient() ?? createDataClient()
    const result = await applyPaystackTransferEvent(event, db)
    return successResponse(result, result.ok ? 'Transfer updated' : 'Transfer ignored')
  }

  const reference = event.data?.reference
  if (!reference) {
    return errorResponse(400, 'NO_REFERENCE', 'Missing transaction reference')
  }

  if (event.event === 'charge.success') {
    const result =
      isLiveTicketReference(reference) || !isServiceRoleConfigured()
        ? await fulfillLiveTicketPayment(reference)
        : await fulfillSuccessfulPayment(reference).catch(() => fulfillLiveTicketPayment(reference))
    return successResponse({ reference, tickets: result.tickets.length }, 'Fulfilled')
  }

  if (event.event === 'charge.failed' || event.data?.status === 'failed') {
    if (!isLiveTicketReference(reference) && isServiceRoleConfigured()) {
      await failPayment(reference, event.event)
    }
    return successResponse({ reference }, 'Marked failed')
  }

  return successResponse({ ignored: event.event ?? 'unknown' }, 'Ignored')
}
