import { authenticateMerchant } from '@/lib/api/gateway-auth'
import { registerWebhookSchema } from '@/lib/schemas/merchant'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    const merchant = await authenticateMerchant(request)
    const json: unknown = await request.json()
    const body = registerWebhookSchema.parse(json)
    const admin = createAdminClient()
    await admin.from('gateway_merchants').update({ webhook_url: body.webhook_url }).eq('id', merchant.id)
    return successResponse({ webhook_url: body.webhook_url }, 'Webhook registered')
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function GET(request: Request) {
  try {
    const merchant = await authenticateMerchant(request)
    const admin = createAdminClient()
    const { data } = await admin
      .from('webhook_deliveries')
      .select('id, event_type, attempts, last_status, last_http_status, last_error, created_at, next_retry_at')
      .eq('merchant_id', merchant.id)
      .order('created_at', { ascending: false })
      .limit(50)
    return successResponse({ deliveries: data ?? [] })
  } catch (error) {
    return handleRouteError(error)
  }
}
