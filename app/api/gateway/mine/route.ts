import { requireUser } from '@/lib/api/session'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { fetchOrganizerEventRows, resolveLiveCelebrantId, withLiveTiers } from '@/lib/events/live'
import { serializeGatewayEvent } from '@/lib/gateway/merchant'
import { GATEWAY_SQL_HINT, isMissingGatewayRelation } from '@/lib/gateway/sql'
import { readBuSession } from '@/lib/auth/bu-session'
import type { GatewayMerchant, Payment } from '@/lib/types/database'

export async function GET() {
  try {
    const user = await requireUser()
    const session = await readBuSession()
    const liveId =
      (await resolveLiveCelebrantId({
        id: user.id,
        email: user.email,
        phone: session?.phone_e164 || session?.phone || null,
      })) ?? user.id

    const eventRows = await fetchOrganizerEventRows(liveId)
    const events = eventRows.map((row) => serializeGatewayEvent(withLiveTiers(row)))

    const admin = tryCreateAdminClient() ?? createDataClient()
    const { data: merchants, error } = await admin
      .from('gateway_merchants')
      .select(
        'id, business_name, email, public_key, secret_key_prefix, webhook_url, live_mode, cors_origins, paystack_subaccount_code, created_at',
      )
      .eq('user_id', liveId)
      .order('created_at', { ascending: false })

    if (error && isMissingGatewayRelation(error.message)) {
      return successResponse({
        merchants: [],
        events,
        payments: [],
        setup_hint: GATEWAY_SQL_HINT,
      })
    }

    const list =
      (merchants as Array<
        Pick<
          GatewayMerchant,
          | 'id'
          | 'business_name'
          | 'email'
          | 'public_key'
          | 'secret_key_prefix'
          | 'webhook_url'
          | 'live_mode'
          | 'cors_origins'
          | 'paystack_subaccount_code'
          | 'created_at'
        >
      >) ?? []
    const ids = list.map((row) => row.id)
    const { data: payments } = ids.length
      ? await admin.from('payments').select('*').in('merchant_id', ids).order('created_at', { ascending: false }).limit(100)
      : { data: [] }

    return successResponse({
      merchants: list,
      events,
      payments: (payments as Payment[]) ?? [],
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
