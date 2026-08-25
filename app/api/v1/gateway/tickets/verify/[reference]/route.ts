import { authenticateMerchant } from '@/lib/api/gateway-auth'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { verifyReference } from '@/lib/payments/verify'

export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  try {
    await authenticateMerchant(request)
    const { reference } = await context.params
    const result = await verifyReference(reference)
    return successResponse(result)
  } catch (error) {
    return handleRouteError(error)
  }
}
