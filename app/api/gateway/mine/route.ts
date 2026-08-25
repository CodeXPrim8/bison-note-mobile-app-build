import { requireUser } from '@/lib/api/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import type { EventRecord, GatewayMerchant, Payment } from '@/lib/types/database'

export async function GET() {
  try {
    const user = await requireUser()
    const admin = createAdminClient()
    const { data: merchants } = await admin
      .from('gateway_merchants')
      .select('id, business_name, email, public_key, secret_key_prefix, webhook_url, live_mode, cors_origins, paystack_subaccount_code, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    const list = (merchants as Array<Pick<GatewayMerchant, 'id' | 'business_name' | 'email' | 'public_key' | 'secret_key_prefix' | 'webhook_url' | 'live_mode' | 'cors_origins' | 'paystack_subaccount_code' | 'created_at'>>) ?? []
    const ids = list.map((m) => m.id)
    const [{ data: events }, { data: payments }] = await Promise.all([
      ids.length
        ? admin.from('events').select('id, title, slug, status, start_time, merchant_id').in('merchant_id', ids)
        : Promise.resolve({ data: [] }),
      ids.length
        ? admin.from('payments').select('*').in('merchant_id', ids).order('created_at', { ascending: false }).limit(100)
        : Promise.resolve({ data: [] }),
    ])

    return successResponse({
      merchants: list,
      events: (events as EventRecord[]) ?? [],
      payments: (payments as Payment[]) ?? [],
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
