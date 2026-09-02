import { authenticateMerchant } from '@/lib/api/gateway-auth'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { assertMerchantOwnsEvent, serializeGatewayEvent } from '@/lib/gateway/merchant'
import { applyGatewayCors, gatewayOptions } from '@/lib/gateway/initialize'

export async function OPTIONS(request: Request) {
  return gatewayOptions(request)
}

export async function GET(request: Request, context: { params: Promise<{ event_id: string }> }) {
  try {
    const merchant = await authenticateMerchant(request)
    const { event_id } = await context.params
    const packed = await assertMerchantOwnsEvent(merchant, event_id)
    const response = successResponse(serializeGatewayEvent(packed))
    return applyGatewayCors(response, request, merchant)
  } catch (error) {
    return handleRouteError(error)
  }
}
