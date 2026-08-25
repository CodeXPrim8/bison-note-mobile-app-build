import { authenticateMerchant } from '@/lib/api/gateway-auth'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { verifyReference } from '@/lib/payments/verify'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Payment } from '@/lib/types/database'

export async function GET(
  request: Request,
  context: { params: Promise<{ reference: string }> },
) {
  try {
    const merchant = await authenticateMerchant(request)
    const { reference } = await context.params
    const admin = createAdminClient()
    const { data } = await admin.from('payments').select('*').eq('reference', reference).maybeSingle()
    if (!data) {
      throw new ApiError(404, 'NOT_FOUND', 'Payment not found')
    }
    const payment = data as Payment
    if (payment.merchant_id && payment.merchant_id !== merchant.id) {
      throw new ApiError(403, 'FORBIDDEN', 'Payment does not belong to this merchant')
    }
    const result = await verifyReference(reference)
    return successResponse(result, 'Verified')
  } catch (error) {
    return handleRouteError(error)
  }
}
