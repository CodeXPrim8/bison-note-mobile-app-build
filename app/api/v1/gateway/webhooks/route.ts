import { authenticateMerchant } from '@/lib/api/gateway-auth'
import { registerWebhookSchema } from '@/lib/schemas/merchant'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleRouteError, successResponse } from '@/lib/api/errors'

export async function POST(request: Request) {
  try {
    const merchant = await authenticateMerchant(request)
    const body = registerWebhookSchema.parse(await request.json())
    const admin = createAdminClient()
    await admin.from('gateway_merchants').update({ webhook_url: body.webhook_url }).eq('id', merchant.id)
    return successResponse({ webhook_url: body.webhook_url }, 'Webhook registered')
  } catch (error) {
    return handleRouteError(error)
  }
}
