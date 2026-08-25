import { handleRouteError, successResponse } from '@/lib/api/errors'
import { verifyReference } from '@/lib/payments/verify'

export async function GET(
  _request: Request,
  context: { params: Promise<{ reference: string }> },
) {
  try {
    const { reference } = await context.params
    const result = await verifyReference(reference)
    return successResponse(result, 'Verified')
  } catch (error) {
    return handleRouteError(error)
  }
}
