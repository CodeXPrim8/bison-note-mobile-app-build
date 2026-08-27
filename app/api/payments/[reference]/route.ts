import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { isServiceRoleConfigured } from '@/lib/env'
import { loadLivePaymentByReference } from '@/lib/payments/live-ticket'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Payment } from '@/lib/types/database'

export async function GET(_request: Request, context: { params: Promise<{ reference: string }> }) {
  try {
    const { reference } = await context.params
    const live = await loadLivePaymentByReference(reference)
    if (live) return successResponse(live)
    if (!isServiceRoleConfigured()) {
      throw new ApiError(404, 'NOT_FOUND', 'Payment not found')
    }
    const admin = createAdminClient()
    const { data } = await admin.from('payments').select('*').eq('reference', reference).maybeSingle()
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Payment not found')
    const payment = data as Payment
    const { data: tickets } = await admin.from('tickets').select('*').eq('payment_id', payment.id)
    return successResponse({ payment, tickets: tickets ?? [] })
  } catch (error) {
    return handleRouteError(error)
  }
}
