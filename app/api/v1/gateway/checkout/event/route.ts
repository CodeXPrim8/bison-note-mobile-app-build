import { NextRequest } from 'next/server'
import { authenticateGatewayKey } from '@/lib/api/gateway-auth'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { assertMerchantOwnsEvent, serializeGatewayEvent } from '@/lib/gateway/merchant'
import { applyGatewayCors, gatewayOptions } from '@/lib/gateway/initialize'

export async function OPTIONS(request: Request) {
  return gatewayOptions(request)
}

export async function GET(request: NextRequest) {
  try {
    const merchant = await authenticateGatewayKey(request)
    const eventRef = request.nextUrl.searchParams.get('event') || request.nextUrl.searchParams.get('event_id') || ''
    const packed = await assertMerchantOwnsEvent(merchant, eventRef)
    const publicEvent = serializeGatewayEvent(packed)
    const response = successResponse({
      ...publicEvent,
      public_key: merchant.public_key,
    })
    return applyGatewayCors(response, request, merchant)
  } catch (error) {
    return handleRouteError(error)
  }
}
