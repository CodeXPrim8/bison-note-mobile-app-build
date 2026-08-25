import { fulfillSuccessfulPayment } from '@/lib/payments/fulfill'
import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError, handleRouteError, successResponse } from '@/lib/api/errors'
import { isPaystackConfigured } from '@/lib/env'
import type { Payment } from '@/lib/types/database'

/** Local/demo only: complete a pending payment when Paystack is not configured. */
export async function POST(request: Request) {
  try {
    if (isPaystackConfigured() && process.env.NODE_ENV === 'production') {
      throw new ApiError(403, 'FORBIDDEN', 'Demo complete is disabled when Paystack is live')
    }
    const json = (await request.json()) as { reference?: string }
    if (!json.reference) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'reference is required')
    }
    const admin = createAdminClient()
    const { data } = await admin.from('payments').select('*').eq('reference', json.reference).maybeSingle()
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Payment not found')
    const payment = data as Payment
    if (payment.status === 'success') {
      return successResponse({ reference: payment.reference }, 'Already fulfilled')
    }
    const result = await fulfillSuccessfulPayment(payment.reference)
    return successResponse(result, 'Demo payment completed')
  } catch (error) {
    return handleRouteError(error)
  }
}
