import { verifyPaystackSignature, isPaystackConfigured } from '@/lib/payments/paystack'
import { failPayment, fulfillSuccessfulPayment } from '@/lib/payments/fulfill'
import { fulfillLiveTicketPayment, isLiveTicketReference } from '@/lib/payments/live-ticket'
import { fulfillDepositReference } from '@/lib/payments/verify'
import { fulfillDedicatedNubanCharge, isDedicatedNubanCharge, type PaystackChargeData } from '@/lib/payments/dva-credit'
import { isServiceRoleConfigured } from '@/lib/env'
import { errorResponse, successResponse } from '@/lib/api/errors'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'
import { applyPaystackTransferEvent } from '@/lib/wallet/payout'

export async function POST(request: Request) {
  const raw = await request.text()
  const signature = request.headers.get('x-paystack-signature')

  if (isPaystackConfigured() && !verifyPaystackSignature(raw, signature)) {
    return errorResponse(401, 'INVALID_SIGNATURE', 'Invalid webhook signature')
  }

  let event: {
    event?: string
    data?: PaystackChargeData & { transfer_code?: string; status?: string; reference?: string }
  }
  try {
    event = JSON.parse(raw) as {
      event?: string
      data?: PaystackChargeData & { transfer_code?: string; status?: string; reference?: string }
    }
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
    if (isDedicatedNubanCharge(event.data)) {
      const result = await fulfillDedicatedNubanCharge(event.data ?? {})
      return successResponse(
        { reference, tickets: 0, channel: 'dedicated_nuban', amount: result.payment.amount },
        'Fulfilled',
      )
    }
    if (reference.startsWith('DEPOSIT_')) {
      if (isServiceRoleConfigured()) {
        try {
          const result = await fulfillSuccessfulPayment(reference)
          return successResponse({ reference, tickets: result.tickets.length }, 'Fulfilled')
        } catch {
          await fulfillDepositReference(reference)
          return successResponse({ reference, tickets: 0 }, 'Fulfilled')
        }
      }
      await fulfillDepositReference(reference)
      return successResponse({ reference, tickets: 0 }, 'Fulfilled')
    }
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
