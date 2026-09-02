import { authenticateMerchant } from '@/lib/api/gateway-auth'
import { registerWebhookSchema } from '@/lib/schemas/merchant'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { gatewayTableError } from '@/lib/gateway/merchant'
import { applyGatewayCors, gatewayOptions } from '@/lib/gateway/initialize'

export async function OPTIONS(request: Request) {
  return gatewayOptions(request)
}

export async function POST(request: Request) {
  try {
    const merchant = await authenticateMerchant(request)
    const body = registerWebhookSchema.parse(await request.json())
    const admin = createAdminClient()
    const { error } = await admin
      .from('gateway_merchants')
      .update({ webhook_url: body.webhook_url })
      .eq('id', merchant.id)
    gatewayTableError(error)
    const response = successResponse({ webhook_url: body.webhook_url }, 'Webhook registered')
    return applyGatewayCors(response, request, merchant)
  } catch (error) {
    return handleRouteError(error)
  }
}
