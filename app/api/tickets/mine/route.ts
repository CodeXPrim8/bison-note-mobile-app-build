import { handleRouteError, successResponse } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { createDataClient } from '@/lib/supabase/data'
import { fetchMyLiveTickets, withLiveTiers } from '@/lib/events/live'
import { eventEndsAt } from '@/lib/events/sale'
import { publicTicketStatus } from '@/lib/types/database'

export async function GET() {
  try {
    const user = await requireUser()
    const session = await readBuSession()
    const list = await fetchMyLiveTickets(
      user.id,
      {
        email: user.email,
        phone: session?.phone_e164 || session?.phone,
      },
      { websiteIssuedOnly: true },
    )
    const eventIds = [...new Set(list.map((ticket) => ticket.event_id))]
    const db = createDataClient()
    const events = eventIds.length ? await db.from('events').select('*').in('id', eventIds) : { data: [] }
    const eventMap = new Map(
      ((events.data as Record<string, unknown>[] | null) ?? []).map((row) => [String(row.id), withLiveTiers(row)]),
    )

    return successResponse(
      list.map((ticket) => {
        const packed = eventMap.get(ticket.event_id) ?? null
        return {
          ...ticket,
          event: packed,
          tier: packed?.ticket_tiers?.find((tier) => tier.id === ticket.tier_id) ?? packed?.ticket_tiers?.[0] ?? null,
          display_status: publicTicketStatus(
            ticket.status,
            packed ? eventEndsAt(packed).toISOString() : undefined,
          ),
        }
      }),
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
