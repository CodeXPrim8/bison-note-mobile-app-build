import { isPaystackConfigured, verifyTransaction } from '@/lib/payments/paystack'
import { failPayment, fulfillSuccessfulPayment } from '@/lib/payments/fulfill'
import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError } from '@/lib/api/errors'
import type { Payment } from '@/lib/types/database'

export async function verifyReference(reference: string) {
  const admin = createAdminClient()
  const { data } = await admin.from('payments').select('*').eq('reference', reference).maybeSingle()
  if (!data) {
    throw new ApiError(404, 'NOT_FOUND', 'Payment not found')
  }
  const payment = data as Payment

  if (payment.status === 'success' || payment.status === 'settled') {
    const { data: tickets } = await admin.from('tickets').select('*').eq('payment_id', payment.id)
    return { payment, tickets: tickets ?? [] }
  }

  if (isPaystackConfigured() && payment.amount > 0) {
    const verified = await verifyTransaction(reference)
    if (verified.status === 'success') {
      return fulfillSuccessfulPayment(reference)
    }
    await failPayment(reference, verified.status)
    throw new ApiError(402, 'PAYMENT_FAILED', 'Payment was not successful', {
      paystack_status: verified.status,
    })
  }

  throw new ApiError(409, 'PAYMENT_PENDING', 'Payment is still pending')
}
